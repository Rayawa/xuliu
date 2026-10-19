import test from "node:test";
import assert from "node:assert/strict";
import { parseYiyanBook, parseYiyanBooks, parseYiyanIdentity, parseYiyanLibraryPage, yiyanDefaultBook } from "../lib/yiyan-library.ts";
import { YiyanClient, YiyanError, YiyanReconnectRequired, YiyanUnconfirmedError } from "../lib/yiyan-service.ts";
import { runYiyanOperation } from "../lib/yiyan-operation.ts";
import { openYiyanSession, sealYiyanSession, yiyanKey } from "../lib/yiyan-session.ts";

const user = { uid: "10", username: "test-user" };
const rawBook = { bookid: "20", bookname: "默认文集", creator: user, cardcnt: 1, ava: "0" };
const rawCard = { textcardid: "30", content: "私密文集内的测试图文", priv: "1", from: "测试", cibdatetime: "2026-10-19 12:00:00", datetime: "2026-10-17 12:00:00" };
const cookies = [["JSESSIONID", "test-cookie"]];
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const library = (extra = {}) => ({ user, booklist: [rawBook], ...extra });
function memoryStore() {
  const values = new Map();
  return { values, get: async key => values.get(key) ?? null, claim: async (key, value) => { if (values.has(key)) return false; values.set(key, value); return true; }, save: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } };
}

test("文集只接受本人明确拥有的记录，默认文集按名称唯一匹配", () => {
  const books = parseYiyanBooks([rawBook, rawBook, { ...rawBook, bookid: "21", bookname: "其他", ava: "1" }, { ...rawBook, bookid: "22", creator: { uid: "11" } }], user.uid);
  assert.deepEqual(books.map(book => book.id), ["20", "21"]);
  assert.equal(books[0].private, true); assert.equal(books[1].private, false);
  assert.equal(parseYiyanBook({ ...rawBook, ava: "false" }, user.uid).private, true);
  assert.equal(parseYiyanBook({ ...rawBook, ava: "true" }, user.uid).private, false);
  assert.equal(yiyanDefaultBook(books).id, "20");
  assert.equal(yiyanDefaultBook([books[1]]), null);
  assert.equal(yiyanDefaultBook([books[0], { ...books[0], id: "23" }]), null);
  assert.equal(parseYiyanBook({ ...rawBook, creator: undefined }, user.uid), null);
  assert.equal(parseYiyanBooks(Array(501).fill(rawBook), user.uid), null);
});

test("文集浏览保留私密和长文内容，只在受控分页内返回安全字段", () => {
  const text = "正文".repeat(3000), page = parseYiyanLibraryPage({ textcardlist: [{ ...rawCard, content: text, creator: { secret: "omit" } }, rawCard] });
  assert.equal(page.cards.length, 1); assert.equal(page.cards[0].text, text);
  assert.equal(page.nextCursor, rawCard.cibdatetime);
  assert.deepEqual(Object.keys(page.cards[0]).sort(), ["id", "image", "publishedAt", "source", "text"]);
  assert.equal(parseYiyanLibraryPage({ textcardlist: [rawCard] }, rawCard.cibdatetime).nextCursor, null);
  assert.deepEqual(parseYiyanLibraryPage({ textcardlist: [] }), { cards: [], nextCursor: null });
  assert.equal(parseYiyanLibraryPage({ textcardlist: Array(101).fill(rawCard) }), null);
});

test("真实本人文集列表缺少 creator 时仍能显示，但须先核对响应账号", async () => {
  const actualShape = { bookid: "20", bookname: "默认文集", cardcnt: "5", ava: "0", picpath: "", datetime: "2026-10-19 12:00:00" };
  const client = new YiyanClient(cookies, async () => response(library({ booklist: [actualShape] })));
  const data = await client.library(user);
  assert.equal(data.books.length, 1); assert.equal(data.defaultBook.id, "20"); assert.equal(data.books[0].count, 5);
  assert.equal(parseYiyanBook(actualShape, user.uid), null);
  assert.equal(parseYiyanBooks([{ ...actualShape, creator: { uid: "other" } }], user.uid), null);
  const other = new YiyanClient(cookies, async () => response(library({ user: { ...user, uid: "11" }, booklist: [actualShape] })));
  await assert.rejects(other.library(user));
});

