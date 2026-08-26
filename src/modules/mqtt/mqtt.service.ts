import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import { CONFIG } from '~/config/config';
import { resolveMqttClientId } from './client-id';

export type MqttMessageHandler = (topic: string, payload: string) => void;

export interface MqttBridgeClient {
  publish(topic: string, payload: string | number | boolean | null): void;
  subscribe(topic: string, handler: MqttMessageHandler): () => void;
}

/** Owns one MQTT connection and dispatches inbound messages to local handlers. */
@Injectable()
export class MqttService implements MqttBridgeClient, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private readonly client: MqttClient;
  private readonly subscriptions = new Map<string, Set<MqttMessageHandler>>();
  /** Opens the shared MQTT connection using the validated configuration. */
  constructor() {
    const { mqtt } = CONFIG;
    const clientId = resolveMqttClientId(mqtt.clientId);
    const options: IClientOptions = {
      protocol: mqtt.protocol,
      host: mqtt.host,
      port: mqtt.port,
      clientId,
      username: mqtt.username,
      password: mqtt.password,
      keepalive: mqtt.keepAliveSeconds,
      reconnectPeriod: mqtt.reconnectDelayMs,
    };
    this.client = connect(options);
    this.client.on('error', (error) => this.logger.error('MQTT connection failed', error));
    this.client.on('message', (topic, payload) => this.dispatch(topic, payload.toString()));
  }
  /** Publishes a non-retained MQTT value, using an empty payload to clear a command topic. */
  publish(topic: string, payload: string | number | boolean | null) {
    this.client.publish(
      topic,
      payload === null ? '' : String(payload),
      { retain: false },
      (error) => error && this.logger.error(`Failed to publish ${topic}`, error),
    );
  }
  /** Adds a local handler and subscribes the broker only for the first handler on a filter. */
  subscribe(filter: string, handler: MqttMessageHandler) {
    let handlers = this.subscriptions.get(filter);
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(filter, handlers);
      this.client.subscribe(filter, (error) => error && this.logger.error(`Failed to subscribe ${filter}`, error));
    }
    handlers.add(handler);
    return () => {
      const current = this.subscriptions.get(filter);
      if (!current) return;
      current.delete(handler);
      if (current.size) return;
      this.subscriptions.delete(filter);
      this.client.unsubscribe(filter);
    };
  }
  /** Clears local handlers and closes the shared MQTT connection. */
  onModuleDestroy() {
    this.subscriptions.clear();
    this.client.end();
  }
  /** Dispatches an inbound MQTT payload to every matching local handler. */
  private dispatch(topic: string, payload: string) {
    for (const [filter, handlers] of this.subscriptions) {
      if (!matchesMqttTopic(filter, topic)) continue;

      for (const handler of handlers) {
        try {
          handler(topic, payload);
        } catch (error) {
          this.logger.error(`MQTT handler failed for ${filter}`, error);
        }
      }
    }
  }
}

/** Checks whether an MQTT topic matches the broker filter's `+` and terminal `#` wildcards. */
function matchesMqttTopic(filter: string, topic: string) {
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');

  for (const [index, filterPart] of filterParts.entries()) {
    if (filterPart === '#') return index === filterParts.length - 1;
    if (filterPart !== '+' && filterPart !== topicParts[index]) return false;
  }
  return filterParts.length === topicParts.length;
}
