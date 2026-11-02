import { common } from '@kit.AbilityKit';
import { fileIo as fs, fileUri, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';

export interface ImportFile { name: string; extension: string; bytes: ArrayBuffer; }

export async function chooseImportFile(context: common.UIAbilityContext, suffixes: string[], maximumBytes: number,
  cancelled: () => boolean = () => false): Promise<ImportFile | undefined> {
  const view = new picker.DocumentViewPicker(context);
  const options = new picker.DocumentSelectOptions(); options.maxSelectNumber = 1; options.fileSuffixFilters = suffixes;
  const chosen = await view.select(options); if (!chosen.length || cancelled()) return undefined;
  const file = await fs.open(chosen[0], fs.OpenMode.READ_ONLY);
  try {
    const size = fs.statSync(file.fd).size;
    if (size > maximumBytes) throw new Error(`文件超过${Math.round(maximumBytes / 1024 / 1024)} MB，请按月份或学期拆分`);
    const bytes = new Uint8Array(size); let read = 0;
    while (read < size) {
      if (cancelled()) throw new Error('文件读取已取消');
      const chunk = new ArrayBuffer(Math.min(256 * 1024, size - read));
      const count = await fs.read(file.fd, chunk); if (count <= 0) throw new Error('文件读取不完整');
      bytes.set(new Uint8Array(chunk, 0, count), read); read += count;
    }
    if (cancelled()) throw new Error('文件读取已取消');
    const name = new fileUri.FileUri(chosen[0]).name;
    const result: ImportFile = { name, extension: name.split('.').pop()?.toLowerCase() ?? '', bytes: bytes.buffer as ArrayBuffer };
    return result;
  } finally { await fs.close(file); }
}

export function importText(bytes: ArrayBuffer): string {
  try { return util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new Uint8Array(bytes)).replace(/^\uFEFF/, ''); }
  catch (_) { return util.TextDecoder.create('gb18030', { fatal: true }).decodeToString(new Uint8Array(bytes)).replace(/^\uFEFF/, ''); }
}
