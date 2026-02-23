import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../lib.js';

describe('parseFrontmatter', () => {
  it('parses basic key:value pairs', () => {
    const result = parseFrontmatter('---\nname: foo\ndescription: bar\n---');
    assert.deepStrictEqual(result, { name: 'foo', description: 'bar' });
  });

  it('strips double quotes from values', () => {
    const result = parseFrontmatter('---\nname: "foo bar"\ndescription: "hello world"\n---');
    assert.deepStrictEqual(result, { name: 'foo bar', description: 'hello world' });
  });

  it('strips single quotes from values', () => {
    const result = parseFrontmatter("---\nname: 'foo bar'\ndescription: 'hello world'\n---");
    assert.deepStrictEqual(result, { name: 'foo bar', description: 'hello world' });
  });

  it('keeps colons inside values', () => {
    const result = parseFrontmatter('---\nname: foo\ndescription: see https://example.com for details\n---');
    assert.deepStrictEqual(result, { name: 'foo', description: 'see https://example.com for details' });
  });

  it('keeps colons inside quoted values', () => {
    const result = parseFrontmatter('---\nname: foo\ndescription: "a: b: c"\n---');
    assert.deepStrictEqual(result, { name: 'foo', description: 'a: b: c' });
  });

  it('skips blank lines', () => {
    const result = parseFrontmatter('---\nname: foo\n\ndescription: bar\n---');
    assert.deepStrictEqual(result, { name: 'foo', description: 'bar' });
  });

  it('skips comment lines', () => {
    const result = parseFrontmatter('---\n# this is a comment\nname: foo\ndescription: bar\n---');
    assert.deepStrictEqual(result, { name: 'foo', description: 'bar' });
  });

  it('handles windows CRLF line endings', () => {
    const result = parseFrontmatter('---\r\nname: foo\r\ndescription: bar\r\n---');
    assert.deepStrictEqual(result, { name: 'foo', description: 'bar' });
  });

  it('returns null when no opening delimiter', () => {
    assert.strictEqual(parseFrontmatter('name: foo\ndescription: bar'), null);
  });

  it('returns null on empty string', () => {
    assert.strictEqual(parseFrontmatter(''), null);
  });

  it('ignores content after the closing delimiter', () => {
    const result = parseFrontmatter('---\nname: foo\ndescription: bar\n---\n# body content\nsome text');
    assert.deepStrictEqual(result, { name: 'foo', description: 'bar' });
  });

  it('returns empty object when frontmatter block is empty', () => {
    assert.deepStrictEqual(parseFrontmatter('---\n\n---'), {});
  });

  it('skips block scalar values (|) rather than storing the indicator as the value', () => {
    const result = parseFrontmatter('---\nname: foo\ndescription: |\n  line one\n  line two\n---');
    assert.strictEqual(result.description, undefined);
  });

  it('skips block scalar values (>) with chomping indicators', () => {
    const result = parseFrontmatter('---\nname: foo\ndescription: >-\n---');
    assert.strictEqual(result.description, undefined);
  });
});
