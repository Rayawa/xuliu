"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { centsToYuanInput, formatCny, formatSignedCny, storedValueBalance, storedValueTotals, yuanToCents, type FinanceEntry, type StoredValueAccount } from "@/lib/finance";
import { submitFormOnEnter } from "./form-keyboard";

export function StoredValuePanel({ accounts, entries, month, readOnly, panelRef, onCreate, onEdit, onRecord, renderEntry }: {
  accounts: StoredValueAccount[];
  entries: FinanceEntry[];
  month: string;
  readOnly: boolean;
  panelRef: RefObject<HTMLDetailsElement | null>;
  onCreate: () => void;
  onEdit: (account: StoredValueAccount) => void;
  onRecord: (type: "topup" | "expense", accountId: string) => void;
  renderEntry: (entry: FinanceEntry, showDate?: boolean) => ReactNode;
}) {
  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
  const monthly = storedValueTotals(monthEntries);
  const balance = accounts.reduce((sum, account) => sum + storedValueBalance(account, entries), 0);
  return <details className="panel storedValuePanel" ref={panelRef}>
    <summary className="financeSectionTitle"><div><h2>储值</h2><span>{accounts.length} 个项目 · 本月实付 {formatCny(monthly.paidCents)} · 赠送 {formatCny(monthly.bonusCents)}</span></div><b>{balance < 0 ? formatSignedCny(balance) : formatCny(balance)}<small>总余额</small></b><i aria-hidden="true">⌄</i></summary>
    <div className="storedValueBody">
      <div className="storedValueToolbar"><p>充值不计入收支，实际消费时记支出。</p>{!readOnly && <button type="button" className="softButton" disabled={accounts.length >= 100} onClick={onCreate}>＋ 新建储值项目</button>}</div>
      {accounts.length ? <div className="storedValueAccounts">{accounts.map((account) => {
        const accountBalance = storedValueBalance(account, entries);
        const monthlyTotals = storedValueTotals(monthEntries, account.id);
        const records = monthEntries.filter((entry) => entry.storedValueAccountId === account.id).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
        return <article className="storedValueAccount" key={account.id}>
          <div className="storedValueAccountHead"><h3>{account.name}</h3>{!readOnly && <button type="button" className="textButton" aria-label={`编辑储值项目${account.name}`} onClick={() => onEdit(account)}>编辑</button>}</div>
          <strong className={accountBalance < 0 ? "dangerText" : ""}>{accountBalance < 0 ? formatSignedCny(accountBalance) : formatCny(accountBalance)}</strong><small>余额{accountBalance < 0 ? " · 请核对充值或起始余额" : ""}</small>
          <p>本月实付 {formatCny(monthlyTotals.paidCents)} · 赠送 {formatCny(monthlyTotals.bonusCents)}<br />已消费 {formatCny(monthlyTotals.spentCents)}</p>
          {!readOnly && <div className="storedValueActions"><button type="button" className="softButton" onClick={() => onRecord("topup", account.id)}>充值</button><button type="button" className="softButton" onClick={() => onRecord("expense", account.id)}>记消费</button></div>}
          {records.length > 0 && <details className="storedValueRecords"><summary>本月记录 · {records.length} 笔 <span>⌄</span></summary>{records.map((entry) => renderEntry(entry, true))}</details>}
        </article>;
      })}</div> : <div className="financeEmpty">还没有储值项目。</div>}
    </div>
  </details>;
}

export function StoredValueEditor({ account, existingNames, onSave, onClose }: {
  account: StoredValueAccount;
  existingNames: string[];
  onSave: (account: StoredValueAccount) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(account.name);
  const [opening, setOpening] = useState(centsToYuanInput(account.openingBalanceCents));
  const [error, setError] = useState("");
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="financeModal storedValueDialog" onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="stored-value-title">
    <form onKeyDown={submitFormOnEnter} onSubmit={(event) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) { setError("请填写项目名称"); return; }
      if (existingNames.some((value) => value.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) { setError("已经有同名储值项目"); return; }
      const openingBalanceCents = !opening.trim() || /^0(?:\.0{1,2})?$/.test(opening.trim()) ? 0 : yuanToCents(opening);
      if (!openingBalanceCents && opening.trim() && !/^0(?:\.0{1,2})?$/.test(opening.trim())) { setError("起始余额应为 0 或有效金额"); return; }
      onSave({ ...account, name: trimmed, openingBalanceCents });
    }}>
      <div className="financeModalHead"><h2 id="stored-value-title">{account.name ? "编辑储值项目" : "新建储值项目"}</h2><button type="button" aria-label="关闭储值项目设置" onClick={onClose}>×</button></div>
      <div className="financeFormGrid"><label className="wide"><span>项目名称</span><input autoFocus value={name} maxLength={40} placeholder="例如：校园卡、咖啡卡" onChange={(event) => { setName(event.target.value); setError(""); }} /></label><label className="wide"><span>起始余额</span><input aria-label="起始余额" aria-describedby="stored-balance-help" inputMode="decimal" value={opening} onChange={(event) => { setOpening(event.target.value); setError(""); }} /><small id="stored-balance-help">只填写还没记录充值的历史余额，避免重复计算。</small></label></div>
      {error && <p className="financeFormError" role="alert">{error}</p>}
      <div className="financeModalActions"><button type="button" className="softButton" onClick={onClose}>取消</button><button type="submit" className="primaryButton">保存项目</button></div>
    </form>
  </dialog>;
}
