import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { CloudApi, CloudApiError } from '../api/CloudApi';
import { currentCloudAccount, sessionCookie, sessionEpoch, clearCloudSession, onSessionInvalidated } from '../../state/cloudSession';
import { CLOUD_ORIGIN, AI_TIMEOUT_MS, MAX_AI_REQUEST_BYTES, MAX_AI_MESSAGES, MAX_AI_TEXT_CHARS } from '../../config/constants';
import { AiMessage, AiPart, AiChatBody, AiPreviewBody, AiPreviewResponse, AiExecuteBody, AiStreamEvent, AiProposalView,
  AiMessageView, AiConversationView, AiPreviewState, AiToolOutput, AiProof } from '../../models/AiModels';
import { Conversation, toolName, proposalInput, toolOutput } from '../../domain/ai/Conversation';
import { EventStream } from './EventStream';
import { uid } from '../../domain/workspace/WorkspaceDomain';

export class AiChatService {
  private conversation: Conversation = new Conversation();
  private api: CloudApi = new CloudApi();
  private previews: Map<string, AiPreviewState> = new Map();
  private owner: string = '';
  private courseId: string = '';
  private chatId: string = uid();
  private busy: boolean = false;
  private error: string = '';
  private uncertain: boolean = false;
  private disposed: boolean = false;
  private generation: number = 0;
  private request: http.HttpRequest | undefined;
  private finishStream: (() => void) | undefined;
  private emitTimer: number = -1;
  private expiryTimer: number = -1;
  private version: number = 0;
  private signatures: Map<string, string> = new Map();
  private versions: Map<string, number> = new Map();
  private stopSessionListener: () => void;
  private update: (view: AiConversationView) => void;
  private canWrite: () => boolean;
  private applied: () => Promise<void>;
  private beforeWrite: () => Promise<void>;

  constructor(update: (view: AiConversationView) => void, canWrite: () => boolean, applied: () => Promise<void>, beforeWrite: () => Promise<void>) {
    this.update = update; this.canWrite = canWrite; this.applied = applied; this.beforeWrite = beforeWrite;
    this.stopSessionListener = onSessionInvalidated(() => this.reset('', ''));
  }

  reset(owner: string, courseId: string): void {
    this.stop(); this.owner = owner; this.courseId = courseId; this.chatId = uid(); this.conversation = new Conversation();
    this.previews.clear(); this.signatures.clear(); this.versions.clear(); this.error = ''; this.uncertain = false; this.notify(true);
  }

  private key(messageId: string, toolCallId: string): string { return `${messageId}:${toolCallId}`; }
  private stage(part: AiPart): string {
    if (part.state === 'approval-requested') return 'first';
    return part.state === 'output-available' && toolOutput(part).status === 'second_confirmation_required' ? 'second' : '';
  }

  private previewState(messageId: string, part: AiPart): AiPreviewState {
    const key = this.key(messageId, part.toolCallId ?? ''); const fingerprint = `${this.stage(part)}:${JSON.stringify(part.input)}`;
    let state = this.previews.get(key);
    if (!state || state.fingerprint !== fingerprint) {
      state = { fingerprint, status: 'idle', operations: [], error: '', cancelled: false, execution: 'idle' }; this.previews.set(key, state);
    }
    return state;
  }

  private proof(message: AiMessage): AiProof | undefined {
    const proof = message.metadata?.deepSeekResponse;
    if (!proof || proof.provider !== 'deepseek' || proof.origin !== 'https://api.deepseek.com' || typeof proof.responseModel !== 'string') return undefined;
    const result = JSON.parse(JSON.stringify(proof)) as AiProof;
    result.verified = proof.verified === true && proof.responseModel === proof.configuredModel && proof.configuredModel === 'deepseek-v4-flash' && !!proof.responseId;
    return result;
  }

