import { Block } from '../../models/Workspace';
import { uid } from '../workspace/WorkspaceDomain';
import { MAX_BLOCK_TEXT_CHARS } from '../../config/constants';

function textBlocks(label: string, text: string): Block[] {
  const value = `${label}${text.trim()}`; const result: Block[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + MAX_BLOCK_TEXT_CHARS);
    const previous = value.charCodeAt(end - 1);
    if (end < value.length && previous >= 0xD800 && previous <= 0xDBFF) end--;
    result.push({ id: uid(), type: 'text', text: value.slice(start, end) });
    start = end;
  }
  return result;
}

export function courseAnswerBlocks(question: string, answer: string): Block[] {
  if (!answer.trim()) throw new Error('没有可插入的回答正文');
  return [{ id: uid(), type: 'heading', headingLevel: 3, text: 'AI 问答' } as Block]
    .concat(textBlocks('问题：', question), textBlocks('回答：', answer));
}
