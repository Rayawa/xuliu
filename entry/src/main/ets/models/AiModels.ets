export interface AiProof {
  provider: string;
  origin: string;
  responseId?: string;
  responseModel?: string;
  configuredModel?: string;
  verified: boolean;
  totalTokens?: number;
}
export interface AiMetadata { deepSeekResponse?: AiProof; }
export interface AiApproval { id: string; approved?: boolean; reason?: string; isAutomatic?: boolean; signature?: string; }
export interface AiPart {
  type: string;
  text?: string;
  state?: string;
  toolCallId?: string;
  toolName?: string;
  input?: Object;
  output?: Object;
  errorText?: string;
  approval?: AiApproval;
  providerExecuted?: boolean;
  providerMetadata?: Object;
  callProviderMetadata?: Object;
  resultProviderMetadata?: Object;
  toolMetadata?: Object;
  preliminary?: boolean;
  title?: string;
  inputEncoding?: string;
}
export interface AiMessage { id: string; role: string; parts: AiPart[]; metadata?: AiMetadata; }
export interface AiStreamEvent {
  type: string;
  id?: string;
  messageId?: string;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  input?: Object;
  inputTextDelta?: string;
  output?: Object;
  approvalId?: string;
  approved?: boolean;
  reason?: string;
  isAutomatic?: boolean;
  signature?: string;
  errorText?: string;
  messageMetadata?: AiMetadata;
  providerMetadata?: Object;
  toolMetadata?: Object;
  providerExecuted?: boolean;
  dynamic?: boolean;
  preliminary?: boolean;
  title?: string;
  inputEncoding?: string;
}
export interface AiProposalInput { baseRevision: number; summary: string; operations: Object[]; }
export interface AiToolOutput { status?: string; message?: string; proposalId?: string; confirmationToken?: string; risk?: string; expiresAt?: string; }
export interface AiPreviewOperation { index: number; description: string; }
export interface AiPreviewResponse { baseRevision: number; operations: AiPreviewOperation[]; }
export interface AiProposalView {
  messageId: string;
  toolCallId: string;
  name: string;
  state: string;
  summary: string;
  stage: string;
  status: string;
  message: string;
  risk: string;
  expiresAt: string;
  previewStatus: string;
  operations: AiPreviewOperation[];
  previewError: string;
  latest: boolean;
  canConfirm: boolean;
  automatic: boolean;
}
export interface AiMessageView { id: string; role: string; text: string; reasoning: string; proof?: AiProof; tools: AiProposalView[]; version: number; }
export interface AiConversationView { messages: AiMessageView[]; busy: boolean; pending: boolean; error: string; uncertain: boolean; }
export interface AiPreviewState { fingerprint: string; status: string; operations: AiPreviewOperation[]; error: string; cancelled: boolean; execution: string; }
export interface AiChatBody { id: string; messages: AiMessage[]; trigger: string; activeWorkspaceOwner: string; activeCourseId?: string; }
export interface AiPreviewBody { proposal: AiProposalInput; }
export interface AiExecuteBody { proposalId: string; confirmationToken: string; }

export function emptyAiProposal(): AiProposalView {
  return { messageId: '', toolCallId: '', name: '', state: '', summary: '', stage: '', status: '', message: '', risk: '', expiresAt: '',
    previewStatus: 'idle', operations: [], previewError: '', latest: false, canConfirm: false, automatic: false };
}
