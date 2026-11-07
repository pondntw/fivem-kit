#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { parseArgs, styleText } from 'node:util';
import { FRAMEWORKS, scaffold, validateName, type Framework } from './scaffold.ts';

const HELP = `Create a FiveM resource with a React + TypeScript NUI, a type-safe Lua bridge and in-game hot reload.

Usage
  npm create fivem-kit@latest [name] -- [options]

Options
  --framework <esx|qbcore|standalone>
  --ox-lib / --no-ox-lib        use ox_lib callbacks (default: yes)
  --oxmysql / --no-oxmysql      add oxmysql to the manifest (default: no)
  --no-install                  don't run npm install
  -y, --yes                     accept defaults for anything not given
  -h, --help`;

const FRAMEWORK_LABELS: Record<Framework, string> = {
  esx: 'ESX Legacy',
  qbcore: 'QBCore',
  standalone: 'Standalone (no framework)',
};

function kitVersion(): string {
  // Contributors can point generated projects at a local checkout of fivem-kit.
  if (process.env.FIVEM_KIT_LOCAL) return `file:${path.resolve(process.env.FIVEM_KIT_LOCAL)}`;
  const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  return own.dependencies['fivem-kit'] ?? 'latest';
}

function packageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const agent = process.env.npm_config_user_agent ?? '';
  if (agent.startsWith('pnpm')) return 'pnpm';
  if (agent.startsWith('yarn')) return 'yarn';
  if (agent.startsWith('bun')) return 'bun';
  return 'npm';
}

async function ask(rl: Interface, question: string, fallback: string): Promise<string> {
  const answer = (await rl.question(`${styleText('cyan', '?')} ${question} ${styleText('dim', `(${fallback})`)} `)).trim();
  return answer || fallback;
}

async function askYesNo(rl: Interface, question: string, fallback: boolean): Promise<boolean> {
  const hint = styleText('dim', fallback ? '(Y/n)' : '(y/N)');
  for (;;) {
    const a = (await rl.question(`${styleText('cyan', '?')} ${question} ${hint} `)).trim().toLowerCase();
    if (a === '') return fallback;
    if (['y', 'yes'].includes(a)) return true;
    if (['n', 'no'].includes(a)) return false;
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      framework: { type: 'string' },
      'ox-lib': { type: 'boolean' },
      'no-ox-lib': { type: 'boolean' },
      oxmysql: { type: 'boolean' },
      'no-oxmysql': { type: 'boolean' },
      'no-install': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const interactive = process.stdin.isTTY && !values.yes;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;

  try {
    console.log(`\n${styleText('bold', 'fivem-kit')} ${styleText('dim', '— new FiveM resource')}\n`);

    let target = positionals[0];
    for (;;) {
      if (!target) target = rl ? await ask(rl, 'Resource name', 'my-resource') : 'my-resource';
      const err = validateName(path.basename(target));
      if (!err) break;
      console.log(styleText('red', `  ${err}`));
      if (!rl) return 1;
      target = undefined;
    }

    let framework = values.framework as Framework | undefined;
    if (framework && !FRAMEWORKS.includes(framework)) {
      console.log(styleText('red', `Unknown framework "${framework}". Use one of: ${FRAMEWORKS.join(', ')}`));
      return 1;
    }
    if (!framework) {
      if (rl) {
        FRAMEWORKS.forEach((f, i) => console.log(`  ${i + 1}) ${FRAMEWORK_LABELS[f]}`));
        for (;;) {
          const pick = Number(await ask(rl, 'Framework', '1'));
          framework = FRAMEWORKS[pick - 1];
          if (framework) break;
        }
      } else framework = 'esx';
    }

    const flag = (yes: boolean | undefined, no: boolean | undefined) => (yes ? true : no ? false : undefined);
    const oxlib = flag(values['ox-lib'], values['no-ox-lib']) ?? (rl ? await askYesNo(rl, 'Use ox_lib (callbacks, notify)?', true) : true);
    const oxmysql = flag(values.oxmysql, values['no-oxmysql']) ?? (rl ? await askYesNo(rl, 'Add oxmysql?', false) : false);

    const dir = path.resolve(target);
    const name = path.basename(dir);
    const files = scaffold(dir, { name, framework, oxlib, oxmysql, kitVersion: kitVersion() });
    console.log(`\n${styleText('green', '✔')} Created ${styleText('bold', name)} (${FRAMEWORK_LABELS[framework]}) with ${files.length} files`);

    const pm = packageManager();
    if (!values['no-install']) {
      console.log(styleText('dim', `\n  ${pm} install...\n`));
      // On Windows npm is a .cmd shim, which needs a shell; pass one string so Node doesn't warn (DEP0190).
      const webDir = path.join(dir, 'web');
      const r = process.platform === 'win32'
        ? spawnSync(`${pm} install`, { cwd: webDir, stdio: 'inherit', shell: true })
        : spawnSync(pm, ['install'], { cwd: webDir, stdio: 'inherit' });
      if (r.status !== 0) console.log(styleText('yellow', `\n  ${pm} install failed — run it yourself inside ${name}/web/`));
    }

    const rel = path.relative(process.cwd(), dir) || '.';
    console.log(`
${styleText('bold', 'Next steps')}
  1. Put ${styleText('cyan', rel)} inside your server's resources folder (or create it there)
  2. Hot reload in-game: copy .env.example to .env, set FIVEM_RCON_PASSWORD,
     and add ${styleText('cyan', 'set rcon_password "<same password>"')} to server.cfg (restart the server after)
  3. ${styleText('cyan', `cd ${path.join(rel, 'web')}`)} and ${styleText('cyan', `${pm} run dev`)}
  4. In game: ${styleText('cyan', `/${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`)}

  UI only, in the browser with mock data: ${styleText('cyan', `${pm} run dev:ui`)}
  Messages between Lua and the UI live in ${styleText('cyan', 'bridge.json')}
`);
    return 0;
  } finally {
    rl?.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(styleText('red', err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  },
);
