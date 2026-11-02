import { chooseImportFile, importText } from '../../services/files/ImportFile';
import { readXlsx } from '../../services/workbooks/XlsxReader';
import { MAX_BILL_IMPORT_BYTES } from '../../config/constants';
import { LengthMetrics } from '@kit.ArkUI';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { common } from '@kit.AbilityKit';
import { Workspace, FinanceEntry, Budget, ChartDatum } from '../../models/Workspace';
import { KEY_REVISION, ROUTE_FINANCE_ENTRY, ROUTE_FINANCE_BUDGET, ROUTE_FINANCE_SETTINGS, ROUTE_STORED_VALUE } from '../../config/constants';
import { emptyWorkspace, localDate, money } from '../../domain/workspace/WorkspaceDomain';
import { categoryChart, financeTotals, financeCsv, monthTrend, FinanceTrendPoint, validMonth } from '../../domain/finance/FinanceDomain';
import { expenseDetailCategory } from '../../domain/finance/FinanceCategories';
import { mergeImportedEntries, ImportMergeResult, recategorizeMonth } from '../../domain/finance/FinanceRules';
import { getWorkspace } from '../../services/storage/storage';
import { changeFinance } from '../../services/storage/financeStorage';
import { readDocument, exportDocument } from '../../services/files/WorkspaceFiles';
import { importWechat, importWechatRows, BillImportResult } from '../../domain/finance/WechatBillImport';
import { FinanceDistribution } from '../../components/charts/FinanceDistribution';
import { FinanceTrend } from '../../components/charts/FinanceTrend';

@Component
export struct FinancePage {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private data: Workspace = emptyWorkspace();
  @State private month: string = localDate().slice(0, 7);
  @State private monthInput: string = localDate().slice(0, 7);
  @State private filterCategories: string[] = [];
  @State private type: string = 'all';
  @State private query: string = '';
  @State private entries: FinanceEntry[] = [];
  @State private visible: number = 50;
  @State private message: string = '';
  @State private busy: boolean = false;
  @State private pending: BillImportResult | undefined = undefined;
  @State private updateExisting: boolean = false;
  @State private importPreview: ImportMergeResult = { added: 0, duplicates: 0, recategorized: 0 };
  @State private previewEntries: FinanceEntry[] = [];
  @State private expenseData: ChartDatum[] = [];
  @State private incomeData: ChartDatum[] = [];
  @State private trendData: FinanceTrendPoint[] = [];
  @State private expandedBudgets: boolean = false;
  private searchTimer: number = -1;
  private importGeneration: number = 0;
  private alive: boolean = true;

  aboutToAppear(): void { this.reload(); }
  aboutToDisappear(): void { this.alive = false; this.importGeneration++; this.stopSearch(); }
  private stopSearch(): void { if (this.searchTimer >= 0) clearTimeout(this.searchTimer); this.searchTimer = -1; }

  private reload(): void { this.data = getWorkspace(); this.prepareCharts(); this.filter(); if (this.pending) this.previewImport(); }

  private prepareCharts(): void {
    this.expenseData = categoryChart(this.data.finance, this.month, 'expense');
    this.incomeData = categoryChart(this.data.finance, this.month, 'income');
    this.trendData = monthTrend(this.data.finance, this.month);
  }

  private filter(): void {
    this.stopSearch(); const query = this.query.trim().toLowerCase();
    this.entries = this.data.finance.entries.filter((entry) => entry.date.startsWith(this.month) &&
      (this.type === 'all' || entry.type === this.type) && (!this.filterCategories.length || this.filterCategories.includes(entry.category)) &&
      (!query || `${entry.merchant ?? ''} ${entry.note} ${entry.purpose ?? ''} ${entry.relatedProject} ${entry.category}`.toLowerCase().includes(query)))
      .sort((a, b) => `${b.date}${b.time}${b.updatedAt}`.localeCompare(`${a.date}${a.time}${a.updatedAt}`));
    this.visible = 50;
  }

  private changeMonth(): void {
    if (!validMonth(this.monthInput)) { this.message = '月份格式为 YYYY-MM，年份需大于或等于1900'; return; }
    this.month = this.monthInput; this.filterCategories = []; this.prepareCharts(); this.filter();
  }

