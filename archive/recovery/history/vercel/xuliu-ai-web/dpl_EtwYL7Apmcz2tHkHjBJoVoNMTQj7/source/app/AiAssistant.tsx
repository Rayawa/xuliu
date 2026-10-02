"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { aiWorkspaceProposalInputSchema, type AiWorkspaceProposalInput } from "@/lib/ai-action-schema";
import { cancelToolApprovalLocally, hasUnresolvedToolApproval, shouldAutoRejectProposalPreview } from "@/lib/ai-chat-state";

type AiAssistantProps = {
  accountName: string;
  activeWorkspaceOwner: string;
  activeWorkspaceName: string;
  disabledReason?: string;
  onApplied: () => Promise<void>;
};

type AnyToolPart = ToolUIPart | DynamicToolUIPart;
type ToolOutput = {
  status?: string;
  message?: string;
  proposalId?: string;
  confirmationToken?: string;
  risk?: "destructive" | "bulk";
  expiresAt?: string;
};

type ProposalPreviewItem = {
  index: number;
  description: string;
};

type ProposalPreviewState = {
  key: string;
  status: "idle" | "loading" | "ready" | "error";
  operations: ProposalPreviewItem[];
  error: string;
};

type DeepSeekResponseProof = {
  responseId: string;
  responseModel: string;
  systemFingerprint?: string;
  verified: boolean;
  totalTokens?: number;
};

function responseProofFrom(metadata: unknown): DeepSeekResponseProof | null {
  if (!metadata || typeof metadata !== "object" || !("deepSeekResponse" in metadata)) return null;
  const value = (metadata as { deepSeekResponse?: unknown }).deepSeekResponse;
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  if (fields.provider !== "deepseek" || fields.origin !== "https://api.deepseek.com") return null;
  if (typeof fields.responseId !== "string" || !fields.responseId || fields.responseId.length > 240) return null;
  if (typeof fields.responseModel !== "string" || !fields.responseModel || fields.responseModel.length > 128) return null;
  if (typeof fields.verified !== "boolean") return null;
  return {
    responseId: fields.responseId,
    responseModel: fields.responseModel,
    systemFingerprint: typeof fields.systemFingerprint === "string" && fields.systemFingerprint.length <= 240 ? fields.systemFingerprint : undefined,
    verified: fields.verified,
    totalTokens: typeof fields.totalTokens === "number" && Number.isSafeInteger(fields.totalTokens) && fields.totalTokens >= 0 ? fields.totalTokens : undefined,
  };
}

