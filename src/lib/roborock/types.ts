/** Regional cloud hosts queried when the account does not configure one explicitly. */
export const REGION_CLOUD_HOSTS = {
  auto: ['euiot.roborock.com', 'usiot.roborock.com', 'cniot.roborock.com', 'ruiot.roborock.com'],
  cn: ['cniot.roborock.com'],
  eu: ['euiot.roborock.com'],
  us: ['usiot.roborock.com'],
} as const;

/** MQTT commands that the bridge is allowed to pass to the Roborock client. */
export const COMMAND_METHODS = {
  charge: 'app_charge',
  find: 'find_me',
  pause: 'app_pause',
  start: 'app_start',
  stop: 'app_stop',
} as const;

/** Values published below the MQTT authentication-status topic. */
export type RoborockAuthenticationStatus = 'authenticated' | 'failed' | 'verification-code-sent';

/** Command names accepted by the bridge. */
export type RoborockCommandName = keyof typeof COMMAND_METHODS;

/** Persisted cloud authentication payload. */
export type RoborockSession = Record<string, unknown>;

/** Command payload received from MQTT. */
export interface RoborockCommand {
  command: RoborockCommandName;
  deviceId: string;
  options?: Record<string, unknown>;
}

/** Response shape returned by the Roborock regional discovery endpoint. */
export interface RegionResponse {
  data?: {
    country?: string | null;
    countrycode?: string | null;
    url?: string;
  };
}

/** Non-sensitive device metadata extracted from Roborock home data. */
export interface RoborockDevice {
  duid?: string;
  model?: string;
  name?: string;
  productModel?: string;
  serialNumber?: string;
}
