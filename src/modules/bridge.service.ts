import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CONFIG, type RoborockConfig } from '~/config/config';
import type { BridgeInstance } from '~/lib/http-mqtt-bridge';
import { Roborock } from '~/lib/roborock';
import { MqttService } from '~/modules/mqtt/mqtt.service';

/** Creates and manages every enabled Roborock bridge instance. */
@Injectable()
export class BridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly instances: BridgeInstance[];
  private timer?: NodeJS.Timeout;

  /** Builds instances from the validated configuration using one shared MQTT connection. */
  constructor(@Inject(MqttService) mqtt: MqttService) {
    this.instances = CONFIG.instances
      .filter((instance) => instance.enabled)
      .map((instance) => new Roborock(instance as RoborockConfig, mqtt));
  }
  /** Starts the bridge instances and their shared one-second scheduler. */
  onModuleInit() {
    this.instances.forEach((instance) => instance.setup());
    this.timer = setInterval(() => this.instances.forEach((instance) => instance.loop(Date.now())), 1000);
  }
  /** Stops the scheduler before disposing each bridge instance. */
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.instances.forEach((instance) => instance.destroy());
  }
}
