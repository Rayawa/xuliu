import { YiyanError, YiyanUnconfirmedError } from "./yiyan-service.ts";

export type YiyanReceipt = { fingerprint: string; state: "pending" | "done"; result?: unknown };
export type YiyanReceiptStore = {
  get(key: string): Promise<YiyanReceipt | null>;
  claim(key: string, receipt: YiyanReceipt): Promise<boolean>;
  save(key: string, receipt: YiyanReceipt): Promise<void>;
  remove(key: string): Promise<void>;
};

export async function runYiyanOperation(store: YiyanReceiptStore, key: string, fingerprint: string, write: () => Promise<unknown>, reconcile?: () => Promise<unknown | null>, checkOnly = false): Promise<unknown> {
  const confirm = async () => {
    if (!reconcile) return null;
    try {
      const result = await reconcile();
      if (result == null) return null;
      await store.save(key, { fingerprint, state: "done", result });
      return result;
    } catch (error) { if (error instanceof YiyanError && error.status === 401) throw error; return null; }
  };
  const previous = await store.get(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new YiyanError("操作编号已使用，请重新打开文集", 409);
    if (previous.state === "done") return previous.result;
    const result = await confirm();
    if (result != null) return result;
    throw new YiyanUnconfirmedError();
  }
  if (checkOnly) { const result = await confirm(); if (result != null) return result; throw new YiyanUnconfirmedError(); }
  if (!await store.claim(key, { fingerprint, state: "pending" })) throw new YiyanError("操作正在处理，请稍后刷新文集", 409);
  try {
    const result = await write();
    await store.save(key, { fingerprint, state: "done", result });
    return result;
  } catch (error) {
    if (error instanceof YiyanError && !(error instanceof YiyanUnconfirmedError) && error.status >= 400 && error.status < 500) { await store.remove(key); throw error; }
    const result = await confirm();
    if (result != null) return result;
    throw new YiyanUnconfirmedError();
  }
}
