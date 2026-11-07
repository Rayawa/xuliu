import { pasteboard } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { cleanPaste, CleanPasteResult } from '../../domain/documents/CleanPaste';
import { MAX_FILE_BYTES } from '../../config/constants';

const baseEntities = JSON.parse('{}') as Record<string, string>;
baseEntities['amp'] = '&'; baseEntities['lt'] = '<'; baseEntities['gt'] = '>';
baseEntities['quot'] = '"'; baseEntities['apos'] = "'"; baseEntities['nbsp'] = ' ';
let entityNames: Promise<Record<string, string>> | undefined;
async function names(context: common.UIAbilityContext): Promise<Record<string, string>> {
  if (!entityNames) entityNames = context.resourceManager.getRawFileContent('html-entities.json').then((data) => {
    return JSON.parse(util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(data)) as Record<string, string>;
  }).catch(() => { entityNames = undefined; return baseEntities; });
  return await entityNames;
}

/** Call only from an authorized system PasteButton event. No clipboard polling or persistence. */
export async function readCleanClipboard(context: common.UIAbilityContext): Promise<CleanPasteResult> {
  const data = await pasteboard.getSystemPasteboard().getData();
  let html = data.getPrimaryHtml() ?? ''; const plain = data.getPrimaryText() ?? '';
  if (!html && !plain) throw new Error('剪贴板没有可粘贴的文字；图片或文件可通过附件添加');
  const encoder = new util.TextEncoder(); let fallback = '';
  if (plain.length > MAX_FILE_BYTES || encoder.encodeInto(plain).byteLength > MAX_FILE_BYTES) throw new Error('剪贴板正文超过2MB，请分段复制');
  if (html.length > MAX_FILE_BYTES || encoder.encodeInto(html).byteLength > MAX_FILE_BYTES) {
    if (!plain) throw new Error('剪贴板富文本超过2MB，请复制为纯文本后重试');
    html = ''; fallback = '富文本内容过大，已按纯文本保留';
  }
  const result = cleanPaste(html, plain, html ? await names(context) : baseEntities);
  if (fallback) result.notice = fallback;
  return result;
}