  private toolView(message: AiMessage, part: AiPart): AiProposalView {
    const stage = this.stage(part); const preview = this.previewState(message.id, part); const output = toolOutput(part);
    const input = proposalInput(part); const latest = this.conversation.latest(message.id);
    const expired = output.expiresAt ? new Date(output.expiresAt).getTime() <= Date.now() : false;
    const canConfirm = !!stage && latest && this.canWrite() && !this.busy && (preview.status === 'ready' || (stage === 'second' && preview.execution === 'uncertain')) && !preview.cancelled &&
      !['running', 'done', 'error'].includes(preview.execution) && !expired &&
      (stage === 'second' || (!!part.approval?.id && !!part.approval?.signature && !part.approval?.isAutomatic));
    return { messageId: message.id, toolCallId: part.toolCallId ?? '', name: toolName(part), state: part.state ?? '',
      summary: input?.summary ?? part.title ?? '', stage, status: preview.execution === 'done' ? 'applied' : preview.execution === 'uncertain' ? 'uncertain' : output.status ?? '',
      message: preview.cancelled ? '已取消此提案' : part.errorText || part.approval?.reason || output.message || '', risk: output.risk ?? '',
      expiresAt: output.expiresAt ?? '', previewStatus: preview.status, operations: preview.operations,
      previewError: expired ? '提案已过期，请重新生成' : preview.error, latest, canConfirm, automatic: part.approval?.isAutomatic ?? false };
  }

  private notify(immediate: boolean = false): void {
    if (this.disposed) return;
    if (!immediate) { if (this.emitTimer < 0) this.emitTimer = setTimeout(() => this.notify(true), 60); return; }
    if (this.emitTimer >= 0) clearTimeout(this.emitTimer); this.emitTimer = -1;
    this.version++;
    const messages: AiMessageView[] = this.conversation.messages.map((message): AiMessageView => {
      const view: AiMessageView = {
        id: message.id, role: message.role, text: message.parts.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n'),
        reasoning: message.parts.filter((part) => part.type === 'reasoning').map((part) => part.text ?? '').join('\n'), proof: this.proof(message),
        tools: message.parts.filter((part) => !!toolName(part)).map((part) => this.toolView(message, part)), version: 0
      };
      const signature = JSON.stringify(view);
      if (this.signatures.get(message.id) !== signature) { this.signatures.set(message.id, signature); this.versions.set(message.id, this.version); }
      view.version = this.versions.get(message.id) ?? this.version;
      return view;
    });
    this.update({ messages, busy: this.busy, pending: this.conversation.hasPending(), error: this.error, uncertain: this.uncertain });
  }

  private requestBody(): string {
    const messages = this.conversation.messages;
    if (messages.length > MAX_AI_MESSAGES || messages.reduce((sum, message) => sum + message.parts.reduce((length, part) => length + (part.text?.length ?? 0), 0), 0) > MAX_AI_TEXT_CHARS) {
      throw new Error('对话过长，请新建一段对话');
    }
    const body: AiChatBody = { id: this.chatId, messages, trigger: 'submit-message', activeWorkspaceOwner: this.owner,
      activeCourseId: this.courseId || undefined };
    const raw = JSON.stringify(body);
    if (new util.TextEncoder().encodeInto(raw).byteLength > MAX_AI_REQUEST_BYTES) throw new Error('对话记录或工具结果过长，请新建一段对话');
    return raw;
  }

  async send(text: string): Promise<void> {
    if (this.busy || this.conversation.hasPending()) throw new Error('请先确认或取消待处理的提案');
    if (!text.trim()) return;
    if (!currentCloudAccount() || !this.owner) throw new Error('请先登录并读取当前空间');
    this.conversation.addUser(text.trim()); await this.run();
  }

  private destroyRequest(): void { try { this.request?.destroy(); } catch (_) {} this.request = undefined; }

