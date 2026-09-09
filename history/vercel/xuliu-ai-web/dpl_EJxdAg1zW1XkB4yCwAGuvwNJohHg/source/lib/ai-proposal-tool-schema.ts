import { z } from "zod";
import { aiWorkspaceProposalInputSchema } from "./ai-action-schema.ts";

export function createServerStampedProposalSchema(getCurrentRevision: () => Promise<number>) {
  return z.preprocess(async (rawValue) => {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) return rawValue;
    const revision = await getCurrentRevision();
    return { ...rawValue, baseRevision: revision };
  }, aiWorkspaceProposalInputSchema);
}
