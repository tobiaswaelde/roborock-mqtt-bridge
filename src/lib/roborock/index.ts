import { Roborock as RoborockClient, type RoborockState } from 'homebridge-roborock-matter/roborockLib/roborockAPI';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ENV } from '~/config/env';
import { HttpMqttBridge } from '~/lib/http-mqtt-bridge';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import type { RoborockConfig, RoborockLogLevel } from '~/types/config/roborock';
import { asRecord, redact } from './data';
import { storeMapImage, type RoborockMapImage } from './map';
import {
  COMMAND_METHODS,
  humanizeRoborockEnum,
  REGION_CLOUD_HOSTS,
  SUCTION_POWER_LEVELS,
  type RegionResponse,
  type RoborockAuthenticationStatus,
  type RoborockCommand,
  type RoborockDevice,
  type RoborockSession,
  type SuctionPowerLevel,
} from './types';

interface RoborockSettingsClient {
  runMatterSettingCommand(deviceId: string, command: 'set_custom_mode', value: number): Promise<unknown>;
}

interface RoborockMapClient {
  getCurrentMapIdForDevice?(deviceId: string): number | null;
  messageQueueHandler?: {
    sendRequest(deviceId: string, method: string, parameters: unknown[], secure: boolean): Promise<unknown>;
  };
  vacuums?: Record<
    string,
    {
      mapParser?: {
        parsedata(map: Buffer): Promise<unknown>;
      };
    }
  >;
}

/** Bridges one Roborock account's state, authentication, and supported commands to MQTT. */
export class Roborock extends HttpMqttBridge<RoborockConfig> {
  private static readonly logLevelPriority: Record<RoborockLogLevel, number> = {
    debug: 3,
    error: 0,
    info: 2,
    warn: 1,
  };

  private client?: RoborockClient;
  private destroyed = false;
  private readonly mapHashes = new Map<string, string>();
  private readonly mapRequests = new Set<string>();

  /** Creates a bridge for one configured Roborock account. */
  constructor(cfg: RoborockConfig, mqtt: MqttBridgeClient) {
    super(cfg, mqtt, `ROBOROCK@${cfg.topic}`, '');
  }

  /** Publishes the initial offline state, registers MQTT handlers, and starts authentication. */
  public setup() {
    this.setConnected(false);
    this.subscribeCommands();
    this.subscribeAuthentication();
    void this.connect();
  }

