/**
 * Tiny template renderer for the resource template.
 *
 *   {{name}}                 replaced with vars.name (unknown keys are an error, so typos fail loudly)
 *   {{#if esx}} ... {{/if}}  keep the lines in between only when the flag is on
 *   {{#if esx|qbcore}}       any of the flags
 *   {{#if !oxlib}}           flag is off
 *
 * Block tags must sit on their own line (leading whitespace is fine); the tag lines themselves are dropped.
 */

export type Flags = Record<string, boolean>;
export type Vars = Record<string, string>;

const IF_TAG = /^\s*\{\{#if\s+(!?)([A-Za-z_][\w|]*)\s*\}\}\s*$/;
const END_TAG = /^\s*\{\{\/if\}\}\s*$/;
const VAR = /\{\{\s*([A-Za-z_]\w*)\s*\}\}/g;

export class TemplateError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'TemplateError';
  }
}

export function render(source: string, flags: Flags, vars: Vars, file = 'template'): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  // Stack of "is this block active"; a line is kept only if every enclosing block is active.
  const stack: boolean[] = [];
  const active = () => stack.every(Boolean);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const open = IF_TAG.exec(line);
    if (open) {
      const negate = open[1] === '!';
      const names = open[2]!.split('|');
      for (const n of names) {
        if (!(n in flags)) throw new TemplateError(file, lineNo, `unknown flag "${n}"`);
      }
      const any = names.some((n) => flags[n]);
      stack.push(negate ? !any : any);
      return;
    }
    if (END_TAG.test(line)) {
      if (stack.length === 0) throw new TemplateError(file, lineNo, '{{/if}} without a matching {{#if}}');
      stack.pop();
      return;
    }
    if (!active()) return;
    out.push(
      line.replace(VAR, (_m, key: string) => {
        if (!(key in vars)) throw new TemplateError(file, lineNo, `unknown variable "${key}"`);
        return vars[key]!;
      }),
    );
  });

  if (stack.length > 0) throw new TemplateError(file, lines.length, 'unclosed {{#if}}');
  return out.join('\n');
}
