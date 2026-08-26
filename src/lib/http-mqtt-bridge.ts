import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import type { MqttBridgeClient, MqttMessageHandler } from '~/modules/mqtt/mqtt.service';

export interface BridgeInstance {
  setup(): void;
  loop(time: number): void;
  destroy(): void;
}

interface PollingTask {
  interval: number;
  lastRun: number;
  task: () => void | Promise<void>;
}

/** Shared lifecycle utilities for bridge instances that communicate over HTTP and MQTT. */
export abstract class HttpMqttBridge<T extends object> implements BridgeInstance {
  protected readonly api: AxiosInstance;
  protected readonly logger: Logger;
  private readonly requests = new Map<string, AbortController>();
  private readonly unsubscribers = new Set<() => void>();
  private readonly tasks = new Map<string, PollingTask>();

  /** Creates a bridge with an Axios client scoped to its supplied base URL. */
  protected constructor(
    protected readonly cfg: T,
    protected readonly mqtt: MqttBridgeClient,
    scope: string,
    baseURL: string,
  ) {
    this.logger = new Logger(scope);
    this.api = axios.create({ baseURL });
  }
  /** Registers MQTT handlers and performs initial bridge work. */
  abstract setup(): void;

  /** Runs each registered polling task whose interval has elapsed. */
  loop(time: number) {
    for (const task of this.tasks.values()) {
      if (time - task.lastRun < task.interval) continue;

      task.lastRun = time;
      void task.task();
    }
  }

  /** Removes MQTT handlers, aborts active requests, and clears scheduled work. */
  destroy() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    for (const controller of this.requests.values()) {
      controller.abort();
    }
    this.unsubscribers.clear();
    this.requests.clear();
    this.tasks.clear();
  }
  /** Registers an MQTT handler and arranges for it to be removed during shutdown. */
  protected subscribe(topic: string, handler: MqttMessageHandler) {
    const unsubscribe = this.mqtt.subscribe(topic, handler);
    this.unsubscribers.add(unsubscribe);
    return unsubscribe;
  }
  /** Registers a task that runs no more often than the given interval. */
  protected poll(key: string, interval: number, task: () => void | Promise<void>) {
    if (interval <= 0) return;
    this.tasks.set(key, { interval, lastRun: 0, task });
  }

  /** Starts an HTTP request scope, aborting a previous request with the same key. */
  protected startRequest(key: string) {
    this.requests.get(key)?.abort();
    const controller = new AbortController();
    this.requests.set(key, controller);
    return controller;
  }
  /** Clears a request scope only when it is still current for its key. */
  protected finishRequest(key: string, controller: AbortController) {
    if (this.requests.get(key) === controller) this.requests.delete(key);
  }
  /** Aborts and removes the active request for a stream. */
  protected cancelRequest(key: string) {
    this.requests.get(key)?.abort();
    this.requests.delete(key);
  }
}
