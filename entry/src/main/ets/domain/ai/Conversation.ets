import { AiMessage, AiPart, AiStreamEvent, AiProposalInput, AiToolOutput, AiMetadata } from '../../models/AiModels';
import { uid } from '../workspace/WorkspaceDomain';

export class Conversation {
  messages: AiMessage[] = [];
  private active: AiMessage | undefined;
  private textParts: Map<string, AiPart> = new Map();
  private stepStart: number = 0;

  addUser(text: string): void {
    this.messages.push({ id: uid(), role: 'user', parts: [{ type: 'text', text }] });
  }
  begin(): void {
    const previous = this.messages[this.messages.length - 1];
    this.active = previous?.role === 'assistant' ? previous : { id: uid(), role: 'assistant', parts: [] };
    this.textParts.clear(); this.stepStart = this.active.parts.length;
  }
  private message(): AiMessage {
    if (!this.active) this.begin();
    const active = this.active as AiMessage;
    if (!this.messages.includes(active)) this.messages.push(active);
    return active;
  }
  part(messageId: string, toolCallId: string): AiPart | undefined {
    return this.messages.find((message) => message.id === messageId)?.parts.find((part) => part.toolCallId === toolCallId);
  }
  private tool(event: AiStreamEvent): AiPart {
    for (const message of this.messages) {
      const part = message.parts.find((item) => item.toolCallId === event.toolCallId); if (part) return part;
    }
    if (!event.toolCallId || !event.toolName) throw new Error('AI工具响应不完整');
    const part: AiPart = { type: event.dynamic ? 'dynamic-tool' : `tool-${event.toolName}`, toolCallId: event.toolCallId,
      toolName: event.dynamic ? event.toolName : undefined, state: 'input-streaming' };
    this.message().parts.push(part); return part;
  }
  event(event: AiStreamEvent): void {
    const message = this.message();
    if (event.type === 'start') {
      if (event.messageId) message.id = event.messageId;
      if (event.messageMetadata) message.metadata = event.messageMetadata;
    } else if (event.type === 'message-metadata' || event.type === 'finish') {
      if (event.messageMetadata) message.metadata = event.messageMetadata;
    } else if (event.type === 'text-start' || event.type === 'reasoning-start') {
      const part: AiPart = { type: event.type === 'text-start' ? 'text' : 'reasoning', text: '', state: 'streaming', providerMetadata: event.providerMetadata };
      message.parts.push(part); this.textParts.set(event.id ?? '', part);
    } else if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
      const part = this.textParts.get(event.id ?? ''); if (!part) throw new Error('AI文本分段不完整'); part.text = (part.text ?? '') + (event.delta ?? '');
    } else if (event.type === 'text-end' || event.type === 'reasoning-end') {
      const part = this.textParts.get(event.id ?? ''); if (part) { part.state = 'done'; if (event.providerMetadata) part.providerMetadata = event.providerMetadata; }
    } else if (event.type === 'start-step') {
      message.parts.push({ type: 'step-start' }); this.stepStart = message.parts.length;
    } else if (event.type === 'finish-step') this.textParts.clear();
    else if (event.type === 'reset-step') { message.parts.splice(this.stepStart); this.textParts.clear(); }
    else if (event.type === 'tool-input-start' || event.type === 'tool-input-available' || event.type === 'tool-input-error') {
      const part = this.tool(event); part.state = event.type === 'tool-input-start' ? 'input-streaming' : event.type === 'tool-input-error' ? 'output-error' : 'input-available';
      part.input = event.input; part.errorText = event.errorText; part.providerExecuted = event.providerExecuted;
      part.callProviderMetadata = event.providerMetadata; part.toolMetadata = event.toolMetadata; part.title = event.title; part.inputEncoding = event.inputEncoding;
    } else if (event.type === 'tool-approval-request') {
      const part = this.tool(event); part.state = 'approval-requested';
      part.approval = { id: event.approvalId ?? '', signature: event.signature, isAutomatic: event.isAutomatic };
    } else if (event.type === 'tool-approval-response') {
      const part = this.messages.flatMap((item) => item.parts).find((item) => item.approval?.id === event.approvalId);
      if (!part?.approval) throw new Error('AI确认响应没有对应提案');
      part.state = 'approval-responded'; part.approval.approved = event.approved; part.approval.reason = event.reason;
    } else if (event.type === 'tool-output-available' || event.type === 'tool-output-error' || event.type === 'tool-output-denied') {
      const part = this.tool(event); part.state = event.type === 'tool-output-available' ? 'output-available' : event.type === 'tool-output-error' ? 'output-error' : 'output-denied';
      part.output = event.output; part.errorText = event.errorText; part.resultProviderMetadata = event.providerMetadata;
      part.preliminary = event.preliminary; part.providerExecuted = event.providerExecuted;
      if (event.type === 'tool-output-denied' && part.approval) part.approval.approved = false;
    } else if (event.type === 'error') throw new Error(event.errorText || 'AI响应失败，请稍后重试');
    else if (event.type === 'abort') throw new Error('AI生成已停止');
  }
  latest(messageId: string): boolean { return this.messages[this.messages.length - 1]?.id === messageId; }
  hasPending(): boolean { return this.messages.some((message) => message.parts.some((part) => part.state === 'approval-requested' || part.state === 'approval-responded')); }
  hasApproved(): boolean { return this.messages.some((message) => message.parts.some((part) => part.state === 'approval-responded' && part.approval?.approved)); }
  respond(messageId: string, toolCallId: string, approved: boolean, reason: string = ''): void {
    const part = this.part(messageId, toolCallId);
    if (!part?.approval || part.state !== 'approval-requested' || (approved && !this.latest(messageId))) throw new Error('此提案已失效或已被后续消息取代');
    part.state = approved ? 'approval-responded' : 'output-denied'; part.approval.approved = approved;
    if (reason) part.approval.reason = reason;
  }
  canResume(): boolean {
    const message = this.messages[this.messages.length - 1];
    return message?.role === 'assistant' && message.parts.some((part) => part.state === 'approval-responded' && part.approval?.approved === true) &&
      !message.parts.some((part) => part.state === 'approval-requested');
  }
}

export function toolName(part: AiPart): string { return part.type === 'dynamic-tool' ? part.toolName ?? '' : part.type.startsWith('tool-') ? part.type.slice(5) : ''; }
export function proposalInput(part: AiPart): AiProposalInput | undefined {
  const value = part.input as AiProposalInput;
  return value && Number.isInteger(value.baseRevision) && value.baseRevision >= 0 && typeof value.summary === 'string' && Array.isArray(value.operations) ? value : undefined;
}
export function toolOutput(part: AiPart): AiToolOutput { return part.output ? part.output as AiToolOutput : {}; }
