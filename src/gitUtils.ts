import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function exec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

export function getConflictedFiles(workspaceRoot: string): string[] {
  const output = exec('git diff --name-only --diff-filter=U', workspaceRoot);
  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.length > 0)
    .map(f => path.join(workspaceRoot, f));
}

export function acceptMine(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const resolved = stripConflictMarkers(content, 'mine');
  fs.writeFileSync(filePath, resolved, 'utf8');
}

export function acceptTheirs(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const resolved = stripConflictMarkers(content, 'theirs');
  fs.writeFileSync(filePath, resolved, 'utf8');
}

function stripConflictMarkers(content: string, side: 'mine' | 'theirs'): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let state: 'normal' | 'mine' | 'theirs' = 'normal';

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      state = 'mine';
      continue;
    }
    if (line.startsWith('=======')) {
      state = 'theirs';
      continue;
    }
    if (line.startsWith('>>>>>>>')) {
      state = 'normal';
      continue;
    }
    if (state === 'normal') {
      result.push(line);
    } else if (state === 'mine' && side === 'mine') {
      result.push(line);
    } else if (state === 'theirs' && side === 'theirs') {
      result.push(line);
    }
  }

  return result.join('\n');
}

export function stageFile(filePath: string): void {
  const dir = path.dirname(filePath);
  exec(`git add "${filePath}"`, dir);
}

export function getCurrentBranch(workspaceRoot: string): string {
  return exec('git branch --show-current', workspaceRoot) || 'HEAD';
}

export function getIncomingRef(workspaceRoot: string): string {
  const mergeHeadPath = path.join(workspaceRoot, '.git', 'MERGE_HEAD');
  const cherryPickHeadPath = path.join(workspaceRoot, '.git', 'CHERRY_PICK_HEAD');
  const rebaseHeadPath = path.join(workspaceRoot, '.git', 'REBASE_HEAD');

  if (fs.existsSync(mergeHeadPath)) {
    const sha = fs.readFileSync(mergeHeadPath, 'utf8').trim();
    const branch = exec(`git name-rev --name-only ${sha}`, workspaceRoot);
    return branch || sha.substring(0, 8);
  }

  if (fs.existsSync(cherryPickHeadPath)) {
    const sha = fs.readFileSync(cherryPickHeadPath, 'utf8').trim();
    return `cherry-pick: ${sha.substring(0, 8)}`;
  }

  if (fs.existsSync(rebaseHeadPath)) {
    const sha = fs.readFileSync(rebaseHeadPath, 'utf8').trim();
    return `rebase: ${sha.substring(0, 8)}`;
  }

  return 'Incoming';
}