test("异常文集结构不再静默显示成空列表", () => {
  assert.equal(parseYiyanBooks([{ unknown: true }], user.uid), null);
  assert.deepEqual(parseYiyanBooks([], user.uid), []);
});

test("旧连接保持可用但文集功能要求重新取得可信身份，不接受伪造身份", async () => {
  assert.equal(parseYiyanIdentity({ uid: "10", username: "_yannewuser_" }), null);
  assert.equal(parseYiyanIdentity({ uid: "bad", username: "user" }), null);
  const client = new YiyanClient(cookies, () => { throw new Error("unexpected request"); });
  await assert.rejects(client.library(undefined), YiyanReconnectRequired);
  const key = yiyanKey("test-connection-secret-with-sufficient-length");
  const session = { owner: "owner", kind: "connected", cookies, expiresAt: Date.now() + 60000, identity: user };
  assert.deepEqual(openYiyanSession(sealYiyanSession(session, key), key, "owner", "connected").identity, user);
  assert.equal(openYiyanSession(sealYiyanSession(session, key), key, "other", "connected"), null);
  assert.throws(() => sealYiyanSession({ ...session, identity: { ...user, uid: "bad" } }, key));
});

test("默认收藏取服务端身份和目标文集，不采用客户端用户名或外部文集", async () => {
  const calls = [];
  const client = new YiyanClient(cookies, async (url, options) => {
    calls.push(new URL(url).pathname);
    assert.equal(new URL(url).origin, "https://app.yiyan.art"); assert.equal(options.headers.Cookie, "JSESSIONID=test-cookie");
    if (new URL(url).pathname.endsWith("getuserinfoandbooklist")) { assert.equal(options.method, "GET"); assert.equal(new URL(url).searchParams.get("uid"), user.uid); return response(library({ user: { ...user, username: "updated-name" } })); }
    const fields = new URLSearchParams(options.body);
    assert.equal(options.method, "POST"); assert.equal(fields.get("cardid"), "30"); assert.equal(fields.get("collectuid"), user.uid);
    assert.equal(fields.get("collectun"), "updated-name"); assert.equal(fields.get("collectbookid"), "20"); assert.equal(fields.get("collectbn"), "默认文集");
    return response({});
  });
  assert.equal((await client.collect(user, "30", "")).saved, true);
  assert.deepEqual(calls.map(path => path.split("/").pop()), ["getuserinfoandbooklist", "collectcard"]);
  await assert.rejects(client.collect(user, "30", "999"), error => error.status === 404);
  assert.equal(calls.length, 2);
});

test("默认目标缺失、外部账号响应或收藏失败均不产生虚假的成功", async () => {
  for (const data of [library({ booklist: [{ ...rawBook, bookname: "其他" }] }), library({ user: { ...user, uid: "11" } }), library({ booklist: [{ ...rawBook, creator: { uid: "11" } }] })]) {
    let writes = 0;
    const client = new YiyanClient(cookies, async (url) => { if (new URL(url).pathname.endsWith("collectcard")) writes++; return response(data); });
    await assert.rejects(client.collect(user, "30", "")); assert.equal(writes, 0);
  }
  const client = new YiyanClient(cookies, async url => response(new URL(url).pathname.endsWith("collectcard") ? { errorcode: "4", errormsg: "private upstream response" } : library()));
  await assert.rejects(client.collect(user, "30", ""), error => !error.message.includes("private upstream response"));
});

test("打开文集前核对归属，并使用 App 的收藏时间分页", async () => {
  const urls = [];
  const client = new YiyanClient(cookies, async url => { urls.push(new URL(url)); return response(new URL(url).pathname.endsWith("gettextcardsinbook") ? { textcardlist: [rawCard] } : library()); });
  const page = await client.bookCards(user, "20", "2026-10-20 00:00:00");
  assert.equal(page.cards[0].text, rawCard.content); assert.equal(urls[1].searchParams.get("bookid"), "20"); assert.equal(urls[1].searchParams.get("datetime"), "2026-10-20 00:00:00");
  await assert.rejects(client.bookCards(user, "999"), error => error.status === 404);
  await assert.rejects(client.bookCards(user, "20", "bad"), error => error.status === 400);
  assert.equal(urls.length, 2);
});

