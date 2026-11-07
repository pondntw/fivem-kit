import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface KitConfig {
  /** Absolute resource directory (the folder with fxmanifest.lua). */
  root: string;
  /** Absolute directory of the UI project (package.json, vite.config, node_modules). */
  webDir: string;
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
  web?: string;
  out?: { ts?: string; lua?: string };
  watch?: string[];
  rcon?: { host?: string; port?: number };
}

export const CONFIG_FILE = 'fivem-kit.config.json';

/**
 * The resource root is the nearest folder (start or a parent) that has fxmanifest.lua,
 * so commands work from both the resource folder and its web/ folder.
 * Falls back to `start` when there is no manifest (e.g. a brand-new folder).
 */
export function findResourceRoot(start: string): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'fxmanifest.lua')) || existsSync(path.join(dir, CONFIG_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/**
 * Reads fivem-kit.config.json (all keys optional) and .env (resource root, then web/).
 * The RCON password only comes from the environment (FIVEM_RCON_PASSWORD) so it never lands in git.
 */
export function loadConfig(start: string): KitConfig {
  const root = findResourceRoot(start);
  const file = path.join(root, CONFIG_FILE);
  let raw: RawConfig = {};
  if (existsSync(file)) {
    try {
      raw = JSON.parse(readFileSync(file, 'utf8')) as RawConfig;
    } catch (err) {
      throw new Error(`${CONFIG_FILE} is not valid JSON: ${(err as Error).message}`);
    }
  }

  const webDir = path.join(root, raw.web ?? 'web');
  // loadEnvFile never overrides variables that are already set, so the first file wins.
  for (const envFile of [path.join(root, '.env'), path.join(webDir, '.env')]) {
    if (existsSync(envFile)) process.loadEnvFile(envFile);
  }

  return {
    root,
    webDir,
    resource: raw.resource ?? path.basename(root),
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
