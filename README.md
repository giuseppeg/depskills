# depskills

Scans installed dependencies for `SKILL.md` files and generates a `depskills.md` index that AI assistants can read.

The idea is that you reference `@depskills.md` in your project's `CLAUDE.md` or `AGENTS.md` so the assistant automatically knows what skills your dependencies ship.

## ‼️ Security

`depskills.md` is generated from files shipped inside your npm dependencies. A malicious package could include prompt injection attempts in its `SKILL.md`.

**BEFORE referencing `depskills.md` in your `AGENTS.md` or `CLAUDE.md`, open it and review its contents.** Check that the skill names and descriptions look legitimate and do not contain instructions disguised as skill metadata. Only reference it once you are satisfied it is safe.

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

Then review `depskills.md` carefully, and if it looks good reference the generated file in your `CLAUDE.md` or `AGENTS.md`:

```markdown
@depskills.md
```

## How it works

Packages can ship a `SKILL.md` file (anywhere in their directory) with a name and description in the frontmatter. When you run `depskills`, it walks your `dependencies` and `devDependencies`, collects every `SKILL.md` it finds, and writes a `depskills.md` at your project root with a structured index of all available skills.

This builds on the idea that libraries will and should ship versioned skills alongside their code. depskills makes them automatically discoverable by AI assistants without any manual configuration.

## Compatibility

depskills assumes a flat, hoisted `node_modules` layout as produced by npm and yarn. It does not currently support pnpm's non-hoisted layout or monorepo setups where dependencies are hoisted to a workspace root outside the project directory.

## LICENSE

MIT
