import assert from 'node:assert/strict';
import { createSocket, type Socket } from 'node:dgram';
import { after, before, describe, it } from 'node:test';
import { buildRconPacket, ensureResource, parseRconResponse, RconError, sendRcon } from '../src/rcon.ts';

const FF = Buffer.from([0xff, 0xff, 0xff, 0xff]);

describe('rcon packets', () => {
  it('builds a Quake-style rcon packet', () => {
    assert.deepEqual(buildRconPacket('secret', 'ensure shop'), Buffer.concat([FF, Buffer.from('rcon secret ensure shop')]));
  });

  it('quotes passwords that contain spaces and refuses quotes', () => {
    assert.match(buildRconPacket('two words', 'status').toString('utf8'), /rcon "two words" status$/);
    assert.throws(() => buildRconPacket('a"b', 'status'), RconError);
  });

  it('strips the header and print prefix from responses', () => {
    assert.equal(parseRconResponse(Buffer.concat([FF, Buffer.from('print Started resource shop\n')])), 'Started resource shop\n');
  });
});

describe('sendRcon against a fake FXServer', () => {
  let server: Socket;
  let port = 0;
  const received: string[] = [];

  before(async () => {
    server = createSocket('udp4');
    server.on('message', (msg, rinfo) => {
      const text = msg.subarray(4).toString('utf8');
      received.push(text);
      const [, password, ...cmd] = text.split(' ');
      const reply = (s: string) => server.send(Buffer.concat([FF, Buffer.from(`print ${s}`)]), rinfo.port, rinfo.address);
      if (password !== 'pw') return reply('Invalid password.\n');
      if (cmd[0] === 'silent') return; // simulate a dead or firewalled server
      if (cmd[0] === 'refresh') return reply('Found 1 new resources, and refreshed 0/180 resources.\n');
      if (cmd.join(' ') === 'ensure missing') return reply("Couldn't find resource missing.\n");
      if (cmd.join(' ') === 'ensure broken') return reply("^3Couldn't start resource broken.^7\n");
      // Long output arrives as two packets.
      reply('Stopping resource shop\n');
      setTimeout(() => reply('Started resource shop\n'), 20);
    });
    await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(() => server.close());

  it('sends the command and joins multi-packet output', async () => {
    const out = await sendRcon({ host: '127.0.0.1', port, password: 'pw' }, 'ensure shop');
    assert.equal(out, 'Stopping resource shop\nStarted resource shop\n');
    assert.equal(received.at(-1), 'rcon pw ensure shop');
  });

  it('rejects a wrong password with a clear error', async () => {
    await assert.rejects(sendRcon({ host: '127.0.0.1', port, password: 'nope' }, 'status'), /rejected the RCON password/);
  });

  it('ensureResource refreshes first when asked', async () => {
    const start = received.length;
    await ensureResource({ host: '127.0.0.1', port, password: 'pw' }, 'shop', { refresh: true });
    assert.deepEqual(received.slice(start), ['rcon pw refresh', 'rcon pw ensure shop']);
  });

  it('ensureResource explains a missing resource instead of reporting success', async () => {
    await assert.rejects(
      ensureResource({ host: '127.0.0.1', port, password: 'pw' }, 'missing'),
      /can't find a resource named "missing"/,
    );
  });

  it('ensureResource reports a resource that failed to start (seen with a package.json in the resource root)', async () => {
    await assert.rejects(
      ensureResource({ host: '127.0.0.1', port, password: 'pw' }, 'broken'),
      /refused to start "broken".*package\.json/s,
    );
  });

  it('times out when the server never answers', async () => {
    await assert.rejects(
      sendRcon({ host: '127.0.0.1', port, password: 'pw', timeoutMs: 200 }, 'silent'),
      /No answer from 127\.0\.0\.1/,
    );
  });
});
