import { common } from '@kit.AbilityKit';
import { picker, fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { MAX_FILE_BYTES } from '../../config/constants';

export async function readDocument(context: common.UIAbilityContext, suffixes: string[] = ['.json']): Promise<string | undefined> {
  const documentPicker = new picker.DocumentViewPicker(context);
  const options = new picker.DocumentSelectOptions();
  options.maxSelectNumber = 1;
  options.fileSuffixFilters = suffixes;
  const uris = await documentPicker.select(options);
  if (!uris.length) return undefined;
  const file = await fs.open(uris[0], fs.OpenMode.READ_ONLY);
  try {
    const size = fs.statSync(file.fd).size;
    if (size > MAX_FILE_BYTES) throw new Error('文件超过 2 MB，请先拆分文件');
    const buffer = new ArrayBuffer(size);
    let read = 0;
    const bytes = new Uint8Array(buffer);
    while (read < size) {
      const part = new ArrayBuffer(size - read);
      const count = await fs.read(file.fd, part);
      if (count <= 0) throw new Error('文件未读取完整，请重试');
      bytes.set(new Uint8Array(part, 0, count), read);
      read += count;
    }
    try { return util.TextDecoder.create('utf-8', { ignoreBOM: true, fatal: true }).decodeToString(bytes).replace(/^\uFEFF/, ''); }
    catch (error) {
      if (!suffixes.includes('.csv')) throw error as Error;
      return util.TextDecoder.create('gb18030', { ignoreBOM: true, fatal: true }).decodeToString(bytes).replace(/^\uFEFF/, '');
    }
  } finally { await fs.close(file); }
}

export async function exportDocument(context: common.UIAbilityContext, text: string, name: string): Promise<boolean> {
  const documentPicker = new picker.DocumentViewPicker(context);
  const options = new picker.DocumentSaveOptions();
  options.newFileNames = [name];
  const uris = await documentPicker.save(options);
  if (!uris.length) return false;
  const file = await fs.open(uris[0], fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
  try {
    const bytes = new util.TextEncoder().encodeInto(text);
    let written = 0;
    while (written < bytes.byteLength) {
      const count = await fs.write(file.fd, bytes.buffer.slice(written));
      if (count <= 0) throw new Error('文件未完整写入，请重试');
      written += count;
    }
  }
  finally { await fs.close(file); }
  return true;
}
