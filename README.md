# depskills

Scans installed dependencies for `SKILL.md` files and vendors them into `.agents/skills/` so AI assistants can discover them automatically.

The idea is that skills, like docs, should ship with the package that owns them and be vendored in your repo for portability and reviewability.

## Usage

```
npm install depskills --save-dev
```

Add to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "depskills"
  }
}
```

On each install, depskills syncs full skill folders from your dependencies into `.agents/skills/`. Commit `.agents/skills/` to your repo — the diff is how you review changes.

## Security

Skill files are generated from content shipped inside your npm dependencies. A malicious package could include prompt injection attempts in its `SKILL.md` or accompanying files.

**Before committing changes to `.agents/skills/`, review the diff carefully.** Check that skill names, descriptions, and file contents look legitimate and do not contain instructions disguised as skill metadata.

depskills prints a notice when new skills are added. It is silent otherwise — use `git diff` to review any content changes.

## How it works

Packages can ship a `SKILL.md` file inside a named subdirectory (e.g. `skills/my-skill/SKILL.md`) with a `name` and `description` in the frontmatter. When you run `depskills`, it walks your `dependencies` and `devDependencies`, finds every skill folder, and vendors the full folder into `.agents/skills/<skill-name>/`.

This follows the `.agents/skills/` convention for agent skill discovery. Vendoring the full folder keeps relative skill files working, makes the result portable across compatible AI assistants, and lets you review changes with git.

Requirements:

- `SKILL.md` must live in a subdirectory of the package, not at the package root
- The directory name must match the `name` field in the frontmatter
- If two dependencies ship a skill with the same directory name, the second one is skipped with a warning

## Compatibility

depskills assumes a flat, hoisted `node_modules` layout as produced by npm and yarn. It does not currently support pnpm's non-hoisted layout or monorepo setups where dependencies are hoisted to a workspace root outside the project directory.

## LICENSE

MIT
