import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import type { RoborockConfig } from '~/types/config/roborock';
import { Roborock } from './index';

describe('Roborock', () => {
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
      payload: { battery: 87, fan_power: 103, localKey: 'never-publish' },
    });

    expect(mqtt.publish).toHaveBeenCalledWith(
      'home/roborock/devices/robot-1/state/json',
      JSON.stringify({ battery: 87, fan_power: 103 }),
    );
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/battery', 87);
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/fan_power', 103);
    expect(mqtt.publish).toHaveBeenCalledWith('home/roborock/devices/robot-1/state/suction_power_code', 103);
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

  it('sets device suction power from its command topic', async () => {
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
      isInited: jest.fn(() => true),
      runMatterSettingCommand: jest.fn().mockResolvedValue(undefined),
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
  });
});