  /** Stops active work, disconnects the wrapped client, and publishes offline state. */
  public override destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.cancelRequest('region');
    const client = this.client;
    this.client = undefined;
    void client?.stopService().catch((error: unknown) => this.logError('Failed to stop Roborock.', error));
    this.setConnected(false);
    super.destroy();
  }

  /** Discovers the cloud endpoint, restores a saved session, and starts the Roborock client. */
  private async connect() {
    const baseURL = await this.getBaseUrl();
    if (!baseURL || this.destroyed) return;

    const session = await this.loadAuthentication();
    if (this.destroyed) return;

    const client = new RoborockClient({
      baseURL,
      cloudOnlyMode: false,
      language: 'en',
      log: this.clientLogger,
      password: this.cfg.password,
      updateInterval: Math.max(this.cfg.updateInterval / 1_000, 5),
      userData: session ?? this.cfg.session,
      username: this.cfg.email,
    });
    this.client = client;
    this.useMemoryOnlyState(client);
    client.setDeviceNotify((event, state) => this.handleClientEvent(client, event, state));

    try {
      await client.startService(() => this.handleConnected(client));
      if (!client.isInited()) {
        if (this.cfg.verificationCode) {
          await this.verifyTwoFactorCode(client, this.cfg.verificationCode);
        } else {
          await this.requestTwoFactorCode(client);
        }
      }
    } catch (error) {
      this.logError('Roborock authentication failed.', error);
    }
  }

  /** Uses the configured cloud host or discovers one from the account e-mail address. */
  private async getBaseUrl(): Promise<string | undefined> {
    if (this.cfg.baseUrl) return this.normalizeHost(this.cfg.baseUrl);

    const controller = this.startRequest('region');
    try {
      for (const host of REGION_CLOUD_HOSTS[this.cfg.region]) {
        const response = await this.api.post<RegionResponse>(
          `https://${host}/api/v1/getUrlByEmail?email=${encodeURIComponent(this.cfg.email)}`,
          undefined,
          { signal: controller.signal },
        );
        const region = response.data.data;
        if (region?.url && region.country && region.countrycode) return this.normalizeHost(region.url);
      }
      throw new Error(`No Roborock region was found for ${this.cfg.email}.`);
    } catch (error) {
      this.logError('Failed to discover the Roborock account region.', error, controller.signal);
      return;
    } finally {
      this.finishRequest('region', controller);
    }
  }

  /** Removes the protocol and trailing slash expected by the wrapped client. */
  private normalizeHost(url: string) {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  /** Keeps device state in memory while persisting only an authentication session. */
  private useMemoryOnlyState(client: RoborockClient) {
    client.setStateAsync = async (id: string, state: RoborockState) => {
      client.states[id] = state;
      if (id === 'UserData') await this.persistAuthentication(state.val);
      if (id === 'HomeData' || id === 'CloudMessage') this.handleClientEvent(client, id, state);
    };
  }

  /** Builds the path used exclusively for the account's authentication session. */
  private get authenticationFile() {
    const topicHash = createHash('sha256').update(this.cfg.topic).digest('hex').slice(0, 12);
    const file = this.cfg.authFile ?? `.roborock-${topicHash}.auth.json`;
    return path.isAbsolute(file) ? file : path.resolve(ENV.CONFIG_PATH, file);
  }

  /** Loads and validates a persisted authentication session, when one exists. */
  private async loadAuthentication(): Promise<RoborockSession | undefined> {
    try {
      const session = asRecord(JSON.parse(await readFile(this.authenticationFile, 'utf8')));
      if (!this.isAuthenticationSession(session)) {
        throw new Error('Authentication file does not contain a valid session.');
      }
      this.logger.debug('Loaded Roborock authentication from the local session file.');
      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.logger.warn(
        `Could not load the Roborock authentication file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  }

  /** Atomically stores a valid cloud session with owner-only file permissions. */
  private async persistAuthentication(value: unknown) {
    const session = asRecord(this.parseJson(value));
    if (!this.isAuthenticationSession(session)) return;

    const file = this.authenticationFile;
    const temporaryFile = `${file}.${process.pid}.tmp`;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(temporaryFile, JSON.stringify(session), { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryFile, file);
      await chmod(file, 0o600);
      this.logger.debug('Stored Roborock authentication in the local session file.');
    } catch (error) {
      this.logError('Could not store the Roborock authentication file.', error);
    }
  }

  /** Checks that a decoded value contains the fields required by the wrapped client. */
  private isAuthenticationSession(session: Record<string, unknown> | undefined): session is RoborockSession {
    return typeof session?.token === 'string' && asRecord(session.rriot) !== undefined;
  }

  /** Marks the bridge as connected and publishes metadata for discovered devices. */
  private handleConnected(client: RoborockClient) {
    if (this.destroyed || client !== this.client) return;

    this.setConnected(true);
    this.publishHomeData(client, client.states.HomeData?.val);
  }

  /** Converts a cloud or local client notification into redacted MQTT publications. */
  private handleClientEvent(client: RoborockClient, event: string, state: unknown) {
    if (this.destroyed || client !== this.client) return;

    if (event === 'HomeData') {
      const record = asRecord(state);
      this.publishHomeData(client, record?.val);
      return;
    }

    const record = asRecord(state);
    const deviceId = typeof record?.duid === 'string' ? record.duid : undefined;
    const payload = record?.payload ?? record;
    const safePayload = redact(payload);
    if (deviceId) {
      this.publishDeviceState(deviceId, safePayload);
      return;
    }

    const prefix = `${this.bridgeTopic}/events/${event}`;
    this.publishJson(`${prefix}/json`, safePayload);
    this.publishData(prefix, safePayload);
  }

  /** Publishes non-sensitive device metadata from the Roborock home-data response. */
  private publishHomeData(client: RoborockClient, value: unknown) {
    const data = this.parseJson(value);
    const devices = asRecord(data)?.devices;
    if (!Array.isArray(devices)) return;

    for (const value of devices) {
      const device = asRecord(value) as RoborockDevice | undefined;
      if (!device?.duid) continue;

      const info = {
        model: device.model,
        name: device.name,
        productModel: device.productModel,
        serialNumber: device.serialNumber,
      };
      this.publishData(`${this.deviceTopic(device.duid)}/info`, info);
      void this.storeCurrentMap(client, device.duid);
    }
  }

  /** Fetches, renders, and publishes the current floor-plan image for one device. */
  private async storeCurrentMap(client: RoborockClient, deviceId: string) {
    if (this.mapRequests.has(deviceId)) return;

    const mapClient = client as RoborockClient & RoborockMapClient;
    const parser = mapClient.vacuums?.[deviceId]?.mapParser;
    if (!mapClient.messageQueueHandler || !parser) return;

    this.mapRequests.add(deviceId);
    try {
      const response = await mapClient.messageQueueHandler.sendRequest(deviceId, 'get_map_v1', [], true);
      if (!Buffer.isBuffer(response)) {
        this.logger.debug(`Roborock did not return a map buffer for ${deviceId}.`);
        return;
      }

      const hash = createHash('sha256').update(response).digest('hex');
      if (this.mapHashes.get(deviceId) === hash) return;

      const parsedMap = await parser.parsedata(response);
      const image = this.mapImage(parsedMap);
      if (!image) {
        this.logger.debug(`Roborock returned no renderable map image for ${deviceId}.`);
        return;
      }

      const file = await storeMapImage(
        ENV.MAP_STORAGE_PATH,
        deviceId,
        this.mapId(mapClient, deviceId, parsedMap),
        image,
      );
      this.mapHashes.set(deviceId, hash);
      this.mqtt.publish(`${this.deviceTopic(deviceId)}/map/current/path`, file, { retain: true });
    } catch (error) {
      this.logger.warn(
        `Could not store the current Roborock map for ${deviceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.mapRequests.delete(deviceId);
    }
  }

  /** Converts a parsed RRMap image block into the renderer's small, validated data shape. */
  private mapImage(value: unknown): RoborockMapImage | undefined {
    const image = asRecord(asRecord(value)?.IMAGE);
    const dimensions = asRecord(image?.dimensions);
    const pixels = asRecord(image?.pixels);
    const width = dimensions?.width;
    const height = dimensions?.height;
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    )
      return;

    return {
      floor: this.numberArray(pixels?.floor),
      height,
      obstacle: this.numberArray(pixels?.obstacle),
      segments: this.numberArray(pixels?.segments),
      width,
    };
  }

  /** Resolves the stable saved-map ID, with a per-device current-map fallback. */
  private mapId(client: RoborockMapClient, deviceId: string, value: unknown) {
    const mapId = client.getCurrentMapIdForDevice?.(deviceId);
    if (typeof mapId === 'number' && Number.isInteger(mapId) && mapId >= 0) return mapId;

    const mapIndex = asRecord(asRecord(value)?.metaData)?.map_index;
    if (typeof mapIndex === 'number' && Number.isInteger(mapIndex) && mapIndex >= 0) return mapIndex;

    return 'current' as const;
  }

  /** Keeps only numeric pixel offsets from a parsed RRMap array. */
  private numberArray(value: unknown) {
    return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : [];
  }

  /** Subscribes to device-scoped action and suction-power command topics. */
  private subscribeCommands() {
    const commandTopic = `${this.cfg.topic}/devices/+/command/json`;
    this.subscribe(commandTopic, (topic, payload) => {
      if (!payload) return;
      try {
        const command = JSON.parse(payload) as unknown;
        if (!this.isCommand(command)) throw new Error('Invalid command.');

        const deviceId = this.commandDeviceId(topic, '/command/json');
        if (!deviceId) throw new Error('Invalid device command topic.');

        void this.executeCommand(deviceId, command);
        this.mqtt.publish(topic, null);
      } catch (error) {
        this.logError(`Invalid Roborock command on ${topic}.`, error);
      }
    });

    const suctionTopic = `${this.cfg.topic}/devices/+/command/suction_power`;
    this.subscribe(suctionTopic, (topic, payload) => {
      const deviceId = this.commandDeviceId(topic, '/command/suction_power');
      const power = payload.trim().toLowerCase();
      if (!deviceId || !this.isSuctionPowerLevel(power)) {
        this.logger.warn(`Invalid Roborock suction-power command on ${topic}.`);
        return;
      }

      void this.setSuctionPower(deviceId, power);
      this.mqtt.publish(topic, null);
    });
  }

  /** Checks that a decoded MQTT payload is a supported Roborock command. */
  private isCommand(value: unknown): value is RoborockCommand {
    const command = asRecord(value);
    return (
      !!command &&
      typeof command.command === 'string' &&
      Object.hasOwn(COMMAND_METHODS, command.command) &&
      (command.options === undefined || asRecord(command.options) !== undefined)
    );
  }

  /** Extracts one device ID from a device-scoped command topic. */
  private commandDeviceId(topic: string, suffix: string) {
    const prefix = `${this.cfg.topic}/devices/`;
    if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) return;

    const deviceId = topic.slice(prefix.length, -suffix.length);
    return deviceId && !deviceId.includes('/') ? deviceId : undefined;
  }

  /** Checks whether the supplied MQTT payload names a supported suction-power level. */
  private isSuctionPowerLevel(value: string): value is SuctionPowerLevel {
    return Object.hasOwn(SUCTION_POWER_LEVELS, value);
  }

  /** Subscribes to the one-time-code request and verification topics. */
  private subscribeAuthentication() {
    const requestTopic = `${this.bridgeTopic}/auth/request`;
    this.subscribe(requestTopic, () => {
      this.mqtt.publish(requestTopic, null);
      const client = this.client;
      if (!client || client.isInited()) return;
      void this.requestTwoFactorCode(client);
    });

    const verifyTopic = `${this.bridgeTopic}/auth/verify`;
    this.subscribe(verifyTopic, (_, payload) => {
      this.mqtt.publish(verifyTopic, null);
      const code = payload.trim();
      const client = this.client;
      if (!code || !client || client.isInited()) return;
      void this.verifyTwoFactorCode(client, code);
    });
  }

  /** Requests a Roborock e-mail verification code for the pending client session. */
  private async requestTwoFactorCode(client: RoborockClient) {
    try {
      await client.sendTwoFactorEmail();
      this.setAuthenticationStatus('verification-code-sent');
      this.logger.debug('Roborock verification code requested by email.');
    } catch (error) {
      this.setAuthenticationStatus('failed');
      this.logError('Failed to request the Roborock verification code.', error);
    }
  }

  /** Verifies a one-time code and resumes setup for the existing client. */
  private async verifyTwoFactorCode(client: RoborockClient, code: string) {
    try {
      await client.verifyTwoFactorCode(code);
      await client.startService(() => this.handleConnected(client));
      this.setAuthenticationStatus(client.isInited() ? 'authenticated' : 'failed');
    } catch (error) {
      this.setAuthenticationStatus('failed');
      this.logError('Roborock verification failed.', error);
    }
  }

  /** Invokes an allowlisted vacuum command when the account is ready. */
  private async executeCommand(deviceId: string, command: RoborockCommand) {
    const client = this.client;
    if (!client || !client.isInited()) {
      this.logger.warn('Ignored Roborock command because the account is not connected.');
      return;
    }

    try {
      await client[COMMAND_METHODS[command.command]](deviceId, command.options);
    } catch (error) {
      this.logError(`Failed to execute Roborock ${command.command} for ${deviceId}.`, error);
    }
  }

  /** Sets the named suction-power level through Roborock's device settings API. */
  private async setSuctionPower(deviceId: string, power: SuctionPowerLevel) {
    const client = this.client;
    if (!client || !client.isInited()) {
      this.logger.warn('Ignored Roborock suction-power command because the account is not connected.');
      return;
    }

    try {
      await (client as RoborockClient & RoborockSettingsClient).runMatterSettingCommand(
        deviceId,
        'set_custom_mode',
        SUCTION_POWER_LEVELS[power],
      );
    } catch (error) {
      this.logError(`Failed to set Roborock suction power for ${deviceId}.`, error);
    }
  }

  /** Publishes the bridge connection state. */
  private setConnected(connected: boolean) {
    this.mqtt.publish(`${this.bridgeTopic}/connected`, connected);
  }

  /** Publishes the current one-time-code authentication state. */
  private setAuthenticationStatus(status: RoborockAuthenticationStatus) {
    this.mqtt.publish(`${this.bridgeTopic}/auth/status`, status);
  }

  /** Publishes a sanitized device state and a readable suction-power level when available. */
  private publishDeviceState(deviceId: string, data: unknown) {
    const topic = `${this.deviceTopic(deviceId)}/state`;
    const state = this.normalizeDeviceState(data);
    this.publishJson(`${topic}/json`, state);
    this.publishData(topic, state);
    this.publishHumanReadableEnums(topic, state);
    this.publishRooms(deviceId, data);

    const code = this.findSuctionPowerCode(state);
    if (code === undefined) return;

    this.mqtt.publish(`${topic}/suction_power_code`, code);
    const label = humanizeRoborockEnum('suction_power_code', code);
    if (label) this.mqtt.publish(`${topic}/suction_power_code_human`, label);

    const power = Object.entries(SUCTION_POWER_LEVELS).find(([, value]) => value === code)?.[0];
    if (power) this.mqtt.publish(`${topic}/suction_power`, power);
  }

  /** Unwraps Roborock's single-item status arrays into one stable state object. */
  private normalizeDeviceState(value: unknown) {
    const candidate = this.unwrapDeviceState(value);
    const state = asRecord(candidate);
    if (!state) return candidate;

    const { rooms: _rooms, ...withoutRooms } = state;
    return withoutRooms;
  }

  /** Publishes room information outside the device-state namespace. */
  private publishRooms(deviceId: string, value: unknown) {
    const rooms = asRecord(this.unwrapDeviceState(value))?.rooms;
    if (!Array.isArray(rooms)) return;

    const topic = `${this.deviceTopic(deviceId)}/rooms`;
    const safeRooms = rooms.map((room) => redact(room));
    this.publishJson(`${topic}/json`, safeRooms);

    for (const room of safeRooms) {
      const record = asRecord(room);
      const id = record?.roomId ?? record?.segmentId;
      if (!this.isTopicSegment(id)) continue;

      const roomTopic = `${topic}/${id}`;
      this.publishJson(`${roomTopic}/json`, room);
      this.publishData(roomTopic, room);
    }
  }

  /** Unwraps the single status entry returned by Roborock for some device events. */
  private unwrapDeviceState(value: unknown) {
    return Array.isArray(value) && value.length === 1 && asRecord(value[0]) ? value[0] : value;
  }

  /** Finds a reported fan-power code in a nested Roborock state payload. */
  private findSuctionPowerCode(value: unknown): number | undefined {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const code = this.findSuctionPowerCode(entry);
        if (code !== undefined) return code;
      }
      return;
    }

    const record = asRecord(value);
    if (!record) return;
    const fanPower = record.fan_power;
    if (typeof fanPower === 'number' && Number.isFinite(fanPower)) return fanPower;

    for (const entry of Object.values(record)) {
      const code = this.findSuctionPowerCode(entry);
      if (code !== undefined) return code;
    }
    return;
  }

  /** Returns the topic segment reserved for bridge-wide state and events. */
  private get bridgeTopic() {
    return `${this.cfg.topic}/bridge`;
  }

  /** Returns the topic segment reserved for one Roborock device. */
  private deviceTopic(deviceId: string) {
    return `${this.cfg.topic}/devices/${deviceId}`;
  }

  /** Publishes direct, named scalar fields without creating array-index topic segments. */
  private publishData(topic: string, data: unknown) {
    const record = asRecord(data);
    if (!record) return;

    for (const [key, value] of Object.entries(record)) {
      if (!this.isTopicSegment(key) || !this.isScalar(value)) continue;
      this.mqtt.publish(`${topic}/${key}`, value);
    }
  }

  /** Publishes a readable companion topic for every known numeric state enum. */
  private publishHumanReadableEnums(topic: string, data: unknown) {
    const record = asRecord(data);
    if (!record) return;

    for (const [field, value] of Object.entries(record)) {
      const label = humanizeRoborockEnum(field, value);
      if (label) this.mqtt.publish(`${topic}/${field}_human`, label);
    }
  }

  /** Checks that a value is safe to use as one MQTT topic segment. */
  private isTopicSegment(value: unknown): value is string | number {
    const segment = typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
    return !!segment && /^[^/\s]+$/.test(segment);
  }

  /** Checks whether a value can be represented as one MQTT scalar payload. */
  private isScalar(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  /** Publishes a structured, non-sensitive payload as JSON. */
  private publishJson(topic: string, data: unknown) {
    try {
      this.mqtt.publish(topic, JSON.stringify(data));
    } catch {
      this.logger.warn(`Could not serialize Roborock data for ${topic}.`);
    }
  }

  /** Parses a client JSON value without allowing malformed data to interrupt the bridge. */
  private parseJson(value: unknown) {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      this.logger.warn('Received invalid Roborock JSON.');
      return;
    }
  }

  /** Provides the logger interface expected by the wrapped Roborock client. */
  private get clientLogger() {
    return {
      debug: (message: unknown) => this.logClientMessage('debug', message),
      error: (message: unknown) => this.logClientMessage('error', message),
      info: (message: unknown) => this.logClientMessage('info', message),
      warn: (message: unknown) => this.logClientMessage('warn', message),
    };
  }

  /** Forwards a client message only when its severity passes the configured threshold. */
  private logClientMessage(level: RoborockLogLevel, message: unknown) {
    if (Roborock.logLevelPriority[level] > Roborock.logLevelPriority[this.cfg.logLevel]) return;

    const text = String(message);
    if (level === 'debug') this.logger.debug(text);
    if (level === 'info') this.logger.log(text);
    if (level === 'warn') this.logger.warn(text);
    if (level === 'error') this.logger.error(text);
  }

  /** Logs an internal error unless its associated request has been aborted. */
  private logError(message: string, error: unknown, signal?: AbortSignal) {
    if (this.destroyed || signal?.aborted) return;
    this.logger.error(`${message} ${error instanceof Error ? error.message : String(error)}`);
  }
}
