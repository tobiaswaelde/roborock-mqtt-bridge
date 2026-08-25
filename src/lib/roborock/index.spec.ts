import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import type { RoborockConfig } from '~/types/config/roborock';
import { Roborock } from './index';

describe('Roborock', () => {
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
});
