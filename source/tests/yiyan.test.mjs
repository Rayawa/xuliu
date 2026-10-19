import test from "node:test";
import assert from "node:assert/strict";
import { defaultYiyanImageClarity, parseYiyanCard, parseYiyanResponse, readYiyanCache, readYiyanImageClarity, saveYiyanCache, saveYiyanImageClarity, yiyanCardStorageKey, yiyanImageClarityKey, yiyanImageUrl } from "../lib/yiyan-card.ts";
import { YiyanClient } from "../lib/yiyan-service.ts";
import { hasYiyanSameOrigin, isYiyanLocalPreview, openYiyanSession, sealYiyanSession, yiyanKey, yiyanPhoneHash } from "../lib/yiyan-session.ts";

const phone = "15500000000", code = "123456";
const rawCard = { textcardid: "101", content: "测试图文\n第二行", from: "测试出处", priv: "0", creator: { uid: "9999" }, rec: "0", datetime: "2026-10-17 20:19:59.0", picpath: "http://jhyiyan.oss-cn-beijing.aliyuncs.com/test.jpg" };
const card = { provider: "yiyan", id: "101", text: rawCard.content, source: rawCard.from, image: rawCard.picpath.replace("http:", "https:"), publishedAt: rawCard.datetime };
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const key = yiyanKey("local-test-secret-that-is-not-a-real-credential");
const session = { owner: "owner", kind: "connected", cookies: [["JSESSIONID", "test-session"]], expiresAt: 2000000000000 };

test("只接受一言确认公开的官方或推荐图文，去重并保留原文与出处", () => {
  assert.deepEqual(parseYiyanResponse({ textcardlist: [rawCard, rawCard] }), [card]);
  assert.equal(parseYiyanResponse({ textcardlist: [{ ...rawCard, creator: { uid: "42" }, rec: 1 }] }).length, 1);
  for (const item of [{ ...rawCard, priv: "1" }, { ...rawCard, priv: undefined }, { ...rawCard, creator: { uid: "42" } }, { ...rawCard, content: " " }, { ...rawCard, content: "长".repeat(1001) }, { ...rawCard, textcardid: "javascript:alert(1)" }]) {
    assert.deepEqual(parseYiyanResponse({ textcardlist: [item] }), []);
  }
  assert.deepEqual(parseYiyanResponse(null), []);
});

test("配图只使用已核实的一言图片域名，拒绝任意协议、凭据和本机地址", () => {
  assert.equal(yiyanImageUrl(rawCard.picpath), card.image);
  const historicalImage = "http://app.yiyan.art/yiyanpic/pic/2022/06/27/031b4d214dc24f19294bffb9f4733761.jpg";
  assert.equal(yiyanImageUrl(historicalImage), historicalImage.replace("http:", "https:"));
  assert.equal(parseYiyanResponse({ textcardlist: [{ ...rawCard, picpath: historicalImage }] })[0].image, historicalImage.replace("http:", "https:"));
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "http://127.0.0.1/a", "https://example.com/a", "https://app.yiyan.art/yiyan/gettodaycard", "https://app.yiyan.art/yiyanpic/pic/../../yiyan/gettodaycard", "https://u:p@jhyiyan.oss-cn-beijing.aliyuncs.com/a", "https://jhyiyan.oss-cn-beijing.aliyuncs.com:8080/a"]) assert.equal(yiyanImageUrl(url), "");
  assert.equal(parseYiyanCard({ ...card, image: "https://example.com/a" }).image, "");
});

