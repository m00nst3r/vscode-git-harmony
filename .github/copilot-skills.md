# GitHarmony — Copilot Skills

skills:

  - name: resolve-conflicts-ui
    description: >
      Work on the conflict file list panel (conflictPanel.ts).
      This is the main entry UI that lists all files with unresolved Git conflicts.
      Each row shows the file path, conflict count, and action buttons (Accept Mine, Accept Theirs, Merge).
      The bottom toolbar has Accept All Mine / Accept All Theirs, a resolved counter, and a Close button.
    instructions: |
      - The panel class is `ConflictPanel` in `src/conflictPanel.ts`.
      - It uses the static factory pattern: `ConflictPanel.create(context)` — the constructor is private.
      - Singleton pattern: `ConflictPanel.currentPanel` ensures only one instance exists.
      - Webview HTML is generated in `_getWebviewContent()` as an inline template literal.
      - Extension ↔ Webview communication uses `postMessage` with `{ command: string, ... }` objects.
      - Message commands: `acceptMine`, `acceptTheirs`, `merge`, `acceptAllMine`, `acceptAllTheirs`, `close`.
      - Refresh the UI by calling `_refresh()`, which posts an `update` message with the current file list.
      - File state is tracked via `ConflictFileInfo` objects with a `resolved` boolean.
      - Always use a nonce for CSP and VS Code theme variables for styling.

  - name: merge-editor
    description: >
      Work on the 3-column merge editor (mergeEditor.ts).
      This is the full-screen panel with Mine (HEAD) | Result | Theirs columns.
      Each conflict block has Accept Mine, Accept Theirs, Edit, and Undo buttons in the Result column.
      The toolbar has navigation, bulk accept, Save & Mark Resolved, and Cancel.
    instructions: |
      - The panel class is `MergeEditor` in `src/mergeEditor.ts`.
      - Static factory: `MergeEditor.create(filePath, workspaceRoot, onSaved)`.
      - The `onSaved` callback notifies `ConflictPanel` that resolution is complete.
      - Message commands from webview: `save` (with full file `content`), `cancel`.
      - The save flow: write content → `git add` → call `onSaved()` → dispose panel.
      - All three columns scroll in sync via shared scroll event handlers.
      - Conflict blocks are highlighted on hover across all three columns.
      - Syntax highlighting uses highlight.js from CDN — the CSP must allow this origin.
      - Unresolved blocks trigger a warning dialog before saving.
      - Keep inline CSS/JS within the HTML template; do not extract to separate files.

  - name: conflict-parsing
    description: >
      Work on the conflict marker parser (conflictScanner.ts).
      This module contains pure logic for parsing Git conflict markers and building resolved file content.
    instructions: |
      - `parseConflictBlocks(content)` is a line-by-line state machine: `normal` → `mine` → `theirs` → `normal`.
      - Conflict markers: `<<<<<<<` starts a block, `=======` separates mine/theirs, `>>>>>>>` ends it.
      - Returns `ConflictBlock[]` with `startLine`, `endLine`, `mineLines`, `theirLines` (all 0-based).
      - `countConflicts(filePath)` reads a file and returns the number of blocks.
      - `resolveWithResult(filePath, blocks, chosenSides)` rebuilds the file by replacing each block with the chosen side ('mine', 'theirs', or a custom string).
      - `ConflictSide` type is `'mine' | 'theirs' | string` — the string case handles manual edits.
      - These functions use `fs.readFileSync` intentionally — keep them synchronous.
      - When modifying parsing, preserve the state machine pattern for clarity.

  - name: git-operations
    description: >
      Work on Git CLI interactions (gitUtils.ts).
      This module wraps all Git shell commands used by the extension.
    instructions: |
      - All commands go through the private `exec(cmd, cwd)` helper which uses `execSync` with `stdio: pipe` and swallows errors (returns '').
      - `getConflictedFiles(workspaceRoot)` — lists unmerged files via `git diff --name-only --diff-filter=U`.
      - `acceptMine(filePath)` / `acceptTheirs(filePath)` — strip conflict markers keeping the chosen side, write back to disk.
      - `stageFile(filePath)` — runs `git add` on the resolved file.
      - `getCurrentBranch(workspaceRoot)` — returns current branch name or 'HEAD'.
      - `getIncomingRef(workspaceRoot)` — checks MERGE_HEAD, CHERRY_PICK_HEAD, REBASE_HEAD files to determine the incoming ref.
      - Always quote file paths in shell commands to prevent injection.
      - Always pass `cwd` to ensure commands target the correct repository.
      - The `stripConflictMarkers()` helper is private and used by `acceptMine`/`acceptTheirs`.

  - name: add-vscode-command
    description: >
      Add a new VS Code command to the extension.
    instructions: |
      To add a new command:
      1. In `src/extension.ts`, register it inside `activate()` using `vscode.commands.registerCommand('gitHarmony.<name>', handler)`.
      2. Push the disposable to `context.subscriptions`.
      3. In `package.json`, add to `contributes.commands` with `command`, `title`, and `category: "GitHarmony"`.
      4. Optionally add a keybinding under `contributes.keybindings` (use `ctrl+shift+g` prefix on Windows/Linux, `cmd+shift+g` on Mac).
      5. Optionally add menu contributions under `contributes.menus` with appropriate `when` clauses.
      6. Run `npm run compile` to verify TypeScript compiles.

  - name: add-webview-panel
    description: >
      Create a new Webview panel in the extension.
    instructions: |
      Follow the established pattern from `ConflictPanel` and `MergeEditor`:
      1. Create a new file in `src/` with a class.
      2. Use a private constructor and a public static async `create()` factory method.
      3. In the constructor, set `this._panel.webview.html` from a `_getWebviewContent()` method.
      4. Wire up `onDidReceiveMessage` for Extension ↔ Webview communication using `{ command: string }` message objects.
      5. Wire up `onDidDispose` to clean up.
      6. In `_getWebviewContent()`:
         - Generate a nonce using the `getNonce()` pattern (32-char random string).
         - Set CSP: `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`.
         - Use VS Code CSS variables for theming (e.g., `--vscode-editor-background`).
         - Keep all CSS and JS inline within the template.
      7. Use `acquireVsCodeApi()` in the webview script to communicate back to the extension.
