import { leaveWithUnsaved } from '../../ui/navigation/unsavedChanges';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { Workspace } from '../../models/Workspace';
import { RuleRow, amountCents, renameCategory } from '../../domain/finance/FinanceDomain';
import { financeRuleRows, saveFinanceRule, migrateExpenseCategories, removeFinanceRule } from '../../domain/finance/FinanceRules';
import { emptyWorkspace } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace } from '../../services/storage/storage';
import { changeFinance } from '../../services/storage/financeStorage';
import { KEY_REVISION, MAX_FINANCE_CATEGORIES } from '../../config/constants';

@Component
export struct FinanceSettingsPage {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private data: Workspace = emptyWorkspace();
  @State private type: string = 'expense';
  @State private categoryName: string = '';
  @State private previousCategory: string = '';
  @State private rules: RuleRow[] = [];
  @State private editingRule: RuleRow | undefined = undefined;
  @State private scope: string = 'merchant';
  @State private merchant: string = '';
  @State private note: string = '';
  @State private amount: string = '';
  @State private ruleCategory: string = '';
  @State private purpose: string = '';
  @State private query: string = '';
  @State private message: string = '';
  @State private rulesVisible: number = 50;
  @State private categoriesVisible: number = 40;

  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.data = getWorkspace(); this.rules = financeRuleRows(this.data.finance); }
  private hasDraft(): boolean {
    return !!(this.categoryName.trim() && this.categoryName.trim() !== this.previousCategory) ||
      (this.editingRule ? this.ruleCategory !== this.editingRule.category || this.purpose !== this.editingRule.purpose :
        !!(this.merchant || this.note || this.amount || this.ruleCategory || this.purpose));
  }
  private leave(): void { leaveWithUnsaved(this.getUIContext().getPromptAction(), this.stack, this.hasDraft()); }

  private filteredRules(): RuleRow[] {
    return this.rules.filter((rule) => rule.key.startsWith(`${this.type}:`) && `${rule.key} ${rule.category} ${rule.purpose}`.toLowerCase().includes(this.query.toLowerCase()));
  }

  private choices(): string[] { return this.type === 'income' ? this.data.finance.incomeCategories : this.data.finance.expenseCategories; }

  private async saveCategory(): Promise<void> {
    try {
      await changeFinance((finance) => {
        if (this.previousCategory) { renameCategory(finance, this.type, this.previousCategory, this.categoryName); return; }
        const name = this.categoryName.trim(); const categories = this.type === 'income' ? finance.incomeCategories : finance.expenseCategories;
        if (!name || name.length > 40) throw new Error('分类需为1–40字');
        if (categories.includes(name)) throw new Error('已有同名分类');
        if (categories.length >= MAX_FINANCE_CATEGORIES) throw new Error('分类最多200个'); categories.push(name);
      });
      this.previousCategory = ''; this.categoryName = ''; this.message = '分类已保存';
    } catch (error) { this.message = (error as Error).message; }
  }

  private moveCategory(category: string, delta: number): void {
    changeFinance((finance) => {
      const list = this.type === 'income' ? finance.incomeCategories : finance.expenseCategories;
      const index = list.indexOf(category); const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return;
      const value = list.splice(index, 1)[0]; list.splice(target, 0, value);
    }).catch((error: Error) => { this.message = error.message; });
  }

  private migrate(): void {
    const preview = getWorkspace(); const result = migrateExpenseCategories(preview.finance);
    if (!result.changed) { this.message = '没有需要迁移的旧分类'; return; }
    this.getUIContext().getPromptAction().showDialog({ title: '统一旧支出分类？',
      message: `学习→教育、健康→医疗健康、居住→住房、人情→人情往来。涉及${result.entries}笔账目、${result.budgets}项预算、${result.rules}条规则；金额和日期保留。`,
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '确认迁移', color: $r('app.color.accent') }]
    }).then(async (answer) => {
      if (answer.index !== 1) return;
      try { await changeFinance((finance) => { migrateExpenseCategories(finance); }); this.message = '旧分类已统一'; }
      catch (error) { this.message = (error as Error).message; }
    }).catch(() => {});
  }

  private async saveRule(): Promise<void> {
    try {
      await changeFinance((finance) => saveFinanceRule(finance, this.type, this.scope, this.merchant, this.note,
        !this.editingRule && this.scope === 'amount' ? amountCents(this.amount) : 0, this.ruleCategory, this.purpose, this.editingRule));
      this.editingRule = undefined; this.merchant = ''; this.note = ''; this.amount = ''; this.ruleCategory = ''; this.purpose = '';
      this.message = '规则已保存；只会在导入或你确认重新分类时应用';
    } catch (error) { this.message = (error as Error).message; }
  }

  @Builder
  private input(label: string, value: string, change: (value: string) => void, limit: number = 200) {
    TextInput({ text: value, placeholder: label }).maxLength(limit).onChange(change).accessibilityText(label)
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Select([{ value: '支出分类与规则' }, { value: '收入分类与规则' }]).value(this.type === 'income' ? '收入分类与规则' : '支出分类与规则')
            .onSelect((index: number) => { this.type = index === 1 ? 'income' : 'expense'; this.previousCategory = ''; this.categoryName = ''; this.editingRule = undefined; })
            .accessibilityText('选择管理支出或收入分类')
          GridRow({ columns: 12, gutter: 20 }) {
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              Column({ space: 12 }) {
                Text('常用分类').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
                ForEach(this.choices().slice(0, this.categoriesVisible), (category: string, index: number) => {
                  Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(6), cross: LengthMetrics.vp(6) } }) {
                    Text(category).fontColor($r('app.color.text_primary')).layoutWeight(1)
                    Button('改名')
                      .onClick(() => { this.previousCategory = category; this.categoryName = category; })
                      .accessibilityText(`修改分类${category}名称，并同步账目预算规则`)
                    Button('上移').enabled(index > 0).onClick(() => this.moveCategory(category, -1)).accessibilityText(`上移分类${category}`)
                    Button('下移')
                      .enabled(index < this.choices().length - 1)
                      .onClick(() => this.moveCategory(category, 1))
                      .accessibilityText(`下移分类${category}`)
                    Button('移出常用').onClick(async () => {
                      try {
                        await changeFinance((finance) => {
                          if (this.type === 'income') finance.incomeCategories = finance.incomeCategories.filter((value) => value !== category);
                          else finance.expenseCategories = finance.expenseCategories.filter((value) => value !== category);
                        });
                        this.message = '已移出常用，历史账目和预算保留';
                      } catch (error) { this.message = (error as Error).message; }
                    }).accessibilityText(`将${category}移出常用，保留历史数据`)
                  }.width('100%').padding(10).borderRadius(12).backgroundColor($r('app.color.surface'))
                }, (category: string) => `${category}-${this.revision}`)
                if (this.categoriesVisible < this.choices().length) {
                  Button('显示更多分类').onClick(() => { this.categoriesVisible += 40; }).accessibilityText('显示下一批分类')
                }
                this.input(this.previousCategory ? '分类新名称' : '新增分类名称', this.categoryName, (value: string) => { this.categoryName = value; }, 40)
                Button(this.previousCategory ? '保存分类改名' : '添加分类').onClick(() => this.saveCategory()).accessibilityText('保存分类')
                if (this.previousCategory) { Button('取消改名')
                  .onClick(() => { this.previousCategory = ''; this.categoryName = ''; })
                  .accessibilityText('取消分类改名') }
                Button('迁移旧支出分类').onClick(() => this.migrate()).accessibilityText('预览并确认将旧分类统一到当前名称')
              }.width('100%')
            }
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              Column({ space: 12 }) {
                Text(this.editingRule ? '编辑规则' : '新增分类与用途规则').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
                if (this.editingRule) {
                  Text(this.editingRule.key).fontSize(13).fontColor($r('app.color.text_secondary'))
                } else {
                  Select([{ value: '商户分类' }, { value: '交易明细分类' }, { value: '固定金额与用途' }])
                    .value(['商户分类', '交易明细分类', '固定金额与用途'][['merchant', 'detail', 'amount'].indexOf(this.scope)])
                    .onSelect((index: number) => { this.scope = ['merchant', 'detail', 'amount'][index]; }).accessibilityText('规则匹配范围')
                  this.input('商户名称', this.merchant, (value: string) => { this.merchant = value; })
                  if (this.scope === 'detail') { this.input('交易明细 / 备注', this.note, (value: string) => { this.note = value; }, 500) }
                  if (this.scope === 'amount') { this.input('固定金额（元）', this.amount, (value: string) => { this.amount = value; }, 20) }
                }
                this.input('分类', this.ruleCategory, (value: string) => { this.ruleCategory = value; }, 40)
                if (this.scope === 'amount' || this.editingRule?.kind === 'payment') { this.input('用途', this.purpose, (value: string) => { this.purpose = value; }, 80) }
                Button('保存规则').onClick(() => this.saveRule()).accessibilityText('保存分类或固定金额用途规则')
                if (this.editingRule) { Button('取消编辑规则')
                  .onClick(() => { this.editingRule = undefined; this.ruleCategory = ''; this.purpose = ''; })
                  .accessibilityText('取消规则编辑') }
                Search({ value: this.query, placeholder: '搜索规则' })
                  .onChange((value: string) => { this.query = value; this.rulesVisible = 50; })
                  .accessibilityText('按商户分类或用途搜索规则')
                ForEach(this.filteredRules().slice(0, this.rulesVisible), (rule: RuleRow) => {
                  Column({ space: 6 }) {
                    Text(`${rule.category}${rule.purpose ? ` · ${rule.purpose}` : ''}`).fontColor($r('app.color.text_primary'))
                    Text(rule.key).fontSize(12).fontColor($r('app.color.text_secondary')).maxLines(3)
                    Row({ space: 8 }) {
                      Button('编辑').onClick(() => { this.editingRule = rule; this.ruleCategory = rule.category; this.purpose = rule.purpose; })
                        .accessibilityText('编辑此规则分类和用途')
                      Button('删除').onClick(async () => {
                        try {
                          await changeFinance((finance) => {
                            removeFinanceRule(finance, rule);
                          }); this.message = '规则已移除，已有账目不变';
                        } catch (error) { this.message = (error as Error).message; }
                      }).accessibilityText('删除此规则，保留已有账目')
                    }
                  }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface'))
                }, (rule: RuleRow) => `${rule.kind}-${rule.key}-${this.revision}`)
                if (this.rulesVisible < this.filteredRules().length) {
                  Button('显示更多规则').onClick(() => { this.rulesVisible += 50; }).accessibilityText('显示下一批规则')
                }
              }.width('100%')
            }
          }
          if (this.message) { Text(this.message).fontColor($r('app.color.text_secondary')) }
        }.width('100%').constraintSize({ maxWidth: 1200 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '分类与识别规则' }, backIcon: { action: () => this.leave() } } })
    .onBackPressed(() => { this.leave(); return true; })
  }
}
