import { createSocket } from 'node:dgram';

/**
 * Minimal client for FXServer's RCON (Quake-style, over UDP on the game port).
 * Enable it on the server with `rcon_password "..."` in server.cfg.
 */

const PREFIX = Buffer.from([0xff, 0xff, 0xff, 0xff]);

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

export class RconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RconError';
  }
}

export function buildRconPacket(password: string, command: string): Buffer {
  if (/["\r\n]/.test(password)) throw new RconError('RCON password cannot contain quotes or newlines');
  const pass = /\s/.test(password) ? `"${password}"` : password;
  return Buffer.concat([PREFIX, Buffer.from(`rcon ${pass} ${command}`, 'utf8')]);
}

/** Strips the 0xFF header and the "print " prefix from one response packet. */
export function parseRconResponse(packet: Buffer): string {
  let body = packet;
  if (body.subarray(0, 4).equals(PREFIX)) body = body.subarray(4);
  const text = body.toString('utf8');
  return text.startsWith('print ') ? text.slice('print '.length) : text;
}

/**
 * Starts or restarts a resource. With refresh: true, first rescans the resources folder:
 * FXServer does not know about a folder created after it booted until `refresh` runs.
 */
export async function ensureResource(opts: RconOptions, resource: string, { refresh = false } = {}): Promise<string> {
  if (refresh) await sendRcon(opts, 'refresh');
  const out = await sendRcon(opts, `ensure ${resource}`);
  if (/Couldn't find resource/i.test(out)) {
    throw new RconError(
      `FXServer can't find a resource named "${resource}". The folder name must match, and the folder must be ` +
        'inside the server\'s resources directory (not inside another resource).',
    );
  }
  return out;
}

/**
 * Sends one command and resolves with the server's output.
 * FXServer may split long output across packets, so we keep reading until the socket is quiet.
 */
export function sendRcon(opts: RconOptions, command: string): Promise<string> {
  const packet = buildRconPacket(opts.password, command);
  const timeoutMs = opts.timeoutMs ?? 2000;
  const quietMs = 150;

  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const chunks: string[] = [];
    let quietTimer: NodeJS.Timeout | undefined;

    const finish = (err?: Error) => {
      clearTimeout(deadline);
      clearTimeout(quietTimer);
      socket.close();
      if (err) return reject(err);
      const output = chunks.join('');
      if (/^Invalid password/i.test(output.trim())) {
        return reject(new RconError('FXServer rejected the RCON password (check FIVEM_RCON_PASSWORD)'));
      }
      resolve(output);
    };

    const deadline = setTimeout(() => {
      if (chunks.length > 0) finish();
      else {
        finish(new RconError(
          `No answer from ${opts.host}:${opts.port} within ${timeoutMs}ms. ` +
            'Is the server running, and is rcon_password set in server.cfg?',
        ));
      }
    }, timeoutMs);

    socket.on('message', (msg) => {
      chunks.push(parseRconResponse(msg));
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(), quietMs);
    });
    socket.on('error', (err) => finish(err));
    socket.send(packet, opts.port, opts.host, (err) => {
      if (err) finish(err);
    });
  });
}