  private chooseCategories(categories: string[], type: string): void {
    this.filterCategories = categories; this.type = categories.length ? type : 'all'; this.filter();
  }

  private budget(): Budget | undefined { return this.data.finance.budgets[this.month]; }

  private deleteEntry(entry: FinanceEntry): void {
    this.getUIContext().getPromptAction().showDialog({ title: '删除账目？', message: `${entry.date} ${entry.category} ${money(entry.amountCents)}`,
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '删除', color: $r('app.color.danger') }]
    }).then(async (answer) => {
      if (answer.index !== 1) return;
      try { await changeFinance((finance) => { finance.entries = finance.entries.filter((item) => item.id !== entry.id); }); }
      catch (error) { this.message = (error as Error).message; }
    }).catch(() => {});
  }

  private async importBill(): Promise<void> {
    if (this.busy) return; this.busy = true;
    const generation = ++this.importGeneration;
    try {
      const cancelled = (): boolean => !this.alive || generation !== this.importGeneration;
      const file = await chooseImportFile(this.getUIContext().getHostContext() as common.UIAbilityContext, ['.csv', '.xlsx'], MAX_BILL_IMPORT_BYTES, cancelled);
      if (!file || cancelled()) return;
      if (file.extension === 'xlsx') {
        const sheets = await readXlsx(file.bytes, cancelled);
        this.pending = await importWechatRows(sheets.flatMap((sheet) => sheet.rows), cancelled);
      } else this.pending = await importWechat(importText(file.bytes), cancelled); this.updateExisting = false; this.previewImport();
    } catch (error) { if (this.alive && generation === this.importGeneration) this.message = (error as Error).message; }
    finally { if (this.alive && generation === this.importGeneration) this.busy = false; }
  }

  private previewImport(): void {
    if (!this.pending) return;
    try {
      const preview = getWorkspace();
      this.importPreview = mergeImportedEntries(preview.finance, this.pending.entries, this.updateExisting);
      const imported = new Set(this.pending.entries.map((entry) => entry.id));
      this.previewEntries = preview.finance.entries.filter((entry) => imported.has(entry.id)).slice(0, 10);
      this.message = '请核对金额、跳过记录和分类，再确认导入；分类仍可手动修改';
    } catch (error) { this.message = (error as Error).message; }
  }

  private recategorize(): void {
    const preview = getWorkspace(); const count = recategorizeMonth(preview.finance, this.month);
    if (!count) { this.message = '本月没有需要更新分类或用途的微信账目'; return; }
    this.getUIContext().getPromptAction().showDialog({ title: '应用当前识别规则？', message: `将更新${this.month}的${count}笔微信账目分类或用途，金额、日期和已有备注保留。`,
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '确认更新', color: $r('app.color.accent') }]
    }).then(async (answer) => {
      if (answer.index !== 1) return;
      try { await changeFinance((finance) => { recategorizeMonth(finance, this.month); }); this.message = '本月识别结果已更新'; }
      catch (error) { this.message = (error as Error).message; }
    }).catch(() => {});
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            TextInput({ text: this.monthInput, placeholder: 'YYYY-MM' }).width(145).onChange((value: string) => { this.monthInput = value; })
              .onSubmit(() => this.changeMonth()).accessibilityText('统计月份')
            Button('查看月份').onClick(() => this.changeMonth()).accessibilityText('查看所选月份的收支')
            Button('记一笔').onClick(() => this.stack.pushPath({ name: ROUTE_FINANCE_ENTRY, param: '' })).accessibilityText('新增账目')
            Button('预算').onClick(() => this.stack.pushPath({ name: ROUTE_FINANCE_BUDGET, param: this.month })).accessibilityText('设置本月总预算和分类预算')
            Button('分类与规则').onClick(() => this.stack.pushPath({ name: ROUTE_FINANCE_SETTINGS })).accessibilityText('管理分类和商户识别规则')
            Button('储值').onClick(() => this.stack.pushPath({ name: ROUTE_STORED_VALUE })).accessibilityText('管理储值项目实付赠送和余额')
          }.width('100%')
          Text(`收入 ${money(financeTotals(this.data.finance, this.month).income)} · 支出 ${money(financeTotals(this.data.finance, this.month).expense)}`)
            .fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Text(`本月结余 ${money(financeTotals(this.data.finance, this.month).net)}`).fontColor($r('app.color.text_secondary'))
          GridRow({ columns: 12, gutter: 20 }) {
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              FinanceDistribution({ title: '支出分类占比', data: this.expenseData, selectedCategories: this.type === 'expense' ? this.filterCategories : [],
                onSelect: (categories: string[]) => this.chooseCategories(categories, 'expense') })
            }
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              FinanceDistribution({ title: '收入分类占比', data: this.incomeData, selectedCategories: this.type === 'income' ? this.filterCategories : [],
                onSelect: (categories: string[]) => this.chooseCategories(categories, 'income') })
            }
          }
          FinanceTrend({ data: this.trendData })
          Column({ space: 12 }) {
            Text(this.budget()?.totalCents ? `总预算剩余 ${money((this.budget()?.totalCents ?? 0) - financeTotals(this.data.finance, this.month).expense)}` : '本月尚未设置总预算')
              .fontSize(20).fontColor($r('app.color.text_primary'))
            if (this.budget()?.totalCents) {
              Progress({ value: Math.min(this.budget()?.totalCents ?? 1, financeTotals(this.data.finance, this.month).expense), total: this.budget()?.totalCents ?? 1 })
                .width('100%').color(financeTotals(this.data.finance, this.month).expense > (this.budget()?.totalCents ?? 0) ? $r('app.color.danger') : $r('app.color.accent'))
                .accessibilityText(`预算已使用${money(financeTotals(this.data.finance, this.month).expense)}`)
            }
            Button(this.expandedBudgets ? '收起分类预算' : '查看分类预算')
              .onClick(() => { this.expandedBudgets = !this.expandedBudgets; })
              .accessibilityText('展开或收起分类预算使用情况')
            if (this.expandedBudgets) {
              ForEach(Object.keys(this.budget()?.categoryCents ?? ({} as Record<string, number>)), (category: string) => {
                Button(`${category} · 预算${money(this.budget()?.categoryCents[category] ?? 0)} · 已用${money(this.expenseData.find((item) => item.label === category)?.value ?? 0)}`)
                  .onClick(() => this.chooseCategories([category], 'expense')).accessibilityText(`查看${category}预算和明细`)
              }, (category: string) => `${category}-${this.revision}-${this.month}`)
            }
          }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            Button(this.busy ? '读取账单中…' : '导入微信账单').enabled(!this.busy).onClick(() => this.importBill()).accessibilityText('选择微信CSV或XLSX账单并预览导入结果')
            Button('按规则重新分类本月').onClick(() => this.recategorize()).accessibilityText('预览确认后更新本月微信账单分类和用途')
            Button('导出本月账目').onClick(async () => {
              try {
                await exportDocument(this.getUIContext().getHostContext() as common.UIAbilityContext, financeCsv(this.data.finance, this.month), `序流账目-${this.month}.csv`);
              } catch (error) { this.message = (error as Error).message; }
            }).accessibilityText('导出含储值实付赠送用途和项目的本月CSV账目')
          }
          if (this.pending) {
            Column({ space: 10 }) {
              Text(`预览：新增${this.importPreview.added}笔，已有重复${this.importPreview.duplicates}笔，更新分类${this.importPreview.recategorized}笔`)
                .fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
              Text(`原账单${this.pending.transactionRows}行；跳过中性${this.pending.skippedNeutral}行、未成功${this.pending.skippedUnsuccessful}行、格式无效${this.pending.skippedInvalid}行、文件内重复${this.pending.skippedDuplicate}行`)
                .fontColor($r('app.color.text_secondary'))
              Row() {
                Text('同步已有账目的分类与用途').layoutWeight(1).fontColor($r('app.color.text_primary'))
                Toggle({ type: ToggleType.Switch, isOn: this.updateExisting })
                  .onChange((value: boolean) => { this.updateExisting = value; this.previewImport(); })
                  .accessibilityText('选择是否按本次账单和当前规则更新已有账目的分类与用途')
              }.width('100%')
              ForEach(this.previewEntries, (entry: FinanceEntry) => {
                Text(`${entry.date} ${entry.merchant ?? ''} · ${entry.category} ${money(entry.amountCents)}${entry.purpose ? ` · ${entry.purpose}` : ''}`)
                  .fontColor($r('app.color.text_secondary'))
              }, (entry: FinanceEntry) => `${entry.id}-${entry.category}-${entry.purpose ?? ''}`)
              Button('确认导入预览结果').onClick(async () => {
                if (!this.pending) return;
                try {
                  const pending = this.pending;
                  await changeFinance((finance) => { mergeImportedEntries(finance, pending.entries, this.updateExisting); });
                  this.pending = undefined; this.previewEntries = []; this.message = '导入完成，请核对分类';
                } catch (error) { this.message = (error as Error).message; }
              }).accessibilityText('将预览的账目和选择的分类更新保存到本机')
              Button('取消导入').onClick(() => { this.pending = undefined; this.previewEntries = []; }).accessibilityText('取消此次账单导入')
            }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
          }
          Text(`账目明细 · ${this.entries.length}笔${this.filterCategories.length ? ` · ${this.filterCategories.join('、')}` : ''}`)
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
          Search({ value: this.query, placeholder: '搜索商户、用途、备注或项目' }).onChange((value: string) => {
            this.query = value; this.stopSearch(); this.searchTimer = setTimeout(() => this.filter(), 200);
          }).onSubmit(() => this.filter()).accessibilityText('搜索本月账目明细')
          Row({ space: 8 }) {
            Select([{ value: '全部类型' }, { value: '支出' }, { value: '收入' }, { value: '储值充值' }])
              .value(['全部类型', '支出', '收入', '储值充值'][['all', 'expense', 'income', 'topup'].indexOf(this.type)])
              .onSelect((index: number) => { this.type = ['all', 'expense', 'income', 'topup'][index]; this.filter(); }).accessibilityText('按账目类型筛选')
            Button('清除筛选')
              .onClick(() => { this.type = 'all'; this.filterCategories = []; this.query = ''; this.filter(); })
              .accessibilityText('清除类型分类和关键词筛选')
          }
          ForEach(this.entries.slice(0, this.visible), (entry: FinanceEntry) => {
            Column({ space: 8 }) {
              Text(`${entry.date} ${entry.time} · ${entry.category}`)
                .fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.text_primary'))
                .width('100%')
              Text(`${entry.type === 'expense' ? '−' : '+'}${money(entry.amountCents)}${entry.type === 'topup' ? `（实付${money(entry.amountCents - (entry.bonusCents ?? 0))}，赠送${money(entry.bonusCents ?? 0)}）` : ''}`)
                .fontSize(20).fontColor($r('app.color.text_primary')).width('100%')
              Text([entry.merchant, entry.type === 'expense' ? expenseDetailCategory(entry) : entry.purpose, entry.note, entry.relatedProject].filter((value) => !!value).join(' · '))
                .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
              Row({ space: 8 }) {
                Button('编辑').onClick(() => this.stack.pushPath({ name: ROUTE_FINANCE_ENTRY, param: entry.id })).accessibilityText('编辑这笔账目')
                Button('删除').onClick(() => this.deleteEntry(entry)).accessibilityText('删除这笔账目')
              }
            }.width('100%').padding(16).borderRadius(16).backgroundColor($r('app.color.surface'))
          }, (entry: FinanceEntry) => `${entry.id}-${this.revision}`)
          if (this.visible < this.entries.length) { Button('显示更多账目').onClick(() => { this.visible += 50; }).accessibilityText('显示下一批50笔账目') }
          if (this.message) { Text(this.message).fontColor($r('app.color.text_secondary')) }
        }.width('100%').constraintSize({ maxWidth: 1200 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '个人记账' }, backIcon: { action: () => this.stack.pop() } } })
    .onShown(() => { this.alive = true; this.reload(); }).onHidden(() => { this.stopSearch(); this.importGeneration++; this.busy = false; })
  }
}
