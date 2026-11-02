import { xml, util } from '@kit.ArkTS';

export interface XmlVisitor {
  start: (name: string, attributes: Map<string, string>) => void;
  text: (value: string) => void;
  end: (name: string) => void;
}
interface StartTag { name: string; empty: boolean; attributes: Map<string, string>; }

function localName(name: string): string { return name.split(':').pop() ?? name; }

function entities(value: string): string {
  return value.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_all: string, entity: string): string => {
    if (entity === 'amp') return '&'; if (entity === 'lt') return '<'; if (entity === 'gt') return '>';
    if (entity === 'quot') return '"'; if (entity === 'apos') return "'";
    const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isInteger(code) || code < 1 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) throw new Error('XML字符无效');
    return String.fromCodePoint(code);
  });
}

/** Attribute positions are scanned in order, independent of native attribute callback ordering. */
class StartTagScanner {
  private source: string;
  private position: number = 0;
  constructor(source: string) { this.source = source; }

  next(): StartTag {
    while (this.position < this.source.length) {
      const start = this.source.indexOf('<', this.position); if (start < 0) break;
      if (this.source.startsWith('<!--', start)) { const end = this.source.indexOf('-->', start + 4); if (end < 0) break; this.position = end + 3; continue; }
      if (this.source.startsWith('<![CDATA[', start)) { const end = this.source.indexOf(']]>', start + 9); if (end < 0) break; this.position = end + 3; continue; }
      if (this.source.startsWith('<?', start)) { const end = this.source.indexOf('?>', start + 2); if (end < 0) break; this.position = end + 2; continue; }
      if (this.source.startsWith('</', start)) { const end = this.source.indexOf('>', start + 2); if (end < 0) break; this.position = end + 1; continue; }
      if (this.source.startsWith('<!', start)) throw new Error('工作簿XML声明不受支持');
      let end = start + 1; let quote = '';
      while (end < this.source.length) {
        const character = this.source[end];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '>') break;
        end++;
      }
      if (end >= this.source.length) break;
      const tag = this.source.slice(start + 1, end); const name = tag.match(/^([^\s/>]+)/)?.[1];
      if (!name) throw new Error('工作簿XML标签无效');
      const attributes: Map<string, string> = new Map();
      const expression = /([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g;
      for (const match of tag.slice(name.length).matchAll(expression)) attributes.set(match[1], entities(match[3]));
      this.position = end + 1; return { name: localName(name), empty: tag.trimEnd().endsWith('/'), attributes };
    }
    throw new Error('工作簿XML结构不完整');
  }
}

export function readXml(bytes: ArrayBuffer, visitor: XmlVisitor, cancelled: () => boolean = () => false): void {
  const source = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new Uint8Array(bytes));
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('工作簿XML格式不受支持');
  const scanner = new StartTagScanner(source);
  const parser = new xml.XmlPullParser(bytes, 'UTF-8');
  const handledEmptyEnds: Set<string> = new Set();
  parser.parseXml({ supportDoctype: false, ignoreNameSpace: true, tokenValueCallbackFunction: (event: xml.EventType, info: xml.ParseInfo): boolean => {
    if (cancelled()) throw new Error('工作簿读取已取消');
    if (event === xml.EventType.START_TAG) {
      const tag = scanner.next(); const name = localName(info.getName());
      if (tag.name !== name) throw new Error('工作簿XML标签顺序不一致');
      const key = `${info.getDepth()}:${name}`; handledEmptyEnds.delete(key); visitor.start(name, tag.attributes);
      if (tag.empty) { visitor.end(name); handledEmptyEnds.add(key); }
    } else if (event === xml.EventType.END_TAG) {
      const name = localName(info.getName()); const key = `${info.getDepth()}:${name}`;
      if (handledEmptyEnds.has(key)) handledEmptyEnds.delete(key); else visitor.end(name);
    }
    else if (event === xml.EventType.TEXT || event === xml.EventType.CDSECT || event === xml.EventType.ENTITY_REFERENCE || event === xml.EventType.WHITESPACE) visitor.text(info.getText());
    return true;
  } });
}
