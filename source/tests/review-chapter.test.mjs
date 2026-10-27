import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReviewChapter, reviewChapterKey } from '../lib/review-chapter.ts';

test('chapter input accepts lowercase, fullwidth digits and Chinese numerals with a consistent display', () => {
  for (const [input, expected] of [
    [' l1 ', 'L1'], ['ｌ ０１', 'L1'], ['L12', 'L12'],
    ['第一章', '第1章'], ['第两章', '第2章'], ['第十一章', '第11章'],
    ['第二十章', '第20章'], ['第二十三章', '第23章'], ['第一百零二章', '第102章'],
    ['第０１章', '第1章'], ['第一〇一章', '第101章'],
  ]) {
    assert.equal(normalizeReviewChapter(input), expected);
    assert.equal(reviewChapterKey(input), reviewChapterKey(expected));
  }
});

test('chapter numbering keeps the full description and does not equate different learning items', () => {
  assert.equal(normalizeReviewChapter('l1（后半）'), 'L1（后半）');
  assert.equal(normalizeReviewChapter('第一章 例题与笔记'), '第1章 例题与笔记');
  assert.equal(reviewChapterKey('l1（后半）'), reviewChapterKey('L1 (后半)'));
  assert.notEqual(reviewChapterKey('L1（后半）'), reviewChapterKey('L1'));
  assert.notEqual(reviewChapterKey('第一章 例题'), reviewChapterKey('第1章'));
  assert.notEqual(reviewChapterKey('第1章和第2章'), reviewChapterKey('第1章'));
  assert.notEqual(reviewChapterKey('L1'), reviewChapterKey('第1章'));
});

test('free text and malformed chapter numbers are not guessed or rewritten', () => {
  for (const title of ['复习自己的笔记', 'lecture notes', 'l1cache', '第十十章', '第一二十章', '第零十章', '第一万章', '第一章之前的基础']) {
    assert.equal(normalizeReviewChapter(title), title === '第一章之前的基础' ? '第1章之前的基础' : title);
  }
});