  private async run(): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true; this.error = ''; const generation = ++this.generation; const epoch = sessionEpoch();
    let failure: Error | undefined; let finished: () => void = () => {}; let applied = false; let received = false;
    const end = new Promise<void>((resolve) => { finished = resolve; }); this.finishStream = finished;
    const stream = new EventStream((event: AiStreamEvent) => {
      received = true; this.conversation.event(event);
      if (event.type === 'tool-output-available' && (event.output as AiToolOutput)?.status === 'applied') applied = true;
      this.notify();
    });
    let rawError = ''; const errorDecoder = util.TextDecoder.create('utf-8');
    const request = http.createHttp(); this.request = request;
    request.on('dataReceive', (chunk: ArrayBuffer) => {
      if (failure || generation !== this.generation || epoch !== sessionEpoch()) return;
      try {
        if (!received && !rawError && new Uint8Array(chunk)[0] === 123) rawError = errorDecoder.decodeToString(new Uint8Array(chunk), { stream: true });
        else if (rawError) rawError += errorDecoder.decodeToString(new Uint8Array(chunk), { stream: true });
        else stream.push(chunk);
        if (rawError.length > 16000) throw new Error('AI服务返回了无效响应');
      } catch (error) { failure = error as Error; try { request.destroy(); } catch (_) {} finished(); }
    });
    request.on('dataEnd', () => finished());
    try {
      const body = this.requestBody(); this.conversation.begin(); this.notify(true);
      const code = await request.requestInStream(`${CLOUD_ORIGIN}/api/ai/chat`, { method: http.RequestMethod.POST,
        header: { 'Content-Type': 'application/json', 'Cookie': sessionCookie(), 'Origin': CLOUD_ORIGIN, 'Accept': 'text/event-stream' },
        extraData: body, connectTimeout: AI_TIMEOUT_MS, readTimeout: AI_TIMEOUT_MS, usingCache: false, maxRedirects: 0 });
      await end;
      if (generation !== this.generation || epoch !== sessionEpoch()) throw new Error('AI请求已取消或账号已变化');
      if (code === 401) clearCloudSession();
      if (code !== 200) {
        let message = `AI请求失败（${code}）`;
        try { message = (JSON.parse(rawError) as AiToolOutput).message ?? (JSON.parse(rawError) as AiApiError).error ?? message; } catch (_) {}
        throw new CloudApiError(code, message);
      }
      if (failure) throw failure;
      stream.finish();
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.error = (failure ?? (error as Error)).message;
        if (this.conversation.hasApproved()) { this.uncertain = true; this.error += '。此前已确认的修改可能已执行，请先核对云端结果'; }
      }
    } finally {
      if (this.finishStream === finished) this.finishStream = undefined;
      if (this.request === request) this.request = undefined;
      try { request.destroy(); } catch (_) {}
    }
    if (generation !== this.generation || this.disposed) return;
    if (applied) {
      try { await this.applied(); } catch (error) { this.error = `云端修改已执行，但读取或同步结果失败：${(error as Error).message}`; }
    }
    await this.preparePreviews();
    if (!this.disposed && generation === this.generation) { this.busy = false; this.notify(true); }
  }

  private async preparePreviews(): Promise<void> {
    const generation = this.generation;
    for (const message of this.conversation.messages) for (const part of message.parts) {
      if (this.disposed || generation !== this.generation) return;
      if (toolName(part) === 'applyWorkspaceChanges' && this.stage(part) && this.conversation.latest(message.id)) await this.preview(message.id, part.toolCallId ?? '');
    }
    if (generation === this.generation) this.scheduleExpiry();
  }

  async preview(messageId: string, toolCallId: string, force: boolean = false): Promise<boolean> {
    const part = this.conversation.part(messageId, toolCallId); if (!part || !this.stage(part)) return false;
    const state = this.previewState(messageId, part);
    if (!this.canWrite()) { state.error = '当前空间只读，不能确认修改'; state.status = 'error'; this.notify(true); return false; }
    if (!force && state.status === 'ready') return true;
    if (state.status === 'loading') return false;
    const input = proposalInput(part); if (!input) { state.status = 'error'; state.error = '提案格式不完整，请取消后重新生成'; this.notify(true); return false; }
    const fingerprint = state.fingerprint; const generation = this.generation;
    state.status = 'loading'; state.error = ''; this.notify(true);
    try {
      const body: AiPreviewBody = { proposal: input };
      const result = JSON.parse(await this.api.request('/api/ai/preview', http.RequestMethod.POST, JSON.stringify(body))) as AiPreviewResponse;
      if (this.disposed || generation !== this.generation || this.previewState(messageId, part).fingerprint !== fingerprint) return false;
      if (result.baseRevision !== input.baseRevision || !Array.isArray(result.operations) || result.operations.length !== input.operations.length ||
        result.operations.some((operation, index) => operation.index !== index || typeof operation.description !== 'string' || !operation.description || operation.description.length > 4000)) {
        throw new Error('服务端返回的修改预览不完整');
      }
      state.operations = result.operations; state.status = 'ready'; this.notify(true); return true;
    } catch (error) {
      if (this.disposed || generation !== this.generation) return false;
      state.status = 'error'; state.error = (error as Error).message;
      if (this.stage(part) === 'first' && [400, 409, 422].includes((error as CloudApiError).status)) {
        this.conversation.respond(messageId, toolCallId, false, state.error);
        this.notify(true);
        if (!this.busy && !this.uncertain && this.conversation.canResume()) await this.run();
      }
      this.notify(true); return false;
    }
  }

  async respond(messageId: string, toolCallId: string, approved: boolean): Promise<void> {
    if (this.busy || this.disposed) return;
    const generation = this.generation;
    const part = this.conversation.part(messageId, toolCallId);
    if (approved && (!part?.approval?.id || !part.approval.signature || part.approval.isAutomatic)) return;
    if (approved && (!this.canWrite() || !await this.preview(messageId, toolCallId, true))) return;
    if (approved) await this.beforeWrite();
    if (this.disposed || generation !== this.generation || (approved && !this.canWrite())) return;
    this.conversation.respond(messageId, toolCallId, approved, approved ? '' : '用户已取消'); this.notify(true);
    if (this.conversation.canResume()) await this.run();
  }

  cancelSecond(messageId: string, toolCallId: string): void {
    const part = this.conversation.part(messageId, toolCallId); if (!part) return;
    const state = this.previewState(messageId, part); if (state.execution === 'running' || state.execution === 'uncertain') return;
    state.cancelled = true; this.notify(true);
  }

  async executeSecond(messageId: string, toolCallId: string): Promise<void> {
    if (this.busy || !this.canWrite() || !this.conversation.latest(messageId)) return;
    const part = this.conversation.part(messageId, toolCallId); if (!part || this.stage(part) !== 'second') return;
    const generation = this.generation;
    const output = toolOutput(part); const state = this.previewState(messageId, part);
    const wasUncertain = state.execution === 'uncertain';
    if (state.cancelled || state.execution === 'done' || state.execution === 'running' || !output.proposalId || !output.confirmationToken) return;
    if (output.expiresAt && new Date(output.expiresAt).getTime() <= Date.now()) { state.error = '提案已过期，请重新生成'; this.notify(true); return; }
    if (state.execution !== 'uncertain' && !await this.preview(messageId, toolCallId, true)) return;
    if (state.cancelled || !this.canWrite() || !this.conversation.latest(messageId) || this.disposed) return;
    await this.beforeWrite();
    if (state.cancelled || this.disposed || generation !== this.generation || !this.canWrite()) return;
    const body: AiExecuteBody = { proposalId: output.proposalId, confirmationToken: output.confirmationToken };
    state.execution = 'running'; state.error = ''; this.busy = true; this.notify(true);
    try {
      const result = JSON.parse(await this.api.request('/api/ai/execute', http.RequestMethod.POST, JSON.stringify(body))) as AiToolOutput;
      if (this.disposed || generation !== this.generation) return;
      if (result.status !== 'applied') throw new Error('服务端没有返回明确的执行结果');
      state.execution = 'done'; if (!this.disposed) await this.applied();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      const status = (error as CloudApiError).status;
      if (state.execution === 'done') state.error = `修改已执行，读取结果失败：${(error as Error).message}`;
      else if (!wasUncertain && status >= 400 && status < 500) { state.execution = 'error'; state.error = (error as Error).message; }
      else { state.execution = 'uncertain'; state.error = `${(error as Error).message}。结果待核对，可安全重试同一提案，不会生成新修改`; this.uncertain = true; }
    } finally { if (!this.disposed && generation === this.generation) { this.busy = false; this.notify(true); } }
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer >= 0) clearTimeout(this.expiryTimer); this.expiryTimer = -1;
    const dates = this.conversation.messages.flatMap((message) => message.parts.map((part) => toolOutput(part).expiresAt)).filter((value) => !!value)
      .map((value) => new Date(value as string).getTime()).filter((date) => date > Date.now());
    if (dates.length) this.expiryTimer = setTimeout(() => { this.expiryTimer = -1; this.notify(true); }, Math.max(1, Math.min(...dates) - Date.now() + 50));
  }

  stop(): void {
    const approved = this.conversation.hasApproved(); this.generation++; this.api.cancel(); this.destroyRequest(); this.finishStream?.(); this.finishStream = undefined;
    this.busy = false;
    if (this.emitTimer >= 0) clearTimeout(this.emitTimer); this.emitTimer = -1;
    if (this.expiryTimer >= 0) clearTimeout(this.expiryTimer); this.expiryTimer = -1;
    if (approved) { this.uncertain = true; this.error = '已停止生成；此前确认过的修改请核对云端状态'; }
    this.notify(true);
  }
  dispose(): void { this.stop(); this.disposed = true; this.stopSessionListener(); this.api.dispose(); }
}
interface AiApiError { error?: string; }
