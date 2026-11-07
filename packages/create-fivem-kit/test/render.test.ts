import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render, TemplateError } from '../src/render.ts';

const flags = { esx: true, qbcore: false, oxlib: false };

describe('render', () => {
  it('replaces variables', () => {
    assert.equal(render("name '{{name}}' -- {{ name }}", flags, { name: 'shop' }), "name 'shop' -- shop");
  });

  it('keeps or drops if-blocks and removes the tag lines', () => {
    const src = ['a', '{{#if esx}}', 'esx', '{{/if}}', '  {{#if qbcore}}', 'qb', '  {{/if}}', 'b'].join('\n');
    assert.equal(render(src, flags, {}), 'a\nesx\nb');
  });

  it('supports | (any) and ! (not)', () => {
    const src = '{{#if qbcore|esx}}\nyes\n{{/if}}\n{{#if !oxlib}}\nno-ox\n{{/if}}\n{{#if !esx}}\nhidden\n{{/if}}';
    assert.equal(render(src, flags, {}), 'yes\nno-ox');
  });

  it('handles nested blocks', () => {
    const src = '{{#if esx}}\nouter\n{{#if oxlib}}\ninner\n{{/if}}\n{{/if}}\nend';
    assert.equal(render(src, flags, {}), 'outer\nend');
    assert.equal(render(src, { ...flags, oxlib: true }, {}), 'outer\ninner\nend');
  });

  it('leaves JSX double braces alone', () => {
    assert.equal(render('<div style={{ color: "red" }} />', flags, {}), '<div style={{ color: "red" }} />');
  });

  it('normalises CRLF', () => {
    assert.equal(render('a\r\n{{#if esx}}\r\nb\r\n{{/if}}\r\n', flags, {}), 'a\nb\n');
  });

  it('fails loudly on typos and broken blocks, with file and line', () => {
    assert.throws(() => render('{{nmae}}', flags, { name: 'x' }, 'f.lua'), /f\.lua:1: unknown variable "nmae"/);
    assert.throws(() => render('{{#if exs}}\n{{/if}}', flags, {}), /unknown flag "exs"/);
    assert.throws(() => render('{{#if esx}}\nx', flags, {}), /unclosed/);
    assert.throws(() => render('x\n{{/if}}', flags, {}), TemplateError);
  });
});
