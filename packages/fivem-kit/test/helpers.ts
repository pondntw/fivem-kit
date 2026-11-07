import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let cached: string | null | undefined;

/** Finds a Lua 5.4 compiler for syntax checks. Returns null if none is installed (tests then skip). */
export function findLuac(): string | null {
  if (cached !== undefined) return cached;
  for (const bin of [process.env.LUAC, 'luac5.4', 'luac54', 'luac'].filter(Boolean) as string[]) {
    const r = spawnSync(bin, ['-v'], { encoding: 'utf8' });
    if (r.status === 0 && /Lua 5\.4/.test(r.stdout + r.stderr)) return (cached = bin);
  }
  return (cached = null);
}

/** Runs `luac -p` on a Lua source string. Returns the error text, or null if it parses. */
export function luaSyntaxError(source: string): string | null {
  const luac = findLuac();
  if (!luac) throw new Error('luac not available');
  const dir = mkdtempSync(path.join(tmpdir(), 'fivem-kit-lua-'));
  const file = path.join(dir, 'check.lua');
  writeFileSync(file, source);
  const r = spawnSync(luac, ['-p', file], { encoding: 'utf8' });
  return r.status === 0 ? null : (r.stderr || r.stdout);
}
