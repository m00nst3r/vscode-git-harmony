# Copilot Instructions — Conflict Resolver

## Project Overview

This is a **VS Code extension** that provides JetBrains-style Git conflict resolution. It features a conflict file list modal and a full 3-column interactive merge editor rendered via VS Code Webview panels.

- **Language:** TypeScript (strict mode, ES2020 target, CommonJS modules)
- **Runtime:** VS Code Extension Host (`^1.85.0`)
- **Build:** `tsc` via `npm run compile`; output goes to `out/`
- **No bundler** — the compiled JS in `out/` is loaded directly by VS Code

## Architecture

```
src/
├── extension.ts        # Entry point — registers the `gitHarmony.openConflicts` command
├── conflictPanel.ts    # WebviewPanel for the conflict file list modal
├── mergeEditor.ts      # WebviewPanel for the 3-column merge editor
├── conflictScanner.ts  # Pure-logic parser for Git conflict markers → ConflictBlock[]
└── gitUtils.ts         # Thin shell wrappers around Git CLI commands
```

### Key Data Types

- **`ConflictBlock`** (`conflictScanner.ts`) — `{ startLine, endLine, mineLines, theirLines }` representing one `<<<<<<<`…`>>>>>>>` block.
- **`ConflictSide`** — `'mine' | 'theirs' | string` (string = custom edited text).
- **`ConflictFileInfo`** (`conflictPanel.ts`) — per-file metadata: `absolutePath`, `relativePath`, `conflictCount`, `resolved`.

### Module Responsibilities

| Module | Owns | Talks to |
|--------|------|----------|
| `extension.ts` | Command registration | `ConflictPanel` |
| `conflictPanel.ts` | File list UI, bulk resolve | `gitUtils`, `conflictScanner`, `MergeEditor` |
| `mergeEditor.ts` | 3-column merge UI, per-block resolve, save | `gitUtils`, `conflictScanner` |
| `conflictScanner.ts` | Parsing conflict markers, building result content | `fs` only |
| `gitUtils.ts` | Git CLI operations (diff, add, branch info) | `child_process.execSync` |

### Communication Pattern

Extension ↔ Webview communication uses `postMessage` / `onDidReceiveMessage`. Messages are plain objects with a `command` string field. Always keep this pattern; do not introduce external messaging libraries.

## Coding Conventions

- **Strict TypeScript** — do not use `any`; prefer explicit types and interfaces.
- **No default exports** — use named exports everywhere.
- **Private members** are prefixed with `_` (e.g., `_panel`, `_files`).
- **Static factory pattern** — `ConflictPanel.create()` and `MergeEditor.create()` are async static factories; constructors are private.
- **Synchronous file/git operations** — `fs.readFileSync`, `execSync` are used intentionally because conflict resolution is a blocking user-initiated action. Do not convert these to async unless there is a specific performance reason.
- Functions in `conflictScanner.ts` and `gitUtils.ts` are plain exported functions (no classes).

## Security Rules (Critical)

All Webview content **must** follow these rules:

1. Every `<style>` and `<script>` tag must include a per-instance `nonce` attribute.
2. The Content Security Policy must be `default-src 'none'; style-src 'nonce-…'; script-src 'nonce-…';` plus any CDN sources explicitly listed.
3. Never use `eval()`, `new Function()`, `innerHTML` with unsanitized user content, or template literal interpolation of file content into HTML without escaping.
4. Shell commands in `gitUtils.ts` must use `stdio: ['pipe', 'pipe', 'pipe']` — never inherit stdio.
5. File paths passed to shell commands must be quoted to prevent injection.

## Webview HTML Guidelines

- Webview HTML is generated as template literals inside `_getWebviewContent()` methods.
- Use VS Code CSS custom properties (e.g., `--vscode-editor-background`, `--vscode-foreground`) for theming so the UI matches the user's VS Code theme.
- The `getNonce()` helper in `conflictPanel.ts` generates a 32-character random string — reuse this pattern for any new webview.
- Keep all CSS and JS inline within the HTML template (no external files) to simplify CSP management.

## Git Operations

- `getConflictedFiles()` uses `git diff --name-only --diff-filter=U`.
- `acceptMine()` / `acceptTheirs()` strip conflict markers in-memory and write back.
- `stageFile()` runs `git add` after a file is resolved.
- `getIncomingRef()` checks `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REBASE_HEAD` in that order to determine what's being merged.
- All git operations go through the `exec()` wrapper which swallows errors and returns `''` — keep this pattern for robustness.

## Testing & Development

```bash
npm install          # Install dependencies
npm run compile      # One-shot build
npm run watch        # Incremental rebuild
# Press F5 in VS Code to launch Extension Development Host
```

There are currently no automated tests. If adding tests, use the VS Code extension testing framework (`@vscode/test-electron`).

## Common Tasks

### Adding a new command
1. Register it in `extension.ts` via `vscode.commands.registerCommand`.
2. Add the command contribution to `package.json` under `contributes.commands`.
3. Optionally add a keybinding under `contributes.keybindings`.

### Adding a new Webview panel
1. Create a new file in `src/` with a class following the `ConflictPanel` / `MergeEditor` pattern (private constructor, static `create()` factory).
2. Use `getNonce()` and set a strict CSP in the HTML template.
3. Wire up `postMessage` handlers in the constructor.

### Modifying conflict parsing logic
- All parsing lives in `conflictScanner.ts`. The parser is a simple state machine (`normal` → `mine` → `theirs` → `normal`).
- `resolveWithResult()` rebuilds the file content by splicing resolved blocks. Both are pure functions (aside from `fs.readFileSync`).

### Modifying Git interactions
- Keep all Git CLI calls in `gitUtils.ts`.
- Always use the `exec()` helper which handles errors gracefully.
- Always pass `cwd` to ensure commands run in the correct workspace.
