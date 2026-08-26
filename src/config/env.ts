import * as dotenv from 'dotenv';
import { cleanEnv, num, str } from 'envalid';
import path from 'node:path';
import { configDirectory } from './runtime';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const environment = cleanEnv(process.env, {
  CORS_ORIGIN: str({ default: '*', desc: 'The allowed CORS origin' }),
  HOST: str({ default: '0.0.0.0', desc: 'The HTTP bind host' }),
  MAP_STORAGE_PATH: str({ default: 'maps', desc: 'The directory used to store rendered Roborock maps' }),
  PORT: num({ default: 3000, desc: 'The HTTP listen port' }),
});

export const ENV = {
  CORS_ORIGIN: environment.CORS_ORIGIN,
  HOST: environment.HOST,
  MAP_STORAGE_PATH: path.resolve(environment.MAP_STORAGE_PATH),
  PORT: environment.PORT,

  /** Directory containing the active configuration file and local authentication files. */
  get CONFIG_PATH() {
    return configDirectory();
  },
};
