"use client";

import { useMemo, useRef, useState } from "react";
import {
  budgetInputToCents,
  centsToYuanInput,
  expenseByCategory,
  financeCsv,
  financeSummary,
  formatCny,
  formatSignedCny,
  isValidLocalDate,
  isValidLocalTime,
  localDateKey,
  localTimeKey,
  monthKey,
  recentMonthKeys,
  yuanToCents,
  defaultExpenseCategories,
  defaultIncomeCategories,
  type FinanceEntry,
  type FinanceEntryType,
  type FinanceState,
} from "@/lib/finance";
import { categoryGlyphs, merchantFromEntry, transactionCategoryKey } from "@/lib/finance-categories";
import { mergeWeChatBillEntries, readWeChatBillFile, recategorizeWeChatMonth, type WeChatBillImport } from "@/lib/wechat-bill-import";

type FinanceViewProps = {
  finance: FinanceState;
  readOnly: boolean;
  projectOptions: string[];
  onChange: (updater: (current: FinanceState) => FinanceState) => void;
  getWorkspaceBytes: () => number;
};

type EditorState = {
  mode: "create" | "edit";
  entry: FinanceEntry;
};

const uid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);

function blankEntry(type: FinanceEntryType): FinanceEntry {
  const now = new Date().toISOString();
  return {
    id: uid(),
    type,
    amountCents: 0,
    category: type === "income" ? "其他收入" : "餐饮",
    date: localDateKey(),
    time: localTimeKey(),
    note: "",
    relatedProject: "",
    createdAt: now,
    updatedAt: now,
    origin: "manual",
  };
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
}

