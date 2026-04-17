import * as fs from 'fs';

export interface ConflictBlock {
  startLine: number; // 0-based index of <<<<<<< line
  endLine: number;   // 0-based index of >>>>>>> line
  mineLines: string[];
  theirLines: string[];
}

export function parseConflictBlocks(fileContent: string): ConflictBlock[] {
  const lines = fileContent.split('\n');
  const blocks: ConflictBlock[] = [];
  let state: 'normal' | 'mine' | 'theirs' = 'normal';
  let startLine = -1;
  let mineLines: string[] = [];
  let theirLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('<<<<<<<')) {
      state = 'mine';
      startLine = i;
      mineLines = [];
      theirLines = [];
    } else if (line.startsWith('=======') && state === 'mine') {
      state = 'theirs';
    } else if (line.startsWith('>>>>>>>') && state === 'theirs') {
      blocks.push({ startLine, endLine: i, mineLines: [...mineLines], theirLines: [...theirLines] });
      state = 'normal';
    } else if (state === 'mine') {
      mineLines.push(line);
    } else if (state === 'theirs') {
      theirLines.push(line);
    }
  }

  return blocks;
}

export function countConflicts(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return parseConflictBlocks(content).length;
  } catch {
    return 0;
  }
}

export type ConflictSide = 'mine' | 'theirs' | string;

export function resolveWithResult(
  filePath: string,
  blocks: ConflictBlock[],
  chosenSides: ConflictSide[]
): string {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const result: string[] = [];
  let blockIndex = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (blockIndex < blocks.length && i === blocks[blockIndex].startLine) {
      const block = blocks[blockIndex];
      const side = chosenSides[blockIndex];

      if (side === 'mine') {
        result.push(...block.mineLines);
      } else if (side === 'theirs') {
        result.push(...block.theirLines);
      } else {
        // Custom text provided as a string
        result.push(...side.split('\n'));
      }

      i = block.endLine + 1;
      blockIndex++;
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}
