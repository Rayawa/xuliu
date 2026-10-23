import "server-only";

import { z } from "zod";
import { canViewWorkspace, findAccountById, getVisibleAccounts, type AccountId } from "./accounts";
import { createInitialFinanceState } from "./finance";
import { getWorkspaceRecord } from "./workspace-store";
import { reviewPoolReadProjection } from "./course-review-pool";

export const workspaceModuleSchema = z.enum([
  "tasks",
  "milestones",
  "courses",
  "learning",
  "research",
  "ideas",
  "tools",
  "habits",
  "routines",
  "reminders",
  "media",
  "recipes",
  "pages",
  "daily",
  "timeEntries",
  "finance",
  "reviewPool",
]);

export type WorkspaceModule = z.infer<typeof workspaceModuleSchema>;

const blockedKeyPattern = /(password|secret|token|cookie|credential|authorization|hash)/i;
const reviewPoolPurpose = "有空可选的复习章节，不是待办或欠交任务；只有 selectedDate 对应当天的章节才进入当天安排，不按旧源记录的日期催办。此模块仅供读取。";

function moduleData(state: Record<string, unknown>, module: WorkspaceModule) {
  if (module !== "reviewPool") return state[module];
  const pool = state.reviewPool;
  return pool && typeof pool === "object" && Array.isArray((pool as Record<string, unknown>).items)
    ? (pool as Record<string, unknown>).items : [];
}

function sanitizeWorkspaceValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[内容层级过深，已省略]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (/^data:/i.test(value)) return "[内嵌文件已省略]";
    return value.slice(0, 2_000);
  }
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeWorkspaceValue(item, depth + 1));
  if (!value || typeof value !== "object") return String(value ?? "");
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !blockedKeyPattern.test(key))
    .map(([key, child]) => [key, sanitizeWorkspaceValue(child, depth + 1)]));
}

function allowedTarget(viewerId: AccountId, requestedId: string) {
  const account = findAccountById(requestedId);
  if (!account || !canViewWorkspace(viewerId, account.id)) throw new Error("无权读取这个空间");
  return account;
}

export function readableWorkspaceIds(viewerId: AccountId) {
  return [viewerId, ...getVisibleAccounts(viewerId).map((account) => account.id)];
}

export async function workspaceOverview(viewerId: AccountId) {
  return Promise.all(readableWorkspaceIds(viewerId).map(async (ownerId) => {
    const account = findAccountById(ownerId)!;
    const record = await getWorkspaceRecord(ownerId);
    const state = reviewPoolReadProjection(record?.data);
    const counts = Object.fromEntries(workspaceModuleSchema.options.map((module) => {
      const value = moduleData(state, module);
      if (module === "finance") {
        const entries = value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).entries)
          ? (value as Record<string, unknown>).entries as unknown[]
          : [];
        return [module, entries.length];
      }
      const count = Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0;
      return [module, count];
    }));
    return {
      ownerId,
      displayName: account.displayName,
      writable: ownerId === viewerId,
      revision: record?.revision ?? 0,
      counts,
      modulePurposes: { reviewPool: reviewPoolPurpose },
    };
  }));
}

export async function readWorkspaceModule(viewerId: AccountId, requestedId: string, module: WorkspaceModule, offset = 0, limit = 50) {
  const account = allowedTarget(viewerId, requestedId);
  const record = await getWorkspaceRecord(account.id);
  const state = reviewPoolReadProjection(record?.data);
  const raw = moduleData(state, module) ?? (module === "daily" ? {} : module === "finance" ? createInitialFinanceState() : []);
  let totalItems = 0;
  let page: unknown;
  if (module === "finance") {
    const finance = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : createInitialFinanceState();
    const entries = Array.isArray(finance.entries) ? finance.entries : [];
    totalItems = entries.length;
    page = { ...finance, entries: entries.slice(offset, offset + limit) };
  } else if (Array.isArray(raw)) {
    totalItems = raw.length;
    page = raw.slice(offset, offset + limit);
  } else if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, unknown>);
    totalItems = entries.length;
    page = Object.fromEntries(entries.slice(offset, offset + limit));
  } else {
    totalItems = 0;
    page = [];
  }
  return {
    source: "untrusted_workspace_data",
    ownerId: account.id,
    displayName: account.displayName,
    writable: module !== "reviewPool" && account.id === viewerId,
    revision: record?.revision ?? 0,
    module,
    ...(module === "reviewPool" ? { purpose: reviewPoolPurpose } : {}),
    offset,
    limit,
    totalItems,
    hasMore: offset + limit < totalItems,
    data: sanitizeWorkspaceValue(page),
  };
}

function searchableText(value: unknown): string {
  if (typeof value === "string") return /^data:/i.test(value) ? "" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(searchableText).join(" ");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !blockedKeyPattern.test(key))
    .map(([, child]) => searchableText(child)).join(" ");
  return "";
}

export async function searchWorkspaces(viewerId: AccountId, query: string, modules?: WorkspaceModule[], offset = 0, limit = 40) {
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  if (!needle) return { offset, limit, totalMatches: 0, hasMore: false, results: [] };
  const selected = modules?.length ? modules : workspaceModuleSchema.options;
  const results: Array<Record<string, unknown>> = [];
  let totalMatches = 0;
  for (const ownerId of readableWorkspaceIds(viewerId)) {
    const account = findAccountById(ownerId)!;
    const record = await getWorkspaceRecord(ownerId);
    const state = reviewPoolReadProjection(record?.data);
    for (const module of selected) {
      const raw = moduleData(state, module);
      const items = module === "finance" && raw && typeof raw === "object" && !Array.isArray(raw)
        ? (Array.isArray((raw as Record<string, unknown>).entries) ? (raw as Record<string, unknown>).entries as unknown[] : [])
        : Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object"
            ? Object.entries(raw).map(([key, value]) => ({ key, value }))
            : [];
      for (const item of items) {
        const text = searchableText(item);
        const position = text.toLocaleLowerCase("zh-CN").indexOf(needle);
        if (position < 0) continue;
        if (totalMatches >= offset && results.length < limit) {
          results.push({
            source: "untrusted_workspace_data",
            ownerId,
            displayName: account.displayName,
            module,
            ...(module === "reviewPool" ? { purpose: reviewPoolPurpose, writable: false } : {}),
            item: sanitizeWorkspaceValue(item),
          });
        }
        totalMatches += 1;
      }
    }
  }
  return { offset, limit, totalMatches, hasMore: offset + results.length < totalMatches, results };
}
