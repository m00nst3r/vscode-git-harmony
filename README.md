# GitHarmony — Git Conflict Resolver & 3-Way Merge Editor for VS Code

Resolve Git merge conflicts faster in VS Code with a clean, visual 3-way merge editor (Mine / Result / Theirs).

GitHarmony is a powerful git conflict resolver for VS Code that helps you resolve merge conflicts, review changes, and finish merges without switching between files.

![Merge Editor](/images/banner.png)

## Resolve Git Conflicts Faster

* **3-way merge editor (Mine / Result / Theirs)** — compare changes side-by-side and understand conflicts instantly
* **All conflicted files in one view** — navigate and resolve multiple git conflicts without jumping between tabs
* **One-click conflict resolution** — Accept Mine, Accept Theirs, or edit the result manually
* **Auto-stage resolved files** — resolved files are staged automatically so you can keep moving
* **Built for the VS Code Git workflow** — works seamlessly with your existing Git setup

## Why GitHarmony Instead of the Default VS Code Merge Editor?

The default VS Code merge experience requires opening each file individually. When a rebase or merge touches many files, that means constant context switching.

GitHarmony gives you:

* A centralized panel listing every conflicted file with conflict counts
* A clear 3-column diff view (Mine / Result / Theirs) in one full-screen panel
* Bulk actions — Accept All Mine or Accept All Theirs across all files in one click
* Faster resolution of large merges, rebases, and pull requests

## How to Resolve Merge Conflicts in VS Code

1. Open your project with Git merge conflicts
2. Click the `$(git-merge) N Conflicts` button in the status bar — or run **Resolve Git Conflicts...** from the Command Palette (`Cmd+Shift+G C` / `Ctrl+Shift+G C`)
3. View all conflicted files in one panel
4. Choose **Accept Mine**, **Accept Theirs**, or open the **Merge Editor** for manual resolution
5. Save — files are automatically staged with `git add`

### Status Bar Icon

![Status Bar Icon](/images/icon.png)

A merge icon appears in the bottom status bar whenever your workspace has merge conflicts, showing the number of conflicted files. Click it to open the resolution panel.

### Conflict File List

![Conflict List](/images/main.png)

A clear overview of every file with unresolved conflicts. Resolved files turn green so you always know what's left.

### 3-Column Merge Editor

![Merge Editor](/images/view.png)

A full-screen panel with three synchronized columns: **Mine (HEAD)**, **Result**, and **Theirs (Incoming)**. Resolve each conflict block individually, edit the result manually, and undo any resolution. Includes syntax highlighting and synchronized scrolling.

## Use Cases

* Resolve Git merge conflicts in VS Code
* Handle large pull requests with many conflicting files
* Simplify git rebase conflict resolution
* Speed up team workflows that involve frequent merges

## Requirements

* **VS Code** `1.85.0` or newer
* A **Git** repository with Git available on `PATH`

## Coming Soon

* Enhanced diff visualization

## Contributing

Contributions are welcome! See the [copilot instructions](.github/copilot-instructions.md) for architecture details, coding conventions, and development setup.

---

## License

MIT
