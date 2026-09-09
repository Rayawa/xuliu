import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AccountId } from "./accounts";
import { aiProposalRisk, aiWorkspaceProposalInputSchema, type AiWorkspaceProposalInput } from "./ai-action-schema";
import { applyAiWorkspaceProposal } from "./ai-action-reducer";
import { deepSeekApprovalSecret } from "./deepseek";
import { getRedis } from "./redis";
import { createEmptyWorkspaceState, workspaceStateSchema } from "./workspace-state-schema";
import { getWorkspaceRecord, saveAiWorkspaceData } from "./workspace-store";

type StoredProposal = {
  schemaVersion: 1;
  proposalId: string;
  actorId: AccountId;
  baseRevision: number;
  input: AiWorkspaceProposalInput;
  risk: "destructive" | "bulk";
  executionId: string;
  confirmationTokenHash: string;
  createdAt: string;
  expiresAt: string;
};

function proposalKey(actorId: AccountId, proposalId: string) {
  return `xuliu-ai-v1:ai:proposal:${actorId}:${proposalId}`;
}

function proposalIdFor(actorId: AccountId, executionId: string) {
  return createHash("sha256").update(`${actorId}:${executionId}`).digest("base64url").slice(0, 32);
}

function confirmationToken(actorId: AccountId, executionId: string) {
  return createHmac("sha256", deepSeekApprovalSecret()).update(`${actorId}:${executionId}:second-confirmation`).digest("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest();
}

function sameToken(candidate: string, expectedHash: string) {
  const candidateHash = tokenHash(candidate);
  const expected = Buffer.from(expectedHash, "base64");
  return candidateHash.length === expected.length && timingSafeEqual(candidateHash, expected);
}

async function applyProposal(actorId: AccountId, input: AiWorkspaceProposalInput, executionId: string) {
  const current = await getWorkspaceRecord(actorId);
  const currentRevision = current?.revision ?? 0;
  if (currentRevision !== input.baseRevision) return { status: "conflict" as const };
  const currentData = current?.data && typeof current.data === "object" && !Array.isArray(current.data)
    ? { ...createEmptyWorkspaceState(), ...current.data }
    : createEmptyWorkspaceState();
  const nextState = workspaceStateSchema.parse(applyAiWorkspaceProposal(currentData, input));
  return saveAiWorkspaceData(actorId, nextState, input.baseRevision, executionId);
}

export async function executeOrStageAiProposal(actorId: AccountId, rawInput: unknown, executionId: string) {
  const input = aiWorkspaceProposalInputSchema.parse(rawInput);
  const risk = aiProposalRisk(input);
  if (risk === "write") return applyProposal(actorId, input, executionId);

  const proposalId = proposalIdFor(actorId, executionId);
  const token = confirmationToken(actorId, executionId);
  const stored: StoredProposal = {
    schemaVersion: 1,
    proposalId,
    actorId,
    baseRevision: input.baseRevision,
    input,
    risk,
    executionId,
    confirmationTokenHash: tokenHash(token).toString("base64"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  await getRedis().set(proposalKey(actorId, proposalId), stored, { ex: 10 * 60 });
  return {
    status: "second_confirmation_required" as const,
    proposalId,
    confirmationToken: token,
    risk,
    expiresAt: stored.expiresAt,
  };
}

export async function executeStoredAiProposal(actorId: AccountId, proposalId: string, token: string) {
  const stored = await getRedis().get<StoredProposal>(proposalKey(actorId, proposalId));
  if (!stored || stored.actorId !== actorId || stored.proposalId !== proposalId) return { status: "not_found" as const };
  if (new Date(stored.expiresAt).getTime() <= Date.now()) return { status: "expired" as const };
  if (!sameToken(token, stored.confirmationTokenHash)) return { status: "forbidden" as const };
  return applyProposal(actorId, stored.input, `proposal:${proposalId}`);
}
