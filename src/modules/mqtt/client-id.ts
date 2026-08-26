import { randomUUID } from 'node:crypto';

/** Uses the configured MQTT client ID or creates one for this process. */
export function resolveMqttClientId(clientId: string): string {
  return clientId || randomUUID();
}
