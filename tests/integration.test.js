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

function writeSkill(tmp, depName, relPath, { name, description }, extraFiles = {}) {
  const dir = path.join(tmp, 'node_modules', depName, path.dirname(relPath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'node_modules', depName, relPath),
    `---\nname: ${name}\ndescription: ${description}\n---\n# body\n`
  );
  for (const [f, content] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(dir, f), content);
  }
}

function run(cwd) {
  return spawnSync('node', [cliPath], { cwd, encoding: 'utf8' });
}

describe('integration', () => {
  const tmps = [];
  after(() => tmps.forEach(t => fs.rmSync(t, { recursive: true, force: true })));

  it('copies skill folder to .agent/skills/<skill-name>/', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'a skill' });

    assert.strictEqual(run(tmp).status, 0);
    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'bar', 'SKILL.md')));
  });

  it('includes extra files in the copied skill folder', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'a skill' }, { 'extra.md': 'extra content' });

    run(tmp);

    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'bar', 'extra.md')));
  });

  it('skips SKILL.md at package root and warns', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'SKILL.md', { name: 'some-lib', description: 'a skill' });

    const result = run(tmp);
    assert.ok(!fs.existsSync(path.join(tmp, '.agent')));
    assert.match(result.stderr, /must be in a subdirectory/);
  });

  it('skips skill whose frontmatter name does not match directory name and warns', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'baz', description: 'a skill' });

    const result = run(tmp);
    assert.ok(!fs.existsSync(path.join(tmp, '.agent')));
    assert.match(result.stderr, /directory name must match/);
  });

  it('warns and skips on skill name collision', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'lib-a': '^1', 'lib-b': '^1' } }));
    writeSkill(tmp, 'lib-a', 'skills/bar/SKILL.md', { name: 'bar', description: 'from lib-a' });
    writeSkill(tmp, 'lib-b', 'skills/bar/SKILL.md', { name: 'bar', description: 'from lib-b' });

    const result = run(tmp);
    assert.match(result.stderr, /collision/);
    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'bar', 'SKILL.md')));
  });

  it('collision is deterministic: alphabetically first dep wins', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'lib-b': '^1', 'lib-a': '^1' } }));
    writeSkill(tmp, 'lib-a', 'skills/bar/SKILL.md', { name: 'bar', description: 'from lib-a' });
    writeSkill(tmp, 'lib-b', 'skills/bar/SKILL.md', { name: 'bar', description: 'from lib-b' });

    run(tmp);

    const content = fs.readFileSync(path.join(tmp, '.agent', 'skills', 'bar', 'SKILL.md'), 'utf8');
    assert.match(content, /from lib-a/);
  });

  it('is silent on subsequent runs when no new skills are added (no git)', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'a skill' });

    run(tmp);
    const result = run(tmp);

    assert.strictEqual(result.stderr, '');
  });

  it('handles scoped packages', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { '@scope/pkg': '^1' } }));
    writeSkill(tmp, '@scope/pkg', 'skills/bar/SKILL.md', { name: 'bar', description: 'from scoped package' });

    assert.strictEqual(run(tmp).status, 0);
    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'bar', 'SKILL.md')));
  });

  it('handles multiple skills from the same package', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'first' });
    writeSkill(tmp, 'some-lib', 'skills/baz/SKILL.md', { name: 'baz', description: 'second' });

    run(tmp);

    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'bar')));
    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'baz')));
  });

  it('merges dependencies and devDependencies', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      dependencies: { 'lib-a': '^1' },
      devDependencies: { 'lib-b': '^1' }
    }));
    writeSkill(tmp, 'lib-a', 'skills/skill-a/SKILL.md', { name: 'skill-a', description: 'from lib-a' });
    writeSkill(tmp, 'lib-b', 'skills/skill-b/SKILL.md', { name: 'skill-b', description: 'from lib-b' });

    run(tmp);

    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'skill-a')));
    assert.ok(fs.existsSync(path.join(tmp, '.agent', 'skills', 'skill-b')));
  });

  it('does not create .agent when no SKILL.md files exist', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    fs.mkdirSync(path.join(tmp, 'node_modules', 'some-lib'), { recursive: true });

    assert.strictEqual(run(tmp).status, 0);
    assert.strictEqual(fs.existsSync(path.join(tmp, '.agent')), false);
  });

  it('ignores SKILL.md in transitive node_modules', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib/node_modules/transitive', 'skills/bar/SKILL.md', { name: 'bar', description: 'transitive' });

    run(tmp);

    assert.strictEqual(fs.existsSync(path.join(tmp, '.agent')), false);
  });

  it('exits cleanly when package.json is missing', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    assert.strictEqual(run(tmp).status, 0);
  });

  it('reports ADDED on first sync (no git fallback)', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'a skill' });

    const result = run(tmp);
    assert.match(result.stderr, /ADDED/);
    assert.match(result.stderr, /bar/);
  });

  it('does not report ADDED on subsequent runs for existing skills (no git fallback)', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'a skill' });

    run(tmp);
    const result = run(tmp);

    assert.doesNotMatch(result.stderr, /ADDED/);
  });

  it('reports CHANGED via git when skill content is updated', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    spawnSync('git', ['init'], { cwd: tmp });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmp });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'original' });

    run(tmp);
    spawnSync('git', ['add', '-A'], { cwd: tmp });
    spawnSync('git', ['commit', '-m', 'init', '--allow-empty-message'], { cwd: tmp });

    fs.writeFileSync(
      path.join(tmp, 'node_modules', 'some-lib', 'skills', 'bar', 'SKILL.md'),
      '---\nname: bar\ndescription: updated\n---\n# body\n'
    );
    const result = run(tmp);
    assert.match(result.stderr, /CHANGED/);
    assert.match(result.stderr, /bar/);
  });

  it('does not report changes for skill dirs not from discovered deps', () => {
    const tmp = makeTmp(); tmps.push(tmp);
    spawnSync('git', ['init'], { cwd: tmp });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmp });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { 'some-lib': '^1' } }));
    writeSkill(tmp, 'some-lib', 'skills/bar/SKILL.md', { name: 'bar', description: 'a skill' });

    run(tmp);
    spawnSync('git', ['add', '-A'], { cwd: tmp });
    spawnSync('git', ['commit', '-m', 'init', '--allow-empty-message'], { cwd: tmp });

    // manually edit a skill not from deps
    fs.mkdirSync(path.join(tmp, '.agent', 'skills', 'hand-authored'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.agent', 'skills', 'hand-authored', 'SKILL.md'), '---\nname: hand-authored\n---\n');

    const result = run(tmp);
    assert.doesNotMatch(result.stderr, /hand-authored/);
  });
});
