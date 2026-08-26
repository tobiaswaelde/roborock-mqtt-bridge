import { Controller, Get } from '@nestjs/common';

/** Reports process health for container and orchestration probes. */
@Controller('health')
export class HealthController {
  /** Returns the service identity and process uptime. */
  @Get() getHealth() {
    return {
      status: 'ok',
      name: process.env.npm_package_name ?? 'roborock-mqtt-bridge',
      version: process.env.npm_package_version ?? '0.0.0',
      uptime: process.uptime(),
    };
  }
}
