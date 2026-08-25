import { Roborock as RoborockClient, type RoborockState } from 'homebridge-roborock-matter/roborockLib/roborockAPI';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ENV } from '~/config/env';
import { HttpMqttBridge } from '~/lib/http-mqtt-bridge';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import { RoborockConfig, RoborockLogLevel } from '~/types/config/roborock';
import { objectToMap } from '~/util/object';
import { asRecord, redact } from './data';
import {
  COMMANDS,
  REGION_HOSTS,
  type RegionResponse,
  type RoborockAuthenticationStatus,
  type RoborockCommand,
  type RoborockDevice,
  type RoborockSession,
} from './types';

/** Bridges the Roborock account's push updates and supported vacuum commands to MQTT.
 */
export class Roborock extends HttpMqttBridge<RoborockConfig> {
  private static readonly logLevelPriority: Record<RoborockLogLevel, number> = {
    debug: 3,
    error: 0,
    info: 2,
    warn: 1,
  };

  private client?: RoborockClient;
  private destroyed = false;

  /** Creates a bridge instance for one Roborock account.
   * @param {RoborockConfig} cfg Roborock account configuration.
   * @param {MqttBridgeClient} mqtt MQTT client.
   */
  constructor(cfg: RoborockConfig, mqtt: MqttBridgeClient) {
    super(cfg, mqtt, `ROBOROCK@${cfg.topic}`, '');
  }

  /** Subscribes to MQTT commands and begins account authentication.
   * @returns {void} Result.
   */
  public setup() {
    this.setConnected(false);
    this.subscribeCommands();
    this.subscribeAuthentication();
    void this.connect();
  }

  /** Stops active work, disconnects the wrapped client, and publishes offline state.
   * @returns {void} Result.
   */
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

  /** Discovers the account region, restores a saved session, and starts the client.
   * @returns {Promise<void>} Result.
   */
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

