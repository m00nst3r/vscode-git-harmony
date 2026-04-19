# GitHarmony

Tired of resolving Git conflicts one file at a time? **GitHarmony** brings JetBrains-style merge resolution directly into VS Code — see all conflicted files at a glance and resolve them in a powerful 3-column merge editor.

![Merge Editor](/images/view.png)

### Why GitHarmony?

- **One-click access** — a status bar icon lights up the moment conflicts appear
- **See everything** — a dedicated panel lists every conflicted file with conflict counts
- **Resolve faster** — accept mine, accept theirs, or manually edit in a side-by-side-by-side view
- **Stay in flow** — files are automatically staged after resolution so you can keep going

## Features

### Status Bar Icon
![Status Bar Icon](/images/icon.png)

A `$(git-merge)` icon appears in the bottom status bar whenever your workspace has merge conflicts.

- Shows the **number of conflicted files** at a glance
- Turns **orange** to grab your attention
- **Click it** to jump straight into the resolution panel
- Automatically hides once all conflicts are resolved

### Conflict File List

![Conflict List](/images/main.png)

A clear overview of every file with unresolved conflicts. For each file you can:

| Action | What it does |
|--------|--------------|
| **Accept Mine** | Keep your (HEAD) changes, discard incoming, auto-stage |
| **Accept Theirs** | Keep incoming changes, discard yours, auto-stage |
| **Merge...** | Open the full 3-column merge editor |

Bulk actions at the bottom let you **Accept All Mine** or **Accept All Theirs** in one click. Resolved files turn green so you always know what's left.

---

### 3-Column Merge Editor

![Merge Editor](/images/view.png)

A full-screen panel inspired by JetBrains IDEs with three synchronized columns: **Mine (HEAD)**, **Result**, and **Theirs (Incoming)**.

**Resolve each conflict block individually:**
- **Accept Mine** or **Accept Theirs** with a single click
- **Edit manually** — the result column is fully editable
- **Undo** any resolution to try a different approach

**Navigate quickly:**
- **← Prev / Next →** buttons to jump between conflicts
- **Accept All Mine / Accept All Theirs** for bulk resolution
- Hover any conflict to highlight the matching block across all columns

**When you're done:**
- **Save & Mark Resolved** writes the file and runs `git add` automatically
- A warning appears if any conflicts are still unresolved

Includes **syntax highlighting** and **synchronized scrolling** across all three columns.

---

## Getting Started

| Action | How |
|--------|-----|
| Click the status bar icon | `$(git-merge) N Conflicts` in the bottom bar (when conflicts exist) |
| Keyboard shortcut | `Cmd+Shift+P` (macOS) / `Ctrl+Shift+P` (Windows/Linux) |
| Command Palette | **Resolve Git Conflicts...** |
| Source Control panel | Title bar icon or right-click a conflicted file |

---

## Requirements

- **VS Code** `1.85.0` or newer
- A **Git** repository with Git available on `PATH`

---

## Contributing

Contributions are welcome! See the [copilot instructions](.github/copilot-instructions.md) for architecture details, coding conventions, and development setup.

---

## License

MIT
