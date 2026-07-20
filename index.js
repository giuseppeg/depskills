#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseFrontmatter } from './lib.js';

const projectRoot = process.cwd();
const agentSkillsDir = path.join(projectRoot, '.agents', 'skills');
// git output always uses '/', even on Windows
const relSkillsDir = path.relative(projectRoot, agentSkillsDir).replace(/\\/g, '/');

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
} catch {
  process.exit(0);
}

const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

if (deps.length === 0) process.exit(0);

const patterns = deps.map(dep => `node_modules/${dep}/**/SKILL.md`);
const skillFiles = fs.globSync(patterns, {
  cwd: projectRoot,
  // exclude transitive deps (nested node_modules)
  exclude: p => path.normalize(p).includes(path.sep + 'node_modules' + path.sep),
}).sort();

function warn(msg) {
  process.stderr.write('depskills: ' + msg + '\n');
}

// Map: skillDirName -> { srcDir, depName }
const discovered = new Map();

for (const relFile of skillFiles) {
  const segs = path.normalize(relFile).split(path.sep).slice(1); // drop 'node_modules'
  const depOffset = segs[0].startsWith('@') ? 2 : 1;
  const depName = segs.slice(0, depOffset).join('/');
  const relPath = path.join(...segs.slice(depOffset));
  const skillDir = path.dirname(relPath);

  if (skillDir === '.') {
    warn(`${depName}: SKILL.md must be in a subdirectory, not at the package root — skipping`);
    continue;
  }

  const fm = parseFrontmatter(fs.readFileSync(path.join(projectRoot, relFile), 'utf8'));
  if (!fm || !fm.name || !fm.description) continue;

  const skillDirName = path.basename(skillDir);

  if (fm.name !== skillDirName) {
    warn(`${depName}: skill in "${skillDirName}/" has name "${fm.name}" in frontmatter — directory name must match, skipping`);
    continue;
  }

  if (discovered.has(skillDirName)) {
    warn(`skill name collision "${skillDirName}" from ${depName} and ${discovered.get(skillDirName).depName} — skipping ${depName}`);
    continue;
  }

  discovered.set(skillDirName, { srcDir: path.join(projectRoot, 'node_modules', depName, skillDir), depName });
}

if (discovered.size === 0) process.exit(0);

// Snapshot existing dirs before copy (used as git fallback for ADDED detection)
const existingDirs = new Set(
  fs.existsSync(agentSkillsDir)
    ? fs.readdirSync(agentSkillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    : []
);

fs.mkdirSync(agentSkillsDir, { recursive: true });

for (const [skillDirName, { srcDir }] of discovered) {
  const destDir = path.join(agentSkillsDir, skillDirName);
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
}

// Detect changes: try git first, fall back to dir existence check for ADDED only
let toReport = [];
const skillDirDepth = relSkillsDir.split('/').length;
const git = spawnSync('git', ['status', '--porcelain', '--', relSkillsDir], { cwd: projectRoot, encoding: 'utf8' });

if (git.status === 0) {
  const added = new Set();
  const changed = new Set();
  for (const line of git.stdout.trim().split('\n').filter(Boolean)) {
    const xy = line.slice(0, 2);
    const skillDirName = line.slice(3).split('/')[skillDirDepth];
    if (skillDirName && discovered.has(skillDirName)) {
      if (xy === '??') added.add(skillDirName);
      else changed.add(skillDirName);
    }
  }
  toReport = [
    ...[...added].map(n => ({ label: 'ADDED', name: n })),
    ...[...changed].filter(n => !added.has(n)).map(n => ({ label: 'CHANGED', name: n })),
  ];
} else {
  toReport = [...discovered.keys()]
    .filter(n => !existingDirs.has(n))
    .map(n => ({ label: 'ADDED', name: n }));
}

if (toReport.length === 0) process.exit(0);

process.stderr.write([
  '',
  'depskills: skills updated in .agents/skills/',
  '',
  ...toReport.map(({ label, name }) => `  ${label.padEnd(7)} ${name}`),
  '',
  '‼️ Review changes for prompt injection before using any coding agent.',
  '',
].join('\n'));
