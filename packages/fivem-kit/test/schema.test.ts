import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BridgeError, parseBridge } from '../src/bridge/schema.ts';

function issuesOf(json: unknown): string[] {
  try {
    parseBridge(json);
  } catch (err) {
    assert.ok(err instanceof BridgeError);
    return err.issues;
  }
  assert.fail('expected parseBridge to throw');
}

describe('parseBridge', () => {
  it('parses primitives, arrays, optionals and nested objects', () => {
    const bridge = parseBridge({
      toUi: {
        setPlayer: {
          name: 'string',
          cash: 'number',
          'job?': 'string',
          tags: 'string[]',
          nickname: 'string?',
          stats: { level: 'number', vip: 'boolean' },
          items: [{ id: 'number', label: 'string' }],
        },
      },
    });
    const fields = bridge.toUi[0]!.fields;
    assert.deepEqual(fields.map((f) => [f.name, f.optional]), [
      ['name', false], ['cash', false], ['job', true], ['tags', false],
      ['nickname', true], ['stats', false], ['items', false],
    ]);
    assert.deepEqual(fields[3]!.type, { kind: 'array', of: { kind: 'primitive', name: 'string' } });
    assert.equal(fields[5]!.type.kind, 'object');
    assert.equal(fields[6]!.type.kind, 'array');
  });

  it('defaults missing request/response to empty', () => {
    const bridge = parseBridge({ toClient: { close: {} } });
    assert.deepEqual(bridge.toClient[0], { name: 'close', request: [], response: [] });
  });

  it('supports nested arrays like number[][]', () => {
    const bridge = parseBridge({ toUi: { grid: { cells: 'number[][]' } } });
    assert.deepEqual(bridge.toUi[0]!.fields[0]!.type, {
      kind: 'array',
      of: { kind: 'array', of: { kind: 'primitive', name: 'number' } },
    });
  });

  it('ignores $-prefixed keys so users can add $schema and $comment', () => {
    const bridge = parseBridge({ $schema: './x.json', toUi: { $comment: 'hi', open: { $note: 'x' } } });
    assert.equal(bridge.toUi.length, 1);
    assert.deepEqual(bridge.toUi[0]!.fields, []);
  });

  it('reports every problem with its path at once', () => {
    const issues = issuesOf({
      toUi: { show: { amount: 'nubmer' }, 'bad-name': {} },
      toClient: { end: { request: {} }, buy: { request: { qty: 5 }, reply: {} } },
      extra: true,
    });
    assert.deepEqual(issues.sort(), [
      'toClient.buy.request.qty: expected a type string, an object or a one-element array',
      'toClient.buy: unknown key "reply" (expected "request" and "response")',
      'toClient.end: "end" is a Lua keyword and cannot be a message name',
      'toUi.bad-name: "bad-name" is not a valid name (use letters, digits and _)',
      'toUi.show.amount: unknown type "nubmer" (expected string, number, boolean, any, optionally with [] or ?)',
      'unknown top-level key "extra" (expected "toUi" and "toClient")',
    ].sort());
  });

  it('rejects array types without exactly one element', () => {
    const issues = issuesOf({ toUi: { list: { items: [] } } });
    assert.match(issues[0]!, /exactly one element/);
  });

  it('rejects a non-object file', () => {
    assert.deepEqual(issuesOf([]), ['the file must contain a JSON object']);
  });
});
