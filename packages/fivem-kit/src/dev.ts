import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { generate } from './bridge/index.ts';
import { BridgeError } from './bridge/schema.ts';
import type { KitConfig } from './config.ts';
import { log } from './log.ts';
import { sendRcon } from './rcon.ts';
import { loadVite, type RollupWatcher } from './vite.ts';

/**
 * Collects change reasons and fires one restart after things go quiet.
 * Saving five Lua files at once (or Vite + Lua together) = one `ensure`, not five.
 */
export function createRestarter(opts: { delayMs: number; run: (reasons: string[]) => Promise<void> }) {
  let timer: NodeJS.Timeout | undefined;
  let pending = new Set<string>();
  let running: Promise<void> | null = null;

  const fire = async () => {
    if (running) {
      // A restart is in flight; try again once it finishes so this change isn't lost.
      await running;
    }
    const reasons = [...pending];
    pending = new Set();
    if (reasons.length === 0) return;
    running = opts.run(reasons).finally(() => {
      running = null;
    });
    await running;
  };

  return {
    schedule(reason: string) {
      pending.add(reason);
      clearTimeout(timer);
      timer = setTimeout(() => void fire(), opts.delayMs);
    },
    /** Resolves when nothing is scheduled or running. Used by tests and shutdown. */
    async flush() {
      clearTimeout(timer);
      await fire();
    },
    cancel() {
      clearTimeout(timer);
      pending.clear();
    },
  };
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];

/**
 * Point Vite at the project's config file explicitly. We must not pass `root` when a config exists:
 * inline options override the file, and the template's config sets root to "web".
 */
function viteBase(root: string): Record<string, unknown> {
  const configFile = VITE_CONFIGS.map((f) => path.join(root, f)).find((f) => existsSync(f));
  return configFile ? { configFile } : { root };
}

/** True for files whose change means the resource must be restarted. */
export function isLuaChange(file: string): boolean {
  const base = path.basename(file).toLowerCase();
  return base.endsWith('.lua') || base === 'fxmanifest.lua' || base === '__resource.lua';
}

function runGenerate(config: KitConfig): boolean {
  try {
    const { changed } = generate(config);
    if (changed.length) log.ok(`bridge regenerated: ${changed.join(', ')}`);
    return true;
  } catch (err) {
    if (err instanceof BridgeError) log.error(err.message);
    else log.error((err as Error).message);
    return false;
  }
}

export interface DevOptions {
  /** Restart the resource over RCON after changes (default true). */
  restart?: boolean;
}

export async function dev(config: KitConfig, opts: DevOptions = {}): Promise<{ close(): Promise<void> }> {
  const wantRestart = opts.restart !== false;
  const rconPassword = config.rcon.password;

  if (wantRestart && !rconPassword) {
    log.warn('FIVEM_RCON_PASSWORD is not set, so changes will build but not restart the resource.');
    log.warn('Add it to .env (and `rcon_password "..."` to server.cfg) to enable in-game hot reload.');
  }

  const restarter = createRestarter({
    delayMs: 300,
    run: async (reasons) => {
      if (!wantRestart || !rconPassword) {
        log.info(`changed (${reasons.join(', ')}) — restart the resource yourself: ensure ${config.resource}`);
        return;
      }
      try {
        const out = await sendRcon(
          { host: config.rcon.host, port: config.rcon.port, password: rconPassword },
          `ensure ${config.resource}`,
        );
        const detail = out.trim().split('\n').filter(Boolean).pop();
        log.ok(`restarted ${config.resource} (${reasons.join(', ')})${detail ? ` — ${detail}` : ''}`);
      } catch (err) {
        log.error(`restart failed: ${(err as Error).message}`);
      }
    },
  });

  runGenerate(config);

  // 1) Bridge: regenerate TS + Lua. The Lua output is inside a watched folder, and the TS output is
  //    imported by the UI, so the watchers below pick up the rest automatically.
  const watchers: FSWatcher[] = [];
  const bridgeFile = path.join(config.root, config.bridge);
  if (existsSync(bridgeFile)) {
    let bridgeTimer: NodeJS.Timeout | undefined;
    watchers.push(
      watch(bridgeFile, () => {
        clearTimeout(bridgeTimer);
        bridgeTimer = setTimeout(() => runGenerate(config), 100);
      }),
    );
  }

  // 2) Lua: any .lua / fxmanifest change under the watched paths restarts the resource.
  for (const rel of config.watch) {
    const target = path.join(config.root, rel);
    if (!existsSync(target)) continue;
    watchers.push(
      watch(target, { recursive: true }, (_event, filename) => {
        const file = filename ? path.join(target, filename.toString()) : target;
        if (isLuaChange(file)) restarter.schedule(path.relative(config.root, file).replace(/\\/g, '/'));
      }),
    );
  }

  // 3) UI: Vite rebuilds web/dist on every save; a finished build restarts the resource so the
  //    NUI page reloads in-game.
  const vite = await loadVite(config.root);
  const viteWatcher = (await vite.build({
    ...viteBase(config.root),
    mode: 'development',
    logLevel: 'warn',
    build: { watch: {}, sourcemap: 'inline', minify: false },
  })) as RollupWatcher;

  let firstBuild = true;
  viteWatcher.on('event', (e) => {
    if (e.code === 'BUNDLE_END' || e.code === 'ERROR') void e.result?.close();
    if (e.code === 'ERROR') log.error(`UI build failed: ${e.error?.message ?? 'unknown error'}`);
    if (e.code === 'END') {
      if (firstBuild) {
        firstBuild = false;
        log.ok('UI built — watching for changes');
      }
      restarter.schedule('ui');
    }
  });

  log.info(`dev mode for resource "${config.resource}" — press Ctrl+C to stop`);

  return {
    async close() {
      restarter.cancel();
      for (const w of watchers) w.close();
      await viteWatcher.close();
    },
  };
}

/** One-off production build: regenerate the bridge, then `vite build`. */
export async function build(config: KitConfig): Promise<void> {
  generate(config);
  const vite = await loadVite(config.root);
  await vite.build({ ...viteBase(config.root), mode: 'production', logLevel: 'info' });
}