function shortProofValue(value: string) {
  return value.length <= 20 ? value : `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function ProviderProof({ proof }: { proof: DeepSeekResponseProof }) {
  return <div className={`aiProviderProof ${proof.verified ? "verified" : "unverified"}`}>
    <strong>{proof.verified ? "DeepSeek 官方响应" : "返回模型未通过核验"} · {proof.responseModel}{proof.totalTokens !== undefined ? ` · ${proof.totalTokens} tokens` : ""}</strong>
    <span>响应 ID：{shortProofValue(proof.responseId)}{proof.systemFingerprint ? ` · Fingerprint：${shortProofValue(proof.systemFingerprint)}` : ""}</span>
  </div>;
}

function asOutput(value: unknown): ToolOutput {
  return value && typeof value === "object" ? value as ToolOutput : {};
}

function proposalInput(part: AnyToolPart) {
  if (!("input" in part)) return null;
  const parsed = aiWorkspaceProposalInputSchema.safeParse(part.input);
  return parsed.success ? parsed.data : null;
}

function ProposalCard({ part, onApproval, onApplied, isLatest, writeDisabledReason }: {
  part: AnyToolPart;
  onApproval: (id: string, approved: boolean, reason?: string) => void;
  onApplied: () => Promise<void>;
  isLatest: boolean;
  writeDisabledReason?: string;
}) {
  const input = proposalInput(part);
  const output = part.state === "output-available" ? asOutput(part.output) : {};
  const refreshed = useRef(false);
  const [secondStatus, setSecondStatus] = useState<"idle" | "running" | "done" | "error" | "cancelled" | "uncertain">("idle");
  const [secondError, setSecondError] = useState("");
  const [preview, setPreview] = useState<ProposalPreviewState>({ key: "", status: "idle", operations: [], error: "" });
  const serializedProposal = input ? JSON.stringify(input) : "";
  const previewStage = part.state === "approval-requested"
    ? "first"
    : part.state === "output-available" && output.status === "second_confirmation_required"
      ? "second"
      : "";
  const previewKey = previewStage ? `${previewStage}:${serializedProposal}` : "";
  const previewReady = Boolean(previewKey) && preview.key === previewKey && preview.status === "ready";
  const previewLoading = Boolean(previewKey && input) && (preview.key !== previewKey || preview.status === "loading" || preview.status === "idle");
  const previewError = !input && previewStage
    ? "提案格式不完整，不能确认。请取消后让 AI 重新生成。"
    : preview.key === previewKey && preview.status === "error"
      ? preview.error
      : "";
  const canApprove = isLatest && !writeDisabledReason;

  useEffect(() => {
    if (!previewKey) return;
    if (!input) {
      setPreview({ key: previewKey, status: "error", operations: [], error: "提案格式不完整，不能确认。" });
      return;
    }
    const controller = new AbortController();
    setPreview({ key: previewKey, status: "loading", operations: [], error: "" });
    void fetch("/api/ai/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposal: input }),
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (shouldAutoRejectProposalPreview(response.status, previewStage)) {
        const message = result.error || (response.status === 409
          ? "云端数据已经变化，原提案已自动作废，请重新生成"
          : "提案字段未通过校验，原提案已自动取消，请重新生成");
        if (part.state === "approval-requested") onApproval(part.approval.id, false, message);
        return;
      }
      if (!response.ok) throw new Error(result.error || "无法核对提案");
      const operations = Array.isArray(result.operations) ? result.operations as ProposalPreviewItem[] : [];
      const complete = result.baseRevision === input.baseRevision
        && operations.length === input.operations.length
        && operations.every((item, index) => item?.index === index && typeof item.description === "string" && item.description.length > 0 && item.description.length <= 4_000);
      if (!complete) throw new Error("服务端返回的提案预览不完整");
      setPreview({ key: previewKey, status: "ready", operations, error: "" });
    }).catch((reason) => {
      if (controller.signal.aborted) return;
      setPreview({
        key: previewKey,
        status: "error",
        operations: [],
        error: `${reason instanceof Error ? reason.message : "无法核对提案"}。请先取消此提案，再重新描述。`,
      });
    });
    return () => controller.abort();
  }, [previewKey]);

  useEffect(() => {
    if (output.status !== "applied" || refreshed.current) return;
    refreshed.current = true;
    void onApplied();
  }, [onApplied, output.status]);

  const secondConfirm = async () => {
    if (!previewReady || !output.proposalId || !output.confirmationToken || !canApprove) return;
    setSecondStatus("running");
    setSecondError("");
    let responseStatus: number | null = null;
    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: output.proposalId, confirmationToken: output.confirmationToken }),
      });
      responseStatus = response.status;
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "执行失败");
      if (result.status !== "applied") throw new Error("服务器没有返回明确的执行结果");
      setSecondStatus("done");
      try {
        await onApplied();
      } catch {
        setSecondError("修改已经执行，但页面暂时没有刷新成功，请刷新页面核对云端数据。");
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "执行失败";
      if (responseStatus !== null && responseStatus >= 400 && responseStatus < 500) {
        setSecondStatus("error");
        setSecondError(message);
      } else {
        setSecondStatus("uncertain");
        setSecondError(`${message}。暂时无法确认请求结果；请使用下方按钮安全重试并核对，系统不会重复执行同一提案。`);
        void onApplied().catch(() => undefined);
      }
    }
  };

  if (part.state === "input-streaming" || part.state === "input-available") {
    return <div className="aiToolStatus"><span />正在整理变更提案…</div>;
  }
  if (part.state === "approval-requested") {
    return <section className="aiProposalCard">
      <div className="aiProposalHead"><span>等待确认</span><strong>{input?.summary ?? "请核对下面的修改"}</strong></div>
      {previewReady && <div className="aiProposalList">{preview.operations.map((operation) => <div key={operation.index}><i>{operation.index + 1}</i><span>{operation.description}</span></div>)}</div>}
      {previewLoading && <div className="aiToolStatus"><span className="working" />正在从你自己的云端空间核对目标与变更前后值…</div>}
      {previewError && <div className="aiToolError">{previewError}</div>}
      <p>目标：你自己的空间 · 确认前不会修改任何数据</p>
      {!part.approval.isAutomatic && <div className="aiProposalActions">
        <button className="softButton" onClick={() => onApproval(part.approval.id, false)}>取消此提案</button>
        <button className="primaryButton" disabled={!previewReady || !canApprove} onClick={() => onApproval(part.approval.id, true)}>{!isLatest ? "提案已被后续消息取代" : writeDisabledReason ? "等待页面同步" : previewLoading ? "正在核对…" : previewReady ? "确认这些修改" : "无法确认"}</button>
      </div>}
    </section>;
  }
  if (part.state === "approval-responded") {
    return <div className="aiToolStatus"><span className={part.approval.approved ? "working" : "denied"} />{part.approval.approved ? "已确认，正在安全执行…" : "已取消，数据没有变化"}</div>;
  }
  if (part.state === "output-denied") {
    const reason = part.approval.reason && part.approval.reason !== "用户已取消" ? part.approval.reason.slice(0, 300) : "已取消，数据没有变化";
    return <div className="aiToolStatus"><span className="denied" />{reason}</div>;
  }
  if (part.state === "output-error") return <div className="aiToolError">{part.errorText || "执行失败，数据没有变化"}</div>;
  if (part.state === "output-available") {
    if (output.status === "conflict") return <div className="aiToolError">云端数据已经在其他设备更新，请让 AI 重新生成提案。</div>;
    if (output.status === "second_confirmation_required") {
      return <section className="aiProposalCard danger">
        <div className="aiProposalHead"><span>再次确认</span><strong>{output.risk === "bulk" ? "这是批量修改" : "其中包含删除操作"}</strong></div>
        {previewReady && <div className="aiProposalList">{preview.operations.map((operation) => <div key={operation.index}><i>{operation.index + 1}</i><span>{operation.description}</span></div>)}</div>}
        {previewLoading && <div className="aiToolStatus"><span className="working" />正在再次核对云端版本与具体变更…</div>}
        {previewError && <div className="aiToolError">{previewError}</div>}
        <p>第一次确认没有写入数据。再次确认后才会执行。</p>
        {secondError && <div className="aiToolError">{secondError}</div>}
        <div className="aiProposalActions">
          {secondStatus === "done" ? <strong className="aiApplied">已执行并同步</strong> : secondStatus === "cancelled" ? <strong>已取消，数据没有变化</strong> : secondStatus === "uncertain" ? <><strong>执行结果待核对</strong><button className="dangerButton" disabled={!canApprove} onClick={secondConfirm}>安全重试并核对</button></> : <><button className="softButton" disabled={secondStatus === "running"} onClick={() => setSecondStatus("cancelled")}>取消</button><button className="dangerButton" disabled={secondStatus === "running" || !previewReady || !canApprove} onClick={secondConfirm}>{!isLatest ? "提案已被后续消息取代" : writeDisabledReason ? "等待页面同步" : secondStatus === "running" ? "正在执行…" : previewLoading ? "正在核对…" : previewReady ? "再次确认并执行" : "无法确认"}</button></>}
        </div>
      </section>;
    }
    return <div className="aiToolStatus success"><span />修改已完成，并已同步到你的空间</div>;
  }
  return null;
}

function ToolPartView({ part, onApproval, onApplied, isLatest, writeDisabledReason }: {
  part: AnyToolPart;
  onApproval: (id: string, approved: boolean, reason?: string) => void;
  onApplied: () => Promise<void>;
  isLatest: boolean;
  writeDisabledReason?: string;
}) {
  const name = getToolName(part);
  if (name === "applyWorkspaceChanges") return <ProposalCard part={part} onApproval={onApproval} onApplied={onApplied} isLatest={isLatest} writeDisabledReason={writeDisabledReason} />;
  if (part.state === "output-error") return <div className="aiToolError">读取数据时遇到问题：{part.errorText}</div>;
  if (part.state === "output-available") return <div className="aiToolStatus"><span />已查阅相关空间数据</div>;
  return <div className="aiToolStatus"><span className="working" />正在查阅相关空间数据…</div>;
}

export default function AiAssistant({ accountName, activeWorkspaceOwner, activeWorkspaceName, disabledReason, onApplied }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/ai/chat",
    body: { activeWorkspaceOwner },
  }), [activeWorkspaceOwner]);
  const { messages, sendMessage, status, error, addToolApprovalResponse, clearError, setMessages, stop } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const hasPendingApproval = hasUnresolvedToolApproval(messages);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, open, status]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || hasPendingApproval || disabledReason) return;
    void sendMessage({ text });
    setInput("");
  };

  const quickPrompt = (text: string) => {
    if (busy || hasPendingApproval || disabledReason) return;
    setOpen(true);
    void sendMessage({ text });
  };

  const respondToApproval = (messageId: string, id: string, approved: boolean, reason?: string) => {
    if (!approved) {
      clearError();
      setMessages((current) => cancelToolApprovalLocally(current, messageId, id, reason));
      return;
    }
    if (messages.at(-1)?.id !== messageId) return;
    void addToolApprovalResponse({ id, approved: true });
  };

  return <>
    <button className={`aiLauncher ${open ? "open" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}><span>AI</span><b>{open ? "×" : "问序流"}</b></button>
    {open && <aside className="aiDrawer" aria-label="序流 AI 助手">
      <header><div><span className="aiAvatar">序</span><div><strong>序流 AI</strong><small>DeepSeek · 读取授权数据 · 写入前确认</small></div></div><button aria-label="关闭" onClick={() => setOpen(false)}>×</button></header>
      <div className="aiScope"><span>当前界面</span><strong>{activeWorkspaceName}</strong><small>AI 写入始终只进入 {accountName}</small></div>
      <div className="aiMessages">
        {!messages.length && <div className="aiWelcome"><span>你好，我可以帮你把自然语言变成清晰行动。</span><p>查询会直接回答；新增或修改会先给你确认卡，删除与批量操作会再确认一次。</p><div className="aiQuickPrompts"><button onClick={() => quickPrompt("总结我今天未完成的任务，并建议优先顺序")}>整理今日任务</button><button onClick={() => quickPrompt("帮我查看本月支出分类和预算进度")}>查看本月收支</button><button onClick={() => quickPrompt("我要规划下周的学习任务，请先问我需要的信息")}>规划下周学习</button></div></div>}
        {messages.map((message) => {
          const providerProof = message.role === "assistant" ? responseProofFrom(message.metadata) : null;
          return <article className={`aiMessage ${message.role}`} key={message.id}>
            <span>{message.role === "user" ? "我" : "序"}</span>
            <div>{message.parts.map((part, index) => {
              if (part.type === "text") return <p key={index}>{part.text}</p>;
              if (isToolUIPart(part)) return <ToolPartView key={index} part={part} onApproval={(id, approved, reason) => respondToApproval(message.id, id, approved, reason)} onApplied={onApplied} isLatest={messages.at(-1)?.id === message.id} writeDisabledReason={disabledReason} />;
              return null;
            })}{providerProof && <ProviderProof proof={providerProof} />}</div>
          </article>;
        })}
        {busy && <div className="aiThinking"><i /><i /><i />{status === "submitted" ? "正在理解…" : "正在回答…"}</div>}
        {error && <div className="aiChatError">{error.message || "AI 暂时不可用，数据没有变化。"}</div>}
        {hasPendingApproval && !busy && <div className="aiDisabled"><strong>请先处理上方提案</strong><span>确认或取消后才能继续对话；也可以清空对话重新开始。</span></div>}
        {disabledReason && <div className="aiDisabled"><strong>AI 尚未启用</strong><span>{disabledReason}</span></div>}
        <div ref={endRef} />
      </div>
      <form className="aiComposer" onSubmit={submit}>
        <textarea value={input} maxLength={4_000} disabled={Boolean(disabledReason) || hasPendingApproval} placeholder={hasPendingApproval ? "请先确认或取消上方提案" : "例如：下周一上午 9 点创建一项课程复习任务…"} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div><button type="button" className="aiClear" onClick={() => { if (busy) void stop(); clearError(); setInput(""); setMessages([]); }}>清空对话</button><span>{input.length}/4000</span><button className="aiSend" disabled={!input.trim() || busy || hasPendingApproval || Boolean(disabledReason)}>{busy ? "…" : "发送"}</button></div>
      </form>
    </aside>}
  </>;
}