test("新建文集只调用无封面接口，私密与公开标记对应 App 原规则", async () => {
  for (const visibility of ["private", "public"]) {
    const client = new YiyanClient(cookies, async (url, options) => {
      if (new URL(url).pathname.endsWith("getuserinfoandbooklist")) return response(library());
      assert.equal(new URL(url).pathname, "/yiyan/newbook_np");
      const fields = new URLSearchParams(options.body); assert.equal(fields.get("bookname"), "新文集"); assert.equal(fields.get("bookid"), null);
      assert.equal(fields.get("ava"), visibility === "private" ? "0" : "1");
      return response({ ...rawBook, bookid: "21", bookname: "新文集", ava: fields.get("ava") });
    });
    const result = await client.createBook(user, " 新文集 ", visibility); assert.equal(result.book.private, visibility === "private");
  }
});

test("同名文集和非法输入不触发创建；响应未确认时不谎报新建成功", async () => {
  let requests = 0;
  const client = new YiyanClient(cookies, async () => { requests++; return response(library()); });
  await assert.rejects(client.createBook(user, "默认文集", "private"), error => error.status === 409); assert.equal(requests, 1);
  await assert.rejects(client.createBook(user, " ", "private")); await assert.rejects(client.createBook(user, "A".repeat(61), "private")); assert.equal(requests, 1);
  const bad = new YiyanClient(cookies, async url => response(new URL(url).pathname.endsWith("getuserinfoandbooklist") ? library() : { ok: true }));
  await assert.rejects(bad.createBook(user, "新文集", "private"), /核对/);
});

test("新建响应缺少 creator 时回读本人文集确认，只创建一次", async () => {
  let reads = 0, writes = 0;
  const created = { ...rawBook, bookid: "21", bookname: "新文集", creator: undefined };
  const client = new YiyanClient(cookies, async url => {
    if (new URL(url).pathname.endsWith("getuserinfoandbooklist")) return response(library({ booklist: ++reads === 1 ? [rawBook] : [rawBook, created] }));
    writes++; return response(created);
  });
  const result = await client.createBook(user, "新文集", "private");
  assert.equal(result.book.id, "21"); assert.equal(result.recovered, true); assert.equal(writes, 1); assert.equal(reads, 2);
});

test("收藏结果通过指定文集回读，缺失时不能冒充已收藏", async () => {
  let found = false;
  const client = new YiyanClient(cookies, async url => response(new URL(url).pathname.endsWith("getuserinfoandbooklist") ? library() : { textcardlist: found ? [rawCard] : [] }));
  assert.equal(await client.checkCollection(user, "30", "20"), null);
  found = true; assert.equal((await client.checkCollection(user, "30", "20")).saved, true);
  await assert.rejects(client.checkCollection(user, "30", "999"), error => error.status === 404);
});

test("已收藏的当前图文直接确认，不重复向一言写入", async () => {
  let writes = 0;
  const client = new YiyanClient(cookies, async (url, options) => {
    if (options.method === "POST") writes++;
    return response(new URL(url).pathname.endsWith("getuserinfoandbooklist") ? library() : { textcardlist: [rawCard] });
  });
  assert.equal((await client.collectConfirmed(user, "30", "20")).saved, true); assert.equal(writes, 0);
});

test("新收藏必须回读到目标图文才显示成功，回读失败不能再次写入", async () => {
  for (const readable of [true, false]) {
    let writes = 0;
    const client = new YiyanClient(cookies, async url => {
      const path = new URL(url).pathname;
      if (path.endsWith("getuserinfoandbooklist")) return response(library());
      if (path.endsWith("collectcard")) { writes++; return response({}); }
      return response({ textcardlist: writes && readable ? [rawCard] : [] });
    });
    if (readable) assert.equal((await client.collectConfirmed(user, "30", "20")).saved, true);
    else await assert.rejects(client.collectConfirmed(user, "30", "20"), YiyanUnconfirmedError);
    assert.equal(writes, 1);
  }
});

