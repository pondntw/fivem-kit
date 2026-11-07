/**
 * End-to-end check of the whole flow, the way a user runs it:
 *   1. create-fivem-kit scaffolds a project (using this checkout of fivem-kit)
 *   2. npm install, typecheck, production build
 *   3. `fivem-kit dev` against a fake FXServer: editing Lua, the UI and bridge.json
 *      must each end in `ensure <resource>` over RCON
 *
 * Run with: npm run e2e   (needs network for npm install; takes ~1 minute)
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const work = path.join(repo, '.tmp', 'e2e');
const name = 'e2e_shop';
const project = path.join(work, name);
const web = path.join(project, 'web');
const isWin = process.platform === 'win32';

function step(msg: string) {
  console.log(`\n▶ ${msg}`);
}

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin && !path.isAbsolute(cmd), env: { ...process.env, ...env } });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} failed in ${cwd}`);
}

step('build packages');
run('npm', ['run', 'build'], repo);

step('scaffold');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
run(
  process.execPath,
  [path.join(repo, 'packages/create-fivem-kit/dist/index.js'), name, '--framework', 'esx', '--yes', '--no-install'],
  work,
  { FIVEM_KIT_LOCAL: path.join(repo, 'packages/fivem-kit') },
);
assert.ok(existsSync(path.join(project, 'fxmanifest.lua')), 'scaffold did not create the project');

step('npm install');
assert.ok(!existsSync(path.join(project, 'package.json')), 'package.json must not be in the resource root (yarn builder)');
run('npm', ['install', '--no-audit', '--no-fund'], web);

step('typecheck + gen --check + build');
run('npm', ['run', 'typecheck'], web);
run('npx', ['fivem-kit', 'gen', '--check'], web);
run('npm', ['run', 'build'], web);
const html = readFileSync(path.join(project, 'web/dist/index.html'), 'utf8');
assert.match(html, /src="\.\/assets\/[^"]+\.js"/, 'built index.html must use relative asset paths for NUI');
assert.doesNotMatch(html, /src="\/assets/, 'absolute asset paths break in NUI');

step('dev mode against a fake FXServer');
const received: string[] = [];
const server = createSocket('udp4');
server.on('message', (msg, rinfo) => {
  received.push(msg.subarray(4).toString('utf8'));
  server.send(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from(`print Started resource ${name}\n`)]), rinfo.port, rinfo.address);
});
await new Promise<void>((r) => server.bind(0, '127.0.0.1', r));
const port = server.address().port;
writeFileSync(path.join(project, '.env'), `FIVEM_RCON_PASSWORD=e2e-pass\nFIVEM_RCON_PORT=${port}\n`);

const kitCli = path.join(repo, 'packages/fivem-kit/dist/cli.js');
const dev: ChildProcess = spawn(process.execPath, [kitCli, 'dev'], { cwd: web, stdio: ['ignore', 'pipe', 'pipe'] });
let devOutput = '';
dev.stdout!.on('data', (d) => (devOutput += d));
dev.stderr!.on('data', (d) => (devOutput += d));

async function waitFor(what: string, check: () => boolean, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}\n--- dev output ---\n${devOutput}`);
}

const ensures = () => received.filter((r) => r === `rcon e2e-pass ensure ${name}`).length;

try {
  await waitFor('initial UI build restart', () => ensures() >= 1);
  console.log('  ✔ initial build → ensure');

  let before = ensures();
  appendFileSync(path.join(project, 'client/main.lua'), '\n-- e2e edit\n');
  await waitFor('restart after Lua edit', () => ensures() > before);
  console.log('  ✔ Lua edit → ensure');

  before = ensures();
  const app = path.join(project, 'web/src/App.tsx');
  writeFileSync(app, readFileSync(app, 'utf8').replace('Esc to close', 'Press Esc to close'));
  await waitFor('restart after UI edit', () => ensures() > before);
  const assets = path.join(project, 'web/dist/assets');
  await waitFor('UI change in dist', () =>
    readdirSync(assets).some((f) => f.endsWith('.js') && readFileSync(path.join(assets, f), 'utf8').includes('Press Esc to close')),
  );
  console.log('  ✔ UI edit → rebuilt + ensure');

  before = ensures();
  const bridgeFile = path.join(project, 'bridge.json');
  const bridge = JSON.parse(readFileSync(bridgeFile, 'utf8'));
  bridge.toUi.notify = { text: 'string' };
  writeFileSync(bridgeFile, JSON.stringify(bridge, null, 2));
  await waitFor('bridge regenerated', () => readFileSync(path.join(project, 'client/bridge.gen.lua'), 'utf8').includes('function Ui.notify('));
  assert.match(readFileSync(path.join(project, 'web/src/bridge.gen.ts'), 'utf8'), /notify: \{\n\s+text: string;/);
  await waitFor('restart after bridge edit', () => ensures() > before);
  console.log('  ✔ bridge.json edit → regenerated TS + Lua + ensure');
} finally {
  dev.kill();
  server.close();
}

console.log('\n✔ e2e passed');