test("图文缓存跨页面刷新保持选择，不读取旧 Hitokoto 数据或存储凭据", () => {
  const values = new Map([["xuliu-daily-hitokoto-v1", JSON.stringify({ text: "旧数据" })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readYiyanCache(storage), null);
  saveYiyanCache(card, storage); assert.deepEqual(readYiyanCache(storage), card);
  assert.equal(values.has("xuliu-daily-hitokoto-v1"), true);
  assert.deepEqual(Object.keys(JSON.parse(values.get(yiyanCardStorageKey))).sort(), ["id", "image", "provider", "publishedAt", "source", "text"]);
  assert.equal(readYiyanCache({ getItem: () => "bad-json" }), null);
  assert.equal(readYiyanCache({ getItem: () => JSON.stringify({ ...card, provider: "hitokoto" }) }), null);
});

test("浏览器存储不可用时缓存操作安全退化", () => {
  const storage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(readYiyanCache(storage), null); assert.doesNotThrow(() => saveYiyanCache(card, storage));
});

test("配图清晰度独立保存在当前浏览器，异常设置和不可用存储安全回退", () => {
  const values = new Map([[yiyanCardStorageKey, JSON.stringify(card)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readYiyanImageClarity(storage), defaultYiyanImageClarity);
  for (const value of [0, 50, 100]) { saveYiyanImageClarity(value, storage); assert.equal(readYiyanImageClarity(storage), value); }
  saveYiyanImageClarity(150, storage); assert.equal(readYiyanImageClarity(storage), 100);
  saveYiyanImageClarity(NaN, storage); assert.equal(readYiyanImageClarity(storage), 100);
  for (const value of ["-1", "101", "", "NaN", "50px"]) { values.set(yiyanImageClarityKey, value); assert.equal(readYiyanImageClarity(storage), defaultYiyanImageClarity); }
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(readYiyanImageClarity(blocked), defaultYiyanImageClarity); assert.doesNotThrow(() => saveYiyanImageClarity(100, blocked));
  assert.deepEqual(readYiyanCache(storage), card);
});

test("验证码核验成功后才登录，固定官方 HTTPS 地址且不把凭据放入 URL", async () => {
  const calls = [], cookie = "test-cookie";
  const client = new YiyanClient([], async (url, options) => {
    assert.equal(new URL(url).origin, "https://app.yiyan.art"); assert.equal(new URL(url).search, "");
    assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
    const path = new URL(url).pathname.split("/").pop(), body = new URLSearchParams(options.body);
    calls.push(path); assert.equal(body.get("v"), "5.20");
    if (path === "sendsmsverifycode") { assert.equal(body.get("pn"), phone); return response({}, 200, { "Set-Cookie": `JSESSIONID=${cookie}; HttpOnly` }); }
    assert.equal(options.headers.Cookie, `JSESSIONID=${cookie}`);
    if (path === "checksmsverifycode") { assert.equal(body.get("code"), code); return response({}); }
    if (path === "yiyanphonelogin") return response({ user: { uid: "10", username: "existing-user", pn: phone }, booklist: [] });
    return response({ textcardlist: [rawCard] });
  });
  await client.sendCode(phone); await client.signIn(phone, code); assert.deepEqual(await client.card(), card);
  assert.deepEqual(calls, ["sendsmsverifycode", "checksmsverifycode", "yiyanphonelogin", "gettodaycard"]);
});

test("验证码失败时停止，不会调用登录接口或泄露服务端原始错误", async () => {
  const calls = [];
  const client = new YiyanClient([], async url => { calls.push(url); return response({ errorcode: "3", errormsg: phone + code }, 400); });
  await assert.rejects(client.signIn(phone, code), error => error.status === 400 && !error.message.includes(phone) && !error.message.includes(code));
  assert.equal(calls.length, 1); assert.equal(calls[0].endsWith("checksmsverifycode"), true);
});

test("无效手机号或验证码不产生上游请求", async () => {
  const client = new YiyanClient([], () => { throw new Error("unexpected network"); });
  await assert.rejects(client.sendCode("wrong"), /手机号/);
  await assert.rejects(client.signIn(phone, "x"), /验证码/);
});

test("未确认原有账号或没有有效会话时拒绝登录", async () => {
  for (const user of [null, { uid: "1", username: "_yannewuser_" }, { uid: "1", username: "existing" }]) {
    const client = new YiyanClient([], async url => response(url.endsWith("yiyanphonelogin") ? { user } : {}));
    await assert.rejects(client.signIn(phone, code));
  }
});

test("手动换句排除当前图文，不重复返回候选中的旧项", async () => {
  let calls = 0;
  const nextRaw = { ...rawCard, textcardid: "102", content: "换句测试" };
  const client = new YiyanClient([["JSESSIONID", "test"]], async (_url, options) => {
    calls++; const body = new URLSearchParams(options.body);
    assert.match(body.get("datetime"), /^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    return response({ textcardlist: [rawCard, nextRaw] });
  });
  assert.equal((await client.card("101")).id, "102"); assert.equal(calls, 1);
});

test("只有旧句或没有公开图文时最多请求两次", async () => {
  let calls = 0;
  const client = new YiyanClient([], async () => { calls++; return response({ textcardlist: [rawCard] }); });
  assert.equal((await client.card("101")).id, "101"); assert.equal(calls, 2);
  const empty = new YiyanClient([], async () => { calls++; return response({ textcardlist: [{ ...rawCard, priv: "1" }] }); });
  await assert.rejects(empty.card(), /新句子/); assert.equal(calls, 4);
});

test("上游会话过期被识别为重新登录，不用其他语句服务兜底", async () => {
  let calls = 0;
  const client = new YiyanClient([], async url => { calls++; assert.equal(new URL(url).hostname, "app.yiyan.art"); return response({ errorcode: "3", errormsg: "请先登录" }, 400); });
  await assert.rejects(client.card(), error => error.status === 401 && /重新连接/.test(error.message)); assert.equal(calls, 1);
});

test("异常跳转、非 JSON 和超大响应停止请求", async () => {
  for (const fetcher of [async () => new Response("", { status: 302 }), async () => new Response("not-json"), async () => new Response("x".repeat(512 * 1024 + 1)), async () => { throw new Error(phone); }]) {
    const client = new YiyanClient([], fetcher); await assert.rejects(client.card(), error => !error.message.includes(phone));
  }
});

test("登录 Cookie 加密并限定序流用户、用途、有效期", () => {
  const token = sealYiyanSession(session, key);
  assert.equal(token.includes("test-session"), false);
  assert.deepEqual(openYiyanSession(token, key, "owner", "connected", 1900000000000), session);
  assert.equal(openYiyanSession(token, key, "partner", "connected", 1900000000000), null);
  assert.equal(openYiyanSession(token, key, "owner", "pending", 1900000000000), null);
  assert.equal(openYiyanSession(token, key, "owner", "connected", 2100000000000), null);
});

test("篡改 Cookie 或使用不同密钥都无法读取会话", () => {
  const token = sealYiyanSession(session, key), changed = (token[0] === "A" ? "B" : "A") + token.slice(1);
  assert.equal(openYiyanSession(changed, key, "owner", "connected"), null);
  assert.equal(openYiyanSession(token, yiyanKey("another-local-secret-which-is-long-enough"), "owner", "connected"), null);
});

test("验证码请求只保存手机号的带密钥摘要，拒绝非法上游 Cookie", () => {
  const pending = { ...session, kind: "pending", phoneHash: yiyanPhoneHash(phone, key) };
  assert.equal(pending.phoneHash.includes(phone), false);
  assert.deepEqual(openYiyanSession(sealYiyanSession(pending, key), key, "owner", "pending", 1900000000000), pending);
  assert.throws(() => sealYiyanSession({ ...session, cookies: [["JSESSIONID", "x\r\nInjected:yes"]] }, key));
  assert.throws(() => new YiyanClient([["bad;name", "value"]]));
  assert.throws(() => yiyanKey("short"));
});

test("Next 地址规范化后仍允许真实同源操作，拒绝跨源和协议变化", () => {
  const request = origin => new Request("http://localhost:3006/api/yiyan", { headers: { Host: "127.0.0.1:3006", ...(origin ? { Origin: origin } : {}) } });
  assert.equal(hasYiyanSameOrigin(request("http://127.0.0.1:3006")), true);
  for (const origin of [undefined, "https://example.com", "http://127.0.0.1:3007", "https://127.0.0.1:3006", "null", "http://127.0.0.1:3006/extra"]) assert.equal(hasYiyanSameOrigin(request(origin)), false);
});

test("仅本机开发预览允许不登录序流，生产和公开主机均不能绕过", () => {
  const local = new Request("http://localhost:3006/api/yiyan", { headers: { Host: "127.0.0.1:3006" } });
  assert.equal(isYiyanLocalPreview(local, "development"), true);
  assert.equal(isYiyanLocalPreview(local, "production"), false);
  assert.equal(isYiyanLocalPreview(new Request("http://localhost:3006/api/yiyan", { headers: { Host: "public.example.com" } }), "development"), false);
});
