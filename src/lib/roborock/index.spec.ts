import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ENV } from '~/config/env';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import type { RoborockConfig } from '~/types/config/roborock';
import { Roborock } from './index';

describe('Roborock', () => {
  afterEach(() => jest.useRealTimers());

  const cfg: RoborockConfig = {
    email: 'robot@example.com',
    enabled: true,
    id: 'test',
    logLevel: 'warn',
    password: 'password',
    region: 'auto',
    topic: 'home/roborock',
    updateInterval: 30_000,
  };

  it('continues regional discovery after a cloud host DNS failure', async () => {
    const mqtt = { publish: jest.fn(), subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const post = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('getaddrinfo EAI_AGAIN euiot.roborock.com'), { code: 'EAI_AGAIN' }),
      )
      .mockResolvedValueOnce({
        data: { data: { country: 'US', countrycode: 'US', url: 'https://usiot.roborock.com/' } },
      });
    const instance = bridge as unknown as {
      api: { post: typeof post };
      getBaseUrl(): Promise<string | undefined>;
    };
    instance.api.post = post;

    await expect(instance.getBaseUrl()).resolves.toBe('usiot.roborock.com');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]?.[0]).toBe('https://euiot.roborock.com/api/v1/getUrlByEmail?email=robot%40example.com');
    expect(post.mock.calls[1]?.[0]).toBe('https://usiot.roborock.com/api/v1/getUrlByEmail?email=robot%40example.com');
  });

  it('retries connecting after regional discovery remains unavailable', async () => {
    jest.useFakeTimers();
    const mqtt = { publish: jest.fn(), subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const instance = bridge as unknown as {
      connect(): Promise<void>;
      getBaseUrl: jest.Mock<() => Promise<string | undefined>>;
    };
    instance.getBaseUrl = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);

    await instance.connect();
    expect(instance.getBaseUrl).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(9_999);
    expect(instance.getBaseUrl).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(instance.getBaseUrl).toHaveBeenCalledTimes(2);

    bridge.destroy();
  });

  it('stores and loads only the authentication session with owner-only permissions', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mqtt-bridges-roborock-'));
    const authFile = path.join(directory, 'auth.json');
    const cfg: RoborockConfig = {
      authFile,
      email: 'robot@example.com',
      enabled: true,
      id: 'test',
      logLevel: 'warn',
      password: 'password',
      region: 'auto',
      topic: 'home/roborock',
      updateInterval: 30_000,
    };
    const mqtt = { publish: jest.fn(), subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const instance = bridge as unknown as {
      loadAuthentication(): Promise<Record<string, unknown> | undefined>;
      persistAuthentication(value: unknown): Promise<void>;
    };

    try {
      await instance.persistAuthentication({ rriot: { h: 'hmac-key' }, token: 'session-token' });

      expect((await stat(authFile)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(authFile, 'utf8'))).toEqual({
        rriot: { h: 'hmac-key' },
        token: 'session-token',
      });
      await expect(instance.loadAuthentication()).resolves.toEqual({
        rriot: { h: 'hmac-key' },
        token: 'session-token',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('publishes device state below one predictable device topic', () => {
    const mqtt = { publish: jest.fn(), subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {};
    const instance = bridge as unknown as {
      client: object;
      handleClientEvent(client: object, event: string, state: unknown): void;
    };
    instance.client = client;

    instance.handleClientEvent(client, 'DeviceStatus', {
      duid: 'robot-1',
      payload: { battery: 87, error_code: 0, fan_power: 103, localKey: 'never-publish', state: 2 },
    });

    expect(mqtt.publish).toHaveBeenCalledWith(
      'home/roborock/devices/robot-1/state/json',
      JSON.stringify({ battery: 87, error_code: 0, fan_power: 103, state: 2 }),
    );
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/battery', 87);
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/fan_power', 103);
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/fan_power_human', 'Turbo');
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/state_human', 'Sleeping');
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/error_code_human', 'No error');
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/suction_power_code', 103);
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/suction_power_code_human', 'Turbo');
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/suction_power', 'turbo');
  });

  it('normalizes single-item status arrays without numeric or empty topic segments', () => {
    const publish = jest.fn();
    const mqtt = { publish, subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {};
    const instance = bridge as unknown as {
      client: object;
      handleClientEvent(client: object, event: string, state: unknown): void;
    };
    instance.client = client;

    instance.handleClientEvent(client, 'DeviceStatus', {
      duid: 'robot-1',
      payload: [{ adbumper_status: [1, 2, 3], battery: 87, fan_power: 103 }],
    });

    expect(publish).toHaveBeenCalledWith(
      'home/roborock/devices/robot-1/state/json',
      JSON.stringify({ adbumper_status: [1, 2, 3], battery: 87, fan_power: 103 }),
    );
    expect(publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/battery', 87);
    expect(publish.mock.calls.map(([topic]) => topic)).not.toContainEqual(expect.stringContaining('//'));
    expect(publish.mock.calls.map(([topic]) => topic)).not.toContainEqual(expect.stringMatching(/\/\d+(?:\/|$)/));
  });

  it('publishes rooms below their own named device namespace', () => {
    const publish = jest.fn();
    const mqtt = { publish, subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {};
    const instance = bridge as unknown as {
      client: object;
      handleClientEvent(client: object, event: string, state: unknown): void;
    };
    instance.client = client;

    instance.handleClientEvent(client, 'DeviceStatus', {
      duid: 'robot-1',
      payload: [{ battery: 87, rooms: [{ mapId: 'map-1', name: 'Living room', roomId: 3, segmentId: 16 }] }],
    });

    expect(publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/json', JSON.stringify({ battery: 87 }));
    expect(publish).toHaveBeenCalledWith(
      'home/roborock/devices/robot-1/rooms/json',
      JSON.stringify([{ mapId: 'map-1', name: 'Living room', roomId: 3, segmentId: 16 }]),
    );
    expect(publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/rooms/3/name', 'Living room');
  });

  it('refreshes device status two seconds after the latest JSON command', async () => {
    jest.useFakeTimers();
    const handlers = new Map<string, (topic: string, payload: string) => void>();
    const mqtt = {
      publish: jest.fn(),
      subscribe: jest.fn((topic: string, handler: (topic: string, payload: string) => void) => {
        handlers.set(topic, handler);
        return jest.fn();
      }),
    } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {
      app_start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      isInited: jest.fn(() => true),
    };
    const instance = bridge as unknown as {
      client: typeof client;
      subscribeCommands(): void;
    };
    instance.client = client;
    instance.subscribeCommands();
    const handler = handlers.get('home/roborock/devices/+/command/json');
    const topic = 'home/roborock/devices/robot-1/command/json';

    handler?.(topic, JSON.stringify({ command: 'start' }));
    await Promise.resolve();
    expect(client.getStatus).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    handler?.(topic, JSON.stringify({ command: 'start' }));
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1_999);
    expect(client.getStatus).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(client.app_start).toHaveBeenCalledTimes(2);
    expect(client.getStatus).toHaveBeenCalledTimes(1);
    expect(client.getStatus).toHaveBeenCalledWith('robot-1', { force: true });
  });

  it('sets device suction power and refreshes its status after two seconds', async () => {
    jest.useFakeTimers();
    const handlers = new Map<string, (topic: string, payload: string) => void>();
    const mqtt = {
      publish: jest.fn(),
      subscribe: jest.fn((topic: string, handler: (topic: string, payload: string) => void) => {
        handlers.set(topic, handler);
        return jest.fn();
      }),
    } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {
      getStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      isInited: jest.fn(() => true),
      runMatterSettingCommand: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    };
    const instance = bridge as unknown as {
      client: typeof client;
      subscribeCommands(): void;
    };
    instance.client = client;
    instance.subscribeCommands();

    handlers.get('home/roborock/devices/+/command/suction_power')?.(
      'home/roborock/devices/robot-1/command/suction_power',
      'turbo',
    );
    await Promise.resolve();

    expect(client.runMatterSettingCommand).toHaveBeenCalledWith('robot-1', 'set_custom_mode', 103);
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/command/suction_power', null);
    expect(client.getStatus).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_000);
    expect(client.getStatus).toHaveBeenCalledWith('robot-1', { force: true });
  });

  it('does not refresh status after failed or ignored commands', async () => {
    jest.useFakeTimers();
    const mqtt = { publish: jest.fn(), subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const failedBridge = new Roborock(cfg, mqtt);
    const failedClient = {
      app_start: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('command failed')),
      getStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      isInited: jest.fn(() => true),
    };
    const failedInstance = failedBridge as unknown as {
      client: typeof failedClient;
      executeCommand(deviceId: string, command: { command: 'start' }): Promise<void>;
    };
    failedInstance.client = failedClient;
    await failedInstance.executeCommand('robot-1', { command: 'start' });

    const ignoredBridge = new Roborock(cfg, mqtt);
    const ignoredClient = {
      app_start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      isInited: jest.fn(() => false),
    };
    const ignoredInstance = ignoredBridge as unknown as {
      client: typeof ignoredClient;
      executeCommand(deviceId: string, command: { command: 'start' }): Promise<void>;
    };
    ignoredInstance.client = ignoredClient;
    await ignoredInstance.executeCommand('robot-1', { command: 'start' });

    await jest.advanceTimersByTimeAsync(2_000);
    expect(failedClient.getStatus).not.toHaveBeenCalled();
    expect(ignoredClient.app_start).not.toHaveBeenCalled();
    expect(ignoredClient.getStatus).not.toHaveBeenCalled();
  });

  it('cancels pending status refreshes when destroyed', async () => {
    jest.useFakeTimers();
    const mqtt = { publish: jest.fn(), subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {
      app_start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      isInited: jest.fn(() => true),
      stopService: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const instance = bridge as unknown as {
      client: typeof client;
      executeCommand(deviceId: string, command: { command: 'start' }): Promise<void>;
    };
    instance.client = client;
    await instance.executeCommand('robot-1', { command: 'start' });

    bridge.destroy();
    await jest.advanceTimersByTimeAsync(2_000);

    expect(client.stopService).toHaveBeenCalled();
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it('stores the latest map and retains its path for later MQTT subscribers', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mqtt-bridges-roborock-map-path-'));
    const originalStoragePath = ENV.MAP_STORAGE_PATH;
    const publish = jest.fn<(topic: string, payload: unknown, options?: unknown) => void>();
    const mqtt = { publish, subscribe: jest.fn(() => jest.fn()) } as unknown as MqttBridgeClient;
    const bridge = new Roborock(cfg, mqtt);
    const client = {
      getCurrentMapIdForDevice: jest.fn().mockReturnValue(42),
      messageQueueHandler: {
        sendRequest: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('map-data')),
      },
      vacuums: {
        'robot-1': {
          mapParser: {
            parsedata: jest.fn<() => Promise<unknown>>().mockResolvedValue({
              IMAGE: {
                dimensions: { height: 2, width: 2 },
                pixels: { floor: [0, 1, 2, 3], obstacle: [], segments: [] },
              },
            }),
          },
        },
      },
    };
    const instance = bridge as unknown as {
      storeCurrentMap(client: object, deviceId: string): Promise<void>;
    };
    ENV.MAP_STORAGE_PATH = directory;

    try {
      await instance.storeCurrentMap(client, 'robot-1');
      await instance.storeCurrentMap(client, 'robot-1');

      const file = publish.mock.calls.find(([topic]) => topic.endsWith('/map/current/path'))?.[1] as string;
      expect(file).toBe(path.join(directory, 'robot-1', '42.png'));
      await expect(stat(file)).resolves.toBeDefined();
      expect(client.messageQueueHandler.sendRequest).toHaveBeenCalledTimes(2);
      expect(publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/map/current/path', file, { retain: true });
    } finally {
      ENV.MAP_STORAGE_PATH = originalStoragePath;
      await rm(directory, { force: true, recursive: true });
    }
  });
});
