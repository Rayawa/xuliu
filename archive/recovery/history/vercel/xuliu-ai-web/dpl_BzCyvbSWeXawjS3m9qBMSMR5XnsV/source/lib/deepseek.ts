import "server-only";

import {
  createOpenAICompatible,
  type MetadataExtractor,
} from "@ai-sdk/openai-compatible";

export const DEEPSEEK_OFFICIAL_BASE_URL = "https://api.deepseek.com" as const;
export const DEEPSEEK_MODEL_ID = "deepseek-v4-flash" as const;

type DeepSeekResponseMetadata = {
  responseId?: string;
  responseModel?: string;
  systemFingerprint?: string;
};

function shortString(value: unknown, maximumLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength
    ? value
    : undefined;
}

function responseMetadataFrom(value: unknown): DeepSeekResponseMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const response = value as Record<string, unknown>;
  return {
    responseId: shortString(response.id, 256),
    responseModel: shortString(response.model, 128),
    systemFingerprint: shortString(response.system_fingerprint, 256),
  };
}

function providerMetadataFrom(metadata: DeepSeekResponseMetadata) {
  return Object.values(metadata).some((value) => value !== undefined)
    ? { deepseek: metadata }
    : undefined;
}

export const deepSeekMetadataExtractor: MetadataExtractor = {
  async extractMetadata({ parsedBody }) {
    return providerMetadataFrom(responseMetadataFrom(parsedBody));
  },
  createStreamExtractor() {
    const metadata: DeepSeekResponseMetadata = {};
    return {
      processChunk(parsedChunk) {
        const next = responseMetadataFrom(parsedChunk);
        metadata.responseId ??= next.responseId;
        metadata.responseModel ??= next.responseModel;
        metadata.systemFingerprint ??= next.systemFingerprint;
      },
      buildMetadata() {
        return providerMetadataFrom(metadata);
      },
    };
  },
};

export function getDeepSeekRuntimeConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const baseURL = process.env.DEEPSEEK_BASE_URL;
  if (baseURL !== DEEPSEEK_OFFICIAL_BASE_URL) {
    throw new Error(`DEEPSEEK_BASE_URL must exactly equal ${DEEPSEEK_OFFICIAL_BASE_URL}`);
  }

  const model = process.env.DEEPSEEK_MODEL;
  if (model !== DEEPSEEK_MODEL_ID) {
    throw new Error(`DEEPSEEK_MODEL must exactly equal ${DEEPSEEK_MODEL_ID}`);
  }

  return Object.freeze({ apiKey, baseURL, model });
}

export function deepSeekApprovalSecret() {
  const value = process.env.XULIU_AI_APPROVAL_SECRET;
  if (!value || value.length < 32) throw new Error("AI approval secret must contain at least 32 characters");
  return value;
}

export function getDeepSeekModel() {
  const { apiKey, baseURL, model } = getDeepSeekRuntimeConfig();
  const provider = createOpenAICompatible({
    name: "deepseek",
    apiKey,
    baseURL,
    includeUsage: true,
    supportsStructuredOutputs: false,
    transformRequestBody: (body) => ({ ...body, thinking: { type: "disabled" } }),
    metadataExtractor: deepSeekMetadataExtractor,
  });
  return provider.chatModel(model);
}