export default function FinanceView({ finance, readOnly, projectOptions, onChange, getWorkspaceBytes }: FinanceViewProps) {
  const wechatFileInput = useRef<HTMLInputElement>(null);
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [typeFilter, setTypeFilter] = useState<"all" | FinanceEntryType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<FinanceEntry | null>(null);
  const [pendingRecategorize, setPendingRecategorize] = useState<{ month: string; count: number } | null>(null);
  const [formError, setFormError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [pendingImport, setPendingImport] = useState<{ fileName: string; result: WeChatBillImport; added: number; duplicates: number; recategorized: number; projectedBytes: number; previewEntries: FinanceEntry[] } | null>(null);
  const [reclassifyDuplicates, setReclassifyDuplicates] = useState(false);

  const monthEntries = useMemo(
    () => finance.entries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [finance.entries, selectedMonth],
  );
  const summary = useMemo(() => financeSummary(finance.entries, selectedMonth), [finance.entries, selectedMonth]);
  const categoryTotals = useMemo(() => expenseByCategory(finance.entries, selectedMonth), [finance.entries, selectedMonth]);
  const expenseEntriesByCategory = useMemo(() => monthEntries
    .filter((entry) => entry.type === "expense")
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .reduce<Record<string, FinanceEntry[]>>((groups, entry) => {
      (groups[entry.category] ??= []).push(entry);
      return groups;
    }, {}), [monthEntries]);
  const currentBudget = finance.budgets[selectedMonth] ?? { totalCents: 0, categoryCents: {} };
  const budgetRemaining = currentBudget.totalCents - summary.expenseCents;
  const budgetRate = currentBudget.totalCents ? Math.round(summary.expenseCents / currentBudget.totalCents * 100) : 0;
  const allCategories = [...new Set([...finance.expenseCategories, ...finance.incomeCategories])];
  const categoryChoices = editor ? editor.entry.type === "income" ? defaultIncomeCategories : defaultExpenseCategories : [];
  const filteredEntries = monthEntries
    .filter((entry) => typeFilter === "all" || entry.type === typeFilter)
    .filter((entry) => categoryFilter === "all" || entry.category === categoryFilter)
    .filter((entry) => !query.trim() || [entry.note, entry.category, entry.relatedProject].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.updatedAt.localeCompare(a.updatedAt));
  const entriesByDay = filteredEntries.reduce<Record<string, FinanceEntry[]>>((groups, entry) => {
    (groups[entry.date] ??= []).push(entry);
    return groups;
  }, {});
  const monthSeries = recentMonthKeys(6).map((month) => ({ month, ...financeSummary(finance.entries, month) }));
  const trendMax = Math.max(1, ...monthSeries.flatMap((item) => [item.incomeCents, item.expenseCents]));
  const reclassifiableCount = useMemo(() => recategorizeWeChatMonth(finance, selectedMonth).changed, [finance, selectedMonth]);

  const openCreate = (type: FinanceEntryType) => {
    const entry = blankEntry(type);
    setEditor({ mode: "create", entry });
    setAmountInput("");
    setFormError("");
  };

  const openEdit = (entry: FinanceEntry) => {
    setEditor({ mode: "edit", entry: { ...entry } });
    setAmountInput(centsToYuanInput(entry.amountCents));
    setFormError("");
  };

  const patchEditor = (patch: Partial<FinanceEntry>) => {
    setEditor((current) => current ? { ...current, entry: { ...current.entry, ...patch } } : current);
  };

  const saveEntry = () => {
    if (!editor) return;
    const amountCents = yuanToCents(amountInput);
    if (!amountCents) {
      setFormError("请输入大于 0 的金额");
      return;
    }
    const category = editor.entry.category.trim();
    if (!category) {
      setFormError("请填写分类");
      return;
    }
    if (!isValidLocalDate(editor.entry.date)) {
      setFormError("请选择有效日期");
      return;
    }
    if (!isValidLocalTime(editor.entry.time)) {
      setFormError("请选择有效时间");
      return;
    }
    const original = finance.entries.find((entry) => entry.id === editor.entry.id);
    const merchant = editor.entry.origin === "wechat" ? merchantFromEntry(editor.entry.note, editor.entry.merchant).slice(0, 200) : "";
    const learnMerchant = Boolean(original && merchant && original.category !== category && merchant !== "微信支付");
    const nextEntry = { ...editor.entry, amountCents, category, updatedAt: new Date().toISOString(), ...(merchant ? { merchant } : {}) };
    onChange((current) => {
      const exists = current.entries.some((entry) => entry.id === nextEntry.id);
      const categoryKey = nextEntry.type === "income" ? "incomeCategories" : "expenseCategories";
      return {
        ...current,
        entries: exists ? current.entries.map((entry) => entry.id === nextEntry.id ? nextEntry : entry) : [nextEntry, ...current.entries],
        [categoryKey]: [...new Set([...current[categoryKey], category])],
        merchantCategories: learnMerchant ? { ...current.merchantCategories, [transactionCategoryKey(nextEntry.type, merchant, nextEntry.note)]: category } : current.merchantCategories,
      };
    });
    setEditor(null);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onChange((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== pendingDelete.id) }));
    setPendingDelete(null);
  };

  const confirmRecategorize = () => {
    if (!pendingRecategorize || readOnly) return;
    const { month } = pendingRecategorize;
    onChange((current) => recategorizeWeChatMonth(current, month).finance);
    setPendingRecategorize(null);
    setImportNotice(`已重新识别 ${monthLabel(month)}的微信账单分类，正在自动保存。`);
  };

  const updateBudget = (patch: { totalCents?: number; category?: string; categoryCents?: number }) => {
    onChange((current) => {
      const previous = current.budgets[selectedMonth] ?? { totalCents: 0, categoryCents: {} };
      const next = {
        totalCents: patch.totalCents ?? previous.totalCents,
        categoryCents: patch.category ? { ...previous.categoryCents, [patch.category]: patch.categoryCents ?? 0 } : previous.categoryCents,
      };
      return { ...current, budgets: { ...current.budgets, [selectedMonth]: next } };
    });
  };

  const commitBudget = (input: HTMLInputElement, previousCents: number, patch: { category?: string }) => {
    const parsed = budgetInputToCents(input.value);
    if (parsed === null) {
      input.value = previousCents ? centsToYuanInput(previousCents) : "";
      setBudgetError("预算请输入大于 0、最多两位小数的金额；留空可清除预算。");
      return;
    }
    setBudgetError("");
    if (patch.category) updateBudget({ category: patch.category, categoryCents: parsed });
    else updateBudget({ totalCents: parsed });
  };

  const exportLedger = () => {
    const blob = new Blob([financeCsv(filteredEntries)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `序流记账-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const chooseWeChatBill = async (file: File | undefined) => {
    if (!file || readOnly) return;
    setImportBusy(true);
    setImportError("");
    setImportNotice("");
    try {
      const result = await readWeChatBillFile(file);
      const merged = mergeWeChatBillEntries(finance, result.entries);
      const recategorized = mergeWeChatBillEntries(finance, result.entries, { updateExistingCategories: true }).recategorized;
      const addedEntries = merged.finance.entries.slice(0, merged.added);
      const projectedBytes = getWorkspaceBytes() + new Blob([JSON.stringify(addedEntries)]).size + 4_000;
      setPendingImport({ fileName: file.name, result, added: merged.added, duplicates: merged.duplicates, recategorized, projectedBytes, previewEntries: addedEntries.slice(0, 5) });
      setReclassifyDuplicates(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "账单读取失败，请检查文件格式后重试。");
    } finally {
      setImportBusy(false);
    }
  };

  const confirmWeChatImport = () => {
    if (!pendingImport || readOnly) return;
    const updated = reclassifyDuplicates ? mergeWeChatBillEntries(finance, pendingImport.result.entries, { updateExistingCategories: true }).recategorized : 0;
    if (!pendingImport.added && !updated) return;
    if (pendingImport.projectedBytes > 1_900_000) {
      setImportError("导入后会超过当前空间的云端保存容量，请换用较短日期范围的账单。");
      return;
    }
    const { added, result } = pendingImport;
    onChange((current) => mergeWeChatBillEntries(current, result.entries, { updateExistingCategories: reclassifyDuplicates }).finance);
    const latestDate = result.entries.reduce((latest, entry) => entry.date > latest ? entry.date : latest, "");
    if (latestDate) setSelectedMonth(latestDate.slice(0, 7));
    setTypeFilter("all");
    setCategoryFilter("all");
    setQuery("");
    setPendingImport(null);
    setImportNotice(`已添加 ${added} 笔${updated ? `，更新 ${updated} 笔分类` : ""}，正在自动保存。`);
  };

  const renderEntry = (entry: FinanceEntry, showDate = false) => <article className="ledgerRow" key={entry.id}>
    <span className={`ledgerType ${entry.type}`}>{categoryGlyphs[entry.category] || (entry.type === "income" ? "收" : "记")}</span>
    <div className="ledgerMain"><strong>{entry.note || entry.category}</strong><span>{showDate ? `${entry.date} · ` : ""}{entry.category}{entry.relatedProject ? ` · ${entry.relatedProject}` : ""}{entry.origin === "wechat" ? " · 微信" : ""}</span></div>
    <time>{entry.time}</time>
    <b className={entry.type === "income" ? "incomeText" : "expenseText"}>{entry.type === "income" ? "+" : "−"}{formatCny(entry.amountCents)}</b>
    {!readOnly && <div className="ledgerActions"><button onClick={() => openEdit(entry)} aria-label={`编辑${entry.note || entry.category}`}>编辑</button><button className="dangerText" onClick={() => setPendingDelete(entry)} aria-label={`删除${entry.note || entry.category}`}>删除</button></div>}
  </article>;

  return <div className="page financePage">
    <div className="pageHead financeHead">
      <div><div className="eyebrow">个人记账</div><h1>记账</h1></div>
      <div className="financeHeadActions">
        <label className="monthPicker"><span>查看月份</span><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || monthKey())} /></label>
        {!readOnly && <><input ref={wechatFileInput} className="financeFileInput" type="file" accept=".xlsx,.csv" aria-label="选择微信账单文件" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void chooseWeChatBill(file); }} /><button className="softButton" disabled={importBusy} onClick={() => wechatFileInput.current?.click()}>{importBusy ? "正在读取账单…" : "导入微信账单"}</button></>}
        {!readOnly && <button className="softButton expenseAction" onClick={() => openCreate("expense")}>− 记支出</button>}
        {!readOnly && <button className="primaryButton" onClick={() => openCreate("income")}>＋ 记收入</button>}
      </div>
    </div>
    {importError && <p className="financeImportMessage error" role="alert">{importError}</p>}
    {importNotice && <p className="financeImportMessage" role="status">{importNotice}</p>}

    <section className="panel financeOverview" aria-label={`${monthLabel(selectedMonth)}收支概览`}>
      <div className="financeOverviewPrimary"><span>{monthLabel(selectedMonth)} · 总支出</span><strong className="expenseText">{formatCny(summary.expenseCents)}</strong><small>{monthEntries.filter((entry) => entry.type === "expense").length} 笔支出</small></div>
      <div className="financeOverviewSecondary"><div><span>总收入</span><b className="incomeText">{formatCny(summary.incomeCents)}</b></div><div><span>结余</span><b>{formatSignedCny(summary.netCents)}</b></div></div>
    </section>

    <details className="financeDetails">
      <summary><span>查看统计详情</span><small>{currentBudget.totalCents ? `预算剩余 ${formatSignedCny(budgetRemaining)}` : "趋势与预算"}</small><b aria-hidden="true">⌄</b></summary>
    <div className="financeInsightGrid">
      <section className="panel financeChartPanel">
        <div className="sectionHead"><div><h2>近六个月趋势</h2><p>收入与支出按月对照</p></div><div className="financeLegend"><span className="incomeDot" />收入<span className="expenseDot" />支出</div></div>
        <div className="trendChart">{monthSeries.map((item) => <div className="trendColumn" key={item.month}>
          <div className="trendBars" title={`${item.month}：收入 ${formatCny(item.incomeCents)}，支出 ${formatCny(item.expenseCents)}`}><i className="incomeBar" style={{ height: `${Math.max(3, item.incomeCents / trendMax * 100)}%` }} /><i className="expenseBar" style={{ height: `${Math.max(3, item.expenseCents / trendMax * 100)}%` }} /></div>
          <span>{Number(item.month.slice(5))}月</span>
        </div>)}</div>
      </section>

    </div>

    <section className="panel budgetPanel">
      <div className="sectionHead"><div><h2>月度预算</h2><p>总预算与分类预算互不重复计算，用来观察不同层级的使用进度。</p></div><span className="countChip">{budgetRate}%</span></div>
      <div className="totalBudgetRow">
        <label><span>本月总预算</span><div><b>¥</b><input key={`total-${selectedMonth}-${currentBudget.totalCents}`} disabled={readOnly} inputMode="decimal" defaultValue={currentBudget.totalCents ? centsToYuanInput(currentBudget.totalCents) : ""} placeholder="例如 3000" onBlur={(event) => commitBudget(event.currentTarget, currentBudget.totalCents, {})} /></div></label>
        <div className="budgetTrack"><i><b style={{ width: `${Math.min(100, budgetRate)}%` }} /></i><span>{currentBudget.totalCents ? `${formatCny(summary.expenseCents)} / ${formatCny(currentBudget.totalCents)}` : "设置预算后显示进度"}</span></div>
      </div>
      {budgetError && <p className="financeFormError" role="alert">{budgetError}</p>}
      <div className="categoryBudgetGrid">{finance.expenseCategories.map((category) => {
        const spent = categoryTotals.find((item) => item.category === category)?.amountCents ?? 0;
        const budget = currentBudget.categoryCents[category] ?? 0;
        const rate = budget ? Math.round(spent / budget * 100) : 0;
        return <label key={category}><span>{category}<small>{spent ? `已用 ${formatCny(spent)}` : "暂无支出"}</small></span><div><b>¥</b><input key={`${selectedMonth}-${category}-${budget}`} disabled={readOnly} inputMode="decimal" defaultValue={budget ? centsToYuanInput(budget) : ""} placeholder="分类预算" onBlur={(event) => commitBudget(event.currentTarget, budget, { category })} /></div>{budget > 0 && <i><b style={{ width: `${Math.min(100, rate)}%` }} /></i>}</label>;
      })}</div>
    </section>

    </details>

    <section className="panel financeCategoryPanel" aria-label="支出分类">
      <div className="financeSectionTitle"><div><h2>支出分类</h2><span>{categoryTotals.length} 类 · 点开查看每笔支出</span></div></div>
      {categoryTotals.length ? <div className="financeCategoryList">{categoryTotals.map((item) => <details className="financeCategoryItem" key={item.category}>
        <summary><span className="financeCategoryGlyph">{categoryGlyphs[item.category] || "记"}</span><span className="financeCategoryName"><strong>{item.category}</strong><small>{expenseEntriesByCategory[item.category]?.length ?? 0} 笔 · {Math.round(item.amountCents / summary.expenseCents * 100)}%</small></span><b>{formatCny(item.amountCents)}</b><i aria-hidden="true">⌄</i></summary>
        <div className="financeCategoryTransactions">{expenseEntriesByCategory[item.category]?.map((entry) => renderEntry(entry, true))}</div>
      </details>)}</div> : <div className="financeEmpty">本月还没有支出记录。</div>}
    </section>

    <section className="panel ledgerPanel">
      <div className="ledgerToolbar">
        <div><h2>每日收支</h2><p>每天只显示支出合计，点开查看当日记录</p></div>
        {!readOnly && reclassifiableCount > 0 && <button className="softButton" onClick={() => setPendingRecategorize({ month: selectedMonth, count: reclassifiableCount })}>更新本月微信分类 · {reclassifiableCount} 笔</button>}
      </div>
      <details className="ledgerTools"><summary>搜索、筛选与导出 <span>⌄</span></summary><div className="ledgerFilters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索备注、分类或项目" />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | FinanceEntryType)}><option value="all">全部类型</option><option value="expense">支出</option><option value="income">收入</option></select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">全部分类</option>{allCategories.map((category) => <option key={category}>{category}</option>)}</select>
        <button className="softButton" onClick={exportLedger}>导出</button>
      </div></details>
      <div className="ledgerList">{Object.entries(entriesByDay).map(([day, entries]) => <details className="ledgerDay" key={day}>
        <summary className="ledgerDayHead"><span><strong>{dayLabel(day)}</strong><small>{entries.length} 笔</small></span><b className="expenseText">支出 {formatCny(entries.reduce((total, entry) => total + (entry.type === "expense" ? entry.amountCents : 0), 0))}</b><i aria-hidden="true">⌄</i></summary>
        <div className="ledgerDayRows">{entries.map((entry) => renderEntry(entry))}</div>
      </details>)}{!filteredEntries.length && <div className="financeEmpty ledgerEmpty"><strong>没有符合条件的记录</strong><span>调整筛选，或添加一笔收支。</span></div>}</div>
    </section>

    {pendingRecategorize && <div className="financeModalScrim"><section className="financeModal compact" role="alertdialog" aria-modal="true" aria-labelledby="finance-recategorize-title">
      <div className="financeModalHead"><div><span>WECHAT BILL</span><h2 id="finance-recategorize-title">更新本月分类？</h2></div></div>
      <p className="deleteDescription">按新的识别规则更新 {pendingRecategorize.count} 笔微信记录的分类。金额、日期和备注保持不变；已记住的商户分类优先保留。</p>
      <div className="financeModalActions"><button className="softButton" onClick={() => setPendingRecategorize(null)}>取消</button><button className="primaryButton" onClick={confirmRecategorize}>确认更新</button></div>
    </section></div>}

    {pendingImport && <div className="financeModalScrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPendingImport(null); }}><section className="financeModal financeImportModal" role="dialog" aria-modal="true" aria-labelledby="finance-import-title">
      <div className="financeModalHead"><div><span>WECHAT BILL</span><h2 id="finance-import-title">确认导入微信账单</h2></div><button aria-label="关闭" onClick={() => setPendingImport(null)}>×</button></div>
      <p className="financeImportIntro">{pendingImport.fileName} · 文件仅在本机浏览器解析。确认后，新记录会随当前空间自动保存。</p>
      <div className="financeImportStats"><div><strong>{pendingImport.added}</strong><span>待新增</span></div><div><strong>{pendingImport.duplicates + pendingImport.result.skippedDuplicate}</strong><span>重复跳过</span></div><div><strong>{pendingImport.result.skippedNeutral}</strong><span>非收支</span></div><div><strong>{pendingImport.result.skippedUnsuccessful + pendingImport.result.skippedInvalid}</strong><span>失败或无效</span></div></div>
      <p className="financeImportHint">按交易单号去重；重复导入同一账单不会重复记账。分类可在导入后逐笔编辑。</p>
      {pendingImport.recategorized > 0 && <label className="financeImportReclassify"><input type="checkbox" checked={reclassifyDuplicates} onChange={(event) => setReclassifyDuplicates(event.target.checked)} /><span>同时更新已导入记录的分类（{pendingImport.recategorized} 笔）<small>会覆盖这些记录此前手动选择的分类，不修改金额和备注。</small></span></label>}
      {pendingImport.added > 0 && <div className="financeImportPreview"><strong>记录预览</strong>{pendingImport.previewEntries.map((entry) => <div key={entry.id}><span>{entry.date} · {entry.category} · {entry.note}</span><b className={entry.type === "income" ? "incomeText" : "expenseText"}>{entry.type === "income" ? "+" : "−"}{formatCny(entry.amountCents)}</b></div>)}</div>}
      {!pendingImport.added && <p className="financeImportHint">没有需要新增的收支记录。{pendingImport.recategorized ? "可勾选上方选项更新旧分类。" : ""}</p>}
      {pendingImport.projectedBytes > 1_900_000 && <p className="financeFormError" role="alert">导入后会超过当前空间的云端保存容量，请换用较短日期范围的账单。</p>}
      <div className="financeModalActions"><button className="softButton" onClick={() => setPendingImport(null)}>取消</button><button className="primaryButton" disabled={(!pendingImport.added && !(reclassifyDuplicates && pendingImport.recategorized)) || pendingImport.projectedBytes > 1_900_000} onClick={confirmWeChatImport}>确认{pendingImport.added ? `导入 ${pendingImport.added} 笔` : `更新 ${pendingImport.recategorized} 笔`}</button></div>
    </section></div>}

    {editor && <div className="financeModalScrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditor(null); }}><section className="financeModal" role="dialog" aria-modal="true" aria-labelledby="finance-editor-title">
      <div className="financeModalHead"><div><span>{editor.entry.type === "income" ? "INCOME" : "EXPENSE"}</span><h2 id="finance-editor-title">{editor.mode === "edit" ? "编辑记录" : editor.entry.type === "income" ? "记录一笔收入" : "记录一笔支出"}</h2></div><button aria-label="关闭" onClick={() => setEditor(null)}>×</button></div>
      <div className="entryTypeSwitch"><button className={editor.entry.type === "expense" ? "active expense" : ""} onClick={() => patchEditor({ type: "expense", category: finance.expenseCategories[0] || "其他" })}>支出</button><button className={editor.entry.type === "income" ? "active income" : ""} onClick={() => patchEditor({ type: "income", category: finance.incomeCategories[0] || "其他收入" })}>收入</button></div>
      <label className="amountField"><span>金额</span><div><b>¥</b><input autoFocus inputMode="decimal" value={amountInput} placeholder="0.00" onChange={(event) => setAmountInput(event.target.value)} /></div></label>
      <div className="financeCategorySection"><span>分类</span><div className="financeCategoryChoices" role="group" aria-label="选择分类">{categoryChoices.map((category) => <button key={category} type="button" className={editor.entry.category === category ? "active" : ""} aria-pressed={editor.entry.category === category} onClick={() => patchEditor({ category })}><i>{categoryGlyphs[category] || "记"}</i>{category}</button>)}</div><label>自定义分类<input value={editor.entry.category} maxLength={40} onChange={(event) => patchEditor({ category: event.target.value })} placeholder="输入或点选上方分类" /></label>{editor.entry.origin === "wechat" && <small>修改分类后，之后导入同一商户的记录会优先使用你的选择。</small>}</div>
      <div className="financeFormGrid">
        <label><span>日期</span><input type="date" value={editor.entry.date} onChange={(event) => patchEditor({ date: event.target.value })} /></label>
        <label><span>时间</span><input type="time" value={editor.entry.time} onChange={(event) => patchEditor({ time: event.target.value })} /></label>
        <label className="wide"><span>备注</span><input value={editor.entry.note} placeholder="这笔钱用在了哪里？" onChange={(event) => patchEditor({ note: event.target.value })} /></label>
        <label className="wide"><span>关联项目（可选）</span><input list="finance-projects" value={editor.entry.relatedProject} placeholder="课程、研究或任务" onChange={(event) => patchEditor({ relatedProject: event.target.value })} /><datalist id="finance-projects">{projectOptions.map((project) => <option key={project} value={project} />)}</datalist></label>
      </div>
      {formError && <p className="financeFormError">{formError}</p>}
      <div className="financeModalActions"><button className="softButton" onClick={() => setEditor(null)}>取消</button><button className="primaryButton" onClick={saveEntry}>保存记录</button></div>
    </section></div>}

    {pendingDelete && <div className="financeModalScrim"><section className="financeModal compact" role="alertdialog" aria-modal="true" aria-labelledby="finance-delete-title"><div className="financeModalHead"><div><span>REMOVE</span><h2 id="finance-delete-title">删除这笔记录？</h2></div></div><p className="deleteDescription">{pendingDelete.date} {pendingDelete.time} · {pendingDelete.category} · {formatCny(pendingDelete.amountCents)}。删除后会立即影响统计与预算进度。</p><div className="financeModalActions"><button className="softButton" onClick={() => setPendingDelete(null)}>取消</button><button className="dangerButton" onClick={confirmDelete}>确认删除</button></div></section></div>}
  </div>;
}
