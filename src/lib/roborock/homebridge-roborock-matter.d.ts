declare module 'homebridge-roborock-matter/roborockLib/roborockAPI' {
  export interface RoborockLogger {
    debug(message: unknown): void;
    error(message: unknown): void;
    info(message: unknown): void;
    warn(message: unknown): void;
  }

  export interface RoborockOptions {
    baseURL: string;
    cloudOnlyMode: boolean;
    language: string;
    log: RoborockLogger;
    password?: string;
    updateInterval: number;
    userData?: Record<string, unknown>;
    username: string;
  }

  export interface RoborockState {
    ack?: boolean;
    val?: unknown;
  }

  export class Roborock {
    public readonly states: Record<string, RoborockState>;

    constructor(options: RoborockOptions);
    app_charge(duid: string, options?: Record<string, unknown>): Promise<void>;
    app_pause(duid: string, options?: Record<string, unknown>): Promise<void>;
    app_start(duid: string, options?: Record<string, unknown>): Promise<void>;
    app_stop(duid: string, options?: Record<string, unknown>): Promise<void>;
    find_me(duid: string, options?: Record<string, unknown>): Promise<void>;
    isInited(): boolean;
    sendTwoFactorEmail(): Promise<{ ok: boolean }>;
    setDeviceNotify(callback: (id: string, state: unknown) => void): void;
    setStateAsync(id: string, state: RoborockState): Promise<void>;
    startService(callback: () => void): Promise<void>;
    stopService(): Promise<void>;
    verifyTwoFactorCode(code: string): Promise<unknown>;
  }
}
