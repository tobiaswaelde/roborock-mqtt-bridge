import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';

/** Provides the single shared MQTT connection. */
@Module({ providers: [MqttService], exports: [MqttService] })
export class MqttModule {}
