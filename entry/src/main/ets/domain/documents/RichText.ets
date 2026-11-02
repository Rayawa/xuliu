import { Block, InlineRun } from '../../models/Workspace';

export function copyRun(run: InlineRun, text: string = run.text): InlineRun {
  const next = JSON.parse(JSON.stringify(run)) as InlineRun;
  next.text = text;
  return next;
}

export function normalizedRuns(block: Block): InlineRun[] {
  const text = block.text ?? '';
  if (block.inlineRuns?.map((run) => run.text).join('') === text) return block.inlineRuns.map((run) => copyRun(run));
  return text ? [{ text }] : [];
}

function sameStyle(left: InlineRun, right: InlineRun): boolean {
  return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline &&
    left.strike === right.strike && left.color === right.color && left.backgroundColor === right.backgroundColor &&
    left.fontSize === right.fontSize && left.fontFamily === right.fontFamily;
}

export function compactRuns(runs: InlineRun[]): InlineRun[] {
  const result: InlineRun[] = [];
  runs.filter((run) => !!run.text).forEach((run) => {
    const previous = result[result.length - 1];
    if (previous && sameStyle(previous, run)) previous.text += run.text;
    else result.push(copyRun(run));
  });
  return result;
}

export function sliceRuns(runs: InlineRun[], start: number, end: number): InlineRun[] {
  const result: InlineRun[] = [];
  let offset = 0;
  runs.forEach((run) => {
    const from = Math.max(0, start - offset);
    const to = Math.min(run.text.length, end - offset);
    if (from < to) result.push(copyRun(run, run.text.slice(from, to)));
    offset += run.text.length;
  });
  return result;
}

export function runAt(runs: InlineRun[], offset: number): InlineRun {
  let length = 0;
  for (const run of runs) {
    length += run.text.length;
    if (offset <= length) return copyRun(run, '');
  }
  return { text: '' };
}

export function editText(block: Block, text: string, insertionStyle?: InlineRun): Block {
  const old = block.text ?? '';
  let start = 0;
  while (start < old.length && start < text.length && old[start] === text[start]) start++;
  let suffix = 0;
  while (suffix < old.length - start && suffix < text.length - start && old[old.length - suffix - 1] === text[text.length - suffix - 1]) suffix++;
  const runs = normalizedRuns(block);
  const inserted = text.slice(start, text.length - suffix);
  const style = insertionStyle ?? runAt(runs, start);
  const nextRuns = sliceRuns(runs, 0, start).concat(inserted ? [copyRun(style, inserted)] : [], sliceRuns(runs, old.length - suffix, old.length));
  const next = JSON.parse(JSON.stringify(block)) as Block;
  next.text = text; next.inlineRuns = compactRuns(nextRuns);
  return next;
}

export function formatRuns(block: Block, start: number, end: number, change: (run: InlineRun) => void): Block {
  const runs = normalizedRuns(block);
  const middle = sliceRuns(runs, start, end);
  middle.forEach(change);
  const next = JSON.parse(JSON.stringify(block)) as Block;
  next.inlineRuns = compactRuns(sliceRuns(runs, 0, start).concat(middle, sliceRuns(runs, end, (block.text ?? '').length)));
  return next;
}

export function plainBlock(block: Block): string {
  if (block.type === 'table') return (block.rows ?? []).map((row) => row.join('\t')).join('\n');
  return block.text ?? block.fileName ?? block.url ?? '';
}
