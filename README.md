# Conflict Resolver

A VS Code extension that brings JetBrains-style Git conflict resolution to the editor — featuring a conflict file list modal and a full 3-column interactive merge editor.

## Features

### Conflict File List Modal

Run **Resolve Git Conflicts...** to open a panel listing every file with unresolved conflict markers.

Each row shows:
- The file's relative path and how many conflict blocks it contains
- **Accept Mine** — keeps HEAD sections, removes markers, and stages the file
- **Accept Theirs** — keeps the incoming sections, removes markers, and stages the file
- **Merge...** — opens the 3-column merge editor for that file

The bottom toolbar provides:
- **Accept All Mine / Accept All Theirs** to resolve every file at once
- A live counter of how many files have been resolved
- A **Close** button

Resolved rows are marked green and their action buttons are disabled.

---

### 3-Column Merge Editor

Opens a full-screen panel with three equal columns:

```
┌─────────────┬─────────────┬──────────────┐
│ Mine (HEAD) │   Result    │    Theirs    │
│  <branch>   │             │  <ref/sha>   │
├─────────────┼─────────────┼──────────────┤
│  normal     │  normal     │  normal      │
│  lines      │  lines      │  lines       │
├─────────────┼─────────────┼──────────────┤
│  HEAD       │ [▶ Accept   │  Incoming    │
│  conflict   │    Mine   ] │  conflict    │
│  lines      │ [▶ Accept   │  lines       │
│  (green)    │   Theirs  ] │  (blue)      │
│             │ [✏ Edit]    │              │
└─────────────┴─────────────┴──────────────┘
```

**Per-block actions (Result column):**
- **▶ Accept Mine** — fills the result with the HEAD version
- **▶ Accept Theirs** — fills the result with the incoming version
- **✏ Edit** — opens an inline `<textarea>` pre-filled with both versions for manual editing; confirm with **✓ Confirm**
- **↩ Undo** — reverts an already-resolved block back to unresolved

**Toolbar actions:**
- **← Prev Conflict / Next Conflict →** — jump between unresolved blocks
- **Accept All Mine / Accept All Theirs** — resolve every block at once
- **Save & Mark Resolved** — writes the result to disk, runs `git add`, and returns to the conflict list
- **Cancel** — closes without saving

**Other behaviours:**
- All three columns scroll in sync
- Hovering a conflict block highlights the corresponding block in all three columns
- Syntax highlighting via [highlight.js](https://highlightjs.org/) (CDN), respecting the file's language
- Unresolved blocks are warned about before saving (with an option to proceed)

---

## Usage

| Action | How |
|--------|-----|
| Open conflict list | `Cmd+Shift+G C` (macOS) / `Ctrl+Shift+G C` (Windows/Linux) |
| Open conflict list | Command Palette → **Resolve Git Conflicts...** |
| Open conflict list | Source Control panel title bar icon |
| Open conflict list | Right-click a resource in the SCM panel |

---

## Requirements

- VS Code `^1.85.0`
- A Git repository (the extension activates on workspaces containing a `.git` folder)
- Git available on `PATH`

---

## Extension Architecture

```
src/
├── extension.ts        # Entry point — registers the command
├── conflictPanel.ts    # WebviewPanel: conflict file list modal
├── mergeEditor.ts      # WebviewPanel: 3-column merge editor
├── conflictScanner.ts  # Parses conflict markers, builds ConflictBlock[]
└── gitUtils.ts         # Shell wrappers: git diff, git add, branch detection
```

### `conflictScanner.ts`

- **`parseConflictBlocks(content)`** — returns `ConflictBlock[]` with `startLine`, `endLine`, `mineLines`, and `theirLines`
- **`countConflicts(filePath)`** — returns the number of conflict blocks in a file
- **`resolveWithResult(filePath, blocks, chosenSides)`** — builds the final file content given per-block resolution choices (`'mine'`, `'theirs'`, or an arbitrary custom string)

### `gitUtils.ts`

- **`getConflictedFiles(workspaceRoot)`** — `git diff --name-only --diff-filter=U`
- **`acceptMine(filePath)`** — strips conflict markers keeping HEAD sections in-place
- **`acceptTheirs(filePath)`** — strips conflict markers keeping incoming sections in-place
- **`stageFile(filePath)`** — `git add <filePath>`
- **`getCurrentBranch(workspaceRoot)`** — `git branch --show-current`
- **`getIncomingRef(workspaceRoot)`** — reads `MERGE_HEAD`, `CHERRY_PICK_HEAD`, or `REBASE_HEAD` to produce a human-readable label

---

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Launch extension in a new VS Code window
# Press F5 in VS Code with the workspace open
```

---

## Security

- All WebviewPanels use a per-instance `nonce` and a strict Content Security Policy (`default-src 'none'`)
- No user input is ever eval'd or interpolated without HTML escaping
- Shell commands use `execSync` with `stdio: pipe` — no shell interpolation of user-controlled paths in command strings

---

## License

MIT