test("只对读取的网络或 5xx 故障重试一次，不重发短信、收藏或创建", async () => {
  let reads = 0, writes = 0;
  const client = new YiyanClient(cookies, async url => {
    if (new URL(url).pathname.endsWith("getuserinfoandbooklist")) { reads++; if (reads === 1) throw new TypeError("network failure"); return response(library()); }
    writes++; throw new TypeError("uncertain result");
  });
  await assert.rejects(client.collect(user, "30", "20")); assert.equal(reads, 2); assert.equal(writes, 1);
  let sms = 0;
  await assert.rejects(new YiyanClient([], async () => { sms++; return response({}, 503); }).sendCode("15500000000")); assert.equal(sms, 1);
  let busy = 0;
  await assert.rejects(new YiyanClient(cookies, async () => { busy++; return response({}, 429); }).library(user), error => error.status === 429); assert.equal(busy, 1);
});

test("操作回执复用成功结果并隔离不同目标，不再次写入", async () => {
  const store = memoryStore(); let writes = 0;
  const result = { saved: true, cardId: "30" };
  assert.deepEqual(await runYiyanOperation(store, "key", "fingerprint", async () => { writes++; return result; }), result);
  assert.deepEqual(await runYiyanOperation(store, "key", "fingerprint", async () => { writes++; }), result);
  await assert.rejects(runYiyanOperation(store, "key", "other", async () => { writes++; }), error => error.status === 409);
  assert.equal(writes, 1);
});

test("并发、超时或结果不明时保留回执，避免重复收藏和重复新建", async () => {
  const store = memoryStore(); let release, writes = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const first = runYiyanOperation(store, "key", "same", async () => { writes++; await gate; return { book: "20" }; });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(runYiyanOperation(store, "key", "same", async () => { writes++; }), error => error.status === 409);
  release(); await first; assert.equal(writes, 1);
  await assert.rejects(runYiyanOperation(store, "timeout", "same", async () => { throw new YiyanError("network", 503); }), /核对/);
  await assert.rejects(runYiyanOperation(store, "timeout", "same", async () => { writes++; }), error => error.status === 409);
  assert.equal(writes, 1);
});

test("上游明确拒绝的操作可纠正后重试，不留下错误的已收藏状态", async () => {
  const store = memoryStore();
  await assert.rejects(runYiyanOperation(store, "key", "same", async () => { throw new YiyanError("invalid", 400); }), error => error.status === 400);
  assert.equal(store.values.has("key"), false);
  assert.deepEqual(await runYiyanOperation(store, "key", "same", async () => ({ saved: true })), { saved: true });
});

test("上次结果不明的操作能只读核对并解除卡住状态，不重发写入", async () => {
  const store = memoryStore(); let writes = 0, confirmed = false;
  const result = { saved: true, cardId: "30" };
  const write = async () => { writes++; throw new YiyanError("timeout", 503); };
  const reconcile = async () => confirmed ? result : null;
  await assert.rejects(runYiyanOperation(store, "key", "same", write, reconcile), YiyanUnconfirmedError);
  confirmed = true;
  assert.deepEqual(await runYiyanOperation(store, "key", "same", write, reconcile, true), result);
  assert.deepEqual(await runYiyanOperation(store, "key", "same", write, reconcile), result);
  assert.equal(writes, 1); assert.equal(store.values.get("key").state, "done");
});

test("检查结果即使没有旧回执也只读；写入响应丢失可立即回读恢复", async () => {
  const store = memoryStore(); let writes = 0;
  const write = async () => { writes++; throw new TypeError("lost response"); };
  await assert.rejects(runYiyanOperation(store, "absent", "same", write, async () => null, true), YiyanUnconfirmedError);
  assert.equal(writes, 0); assert.equal(store.values.has("absent"), false);
  const result = { book: { id: "20" } };
  assert.deepEqual(await runYiyanOperation(store, "key", "same", write, async () => result), result);
  assert.equal(writes, 1);
});
