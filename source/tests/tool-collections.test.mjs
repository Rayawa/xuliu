import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyWorkspaceState, workspaceStateSchema } from "../lib/workspace-state-schema.ts";
import { MAX_COLLECTION_WEBSITES, moveCollectionWebsite, normalizeWebsiteUrl, toolCollectionFields } from "../lib/tool-collections.ts";

const sites = [
  { id: "site-a", title: "学校主页", url: "https://www.bit.edu.cn/", description: "学校信息" },
  { id: "site-b", title: "学术检索", url: "https://example.org/search", description: "检索入口" },
];
const legacyTool = { id: "original", title: "原有工具", status: "已完成", description: "保留原有说明", url: "https://example.com", version: "v2", versions: [{ id: "v2", label: "v2", url: "https://example.com", note: "已有版本", createdAt: "2026-09-09" }], blocks: [{ id: "note", type: "text", text: "已有笔记" }] };
const collection = { id: "collection", title: "北理相关网站", description: "常用入口", status: "常用", url: "", version: "", kind: "collection", websites: sites, blocks: [] };

test("old tools and collections survive validation, JSON export and client hydration together", () => {
  const state = { ...createEmptyWorkspaceState(), tools: [legacyTool, collection] };
  const saved = workspaceStateSchema.parse(state);
  const restored = workspaceStateSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.tools[0], legacyTool);
  assert.deepEqual(toolCollectionFields(restored.tools[0]), {});
  assert.deepEqual(toolCollectionFields(restored.tools[1]), { kind: "collection", websites: sites });
  assert.deepEqual(restored, state);
});

test("empty and reordered collections are valid and do not mutate the source order", () => {
  const moved = moveCollectionWebsite(sites, "site-b", -1);
  assert.deepEqual(moved.map((site) => site.id), ["site-b", "site-a"]);
  assert.deepEqual(sites.map((site) => site.id), ["site-a", "site-b"]);
  assert.strictEqual(moveCollectionWebsite(sites, "missing", -1), sites);
  assert.strictEqual(moveCollectionWebsite(sites, "site-a", -1), sites);
  assert.strictEqual(moveCollectionWebsite(sites, "site-b", 1), sites);
  for (const websites of [[], moved]) {
    const state = { ...createEmptyWorkspaceState(), tools: [{ ...collection, websites }] };
    assert.deepEqual(workspaceStateSchema.parse(state).tools[0].websites, websites);
  }
});

test("website input accepts ordinary web addresses and rejects executable or credential-bearing URLs", () => {
  assert.equal(normalizeWebsiteUrl(" www.bit.edu.cn "), "https://www.bit.edu.cn/");
  assert.equal(normalizeWebsiteUrl("//example.org/a?q=1"), "https://example.org/a?q=1");
  assert.equal(normalizeWebsiteUrl("http://example.org:8080/a"), "http://example.org:8080/a");
  for (const value of ["", "javascript:alert(1)", "data:text/html,hello", "file:///a", "ftp://example.org", "https://user:password@example.org", "not a website", "https://"]) {
    assert.equal(normalizeWebsiteUrl(value), null, value);
    const state = { ...createEmptyWorkspaceState(), tools: [{ ...collection, websites: [{ ...sites[0], url: value }] }] };
    assert.equal(workspaceStateSchema.safeParse(state).success, false, value);
  }
});

test("server validation enforces collection size and website field limits", () => {
  for (const websites of [Array.from({ length: MAX_COLLECTION_WEBSITES + 1 }, (_, i) => ({ ...sites[0], id: `s${i}` })), [{ ...sites[0], title: " " }], [{ ...sites[0], description: "x".repeat(501) }]]) {
    assert.equal(workspaceStateSchema.safeParse({ ...createEmptyWorkspaceState(), tools: [{ ...collection, websites }] }).success, false);
  }
});
