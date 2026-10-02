"use client";

import { useMemo, useState } from "react";
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
  type FinanceEntry,
  type FinanceEntryType,
  type FinanceState,
} from "@/lib/finance";

type FinanceViewProps = {
  finance: FinanceState;
  readOnly: boolean;
  projectOptions: string[];
  onChange: (updater: (current: FinanceState) => FinanceState) => void;
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

export default function FinanceView({ finance, readOnly, projectOptions, onChange }: FinanceViewProps) {
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [typeFilter, setTypeFilter] = useState<"all" | FinanceEntryType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<FinanceEntry | null>(null);
  const [formError, setFormError] = useState("");
  const [budgetError, setBudgetError] = useState("");

  const monthEntries = useMemo(
    () => finance.entries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [finance.entries, selectedMonth],
  );
  const summary = useMemo(() => financeSummary(finance.entries, selectedMonth), [finance.entries, selectedMonth]);
  const categoryTotals = useMemo(() => expenseByCategory(finance.entries, selectedMonth), [finance.entries, selectedMonth]);
  const currentBudget = finance.budgets[selectedMonth] ?? { totalCents: 0, categoryCents: {} };
  const budgetRemaining = currentBudget.totalCents - summary.expenseCents;
  const budgetRate = currentBudget.totalCents ? Math.round(summary.expenseCents / currentBudget.totalCents * 100) : 0;
  const allCategories = [...new Set([...finance.expenseCategories, ...finance.incomeCategories])];
  const filteredEntries = monthEntries
    .filter((entry) => typeFilter === "all" || entry.type === typeFilter)
    .filter((entry) => categoryFilter === "all" || entry.category === categoryFilter)
    .filter((entry) => !query.trim() || [entry.note, entry.category, entry.relatedProject].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.updatedAt.localeCompare(a.updatedAt));
  const monthSeries = recentMonthKeys(6).map((month) => ({ month, ...financeSummary(finance.entries, month) }));
  const trendMax = Math.max(1, ...monthSeries.flatMap((item) => [item.incomeCents, item.expenseCents]));

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
    const nextEntry = { ...editor.entry, amountCents, category, updatedAt: new Date().toISOString() };
    onChange((current) => {
      const exists = current.entries.some((entry) => entry.id === nextEntry.id);
      const categoryKey = nextEntry.type === "income" ? "incomeCategories" : "expenseCategories";
      return {
        ...current,
        entries: exists ? current.entries.map((entry) => entry.id === nextEntry.id ? nextEntry : entry) : [nextEntry, ...current.entries],
        [categoryKey]: [...new Set([...current[categoryKey], category])],
      };
    });
    setEditor(null);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onChange((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== pendingDelete.id) }));
    setPendingDelete(null);
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

  return <div className="page financePage">
    <div className="pageHead financeHead">
      <div><div className="eyebrow">个人记账 · 人民币</div><h1>把每一笔，放回生活里。</h1><p>收入、支出、预算与项目关系集中记录；当前空间自动保存并同步。</p></div>
      <div className="financeHeadActions">
        <label className="monthPicker"><span>查看月份</span><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || monthKey())} /></label>
        <button className="softButton" onClick={exportLedger}>导出筛选结果</button>
        {!readOnly && <button className="softButton expenseAction" onClick={() => openCreate("expense")}>− 记支出</button>}
        {!readOnly && <button className="primaryButton" onClick={() => openCreate("income")}>＋ 记收入</button>}
      </div>
    </div>

    <section className="financeSummaryGrid" aria-label={`${monthLabel(selectedMonth)}收支概览`}>
      <article><span>本月收入</span><strong className="incomeText">{formatCny(summary.incomeCents)}</strong><small>{monthEntries.filter((entry) => entry.type === "income").length} 笔收入</small></article>
      <article><span>本月支出</span><strong className="expenseText">{formatCny(summary.expenseCents)}</strong><small>{monthEntries.filter((entry) => entry.type === "expense").length} 笔支出</small></article>
      <article><span>本月结余</span><strong>{formatSignedCny(summary.netCents)}</strong><small>{summary.netCents >= 0 ? "收支保持正向" : "支出超过收入"}</small></article>
      <article className={budgetRemaining < 0 ? "overBudget" : ""}><span>预算剩余</span><strong>{currentBudget.totalCents ? formatSignedCny(budgetRemaining) : "未设置"}</strong><small>{currentBudget.totalCents ? `已使用 ${budgetRate}%` : "在预算面板中设置"}</small></article>
    </section>

    <div className="financeInsightGrid">
      <section className="panel financeChartPanel">
        <div className="sectionHead"><div><h2>近六个月趋势</h2><p>收入与支出按月对照</p></div><div className="financeLegend"><span className="incomeDot" />收入<span className="expenseDot" />支出</div></div>
        <div className="trendChart">{monthSeries.map((item) => <div className="trendColumn" key={item.month}>
          <div className="trendBars" title={`${item.month}：收入 ${formatCny(item.incomeCents)}，支出 ${formatCny(item.expenseCents)}`}><i className="incomeBar" style={{ height: `${Math.max(3, item.incomeCents / trendMax * 100)}%` }} /><i className="expenseBar" style={{ height: `${Math.max(3, item.expenseCents / trendMax * 100)}%` }} /></div>
          <span>{Number(item.month.slice(5))}月</span>
        </div>)}</div>
      </section>

      <section className="panel financeChartPanel categoryPanel">
        <div className="sectionHead"><div><h2>支出分类</h2><p>{monthLabel(selectedMonth)}的主要去向</p></div><span className="countChip">{categoryTotals.length} 类</span></div>
        <div className="categoryBars">{categoryTotals.length ? categoryTotals.slice(0, 6).map((item) => <div key={item.category}>
          <span>{item.category}</span><i><b style={{ width: `${Math.max(4, item.amountCents / Math.max(1, summary.expenseCents) * 100)}%` }} /></i><strong>{Math.round(item.amountCents / Math.max(1, summary.expenseCents) * 100)}% · {formatCny(item.amountCents)}</strong>
        </div>) : <div className="financeEmpty">本月还没有支出记录。</div>}</div>
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

    <section className="panel ledgerPanel">
      <div className="ledgerToolbar">
        <div><h2>收支明细</h2><p>{filteredEntries.length} 笔记录</p></div>
        <div className="ledgerFilters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索备注、分类或项目" />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | FinanceEntryType)}><option value="all">全部类型</option><option value="expense">支出</option><option value="income">收入</option></select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">全部分类</option>{allCategories.map((category) => <option key={category}>{category}</option>)}</select>
        </div>
      </div>
      <div className="ledgerList">{filteredEntries.map((entry) => <article className="ledgerRow" key={entry.id}>
        <span className={`ledgerType ${entry.type}`}>{entry.type === "income" ? "收" : "支"}</span>
        <div className="ledgerMain"><strong>{entry.note || entry.category}</strong><span>{entry.category}{entry.relatedProject ? ` · ${entry.relatedProject}` : ""}</span></div>
        <time>{entry.date}<br />{entry.time}</time>
        <b className={entry.type === "income" ? "incomeText" : "expenseText"}>{entry.type === "income" ? "+" : "−"}{formatCny(entry.amountCents)}</b>
        {!readOnly && <div className="ledgerActions"><button onClick={() => openEdit(entry)}>编辑</button><button className="dangerText" onClick={() => setPendingDelete(entry)}>删除</button></div>}
      </article>)}{!filteredEntries.length && <div className="financeEmpty ledgerEmpty"><strong>没有符合条件的记录</strong><span>调整筛选，或从右上角记一笔新的收支。</span></div>}</div>
    </section>

    {editor && <div className="financeModalScrim" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditor(null); }}><section className="financeModal" role="dialog" aria-modal="true" aria-labelledby="finance-editor-title">
      <div className="financeModalHead"><div><span>{editor.entry.type === "income" ? "INCOME" : "EXPENSE"}</span><h2 id="finance-editor-title">{editor.mode === "edit" ? "编辑记录" : editor.entry.type === "income" ? "记录一笔收入" : "记录一笔支出"}</h2></div><button aria-label="关闭" onClick={() => setEditor(null)}>×</button></div>
      <div className="entryTypeSwitch"><button className={editor.entry.type === "expense" ? "active expense" : ""} onClick={() => patchEditor({ type: "expense", category: finance.expenseCategories[0] || "其他" })}>支出</button><button className={editor.entry.type === "income" ? "active income" : ""} onClick={() => patchEditor({ type: "income", category: finance.incomeCategories[0] || "其他收入" })}>收入</button></div>
      <label className="amountField"><span>金额</span><div><b>¥</b><input autoFocus inputMode="decimal" value={amountInput} placeholder="0.00" onChange={(event) => setAmountInput(event.target.value)} /></div></label>
      <div className="financeFormGrid">
        <label><span>分类</span><input list={`finance-categories-${editor.entry.type}`} value={editor.entry.category} onChange={(event) => patchEditor({ category: event.target.value })} /><datalist id={`finance-categories-${editor.entry.type}`}>{(editor.entry.type === "income" ? finance.incomeCategories : finance.expenseCategories).map((category) => <option key={category} value={category} />)}</datalist></label>
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
