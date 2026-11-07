import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The slice of Vite's API that fivem-kit uses. Vite is the project's dependency, not ours. */
export interface ViteApi {
  build(config: Record<string, unknown>): Promise<unknown>;
}

export interface RollupWatcherEvent {
  code: 'START' | 'BUNDLE_START' | 'BUNDLE_END' | 'END' | 'ERROR';
  error?: Error;
  result?: { close(): Promise<void> } | null;
}

export interface RollupWatcher {
  on(event: 'event', listener: (e: RollupWatcherEvent) => void): void;
  close(): Promise<void>;
}

type ExportTarget = string | { import?: ExportTarget; default?: ExportTarget; node?: ExportTarget } | undefined;

function pickEntry(target: ExportTarget): string | undefined {
  if (typeof target === 'string') return target;
  if (!target) return undefined;
  return pickEntry(target.import) ?? pickEntry(target.node) ?? pickEntry(target.default);
}

/**
 * Loads the ESM entry of `vite` installed in the user's project (so we always use their version).
 * require.resolve would pick the CommonJS entry, which newer Vite versions don't ship.
 */
export async function loadVite(root: string): Promise<ViteApi> {
  const req = createRequire(path.join(root, 'package.json'));
  let pkgPath: string;
  try {
    pkgPath = req.resolve('vite/package.json');
  } catch {
    throw new Error('vite is not installed in this project. Run `npm install` first.');
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    exports?: Record<string, ExportTarget> | string;
    module?: string;
    main?: string;
  };
  const dotExport = typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.'];
  const entry = pickEntry(dotExport) ?? pkg.module ?? pkg.main ?? 'index.js';
  return (await import(pathToFileURL(path.join(path.dirname(pkgPath), entry)).href)) as ViteApi;
}
