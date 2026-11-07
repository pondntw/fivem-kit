import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KitConfig } from '../config.ts';
import { generateLua } from './gen-lua.ts';
import { generateTs } from './gen-ts.ts';
import { BridgeError, parseBridge } from './schema.ts';

export { BridgeError, parseBridge } from './schema.ts';
export type { Bridge, Field, NuiCallback, TypeNode, UiMessage } from './schema.ts';
export { generateLua } from './gen-lua.ts';
export { generateTs } from './gen-ts.ts';

export interface GenerateResult {
  /** Files (relative to root) whose content changed — or would change, with check: true. */
  changed: string[];
}

export function readBridge(config: KitConfig) {
  const file = path.join(config.root, config.bridge);
  if (!existsSync(file)) throw new Error(`${config.bridge} not found in ${config.root}`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new BridgeError([`${config.bridge} is not valid JSON: ${(err as Error).message}`]);
  }
  return parseBridge(json);
}

/**
 * Regenerates the TS and Lua bridge files. Only writes files whose content changed,
 * so watchers (Vite, the Lua watcher) don't fire for no reason.
 * With check: true nothing is written — use it in CI to fail on stale generated files.
 */
export function generate(config: KitConfig, opts: { check?: boolean } = {}): GenerateResult {
  const bridge = readBridge(config);
  const outputs: [string, string][] = [
    [config.out.ts, generateTs(bridge)],
    [config.out.lua, generateLua(bridge)],
  ];
  const changed: string[] = [];
  for (const [rel, content] of outputs) {
    const file = path.join(config.root, rel);
    const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === content) continue;
    changed.push(rel);
    if (!opts.check) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }
  return { changed };
}
