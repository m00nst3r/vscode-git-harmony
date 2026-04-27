import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCurrentBranch, getIncomingRef, stageFile } from './gitUtils';
import { parseConflictBlocks, ConflictBlock, resolveWithResult, ConflictSide } from './conflictScanner';

export class MergeEditor {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _filePath: string;
  private readonly _workspaceRoot: string;
  private readonly _onSaved: () => void;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    filePath: string,
    workspaceRoot: string,
    onSaved: () => void
  ) {
    this._panel = panel;
    this._filePath = filePath;
    this._workspaceRoot = workspaceRoot;
    this._onSaved = onSaved;

    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            await this._save(message.content);
            break;
          case 'cancel':
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static async create(
    filePath: string,
    workspaceRoot: string,
    onSaved: () => void
  ): Promise<void> {
    const fileName = path.basename(filePath);
    const panel = vscode.window.createWebviewPanel(
      'conflictMergeEditor',
      `Merge: ${fileName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    new MergeEditor(panel, filePath, workspaceRoot, onSaved);
  }

  private async _save(content: string): Promise<void> {
    try {
      fs.writeFileSync(this._filePath, content, 'utf8');
      stageFile(this._filePath);
      this._onSaved();
      this._panel.dispose();
      vscode.window.showInformationMessage(`Saved and staged: ${path.basename(this._filePath)}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save: ${err}`);
    }
  }

  public dispose(): void {
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  private _getWebviewContent(): string {
    const nonce = getNonce();
    const fileContent = fs.readFileSync(this._filePath, 'utf8');
    const blocks = parseConflictBlocks(fileContent);
    const lines = fileContent.split('\n');
    const currentBranch = getCurrentBranch(this._workspaceRoot);
    const incomingRef = getIncomingRef(this._workspaceRoot);
    const fileName = path.basename(this._filePath);
    const ext = path.extname(this._filePath).slice(1);

    // Build segment data for the webview
    interface NormalSegment { type: 'normal'; lines: string[] }
    interface ConflictSegment { type: 'conflict'; index: number; mineLines: string[]; theirLines: string[] }
    type Segment = NormalSegment | ConflictSegment;

    const segments: Segment[] = [];
    let lineIndex = 0;
    let blockIdx = 0;

    while (lineIndex < lines.length) {
      if (blockIdx < blocks.length && lineIndex === blocks[blockIdx].startLine) {
        const b = blocks[blockIdx];
        segments.push({ type: 'conflict', index: blockIdx, mineLines: b.mineLines, theirLines: b.theirLines });
        lineIndex = b.endLine + 1;
        blockIdx++;
      } else {
        // Gather normal lines until next conflict or end
        const normalLines: string[] = [];
        const nextConflictStart = blockIdx < blocks.length ? blocks[blockIdx].startLine : Infinity;
        while (lineIndex < lines.length && lineIndex < nextConflictStart) {
          normalLines.push(lines[lineIndex]);
          lineIndex++;
        }
        if (normalLines.length > 0) {
          segments.push({ type: 'normal', lines: normalLines });
        }
      }
    }

    const segmentsJson = JSON.stringify(segments);
    const blocksCount = blocks.length;

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' https://cdnjs.cloudflare.com; script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com; font-src https://cdnjs.cloudflare.com;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merge: ${fileName}</title>
  <link rel="stylesheet" nonce="${nonce}" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
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

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .toolbar .title {
      font-weight: 600;
      font-size: 13px;
      margin-right: 8px;
    }

    .toolbar button {
      cursor: pointer;
      border: none;
      border-radius: 3px;
      padding: 4px 12px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      transition: opacity 0.1s;
    }

    .toolbar button:hover { opacity: 0.85; }
    .toolbar button:disabled { opacity: 0.4; cursor: default; }

    .btn-prev, .btn-next {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-button-border, transparent);
    }

    .btn-mine-all { background: #2d5a27; color: #c8e6c9; border: 1px solid #4caf50; }
    .btn-theirs-all { background: #1a3a5c; color: #bbdefb; border: 1px solid #2196f3; }

    .btn-save {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid transparent;
    }

    .btn-cancel {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border, #555);
      margin-left: auto;
    }

    .conflict-counter {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .columns-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .column {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      border-right: 1px solid var(--vscode-panel-border);
      overflow: hidden;
    }

    .column:last-child { border-right: none; }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 600;
    }

    .column-header .branch-label {
      font-weight: 400;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .column-scroll {
      flex: 1;
      overflow-y: scroll;
      overflow-x: auto;
    }

    .code-content {
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
      min-height: 100%;
    }

    /* Normal segment rows */
    .normal-block {
      background: var(--vscode-editor-background);
    }

    .code-line {
      display: block;
      padding: 0 12px;
      white-space: pre;
      min-height: 1.5em;
    }

    .code-line:hover {
      background: var(--vscode-editor-lineHighlightBackground, rgba(255,255,255,0.04));
    }

    /* Conflict block wrappers */
    .conflict-block {
      border-top: 1px solid var(--vscode-panel-border);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .conflict-block.active {
      box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007fd4) inset;
    }

    .mine-block {
      background: #2d5a27;
    }

    .theirs-block {
      background: #1a3a5c;
    }

    .mine-block .code-line { color: #c8e6c9; }
    .theirs-block .code-line { color: #bbdefb; }

    .unresolved-block {
      background: repeating-linear-gradient(
        -45deg,
        rgba(128, 128, 128, 0.05),
        rgba(128, 128, 128, 0.05) 10px,
        transparent 10px,
        transparent 20px
      );
    }

    .resolved-block {
      background: var(--vscode-editor-background);
    }

    .incoming-separator {
      font-family: var(--vscode-font-family);
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 12px;
      background: rgba(33, 150, 243, 0.08);
      border-top: 1px dashed rgba(33, 150, 243, 0.3);
      user-select: none;
      pointer-events: none;
      letter-spacing: 0.05em;
    }

    .ghost-theirs-block {
      opacity: 0.4;
      pointer-events: none;
      user-select: none;
      background: rgba(26, 58, 92, 0.5);
    }

    .result-content-area {
      min-height: 1.5em;
      position: relative;
    }

    .result-content-area:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    /* Action sidebar bars */
    .action-bar {
      width: 52px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      background: var(--vscode-sideBar-background);
      border-right: 1px solid var(--vscode-panel-border);
      overflow: hidden;
    }

    .action-bar-header {
      padding: 6px 0;
      background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 600;
    }

    .action-bar-scroll {
      flex: 1;
      overflow-y: scroll;
      overflow-x: hidden;
      scrollbar-width: none;
    }

    .action-bar-scroll::-webkit-scrollbar { display: none; }

    .action-bar-content {
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
      min-height: 100%;
    }

    .action-bar-row {
      background: var(--vscode-editor-background);
    }

    .action-bar-conflict-row {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: center;
      gap: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--vscode-panel-border);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .action-bar-conflict-row.active {
      box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007fd4) inset;
    }

    /* Icon-only action buttons */
    .icon-btn {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      border-radius: 3px;
      border: 1px solid transparent;
      padding: 0;
      transition: opacity 0.1s;
      font-family: var(--vscode-font-family);
      flex-shrink: 0;
    }

    .icon-btn:hover { opacity: 0.8; }
    .icon-btn:disabled { opacity: 0.25; cursor: default; }

    .icon-btn-accept-mine   { background: #2d5a27; color: #c8e6c9; border-color: #4caf50; }
    .icon-btn-accept-theirs { background: #1a3a5c; color: #bbdefb; border-color: #2196f3; }
    .icon-btn-decline       { background: #4a1a1a; color: #ffcdd2; border-color: #e57373; }
    .icon-btn-undo          { background: none; color: var(--vscode-foreground); border-color: var(--vscode-button-border, #555); }

    .hljs { background: transparent !important; padding: 0 !important; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="title">Merge: ${fileName}</span>
    <button class="btn-prev" id="btnPrev">← Prev Conflict</button>
    <button class="btn-next" id="btnNext">Next Conflict →</button>
    <button class="btn-mine-all" id="btnAcceptAllMine">Accept All Mine</button>
    <button class="btn-theirs-all" id="btnAcceptAllTheirs">Accept All Theirs</button>
    <span class="conflict-counter" id="conflictCounter"></span>
    <button class="btn-save" id="btnSave">Save &amp; Mark Resolved</button>
    <button class="btn-cancel" id="btnCancel">Cancel</button>
  </div>

  <div class="columns-container">
    <div class="column" id="colMine">
      <div class="column-header">
        <span>Mine (HEAD)</span>
        <span class="branch-label">${currentBranch}</span>
      </div>
      <div class="column-scroll" id="scrollMine">
        <div class="code-content" id="contentMine"></div>
      </div>
    </div>

    <div class="action-bar" id="colActionLeft">
      <div class="action-bar-header">&#160;</div>
      <div class="action-bar-scroll" id="scrollActionLeft">
        <div class="action-bar-content" id="contentActionLeft"></div>
      </div>
    </div>

    <div class="column" id="colResult">
      <div class="column-header">
        <span>Result</span>
        <span class="branch-label" id="resultCounter"></span>
      </div>
      <div class="column-scroll" id="scrollResult">
        <div class="code-content" id="contentResult"></div>
      </div>
    </div>

    <div class="action-bar" id="colActionRight">
      <div class="action-bar-header">&#160;</div>
      <div class="action-bar-scroll" id="scrollActionRight">
        <div class="action-bar-content" id="contentActionRight"></div>
      </div>
    </div>

    <div class="column" id="colTheirs">
      <div class="column-header">
        <span>Theirs (Incoming)</span>
        <span class="branch-label">${incomingRef}</span>
      </div>
      <div class="column-scroll" id="scrollTheirs">
        <div class="code-content" id="contentTheirs"></div>
      </div>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" nonce="${nonce}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const segments = ${segmentsJson};
    const totalConflicts = ${blocksCount};
    const fileExt = ${JSON.stringify(ext)};

    // Track resolution choices: null = unresolved, 'mine', 'theirs', or custom string
    const resolutions = new Array(totalConflicts).fill(null);
    let activeConflictIndex = -1;

    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function highlight(code, ext) {
      if (!code.trim()) return escapeHtml(code);
      try {
        const lang = hljs.getLanguage(ext) ? ext : 'plaintext';
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        return escapeHtml(code);
      }
    }

    function renderLines(lines, cssClass) {
      if (lines.length === 0) {
        return '<span class="code-line">&nbsp;</span>';
      }
      return lines.map(l => {
        const highlighted = highlight(l, fileExt);
        return '<span class="code-line">' + (highlighted || '&nbsp;') + '</span>';
      }).join('');
    }

    function renderColumns() {
      let mineHtml = '';
      let leftBarHtml = '';
      let resultHtml = '';
      let rightBarHtml = '';
      let theirsHtml = '';
      let conflictIdx = 0;

      for (const seg of segments) {
        if (seg.type === 'normal') {
          const rendered = renderLines(seg.lines, '');
          const block = '<div class="normal-block">' + rendered + '</div>';
          mineHtml += block;
          theirsHtml += block;
          resultHtml += block;
          const normalBarBlock = '<div class="action-bar-row"></div>';
          leftBarHtml += normalBarBlock;
          rightBarHtml += normalBarBlock;
        } else {
          const idx = conflictIdx;
          conflictIdx++;
          const res = resolutions[idx];
          const isActive = idx === activeConflictIndex;
          const activeClass = isActive ? ' active' : '';

          const resLinesLength = res === 'mine' ? seg.mineLines.length 
            : res === 'theirs' ? seg.theirLines.length 
            : res !== null ? res.split('\\n').length 
            : 0;
            
          const lineCountDiff = Math.max(seg.mineLines.length, seg.theirLines.length, resLinesLength);
          const minHeightStyle = 'min-height: ' + (Math.max(lineCountDiff, 1) * 1.5) + 'em; display: block;';

          // Resolved state helpers
          const mineAccepted  = res === 'mine';
          const theirsAccepted = res === 'theirs';
          const anyResolved = res !== null;

          // Mine column
          mineHtml += '<div class="conflict-block mine-block' + activeClass + '" data-conflict="' + idx + '">'
            + '<div style="' + minHeightStyle + '">' + renderLines(seg.mineLines, 'mine') + '</div>'
            + '</div>';

          // Theirs column
          theirsHtml += '<div class="conflict-block theirs-block' + activeClass + '" data-conflict="' + idx + '">'
            + '<div style="' + minHeightStyle + '">' + renderLines(seg.theirLines, 'theirs') + '</div>'
            + '</div>';

          // Action bar rows
          if (!anyResolved) {
            leftBarHtml += '<div class="action-bar-conflict-row' + activeClass + '" data-conflict="' + idx + '">'
              + '<button class="icon-btn icon-btn-decline" data-action="decline" data-side="mine" data-index="' + idx + '" title="Accept Theirs">&#x2715;</button>'
              + '<button class="icon-btn icon-btn-accept-mine" data-action="accept" data-side="mine" data-index="' + idx + '" title="Accept Mine">&#x25B6;</button>'
              + '</div>';
            rightBarHtml += '<div class="action-bar-conflict-row' + activeClass + '" data-conflict="' + idx + '">'
              + '<button class="icon-btn icon-btn-accept-theirs" data-action="accept" data-side="theirs" data-index="' + idx + '" title="Accept Theirs">&#x25C0;</button>'
              + '<button class="icon-btn icon-btn-decline" data-action="decline" data-side="theirs" data-index="' + idx + '" title="Accept Mine">&#x2715;</button>'
              + '</div>';
          } else {
            leftBarHtml += '<div class="action-bar-conflict-row' + activeClass + '" data-conflict="' + idx + '">'
              + '<button class="icon-btn icon-btn-undo" data-action="undo" data-index="' + idx + '" title="Reset">&#x21A9;</button>'
              + '</div>';
            rightBarHtml += '<div class="action-bar-conflict-row' + activeClass + '" data-conflict="' + idx + '">'
              + '<button class="icon-btn icon-btn-undo" data-action="undo" data-index="' + idx + '" title="Reset">&#x21A9;</button>'
              + '</div>';
          }

          // Result column
          if (res === null) {
            const mineHeightStyle = 'min-height: ' + (Math.max(seg.mineLines.length, 1) * 1.5) + 'em; display: block;';
            const ghostHeightStyle = 'min-height: ' + (Math.max(seg.theirLines.length, 1) * 1.5) + 'em; display: block;';
            resultHtml += '<div class="conflict-block result-block' + activeClass + '" data-conflict="' + idx + '">'
              + '<div class="result-content-area mine-block" contenteditable="true" data-index="' + idx + '" style="outline:none; width:100%; ' + mineHeightStyle + '">'
              + renderLines(seg.mineLines, 'mine')
              + '</div>'
              + '<div class="incoming-separator">Incoming \u2193</div>'
              + '<div class="ghost-theirs-block theirs-block" contenteditable="false" style="' + ghostHeightStyle + '">'
              + renderLines(seg.theirLines, 'theirs')
              + '</div>'
              + '</div>';
          } else {
            let resContent = '';
            let resClass = '';
            if (res === 'mine') {
              resContent = renderLines(seg.mineLines, 'mine');
              resClass = ' mine-block';
            } else if (res === 'theirs') {
              resContent = renderLines(seg.theirLines, 'theirs');
              resClass = ' theirs-block';
            } else {
              resContent = renderLines(res.split('\\n'), '');
              resClass = ' resolved-block';
            }
            resultHtml += '<div class="conflict-block result-block' + resClass + activeClass + '" data-conflict="' + idx + '">'
              + '<div class="result-content-area" contenteditable="true" data-index="' + idx + '" style="outline:none; width:100%; ' + minHeightStyle + '">'
              + resContent
              + '</div>'
              + '</div>';
          }
        }
      }

      document.getElementById('contentMine').innerHTML = mineHtml;
      document.getElementById('contentActionLeft').innerHTML = leftBarHtml;
      document.getElementById('contentResult').innerHTML = resultHtml;
      document.getElementById('contentActionRight').innerHTML = rightBarHtml;
      document.getElementById('contentTheirs').innerHTML = theirsHtml;

      updateCounter();
      syncBarHeights();
    }

    // Measure actual rendered heights from the code columns and apply them
    // to the action bar rows so buttons align exactly with each conflict block.
    function syncBarHeights() {
      const mineChildren    = document.getElementById('contentMine').children;
      const resultChildren  = document.getElementById('contentResult').children;
      const theirsChildren  = document.getElementById('contentTheirs').children;
      const leftChildren    = document.getElementById('contentActionLeft').children;
      const rightChildren   = document.getElementById('contentActionRight').children;
      const len = mineChildren.length;
      for (let i = 0; i < len; i++) {
        const h = Math.max(
          mineChildren[i]   ? mineChildren[i].offsetHeight   : 0,
          resultChildren[i] ? resultChildren[i].offsetHeight : 0,
          theirsChildren[i] ? theirsChildren[i].offsetHeight : 0
        );
        if (leftChildren[i])  { leftChildren[i].style.height  = h + 'px'; }
        if (rightChildren[i]) { rightChildren[i].style.height = h + 'px'; }
      }
    }

    function updateCounter() {
      const unresolved = resolutions.filter(r => r === null).length;
      const counterText = unresolved === 0
        ? '✓ All resolved'
        : unresolved + ' conflict' + (unresolved !== 1 ? 's' : '') + ' remaining';
      document.getElementById('conflictCounter').textContent = counterText;
      document.getElementById('resultCounter').textContent = counterText;

      document.getElementById('btnPrev').disabled = totalConflicts === 0;
      document.getElementById('btnNext').disabled = totalConflicts === 0;
    }

    function accept(idx, side) {
      resolutions[idx] = side;
      renderColumns();
    }

    function undo(idx) {
      resolutions[idx] = null;
      renderColumns();
    }

    function acceptAllMine() {
      for (let i = 0; i < totalConflicts; i++) {
        resolutions[i] = 'mine';
      }
      renderColumns();
    }

    function acceptAllTheirs() {
      for (let i = 0; i < totalConflicts; i++) {
        resolutions[i] = 'theirs';
      }
      renderColumns();
    }

    function navigateConflict(direction) {
      const conflictBlocks = document.querySelectorAll('#contentMine .conflict-block');
      if (conflictBlocks.length === 0) { return; }

      let nextIdx = activeConflictIndex + direction;
      if (nextIdx < 0) { nextIdx = conflictBlocks.length - 1; }
      if (nextIdx >= conflictBlocks.length) { nextIdx = 0; }

      setActive(nextIdx);

      // Scroll to the block in the mine column
      const mineBlock = conflictBlocks[nextIdx];
      if (mineBlock instanceof HTMLElement) {
        mineBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function setActive(idx) {
      activeConflictIndex = idx;
      // Highlight all columns' conflict block with this index
      document.querySelectorAll('[data-conflict]').forEach(el => {
        if (parseInt(el.getAttribute('data-conflict')) === idx) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    }

    function clearActive() {
      // Only clear if not navigating
    }

    function buildResultContent() {
      const lines = [];
      let conflictIdx = 0;
      for (const seg of segments) {
        if (seg.type === 'normal') {
          lines.push(...seg.lines);
        } else {
          const res = resolutions[conflictIdx];
          if (res === 'mine') {
            lines.push(...seg.mineLines);
          } else if (res === 'theirs') {
            lines.push(...seg.theirLines);
          } else if (res !== null) {
            lines.push(...res.split('\\n'));
          } else {
            // Still unresolved — keep raw conflict markers
            lines.push('<<<<<<< HEAD');
            lines.push(...seg.mineLines);
            lines.push('=======');
            lines.push(...seg.theirLines);
            lines.push('>>>>>>> incoming');
          }
          conflictIdx++;
        }
      }
      return lines.join('\\n');
    }

    function saveResult() {
      const content = buildResultContent();
      const conflictMarkerCount = (content.match(/^<{7}/mg) || []).length;
      if (conflictMarkerCount > 0) {
        const proceed = confirm(conflictMarkerCount + ' conflict(s) still unresolved. Save anyway with conflict markers?');
        if (!proceed) { return; }
      }
      vscode.postMessage({ command: 'save', content });
    }

    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }

    document.getElementById('btnPrev').addEventListener('click', () => navigateConflict(-1));
    document.getElementById('btnNext').addEventListener('click', () => navigateConflict(1));
    document.getElementById('btnAcceptAllMine').addEventListener('click', acceptAllMine);
    document.getElementById('btnAcceptAllTheirs').addEventListener('click', acceptAllTheirs);
    document.getElementById('btnSave').addEventListener('click', saveResult);
    document.getElementById('btnCancel').addEventListener('click', cancel);

    document.querySelector('.columns-container').addEventListener('mouseover', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const conflictBlock = target.closest('[data-conflict]');
      if (!(conflictBlock instanceof HTMLElement)) {
        return;
      }

      const index = Number(conflictBlock.dataset.conflict);
      if (Number.isInteger(index)) {
        setActive(index);
      }
    });

    function handleConflictAction(event) {
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

      switch (button.dataset.action) {
        case 'accept': {
          const side = button.dataset.side;
          if (side === 'mine' || side === 'theirs') {
            accept(index, side);
          }
          break;
        }
        case 'decline': {
          // Declining one side accepts the opposite side
          const side = button.dataset.side;
          if (side === 'mine') {
            accept(index, 'theirs');
          } else if (side === 'theirs') {
            accept(index, 'mine');
          }
          break;
        }
        case 'undo':
          undo(index);
          break;
      }
    }

    document.getElementById('contentMine').addEventListener('click', handleConflictAction);
    document.getElementById('contentActionLeft').addEventListener('click', handleConflictAction);
    document.getElementById('contentResult').addEventListener('click', handleConflictAction);
    document.getElementById('contentActionRight').addEventListener('click', handleConflictAction);
    document.getElementById('contentTheirs').addEventListener('click', handleConflictAction);

    document.getElementById('contentResult').addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (document.queryCommandSupported('insertText')) {
        document.execCommand('insertText', false, text);
      } else {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;
        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(text));
      }
    });

    document.getElementById('contentResult').addEventListener('input', e => {
      const target = e.target;
      const contentArea = target.closest('.result-content-area');
      if (contentArea) {
        // Remove ghost preview when user starts editing
        const conflictBlock = contentArea.closest('.conflict-block');
        if (conflictBlock) {
          const sep = conflictBlock.querySelector('.incoming-separator');
          const ghost = conflictBlock.querySelector('.ghost-theirs-block');
          if (sep) sep.remove();
          if (ghost) ghost.remove();
        }
        const idx = Number(contentArea.getAttribute('data-index'));
        let text = contentArea.innerText || '';
        if (text.endsWith('\\n')) text = text.slice(0, -1);
        resolutions[idx] = text;
        updateCounter();
        syncBarHeights();
      }
    });

    // Synchronized scrolling
    let scrollingSrc = null;
    let scrollTimer = null;

    function syncScroll(src) {
      if (scrollingSrc && scrollingSrc !== src) { return; }
      scrollingSrc = src;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { scrollingSrc = null; }, 100);

      const scrolls = ['scrollMine', 'scrollActionLeft', 'scrollResult', 'scrollActionRight', 'scrollTheirs'];
      const srcEl = document.getElementById(src);
      const ratio = srcEl.scrollTop / (srcEl.scrollHeight - srcEl.clientHeight || 1);

      for (const id of scrolls) {
        if (id === src) { continue; }
        const el = document.getElementById(id);
        el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
      }
    }

    ['scrollMine', 'scrollActionLeft', 'scrollResult', 'scrollActionRight', 'scrollTheirs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('scroll', () => syncScroll(id), { passive: true });
    });

    // Initial render
    renderColumns();
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
