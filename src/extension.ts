import * as vscode from 'vscode';
import { ConflictPanel } from './conflictPanel';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'conflictResolver.openConflicts',
    async () => {
      await ConflictPanel.create(context);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Nothing to clean up
}
