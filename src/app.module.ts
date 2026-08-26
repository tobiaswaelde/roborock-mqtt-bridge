import { Module } from '@nestjs/common';
import { BridgeModule } from '~/modules/bridge.module';
import { HealthModule } from '~/modules/health/health.module';

/** Root module for the HTTP health endpoint and MQTT bridge lifecycle. */
@Module({ imports: [HealthModule, BridgeModule] })
export class AppModule {}
