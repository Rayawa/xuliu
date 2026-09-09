import { isToolUIPart, type UIMessage } from "ai";

export function hasUnresolvedToolApproval(messages: UIMessage[]) {
  return messages.some((message) => message.parts.some((part) => (
    isToolUIPart(part) && (part.state === "approval-requested" || part.state === "approval-responded")
  )));
}

export function shouldAutoRejectProposalPreview(status: number, stage: "first" | "second" | "") {
  return stage === "first" && (status === 400 || status === 409 || status === 422);
}

export function cancelToolApprovalLocally(
  messages: UIMessage[],
  messageId: string,
  approvalId: string,
  reason = "用户已取消",
) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== messageId) return message;
    const parts = message.parts.map((part) => {
      if (!isToolUIPart(part) || part.state !== "approval-requested" || part.approval.id !== approvalId) return part;
      changed = true;
      return {
        ...part,
        state: "output-denied" as const,
        approval: {
          ...part.approval,
          approved: false as const,
          reason,
        },
      } as UIMessage["parts"][number];
    });
    return { ...message, parts };
  });
  return changed ? nextMessages : messages;
}

export function closeAbandonedToolApprovals(messages: UIMessage[]) {
  let closedCount = 0;
  const nextMessages = messages.map((message, messageIndex) => {
    const hasLaterUserMessage = messages.slice(messageIndex + 1).some((candidate) => candidate.role === "user");
    if (!hasLaterUserMessage) return message;
    const parts = message.parts.map((part) => {
      if (!isToolUIPart(part) || part.state !== "approval-requested") return part;
      closedCount += 1;
      return {
        ...part,
        state: "output-denied" as const,
        approval: {
          ...part.approval,
          approved: false as const,
          reason: "该提案已被后续消息取代",
        },
      } as UIMessage["parts"][number];
    });
    return { ...message, parts };
  });
  return { messages: closedCount ? nextMessages : messages, closedCount };
}
