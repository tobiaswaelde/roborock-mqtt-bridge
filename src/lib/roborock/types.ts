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

/** Roborock fan-power codes keyed by their stable MQTT representation. */
export const SUCTION_POWER_LEVELS = {
  balanced: 102,
  custom: 106,
  max: 104,
  max_plus: 108,
  off: 105,
  silent: 101,
  turbo: 103,
} as const;

const SUCTION_POWER_LABELS = {
  101: 'Silent',
  102: 'Balanced',
  103: 'Turbo',
  104: 'Max',
  105: 'Off',
  106: 'Custom',
  108: 'Max+',
} as const;

/** Human-readable labels for known numeric Roborock state fields. */
export const ENUM_VALUE_LABELS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  dock_type: {
    0: 'Charging dock',
    1: 'Auto-empty dock',
    2: 'Empty, wash and fill dock',
    3: 'Empty, wash, fill and dry dock',
    5: 'Auto-empty dock (Q8 Max+)',
    7: 'Empty, wash, fill and dry dock (S8 Pro Ultra)',
    8: 'Empty, wash, fill and dry dock (Q Revo)',
    9: 'Empty, wash, fill and dry dock (Q Revo Pro)',
    20: 'Auto-empty dock (K1S / Qrevo CurvX)',
  },
  error_code: {
    [-1]: 'Unknown error',
    0: 'No error',
    1: 'Laser sensor fault',
    2: 'Collision sensor fault',
    3: 'Wheel floating',
    4: 'Cliff sensor fault',
    5: 'Main brush blocked',
    6: 'Side brush blocked',
    7: 'Wheel blocked',
    8: 'Robot stuck',
    9: 'Dust bin missing',
    10: 'Filter blocked',
    11: 'Magnetic field detected',
    12: 'Low battery',
    13: 'Charging problem',
    14: 'Battery failure',
    15: 'Wall sensor fault',
    16: 'Uneven surface',
    17: 'Side-brush failure',
    18: 'Suction-fan failure',
    19: 'Charging station has no power',
    20: 'Unknown error',
    21: 'Laser pressure sensor problem',
    22: 'Charge sensor problem',
    23: 'Dock problem',
    24: 'No-go zone or invisible wall detected',
    254: 'Dust bin full',
    255: 'Internal error',
  },
  fan_power: SUCTION_POWER_LABELS,
  mop_mode: { 300: 'Standard', 301: 'Deep', 303: 'Deep+', 304: 'Fast' },
  state: {
    0: 'Unknown',
    1: 'Initiating',
    2: 'Sleeping',
    3: 'Idle',
    4: 'Remote control',
    5: 'Cleaning',
    6: 'Returning to dock',
    7: 'Manual mode',
    8: 'Charging',
    9: 'Charging error',
    10: 'Paused',
    11: 'Spot cleaning',
    12: 'Error',
    13: 'Shutting down',
    14: 'Updating',
    15: 'Docking',
    16: 'Going to target',
    17: 'Zone cleaning',
    18: 'Room cleaning',
    22: 'Emptying dust container',
    23: 'Washing mop',
    26: 'Going to wash mop',
    28: 'In call',
    29: 'Mapping',
    100: 'Fully charged',
  },
  suction_power_code: SUCTION_POWER_LABELS,
  water_box_custom_mode: { 200: 'Off', 201: 'Mild', 202: 'Moderate', 203: 'Intense' },
  water_box_mode: { 200: 'Off', 201: 'Mild', 202: 'Moderate', 203: 'Intense' },
};

/** Returns a documented human-readable label for a numeric Roborock state value. */
export function humanizeRoborockEnum(field: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return;
  return ENUM_VALUE_LABELS[field]?.[value];
}

/** Values published below the MQTT authentication-status topic. */
export type RoborockAuthenticationStatus = 'authenticated' | 'failed' | 'verification-code-sent';

/** Command names accepted by the bridge. */
export type RoborockCommandName = keyof typeof COMMAND_METHODS;

/** A supported named Roborock suction-power level. */
export type SuctionPowerLevel = keyof typeof SUCTION_POWER_LEVELS;

/** Persisted cloud authentication payload. */
export type RoborockSession = Record<string, unknown>;

/** Command payload received from MQTT. */
export interface RoborockCommand {
  command: RoborockCommandName;
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
