import * as vscode from 'vscode';
import { ConflictPanel } from './conflictPanel';
import { getConflictedFiles } from './gitUtils';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'gitHarmony.openConflicts',
    async () => {
      await ConflictPanel.create(context);
    }
  );

  context.subscriptions.push(disposable);

  // Create and configure the status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'gitHarmony.openConflicts';
  context.subscriptions.push(statusBarItem);

  // Initial update
  updateStatusBar();

  // Update on relevant events
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => updateStatusBar()),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBar())
  );

  // Periodic poll for external git changes (every 5s)
  const timer = setInterval(updateStatusBar, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

function updateStatusBar() {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    statusBarItem.hide();
    return;
  }

  const conflictedFiles = getConflictedFiles(workspaceRoot);
  const count = conflictedFiles.length;

  if (count > 0) {
    statusBarItem.text = `$(git-merge) ${count} Conflict${count > 1 ? 's' : ''}`;
    statusBarItem.tooltip = `${count} file${count > 1 ? 's' : ''} have Git conflicts. Click to resolve.`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

export function deactivate(): void {
  // statusBarItem is disposed via context.subscriptions
}
