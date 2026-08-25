import { z } from 'zod';
import { commonSchema, instanceSchema, loadConfig } from './runtime';
export const configSchema = commonSchema
  .extend({
    instances: z
      .array(
        instanceSchema
          .extend({
            authFile: z.string().min(1).optional(),
            baseUrl: z.string().min(1).optional(),
            email: z.email(),
            password: z.string().min(1).optional(),
            session: z.record(z.string(), z.unknown()).optional(),
            verificationCode: z.string().min(1).optional(),
            region: z.enum(['auto', 'eu', 'us', 'cn']).default('auto'),
            logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('warn'),
            updateInterval: z.number().positive().default(30000),
          })
          .refine((value) => !!value.password || !!value.session || !!value.authFile, {
            message: 'password, session, or authFile is required',
          }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => unique(value.instances, ctx));
/**
 * Executes `unique`.
 * @param {{ id: string; topic: string; }[]} instances The instances value.
 * @param {$RefinementCtx<unknown>} ctx The ctx value.
 * @returns {void} Result.
 */
function unique(instances: { id: string; topic: string }[], ctx: z.RefinementCtx) {
  for (const [index, entry] of instances.entries())
    for (let prior = 0; prior < index; prior++)
      if (instances[prior].id === entry.id || instances[prior].topic === entry.topic)
        ctx.addIssue({ code: 'custom', path: ['instances', index], message: 'instance id and topic must be unique' });
}
export type RoborockConfig = z.infer<typeof configSchema>['instances'][number];
export type RoborockLogLevel = RoborockConfig['logLevel'];
export const CONFIG = loadConfig(configSchema);
