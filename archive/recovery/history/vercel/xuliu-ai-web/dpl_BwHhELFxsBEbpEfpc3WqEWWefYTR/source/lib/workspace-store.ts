import "server-only";

import type { AccountId } from "./accounts";
import { getRedis } from "./redis";

export type WorkspaceRecord = {
  data: unknown;
  updatedAt: string;
  revision: number;
};

const saveWorkspaceScript = `
local current = redis.call("GET", KEYS[1])
local expected = tonumber(ARGV[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  local currentRevision = 0
  if ok and decoded and decoded["revision"] then
    currentRevision = tonumber(decoded["revision"]) or 0
  end
  if currentRevision ~= expected then
    return -1
  end
  redis.call("LPUSH", KEYS[2], current)
  redis.call("LTRIM", KEYS[2], 0, 9)
elseif expected ~= 0 then
  return -1
end
redis.call("SET", KEYS[1], ARGV[2])
return expected + 1
`;

const saveAiWorkspaceScript = `
local previousResult = redis.call("GET", KEYS[3])
if previousResult then
  return previousResult
end

local current = redis.call("GET", KEYS[1])
local expected = tonumber(ARGV[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  local currentRevision = 0
  if ok and decoded and decoded["revision"] then
    currentRevision = tonumber(decoded["revision"]) or 0
  end
  if currentRevision ~= expected then
    return cjson.encode({ status = "conflict" })
  end
  redis.call("LPUSH", KEYS[2], current)
  redis.call("LTRIM", KEYS[2], 0, 9)
elseif expected ~= 0 then
  return cjson.encode({ status = "conflict" })
end

redis.call("SET", KEYS[1], ARGV[2])
local result = cjson.encode({ status = "applied", revision = expected + 1 })
redis.call("SET", KEYS[3], result, "EX", 86400)
return result
`;

function keys(ownerId: AccountId) {
  return {
    workspace: `xuliu-ai-v1:workspace:${ownerId}`,
    history: `xuliu-ai-v1:workspace:history:${ownerId}`,
  };
}

export async function getWorkspaceRecord(ownerId: AccountId): Promise<WorkspaceRecord | null> {
  const record = await getRedis().get<WorkspaceRecord>(keys(ownerId).workspace);
  if (!record) return null;
  return {
    data: record.data,
    updatedAt: String(record.updatedAt ?? ""),
    revision: Number.isInteger(record.revision) && record.revision >= 0 ? record.revision : 0,
  };
}

export async function saveWorkspaceData(ownerId: AccountId, data: unknown, baseRevision: number) {
  const updatedAt = new Date().toISOString();
  const record: WorkspaceRecord = { data, updatedAt, revision: baseRevision + 1 };
  const target = keys(ownerId);
  const revision = Number(await getRedis().eval(
    saveWorkspaceScript,
    [target.workspace, target.history],
    [String(baseRevision), JSON.stringify(record)],
  ));
  return revision === -1
    ? { status: "conflict" as const }
    : { status: "applied" as const, revision, updatedAt };
}

export async function saveAiWorkspaceData(ownerId: AccountId, data: unknown, baseRevision: number, executionId: string) {
  const updatedAt = new Date().toISOString();
  const record: WorkspaceRecord = { data, updatedAt, revision: baseRevision + 1 };
  const target = keys(ownerId);
  const resultKey = `xuliu-ai-v1:ai:execution:${ownerId}:${executionId}`;
  const raw = await getRedis().eval(
    saveAiWorkspaceScript,
    [target.workspace, target.history, resultKey],
    [String(baseRevision), JSON.stringify(record)],
  );
  const parsed = typeof raw === "string" ? JSON.parse(raw) as { status?: string; revision?: number } : raw as { status?: string; revision?: number };
  return parsed?.status === "applied"
    ? { status: "applied" as const, revision: Number(parsed.revision), updatedAt }
    : { status: "conflict" as const };
}
