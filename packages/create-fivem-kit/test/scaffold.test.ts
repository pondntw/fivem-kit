import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { FRAMEWORKS, scaffold, validateName, type Framework } from '../src/scaffold.ts';

function findLuac(): string | null {
  for (const bin of [process.env.LUAC, 'luac5.4', 'luac54', 'luac'].filter(Boolean) as string[]) {
    const r = spawnSync(bin, ['-v'], { encoding: 'utf8' });
    if (r.status === 0 && /Lua 5\.4/.test(r.stdout + r.stderr)) return bin;
  }
  return null;
}
const luac = findLuac();

function make(framework: Framework, oxlib: boolean, oxmysql = false) {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'cfk-')), 'my_shop');
  const files = scaffold(dir, { name: 'my_shop', framework, oxlib, oxmysql, kitVersion: '^0.1.0' });
  const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf8');
  return { dir, files, read };
}

describe('validateName', () => {
  it('accepts FiveM-safe names and rejects the rest', () => {
    assert.equal(validateName('my-shop_2'), null);
    assert.match(validateName('my shop')!, /letters, digits/);
    assert.match(validateName('shop.v2')!, /letters, digits/);
    assert.match(validateName('')!, /Enter/);
  });
});

describe('scaffold', () => {
  it('creates the full project, with dotfiles renamed and the bridge generated', () => {
    const { files } = make('esx', true);
    for (const f of [
      '.env.example', '.gitignore', '.vscode/settings.json', 'README.md', 'bridge.json',
      'client/bridge.gen.lua', 'client/main.lua', 'fxmanifest.lua', 'package.json',
      'server/main.lua', 'shared/config.lua', 'vite.config.ts', 'web/index.html',
      'web/src/App.tsx', 'web/src/bridge.gen.ts', 'web/src/nui.ts',
    ]) {
      assert.ok(files.includes(f), `missing ${f}`);
    }
    assert.ok(!files.some((f) => f.endsWith('.tpl') || f.includes('_gitignore')), 'template names leaked');
  });

  it('refuses to write into a non-empty folder', () => {
    const { dir } = make('standalone', false);
    assert.throws(() => scaffold(dir, { name: 'my_shop', framework: 'esx', oxlib: true, oxmysql: false, kitVersion: '1' }), /not empty/);
  });

  it('writes a package.json with the dev scripts and the fivem-kit dependency', () => {
    const pkg = JSON.parse(make('esx', true).read('package.json'));
    assert.equal(pkg.scripts.dev, 'fivem-kit dev');
    assert.equal(pkg.devDependencies['fivem-kit'], '^0.1.0');
    assert.ok(pkg.devDependencies.vite);
  });

  it('wires ESX + ox_lib + oxmysql into the manifest and code', () => {
    const { read } = make('esx', true, true);
    const manifest = read('fxmanifest.lua');
    assert.match(manifest, /'@ox_lib\/init\.lua',\n {4}'@es_extended\/imports\.lua',/);
    assert.match(manifest, /'@oxmysql\/lib\/MySQL\.lua'/);
    assert.match(manifest, /dependencies \{\n {4}'es_extended',\n {4}'ox_lib',\n {4}'oxmysql',\n\}/);
    assert.match(read('server/main.lua'), /xPlayer\.removeMoney\(total\)/);
    assert.match(read('server/main.lua'), /lib\.callback\.register/);
    assert.match(read('client/main.lua'), /lib\.callback\.await/);
    assert.match(read('shared/config.lua'), /Config\.Command = 'myshop'/);
  });

  it('uses QBCore money and item names for qbcore', () => {
    const { read } = make('qbcore', false);
    const manifest = read('fxmanifest.lua');
    assert.doesNotMatch(manifest, /es_extended|ox_lib/);
    assert.match(manifest, /'qb-core'/);
    assert.match(read('server/main.lua'), /RemoveMoney\('cash'/);
    assert.match(read('server/main.lua'), /RegisterNetEvent\(RESOURCE \.\. ':request'/);
    assert.match(read('client/main.lua'), /promise\.new\(\)/);
    assert.match(read('shared/config.lua'), /water_bottle/);
  });

  it('leaves no template syntax in any output file', () => {
    for (const fw of FRAMEWORKS) {
      for (const oxlib of [true, false]) {
        const { files, read } = make(fw, oxlib, oxlib);
        for (const f of files) {
          assert.doesNotMatch(read(f), /\{\{[#/]|\{\{\s*[A-Za-z_]\w*\s*\}\}/, `${fw}/${oxlib}: ${f}`);
        }
      }
    }
  });

  it('produces valid Lua 5.4 for every framework/option combination', { skip: luac ? false : 'luac 5.4 not installed' }, () => {
    for (const fw of FRAMEWORKS) {
      for (const oxlib of [true, false]) {
        const { dir, files } = make(fw, oxlib, !oxlib);
        const luaFiles = files.filter((f) => f.endsWith('.lua')).map((f) => path.join(dir, f));
        const r = spawnSync(luac!, ['-p', ...luaFiles], { encoding: 'utf8' });
        assert.equal(r.status, 0, `${fw} oxlib=${oxlib}: ${r.stderr}`);
      }
    }
  });

  it('keeps the shop example in sync with the generated bridge', () => {
    // If someone renames a message in the template's bridge.json, the Lua example must follow.
    const { read } = make('esx', true);
    const lua = read('client/main.lua');
    const gen = read('client/bridge.gen.lua');
    for (const call of lua.matchAll(/\b(Ui|Nui)\.(\w+)\(/g)) {
      assert.match(gen, new RegExp(`function ${call[1]}\\.${call[2]}\\(`), `${call[0]} is not generated`);
    }
  });
});

describe('scaffold output stays stable', () => {
  it('re-running gen on a fresh project changes nothing', async () => {
    const { dir } = make('standalone', true);
    const { generate, loadConfig } = await import('fivem-kit');
    assert.deepEqual(generate(loadConfig(dir), { check: true }).changed, []);
    // and editing the bridge is detected
    const file = path.join(dir, 'bridge.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.toUi.ping = {};
    writeFileSync(file, JSON.stringify(json));
    assert.equal(generate(loadConfig(dir), { check: true }).changed.length, 2);
  });
});
