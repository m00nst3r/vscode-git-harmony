import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getConflictedFiles, acceptMine, acceptTheirs, stageFile } from './gitUtils';
import { countConflicts } from './conflictScanner';
import { MergeEditor } from './mergeEditor';

interface ConflictFileInfo {
  absolutePath: string;
  relativePath: string;
  conflictCount: number;
  resolved: boolean;
}

export class ConflictPanel {
  public static currentPanel: ConflictPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _workspaceRoot: string;
  private _files: ConflictFileInfo[];
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, workspaceRoot: string, files: ConflictFileInfo[]) {
    this._panel = panel;
    this._workspaceRoot = workspaceRoot;
    this._files = files;

    this._panel.webview.html = this._getWebviewContent(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'acceptMine':
            await this._resolveFile(message.index, 'mine');
            break;
          case 'acceptTheirs':
            await this._resolveFile(message.index, 'theirs');
            break;
          case 'merge':
            await this._openMergeEditor(message.index);
            break;
          case 'acceptAllMine':
            await this._resolveAll('mine');
            break;
          case 'acceptAllTheirs':
            await this._resolveAll('theirs');
            break;
          case 'close':
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static async create(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const absolutePaths = getConflictedFiles(workspaceRoot);

    if (absolutePaths.length === 0) {
      vscode.window.showInformationMessage('No Git conflicts found in the workspace.');
      return;
    }

    const files: ConflictFileInfo[] = absolutePaths.map(absPath => ({
      absolutePath: absPath,
      relativePath: path.relative(workspaceRoot, absPath),
      conflictCount: countConflicts(absPath),
      resolved: false,
    }));

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ConflictPanel.currentPanel) {
      ConflictPanel.currentPanel._files = files;
      ConflictPanel.currentPanel._panel.reveal(column);
      ConflictPanel.currentPanel._refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'conflictResolver',
      'Git Conflicts',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))],
      }
    );

    ConflictPanel.currentPanel = new ConflictPanel(panel, workspaceRoot, files);
  }

  private async _resolveFile(index: number, side: 'mine' | 'theirs'): Promise<void> {
    const file = this._files[index];
    if (!file) { return; }

    try {
      if (side === 'mine') {
        acceptMine(file.absolutePath);
      } else {
        acceptTheirs(file.absolutePath);
      }
      stageFile(file.absolutePath);
      file.resolved = true;
      file.conflictCount = 0;
      this._refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to resolve ${file.relativePath}: ${err}`);
    }
  }

  private async _resolveAll(side: 'mine' | 'theirs'): Promise<void> {
    for (let i = 0; i < this._files.length; i++) {
      if (!this._files[i].resolved) {
        await this._resolveFile(i, side);
      }
    }
  }

  private async _openMergeEditor(index: number): Promise<void> {
    const file = this._files[index];
    if (!file) { return; }

    await MergeEditor.create(file.absolutePath, this._workspaceRoot, () => {
      // Called when merge editor saves
      file.resolved = true;
      file.conflictCount = 0;
      this._refresh();
    });
  }

  private _refresh(): void {
    this._panel.webview.postMessage({
      command: 'update',
      files: this._files,
    });
  }

  public dispose(): void {
    ConflictPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  private _getWebviewContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const totalConflicts = this._files.reduce((sum, f) => sum + f.conflictCount, 0);

    const filesJson = JSON.stringify(
      this._files.map(f => ({
        relativePath: f.relativePath,
        conflictCount: f.conflictCount,
        resolved: f.resolved,
        ext: path.extname(f.relativePath).slice(1),
      }))
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Conflicts</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .header h1 {
      font-size: 16px;
      font-weight: 600;
    }

    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
    }

    .file-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .file-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
      transition: background 0.1s;
    }

    .file-row:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .file-row.resolved {
      opacity: 0.5;
    }

    .file-icon {
      font-size: 14px;
      width: 20px;
      text-align: center;
      flex-shrink: 0;
    }

    .file-info {
      flex: 1;
      min-width: 0;
    }

    .file-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .conflict-count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .resolved-badge {
      color: #4caf50;
      font-size: 12px;
      font-weight: 600;
    }

    .row-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    button {
      cursor: pointer;
      border: none;
      border-radius: 3px;
      padding: 4px 10px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      transition: opacity 0.1s;
    }

    button:hover { opacity: 0.85; }
    button:active { opacity: 0.7; }
    button:disabled { opacity: 0.4; cursor: default; }

    .btn-mine {
      background: #2d5a27;
      color: #c8e6c9;
      border: 1px solid #4caf50;
    }

    .btn-theirs {
      background: #1a3a5c;
      color: #bbdefb;
      border: 1px solid #2196f3;
    }

    .btn-merge {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      border: 1px solid var(--vscode-button-border, transparent);
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .toolbar .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 5px 14px;
      font-size: 13px;
    }

    .toolbar .btn-close {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border, #555);
      padding: 5px 14px;
      font-size: 13px;
      margin-left: auto;
    }

    .counter {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state .icon { font-size: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Git Conflicts</h1>
    <span class="badge" id="totalBadge">${totalConflicts} conflict${totalConflicts !== 1 ? 's' : ''}</span>
  </div>

  <div class="file-list" id="fileList"></div>

  <div class="toolbar">
    <button class="btn-primary btn-mine" id="acceptAllMine">Accept All Mine</button>
    <button class="btn-primary btn-theirs" id="acceptAllTheirs">Accept All Theirs</button>
    <span class="counter" id="counter"></span>
    <button class="btn-close" id="closeBtn">Close</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let files = ${filesJson};

    function getFileIcon(ext) {
      const icons = {
        ts: '$(file-code)', tsx: '$(file-code)', js: '$(file-code)', jsx: '$(file-code)',
        json: '$(json)', md: '$(markdown)', py: '$(file-code)', html: '$(file-code)',
        css: '$(file-code)', scss: '$(file-code)', java: '$(file-code)', cs: '$(file-code)',
        go: '$(file-code)', rs: '$(file-code)', rb: '$(file-code)', php: '$(file-code)',
        xml: '$(file-code)', yaml: '$(file-code)', yml: '$(file-code)',
        sh: '$(terminal)', bash: '$(terminal)',
        png: '$(file-media)', jpg: '$(file-media)', svg: '$(file-media)',
        txt: '$(file-text)',
      };
      return icons[ext] || '$(file)';
    }

    function render() {
      const list = document.getElementById('fileList');
      const resolved = files.filter(f => f.resolved).length;
      const total = files.length;

      document.getElementById('counter').textContent = resolved + ' of ' + total + ' resolved';

      if (files.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="icon">✓</div><div>No conflicts found</div></div>';
        return;
      }

      list.innerHTML = files.map((f, i) => {
        const icon = f.ext || 'file';
        return \`<div class="file-row \${f.resolved ? 'resolved' : ''}" data-index="\${i}">
          <div class="file-icon" title="\${f.ext || 'file'}">📄</div>
          <div class="file-info">
            <div class="file-path" title="\${f.relativePath}">\${f.relativePath}</div>
            <div class="conflict-count">\${f.resolved ? '<span class="resolved-badge">✓ Resolved</span>' : f.conflictCount + ' conflict block' + (f.conflictCount !== 1 ? 's' : '')}</div>
          </div>
          <div class="row-actions">
            <button class="btn-mine" data-action="resolve" data-side="mine" data-index="\${i}" \${f.resolved ? 'disabled' : ''}>Accept Mine</button>
            <button class="btn-theirs" data-action="resolve" data-side="theirs" data-index="\${i}" \${f.resolved ? 'disabled' : ''}>Accept Theirs</button>
            <button class="btn-merge" data-action="merge" data-index="\${i}" \${f.resolved ? 'disabled' : ''}>Merge...</button>
          </div>
        </div>\`;
      }).join('');

      const allResolved = files.every(f => f.resolved);
      document.getElementById('totalBadge').textContent =
        allResolved ? 'All resolved ✓' : (files.reduce((s, f) => s + (f.resolved ? 0 : f.conflictCount), 0)) + ' conflicts remaining';
    }

    function resolve(index, side) {
      vscode.postMessage({ command: side === 'mine' ? 'acceptMine' : 'acceptTheirs', index });
    }

    function merge(index) {
      vscode.postMessage({ command: 'merge', index });
    }

    document.getElementById('fileList').addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest('button[data-action]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return;
      }

      const index = Number(button.dataset.index);
      if (!Number.isInteger(index)) {
        return;
      }

      if (button.dataset.action === 'resolve') {
        const side = button.dataset.side;
        if (side === 'mine' || side === 'theirs') {
          resolve(index, side);
        }
        return;
      }

      if (button.dataset.action === 'merge') {
        merge(index);
      }
    });

    document.getElementById('acceptAllMine').onclick = () => vscode.postMessage({ command: 'acceptAllMine' });
    document.getElementById('acceptAllTheirs').onclick = () => vscode.postMessage({ command: 'acceptAllTheirs' });
    document.getElementById('closeBtn').onclick = () => vscode.postMessage({ command: 'close' });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'update') {
        files = msg.files;
        render();
      }
    });

    render();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
