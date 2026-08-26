import { Module } from '@nestjs/common';
import { MqttModule } from '~/modules/mqtt/mqtt.module';
import { BridgeService } from './bridge.service';

/** Provides the configured bridge instances and their shared MQTT transport. */
@Module({ imports: [MqttModule], providers: [BridgeService] })
export class BridgeModule {}
