import { util } from '@kit.ArkTS';
import { AiStreamEvent } from '../../models/AiModels';
import { MAX_AI_STREAM_BYTES } from '../../config/constants';

export class EventStream {
  private decoder: util.TextDecoder = util.TextDecoder.create('utf-8', { fatal: true });
  private buffer: string = '';
  private bytes: number = 0;
  private ended: boolean = false;
  private receive: (event: AiStreamEvent) => void;
  constructor(receive: (event: AiStreamEvent) => void) { this.receive = receive; }

  push(chunk: ArrayBuffer): void {
    this.bytes += chunk.byteLength;
    if (this.bytes > MAX_AI_STREAM_BYTES) throw new Error('AI响应过长，请新建对话并缩小问题范围');
    this.buffer += this.decoder.decodeToString(new Uint8Array(chunk), { stream: true }); this.frames();
  }
  finish(): void {
    this.buffer += this.decoder.decodeToString(new Uint8Array(0), { stream: false }); this.frames();
    if (this.buffer.trim()) this.frame(this.buffer);
    this.buffer = '';
    if (!this.ended) throw new Error('AI响应中断，未收到完整结束标记');
  }
  private frames(): void {
    let match = this.buffer.match(/\r?\n\r?\n/);
    while (match && match.index !== undefined) {
      this.frame(this.buffer.slice(0, match.index)); this.buffer = this.buffer.slice(match.index + match[0].length);
      match = this.buffer.match(/\r?\n\r?\n/);
    }
  }
  private frame(frame: string): void {
    const lines = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'));
    if (!lines.length) return;
    const data = lines.map((line) => line.slice(5).trimStart()).join('\n');
    if (data === '[DONE]') { this.ended = true; return; }
    if (this.ended) return;
    let event: AiStreamEvent;
    try { event = JSON.parse(data) as AiStreamEvent; } catch (_) { throw new Error('AI响应格式无效，请重新发起对话'); }
    if (!event || typeof event.type !== 'string') throw new Error('AI响应格式无效');
    this.receive(event);
  }
}
