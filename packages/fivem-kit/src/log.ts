import { styleText } from 'node:util';

type Style = Parameters<typeof styleText>[0];

function stamp(): string {
  return styleText('dim', new Date().toLocaleTimeString('en-GB'));
}

function line(style: Style, tag: string, msg: string): void {
  console.log(`${stamp()} ${styleText(style, tag)} ${msg}`);
}

export const log = {
  info: (msg: string) => line('cyan', '[kit]', msg),
  ok: (msg: string) => line('green', '[kit]', msg),
  warn: (msg: string) => line('yellow', '[kit]', msg),
  error: (msg: string) => line('red', '[kit]', msg),
};
