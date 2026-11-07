#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generate } from './bridge/index.ts';
import { BridgeError } from './bridge/schema.ts';
import { loadConfig } from './config.ts';
import { build, dev } from './dev.ts';
import { log } from './log.ts';
import { sendRcon } from './rcon.ts';

const HELP = `fivem-kit — type-safe NUI bridge and hot reload for FiveM resources

Usage
  fivem-kit dev [--no-restart]   Watch Lua + UI, rebuild, and restart the resource in-game over RCON
  fivem-kit build                Generate the bridge and build the UI for production
  fivem-kit gen [--check]        Generate web/src/bridge.gen.ts and client/bridge.gen.lua from bridge.json
                                 --check: don't write, exit 1 if generated files are stale (for CI)
  fivem-kit restart              Send "ensure <resource>" over RCON once

Options
  --cwd <dir>     Resource folder (default: current directory)
  -h, --help      Show this help
  -v, --version   Show version

RCON (for hot reload): set FIVEM_RCON_PASSWORD in .env, and rcon_password in server.cfg.
Docs: https://github.com/pondntw/fivem-kit`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: 'string' },
      check: { type: 'boolean' },
      'no-restart': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.version) {
    console.log(version());
    return 0;
  }
  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }

  const config = loadConfig(values.cwd ?? process.cwd());

  switch (command) {
    case 'gen': {
      const { changed } = generate(config, { check: values.check });
      if (values.check) {
        if (changed.length) {
          log.error(`generated files are out of date: ${changed.join(', ')} — run \`npx fivem-kit gen\``);
          return 1;
        }
        log.ok('generated files are up to date');
      } else {
        log.ok(changed.length ? `wrote ${changed.join(', ')}` : 'bridge already up to date');
      }
      return 0;
    }
    case 'build':
      await build(config);
      return 0;
    case 'dev': {
      const session = await dev(config, { restart: !values['no-restart'] });
      const stop = () => {
        void session.close().then(() => process.exit(0));
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      return new Promise<number>(() => {}); // runs until Ctrl+C
    }
    case 'restart': {
      if (!config.rcon.password) {
        log.error('FIVEM_RCON_PASSWORD is not set (put it in .env)');
        return 1;
      }
      const out = await sendRcon(
        { host: config.rcon.host, port: config.rcon.port, password: config.rcon.password },
        `ensure ${config.resource}`,
      );
      log.ok(`ensure ${config.resource}${out.trim() ? ` — ${out.trim()}` : ''}`);
      return 0;
    }
    default:
      log.error(`unknown command "${command}"\n`);
      console.log(HELP);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof BridgeError) log.error(err.message);
    else log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  },
);
