import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, loadConfig } from 'fivem-kit';
import { render, type Flags } from './render.ts';

export const FRAMEWORKS = ['esx', 'qbcore', 'standalone'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export interface ScaffoldOptions {
  /** Resource name = folder name. FiveM only allows letters, digits, - and _. */
  name: string;
  framework: Framework;
  oxlib: boolean;
  oxmysql: boolean;
  /** Version range (or file: path) used for the fivem-kit devDependency. */
  kitVersion: string;
}

export const TEMPLATE_DIR = fileURLToPath(new URL('../template/', import.meta.url));

/** Versions pinned for generated projects. Bump together and re-run the e2e test. */
export const DEPENDENCIES = {
  react: '^19.3.1',
  'react-dom': '^19.3.1',
};
export const DEV_DEPENDENCIES = {
  '@types/node': '^24.0.0',
  '@types/react': '^19.3.0',
  '@types/react-dom': '^19.3.0',
  '@vitejs/plugin-react': '^6.2.1',
  typescript: '^5.9.3',
  vite: '^8.3.6',
};

const NAME = /^[A-Za-z0-9_-]+$/;

export function validateName(name: string): string | null {
  if (!name) return 'Enter a resource name';
  if (!NAME.test(name)) return 'Use only letters, digits, - and _ (FiveM resource names cannot contain spaces or dots)';
  if (name.length > 64) return 'Keep the name under 64 characters';
  return null;
}

/** Folder names that npm would strip or ignore when publishing get a leading underscore in the template. */
function outputName(templateName: string): string {
  if (templateName === '_gitignore') return '.gitignore';
  if (templateName === '_env.example') return '.env.example';
  if (templateName === '_vscode') return '.vscode';
  return templateName.endsWith('.tpl') ? templateName.slice(0, -4) : templateName;
}

function walk(dir: string, rel = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(dir, rel))) {
    const relPath = rel ? `${rel}/${entry}` : entry;
    if (statSync(path.join(dir, relPath)).isDirectory()) files.push(...walk(dir, relPath));
    else files.push(relPath);
  }
  return files;
}

function packageJson(opts: ScaffoldOptions): string {
  const pkg = {
    name: opts.name.toLowerCase(),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'fivem-kit dev',
      'dev:ui': 'vite',
      build: 'fivem-kit build',
      gen: 'fivem-kit gen',
      typecheck: 'tsc --noEmit',
    },
    dependencies: DEPENDENCIES,
    devDependencies: { 'fivem-kit': opts.kitVersion, ...DEV_DEPENDENCIES },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/** Writes the project into targetDir (must not exist or be empty) and returns the files created. */
export function scaffold(targetDir: string, opts: ScaffoldOptions): string[] {
  const nameError = validateName(opts.name);
  if (nameError) throw new Error(nameError);
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new Error(`${targetDir} already exists and is not empty`);
  }

  const flags: Flags = {
    esx: opts.framework === 'esx',
    qbcore: opts.framework === 'qbcore',
    standalone: opts.framework === 'standalone',
    oxlib: opts.oxlib,
    oxmysql: opts.oxmysql,
  };
  const vars = {
    name: opts.name,
    command: opts.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    framework: opts.framework,
  };

  const created: string[] = [];
  for (const rel of walk(TEMPLATE_DIR)) {
    const outRel = rel.split('/').map(outputName).join('/');
    const src = readFileSync(path.join(TEMPLATE_DIR, rel), 'utf8');
    const content = rel.endsWith('.tpl') ? render(src, flags, vars, rel) : src;
    const dest = path.join(targetDir, outRel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, content);
    created.push(outRel);
  }

  writeFileSync(path.join(targetDir, 'package.json'), packageJson(opts));
  created.push('package.json');

  // Generate the bridge now so the project type-checks and runs before the first `npm run dev`.
  const { changed } = generate(loadConfig(targetDir));
  created.push(...changed);
  return created.sort();
}
