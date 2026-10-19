import test from "node:test";
import assert from "node:assert/strict";
import { dailyHitokotoStorageKey, loadDailyHitokoto, parseHitokoto } from "../lib/daily-hitokoto.ts";

const response = { hitokoto: "本地测试用的一句话。", from: "测试来源", from_who: "测试作者", uuid: "35c2399a-5a4f-4025-bd59-019a1150539f" };
const cached = { ...parseHitokoto(response), date: "2026-10-19" };
function store(value) {
  const values = new Map(value === undefined ? [] : [[dailyHitokotoStorageKey, typeof value === "string" ? value : JSON.stringify(value)]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("same-day quotes survive reload without another network request", async () => {
  const storage = store(cached);
  assert.deepEqual(await loadDailyHitokoto("2026-10-19", storage, () => { throw new Error("must use today's cache"); }), cached);
});

test("a new local day fetches and saves a new quote without sending credentials", async () => {
  const storage = store(cached);
  let calls = 0;
  const next = await loadDailyHitokoto("2026-10-20", storage, async (url, options) => {
    calls++;
    assert.equal(new URL(url).origin, "https://v1.hitokoto.cn");
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    return { ok: true, json: async () => ({ ...response, hitokoto: "第二天的测试语句。" }) };
  });
  assert.equal(calls, 1);
  assert.equal(next.date, "2026-10-20");
  assert.equal(next.text, "第二天的测试语句。");
  assert.deepEqual(JSON.parse(storage.getItem(dailyHitokotoStorageKey)), next);
  assert.equal(cached.date, "2026-10-19");
});

test("an unavailable provider retains the last quote with its original date", async () => {
  const storage = store(cached);
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ error: "bad response" }) })]) {
    assert.deepEqual(await loadDailyHitokoto("2026-10-20", storage, fetcher), cached);
    assert.equal(JSON.parse(storage.getItem(dailyHitokotoStorageKey)).date, "2026-10-19");
  }
});

test("corrupted cache and provider failures leave no fabricated fallback sentence", async () => {
  for (const value of ["not-json", { ...cached, date: "2026-99-99" }, { date: "2026-10-19", text: 42 }]) {
    assert.equal(await loadDailyHitokoto("2026-10-19", store(value), async () => { throw new Error("offline"); }), null);
  }
});

test("browser storage failures do not prevent displaying a fetched quote", async () => {
  const storage = { getItem() { throw new Error("unavailable"); }, setItem() { throw new Error("full"); } };
  assert.deepEqual(await loadDailyHitokoto("2026-10-19", storage, async () => ({ ok: true, json: async () => response })), cached);
});

test("quote parsing rejects missing or oversized text and drops unsafe metadata", () => {
  for (const value of [null, [], {}, { hitokoto: " " }, { hitokoto: "长".repeat(141) }]) assert.equal(parseHitokoto(value), null);
  assert.deepEqual(parseHitokoto({ hitokoto: " 一句话。 ", from: null, from_who: {}, uuid: "javascript:alert(1)" }), { text: "一句话。", source: "", author: "", uuid: "" });
});

test("manual refresh bypasses today's cache and remembers the new sentence", async () => {
  const storage = store(cached);
  const next = await loadDailyHitokoto("2026-10-19", storage, async (_url, options) => {
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => ({ ...response, hitokoto: "手动更换后的测试语句。" }) };
  }, { refresh: true });
  assert.equal(next.text, "手动更换后的测试语句。");
  assert.deepEqual(await loadDailyHitokoto("2026-10-19", storage, () => { throw new Error("must keep refreshed sentence"); }), next);
});

test("failed manual refresh reports failure and leaves the previous cached sentence intact", async () => {
  const storage = store(cached);
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ error: "bad response" }) })]) {
    assert.equal(await loadDailyHitokoto("2026-10-19", storage, fetcher, { refresh: true }), null);
    assert.deepEqual(JSON.parse(storage.getItem(dailyHitokotoStorageKey)), cached);
  }
});
