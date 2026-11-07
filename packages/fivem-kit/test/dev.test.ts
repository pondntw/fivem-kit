import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRestarter, isLuaChange } from '../src/dev.ts';

describe('createRestarter', () => {
  it('collapses a burst of changes into one restart with all reasons', async () => {
    const runs: string[][] = [];
    const r = createRestarter({ delayMs: 30, run: async (reasons) => void runs.push(reasons) });
    r.schedule('client/main.lua');
    r.schedule('server/main.lua');
    r.schedule('client/main.lua');
    r.schedule('ui');
    await sleep(80);
    assert.deepEqual(runs, [['client/main.lua', 'server/main.lua', 'ui']]);
  });

  it('does not lose changes that arrive while a restart is running', async () => {
    const runs: string[][] = [];
    const r = createRestarter({
      delayMs: 10,
      run: async (reasons) => {
        runs.push(reasons);
        await sleep(50);
      },
    });
    r.schedule('a.lua');
    await sleep(20); // first restart is now in flight
    r.schedule('b.lua');
    await sleep(120);
    assert.deepEqual(runs, [['a.lua'], ['b.lua']]);
  });

  it('cancel drops pending changes', async () => {
    let count = 0;
    const r = createRestarter({ delayMs: 10, run: async () => void count++ });
    r.schedule('x.lua');
    r.cancel();
    await sleep(40);
    assert.equal(count, 0);
  });
});

describe('isLuaChange', () => {
  it('matches Lua files and manifests only', () => {
    assert.equal(isLuaChange('client/main.lua'), true);
    assert.equal(isLuaChange('fxmanifest.lua'), true);
    assert.equal(isLuaChange('C:\\res\\shared\\Config.LUA'), true);
    assert.equal(isLuaChange('web/src/App.tsx'), false);
    assert.equal(isLuaChange('client/main.lua~'), false);
  });
});
