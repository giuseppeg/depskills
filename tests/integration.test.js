import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const cliPath = path.resolve(import.meta.dirname, '../index.js');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'depskills-'));
}

function writeSkill(tmp, depName, relPath, { name, description }) {
  const dir = path.join(tmp, 'node_modules', depName, path.dirname(relPath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'node_modules', depName, relPath),
    `---\nname: ${name}\ndescription: ${description}\n---\n# body\n`
  );
}

function run(cwd) {
  return spawnSync('node', [cliPath], { cwd, encoding: 'utf8' });
}

describe('integration', () => {
  const tmps = [];
  after(() => tmps.forEach(t => fs.rmSync(t, { recursive: true, force: true })));

  it('generates depskills.md with correct JSON', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/SKILL.md', { name: 'some helpers', description: 'useful helpers' });

    assert.strictEqual(run(tmp).status, 0);

    const output = fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8');
    const json = JSON.parse(output.match(/```json\n(.+)\n```/)[1]);
    assert.deepStrictEqual(json, {
      'some-lib': [['some helpers', 'useful helpers', 'skills/SKILL.md']]
    });
  });

  it('output is wrapped in dependency-skills tags', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'SKILL.md', { name: 'a skill', description: 'does things' });

    run(tmp);

    const output = fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8');
    assert.ok(output.startsWith('<dependency-skills>'), 'should open with <dependency-skills>');
    assert.ok(output.trimEnd().endsWith('</dependency-skills>'), 'should close with </dependency-skills>');
  });

  it('output contains BLOCKING REQUIREMENT instruction', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'SKILL.md', { name: 'a skill', description: 'does things' });

    run(tmp);

    const output = fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8');
    assert.match(output, /BLOCKING REQUIREMENT/);
  });

  it('security note appears after the json block', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'SKILL.md', { name: 'a skill', description: 'does things' });

    run(tmp);

    const output = fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8');
    const jsonEnd = output.indexOf('```\n\n');
    const securityIdx = output.indexOf('Security:');
    assert.ok(securityIdx > jsonEnd, 'security note should appear after the json block');
  });

  it('picks up multiple SKILL.md files from the same package', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/SKILL.md', { name: 'skill one', description: 'first' });
    writeSkill(tmp, 'some-lib', 'skills/extra/SKILL.md', { name: 'skill two', description: 'second' });

    assert.strictEqual(run(tmp).status, 0);

    const json = JSON.parse(fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8').match(/```json\n(.+)\n```/)[1]);
    assert.strictEqual(json['some-lib'].length, 2);
  });

  it('handles scoped packages', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { '@scope/pkg': '^1' } }));
    writeSkill(tmp, '@scope/pkg', 'skills/SKILL.md', { name: 'scoped skill', description: 'from a scoped package' });

    assert.strictEqual(run(tmp).status, 0);

    const json = JSON.parse(fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8').match(/```json\n(.+)\n```/)[1]);
    assert.deepStrictEqual(json['@scope/pkg'], [['scoped skill', 'from a scoped package', 'skills/SKILL.md']]);
  });

  it('merges dependencies and devDependencies', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      dependencies: { 'lib-a': '^1' },
      devDependencies: { 'lib-b': '^1' }
    }));
    writeSkill(tmp, 'lib-a', 'SKILL.md', { name: 'lib-a skill', description: 'from lib-a' });
    writeSkill(tmp, 'lib-b', 'SKILL.md', { name: 'lib-b skill', description: 'from lib-b' });

    assert.strictEqual(run(tmp).status, 0);

    const json = JSON.parse(fs.readFileSync(path.join(tmp, 'depskills.md'), 'utf8').match(/```json\n(.+)\n```/)[1]);
    assert.ok('lib-a' in json);
    assert.ok('lib-b' in json);
  });

  it('does not create depskills.md when no SKILL.md files exist', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    fs.mkdirSync(path.join(tmp, 'node_modules', 'some-lib'), { recursive: true });

    assert.strictEqual(run(tmp).status, 0);
    assert.strictEqual(fs.existsSync(path.join(tmp, 'depskills.md')), false);
  });

  it('ignores SKILL.md files nested inside transitive node_modules', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    // transitive dep nested inside some-lib — should be ignored
    writeSkill(tmp, 'some-lib/node_modules/transitive', 'SKILL.md', { name: 'transitive skill', description: 'should not appear' });

    assert.strictEqual(run(tmp).status, 0);
    assert.strictEqual(fs.existsSync(path.join(tmp, 'depskills.md')), false);
  });

  it('exits cleanly when package.json is missing', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    assert.strictEqual(run(tmp).status, 0);
  });
});
