import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface KitConfig {
  /** Absolute project (resource) directory. */
  root: string;
  /** FiveM resource name, used for `ensure <resource>` over RCON. Defaults to the folder name. */
  resource: string;
  /** Path of bridge.json, relative to root. */
  bridge: string;
  out: { ts: string; lua: string };
  /** Paths (relative to root) whose .lua / fxmanifest changes trigger a resource restart. */
  watch: string[];
  rcon: { host: string; port: number; password: string | undefined };
}

interface RawConfig {
  resource?: string;
  bridge?: string;
  out?: { ts?: string; lua?: string };
  watch?: string[];
  rcon?: { host?: string; port?: number };
}

export const CONFIG_FILE = 'fivem-kit.config.json';

/**
 * Reads fivem-kit.config.json (all keys optional) and .env.
 * The RCON password only comes from the environment (FIVEM_RCON_PASSWORD) so it never lands in git.
 */
export function loadConfig(root: string): KitConfig {
  const abs = path.resolve(root);
  const file = path.join(abs, CONFIG_FILE);
  let raw: RawConfig = {};
  if (existsSync(file)) {
    try {
      raw = JSON.parse(readFileSync(file, 'utf8')) as RawConfig;
    } catch (err) {
      throw new Error(`${CONFIG_FILE} is not valid JSON: ${(err as Error).message}`);
    }
  }

  const envFile = path.join(abs, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  return {
    root: abs,
    resource: raw.resource ?? path.basename(abs),
    bridge: raw.bridge ?? 'bridge.json',
    out: {
      ts: raw.out?.ts ?? 'web/src/bridge.gen.ts',
      lua: raw.out?.lua ?? 'client/bridge.gen.lua',
    },
    watch: raw.watch ?? ['client', 'server', 'shared', 'fxmanifest.lua'],
    rcon: {
      host: process.env.FIVEM_RCON_HOST ?? raw.rcon?.host ?? '127.0.0.1',
      port: Number(process.env.FIVEM_RCON_PORT ?? raw.rcon?.port ?? 30120),
      password: process.env.FIVEM_RCON_PASSWORD || undefined,
    },
  };
}
