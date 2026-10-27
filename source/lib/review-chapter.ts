const chineseDigits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const chineseUnits: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

function chapterNumber(value: string): string | undefined {
  const text = value.normalize("NFKC");
  if (/^\d+$/.test(text)) return text.replace(/^0+(?=\d)/, "");
  if (/^[零〇一二两三四五六七八九]+$/.test(text)) return [...text].map((digit) => chineseDigits[digit]).join("").replace(/^0+(?=\d)/, "");
  let total = 0;
  let digit: number | undefined;
  let lastUnit = Infinity;
  for (const character of text) {
    if (character in chineseDigits) {
      if (digit !== undefined && digit !== 0) return;
      digit = chineseDigits[character];
    } else {
      const unit = chineseUnits[character];
      if (!unit || unit >= lastUnit || digit === 0) return;
      if (digit === undefined && (total !== 0 || unit !== 10)) return;
      total += (digit ?? 1) * unit;
      digit = undefined;
      lastUnit = unit;
    }
  }
  return String(total + (digit ?? 0));
}

export function normalizeReviewChapter(value: string): string {
  const text = value.trim();
  const lecture = /^[lLｌＬ]\s*([0-9０-９]+)(?=$|[^A-Za-z0-9０-９])/.exec(text);
  if (lecture) return `L${chapterNumber(lecture[1])}${text.slice(lecture[0].length)}`;
  const chapter = /^第\s*([0-9０-９零〇一二两三四五六七八九十百千]+)\s*章/.exec(text);
  if (!chapter) return text;
  const number = chapterNumber(chapter[1]);
  return number === undefined ? text : `第${number}章${text.slice(chapter[0].length)}`;
}

export function reviewChapterKey(value: string): string {
  return normalizeReviewChapter(value).normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}