  /** Resolves the cloud host explicitly configured for the account or discovers it by e-mail.
   * @returns {Promise<string | undefined>} Result.
   */
  private async getBaseUrl() {
    if (this.cfg.baseUrl) return this.normalizeHost(this.cfg.baseUrl);

    const controller = this.startRequest('region');
    try {
      for (const host of REGION_HOSTS[this.cfg.region]) {
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

  /** Removes protocol and trailing slash so the wrapped client receives only a host name.
   * @param {string} url The url value.
   * @returns {string} Result.
   */
  private normalizeHost(url: string) {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  /** Keeps device data in memory and persists only the authentication session to the configured local file.
   * @param {RoborockClient} client The client value.
   * @returns {void} Result.
   */
  private useMemoryOnlyState(client: RoborockClient) {
    client.setStateAsync = async (id: string, state: RoborockState) => {
      client.states[id] = state;
      if (id === 'UserData') await this.persistAuthentication(state.val);
      if (id === 'HomeData' || id === 'CloudMessage') this.handleClientEvent(client, id, state);
    };
  }

  /** Builds the local path used exclusively for the authentication session.
   * @returns {string} Result.
   */
  private get authenticationFile() {
    const topicHash = createHash('sha256').update(this.cfg.topic).digest('hex').slice(0, 12);
    const file = this.cfg.authFile ?? `.roborock-${topicHash}.auth.json`;
    return path.isAbsolute(file) ? file : path.resolve(ENV.CONFIG_PATH, file);
  }

  /** Loads and validates a previously persisted authentication session, if one exists.
   * @returns {Promise<RoborockSession | undefined>} Result.
   */
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

  /** Atomically stores a valid cloud session with owner-only file permissions.
   * @param {unknown} value The value value.
   * @returns {Promise<void>} Result.
   */
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

  /** Checks that a decoded value has the fields required by the wrapped client.
   * @param {Record<string, unknown> | undefined} session The session value.
   * @returns {boolean} Result.
   */
  private isAuthenticationSession(session: Record<string, unknown> | undefined): session is RoborockSession {
    return typeof session?.token === 'string' && asRecord(session.rriot) !== undefined;
  }

  /** Marks the MQTT bridge connected and publishes the discovered device metadata.
   * @param {RoborockClient} client The client value.
   * @returns {void} Result.
   */
  private handleConnected(client: RoborockClient) {
    if (this.destroyed || client !== this.client) return;

    this.setConnected(true);
    this.publishHomeData(client.states.HomeData?.val);
  }

  /** Converts a cloud or local client notification into redacted MQTT publications.
   * @param {RoborockClient} client The client value.
   * @param {string} event The event value.
   * @param {unknown} state The state value.
   * @returns {void} Result.
   */
  private handleClientEvent(client: RoborockClient, event: string, state: unknown) {
    if (this.destroyed || client !== this.client) return;

    if (event === 'HomeData') {
      const record = asRecord(state);
      this.publishHomeData(record?.val);
      return;
    }

    const record = asRecord(state);
    const deviceId = typeof record?.duid === 'string' ? record.duid : undefined;
    const payload = record?.payload ?? record;
    const safePayload = redact(payload);
    const prefix = deviceId ? `${this.cfg.topic}/devices/${deviceId}` : `${this.cfg.topic}/events/${event}`;
    this.publishJson(`${prefix}/json`, safePayload);
    this.publishData(prefix, safePayload);
  }

  /** Publishes non-sensitive device metadata from the Roborock home-data response.
   * @param {unknown} value The value value.
   * @returns {void} Result.
   */
  private publishHomeData(value: unknown) {
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
      this.publishData(`${this.cfg.topic}/devices/${device.duid}/info`, info);
    }
  }

  /** Subscribes to the allowlisted vacuum command topic.
   * @returns {void} Result.
   */
  private subscribeCommands() {
    const topic = `${this.cfg.topic}/set/json`;
    this.subscribe(topic, (_, payload) => {
      if (!payload) return;
      try {
        const command = JSON.parse(payload) as RoborockCommand;
        if (!command.deviceId || !Object.hasOwn(COMMANDS, command.command)) throw new Error('Invalid command.');
        void this.executeCommand(command);
        this.mqtt.publish(topic, null);
      } catch (error) {
        this.logError(`Invalid Roborock command on ${topic}.`, error);
      }
    });
  }

  /** Subscribes to one-time-code request and verification topics.
   * @returns {void} Result.
   */
  private subscribeAuthentication() {
    const requestTopic = `${this.cfg.topic}/auth/request`;
    this.subscribe(requestTopic, () => {
      this.mqtt.publish(requestTopic, null);
      const client = this.client;
      if (!client || client.isInited()) return;
      void this.requestTwoFactorCode(client);
    });

    const verifyTopic = `${this.cfg.topic}/auth/verify`;
    this.subscribe(verifyTopic, (_, payload) => {
      this.mqtt.publish(verifyTopic, null);
      const code = payload.trim();
      const client = this.client;
      if (!code || !client || client.isInited()) return;
      void this.verifyTwoFactorCode(client, code);
    });
  }

  /** Requests a Roborock e-mail verification code for the pending client session.
   * @param {RoborockClient} client The client value.
   * @returns {Promise<void>} Result.
   */
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

  /** Verifies a one-time code and resumes the existing client setup.
   * @param {RoborockClient} client The client value.
   * @param {string} code The code value.
   * @returns {Promise<void>} Result.
   */
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

  /** Invokes one allowlisted vacuum command when the account is ready.
   * @param {RoborockCommand} command The command value.
   * @returns {Promise<void>} Result.
   */
  private async executeCommand(command: RoborockCommand) {
    const client = this.client;
    if (!client || !client.isInited()) {
      this.logger.warn('Ignored Roborock command because the account is not connected.');
      return;
    }

    try {
      await client[COMMANDS[command.command]](command.deviceId, command.options);
    } catch (error) {
      this.logError(`Failed to execute Roborock ${command.command} for ${command.deviceId}.`, error);
    }
  }

  /** Publishes the bridge connection state.
   * @param {boolean} connected The connected value.
   * @returns {void} Result.
   */
  private setConnected(connected: boolean) {
    this.mqtt.publish(`${this.cfg.topic}/connected`, connected);
  }

  /** Publishes the current one-time-code authentication state.
   * @param {RoborockAuthenticationStatus} status The status value.
   * @returns {void} Result.
   */
  private setAuthenticationStatus(status: RoborockAuthenticationStatus) {
    this.mqtt.publish(`${this.cfg.topic}/auth/status`, status);
  }

  /** Flattens a structured, non-sensitive payload into MQTT scalar topics.
   * @param {string} topic The topic value.
   * @param {unknown} data The data value.
   * @returns {void} Result.
   */
  private publishData(topic: string, data: unknown) {
    if (!data || typeof data !== 'object') return;
    for (const [path, value] of objectToMap(data)) {
      if (value === null || value === undefined) continue;
      this.mqtt.publish(`${topic}/${path}`, value);
    }
  }

  /** Publishes a structured, non-sensitive payload as JSON.
   * @param {string} topic The topic value.
   * @param {unknown} data The data value.
   * @returns {void} Result.
   */
  private publishJson(topic: string, data: unknown) {
    try {
      this.mqtt.publish(topic, JSON.stringify(data));
    } catch {
      this.logger.warn(`Could not serialize Roborock data for ${topic}.`);
    }
  }

  /** Parses a client JSON value without allowing malformed data to interrupt the bridge.
   * @param {unknown} value The value value.
   * @returns {unknown} Result.
   */
  private parseJson(value: unknown) {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      this.logger.warn('Received invalid Roborock JSON.');
      return;
    }
  }

  /** Emits a client log only when it is enabled by the configured Roborock log level.
   * @returns {{ debug: (message: unknown) => void; error: (message: unknown) => void; info: (message: unknown) => void; warn: (message: unknown) => void; }} Result.
   */
  private get clientLogger() {
    return {
      debug: (message: unknown) => this.logClientMessage('debug', message),
      error: (message: unknown) => this.logClientMessage('error', message),
      info: (message: unknown) => this.logClientMessage('info', message),
      warn: (message: unknown) => this.logClientMessage('warn', message),
    };
  }

  /** Forwards a wrapped-client message to Nest only if its severity passes the configured threshold.
   * @param {"error" | "warn" | "debug" | "info"} level The level value.
   * @param {unknown} message The message value.
   * @returns {void} Result.
   */
  private logClientMessage(level: RoborockLogLevel, message: unknown) {
    if (Roborock.logLevelPriority[level] > Roborock.logLevelPriority[this.cfg.logLevel]) return;

    const text = String(message);
    if (level === 'debug') this.logger.debug(text);
    if (level === 'info') this.logger.log(text);
    if (level === 'warn') this.logger.warn(text);
    if (level === 'error') this.logger.error(text);
  }

  /** Logs an internal bridge error unless its associated request has been aborted.
   * @param {string} message The message value.
   * @param {unknown} error The error value.
   * @param {AbortSignal | undefined} signal The signal value.
   * @returns {void} Result.
   */
  private logError(message: string, error: unknown, signal?: AbortSignal) {
    if (this.destroyed || signal?.aborted) return;
    this.logger.error(`${message} ${error instanceof Error ? error.message : String(error)}`);
  }
}
