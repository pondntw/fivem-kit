import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { generate } from '../src/bridge/index.ts';
import { generateLua } from '../src/bridge/gen-lua.ts';
import { generateTs } from '../src/bridge/gen-ts.ts';
import { parseBridge } from '../src/bridge/schema.ts';
import { loadConfig } from '../src/config.ts';
import { findLuac, luaSyntaxError } from './helpers.ts';

const SAMPLE = {
  toUi: {
    setVisible: { visible: 'boolean' },
    setShop: {
      title: 'string',
      'subtitle?': 'string',
      items: [{ name: 'string', price: 'number', tags: 'string[]', meta: { rare: 'boolean' } }],
    },
  },
  toClient: {
    close: {},
    buy: {
      request: { item: 'string', amount: 'number' },
      response: { ok: 'boolean', message: 'string?', extra: 'any' },
    },
  },
};

function typeErrors(files: Record<string, string>): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'fivem-kit-ts-'));
  const names = Object.entries(files).map(([name, src]) => {
    const file = path.join(dir, name);
    writeFileSync(file, src);
    return file;
  });
  const program = ts.createProgram(names, {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  });
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('generateTs', () => {
  const out = generateTs(parseBridge(SAMPLE));

  it('produces types that accept valid data and reject invalid data', () => {
    const usage = `
      import type { NuiCallbacks, UiMessages } from './bridge.gen';
      const shop: UiMessages['setShop'] = {
        title: 'Shop',
        items: [{ name: 'water', price: 5, tags: [], meta: { rare: false } }],
      };
      const req: NuiCallbacks['buy']['request'] = { item: 'water', amount: 1 };
      const res: NuiCallbacks['buy']['response'] = { ok: true, extra: 1 };
      // @ts-expect-error amount must be a number
      const bad: NuiCallbacks['buy']['request'] = { item: 'water', amount: '1' };
      // @ts-expect-error unknown message name
      type Missing = UiMessages['nope'];
      // @ts-expect-error close takes no fields
      const closeReq: NuiCallbacks['close']['request'] = { x: 1 };
      export { shop, req, res, bad, closeReq };
      export type { Missing };
    `;
    assert.deepEqual(typeErrors({ 'bridge.gen.ts': out, 'usage.ts': usage }), []);
  });

  it('lists message names as const tuples', () => {
    assert.match(out, /uiMessageNames = \["setVisible","setShop"\] as const/);
    assert.match(out, /nuiCallbackNames = \["close","buy"\] as const/);
  });
});

describe('generateLua', () => {
  const out = generateLua(parseBridge(SAMPLE));

  it('writes LuaLS classes, including nested ones', () => {
    assert.match(out, /---@class UiMessage\.setShop\n---@field title string\n---@field subtitle\? string\n---@field items UiMessage\.setShop\.items\[\]/);
    assert.match(out, /---@class UiMessage\.setShop\.items\n---@field name string\n---@field price number\n---@field tags string\[\]\n---@field meta UiMessage\.setShop\.items\.meta/);
    assert.match(out, /---@class NuiResponse\.buy\n---@field ok boolean\n---@field message\? string\n---@field extra any/);
  });

  it('wraps SendNUIMessage and RegisterNUICallback', () => {
    assert.match(out, /function Ui\.setVisible\(data\)\n {4}SendNUIMessage\(\{ action = 'setVisible', data = data or \{\} \}\)/);
    assert.match(out, /function Nui\.buy\(handler\)\n {4}RegisterNUICallback\('buy'/);
    assert.match(out, /cb\(\{ __error = tostring\(result\) \}\)/);
  });

  it('is valid Lua 5.4', { skip: findLuac() ? false : 'luac 5.4 not installed' }, () => {
    assert.equal(luaSyntaxError(out), null);
  });
});

describe('generate (files)', () => {
  it('writes both files, then reports nothing changed, and --check detects drift', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fivem-kit-gen-'));
    writeFileSync(path.join(root, 'bridge.json'), JSON.stringify(SAMPLE));
    const config = loadConfig(root);

    assert.deepEqual(generate(config).changed, ['web/src/bridge.gen.ts', 'client/bridge.gen.lua']);
    assert.match(readFileSync(path.join(root, 'client/bridge.gen.lua'), 'utf8'), /AUTO-GENERATED/);
    assert.deepEqual(generate(config).changed, []);
    assert.deepEqual(generate(config, { check: true }).changed, []);

    writeFileSync(path.join(root, 'bridge.json'), JSON.stringify({ toUi: { ping: {} } }));
    assert.deepEqual(generate(config, { check: true }).changed, ['web/src/bridge.gen.ts', 'client/bridge.gen.lua']);
    assert.doesNotMatch(readFileSync(path.join(root, 'web/src/bridge.gen.ts'), 'utf8'), /ping/, 'check must not write');
  });

  it('treats CRLF checkouts as unchanged', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fivem-kit-crlf-'));
    writeFileSync(path.join(root, 'bridge.json'), JSON.stringify(SAMPLE));
    const config = loadConfig(root);
    generate(config);
    const lua = path.join(root, 'client/bridge.gen.lua');
    writeFileSync(lua, readFileSync(lua, 'utf8').replace(/\n/g, '\r\n'));
    assert.deepEqual(generate(config, { check: true }).changed, []);
  });

  it('finds the resource root (fxmanifest.lua) when run from web/', () => {
    const root = path.join(mkdtempSync(path.join(tmpdir(), 'fivem-kit-root-')), 'my_res');
    mkdirSync(path.join(root, 'web', 'src'), { recursive: true });
    writeFileSync(path.join(root, 'fxmanifest.lua'), "fx_version 'cerulean'\n");
    const config = loadConfig(path.join(root, 'web'));
    assert.equal(config.root, root);
    assert.equal(config.webDir, path.join(root, 'web'));
    assert.equal(config.resource, 'my_res');
  });

  it('respects custom output paths from fivem-kit.config.json', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fivem-kit-cfg-'));
    mkdirSync(path.join(root, 'ui'));
    writeFileSync(path.join(root, 'nui.json'), JSON.stringify(SAMPLE));
    writeFileSync(path.join(root, 'fivem-kit.config.json'), JSON.stringify({
      resource: 'my_shop', bridge: 'nui.json', out: { ts: 'ui/gen.ts', lua: 'cl/gen.lua' },
    }));
    const config = loadConfig(root);
    assert.equal(config.resource, 'my_shop');
    assert.deepEqual(generate(config).changed, ['ui/gen.ts', 'cl/gen.lua']);
  });
});
