import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { Budget } from '../../models/Workspace';
import { amountCents, amountInput, assertBudget, categoryChoices, validMonth } from '../../domain/finance/FinanceDomain';
import { getWorkspace } from '../../services/storage/storage';
import { changeFinance } from '../../services/storage/financeStorage';
import { money } from '../../domain/workspace/WorkspaceDomain';
import { leaveWithUnsaved } from '../../ui/navigation/unsavedChanges';

@Component
export struct BudgetPage {
  @Consume('pageStack') private stack: NavPathStack;
  @Prop month: string = '';
  @State private total: string = '';
  @State private categories: string[] = [];
  @State private amounts: Record<string, string> = {};
  @State private spent: Record<string, number> = {};
  @State private dirty: boolean = false;
  @State private busy: boolean = false;
  @State private message: string = '';

  aboutToAppear(): void {
    const finance = getWorkspace().finance;
    const budget = finance.budgets[this.month]; this.total = budget ? amountInput(budget.totalCents) : '';
    this.categories = Array.from(new Set(categoryChoices(finance, 'expense').concat(Object.keys(budget?.categoryCents ?? ({} as Record<string, number>)))));
    this.categories.forEach((category) => { this.amounts[category] = budget?.categoryCents[category] !== undefined ? amountInput(budget.categoryCents[category]) : ''; });
    finance.entries.filter((entry) => entry.type === 'expense' && entry.date.startsWith(this.month)).forEach((entry) => {
      this.spent[entry.category] = (this.spent[entry.category] ?? 0) + entry.amountCents;
    });
  }

  private leave(): void { if (this.busy) return; leaveWithUnsaved(this.getUIContext().getPromptAction(), this.stack, this.dirty); }

  private async save(): Promise<void> {
    if (this.busy) return; this.busy = true;
    try {
      if (!validMonth(this.month)) throw new Error('月份无效');
      const budget: Budget = { totalCents: amountCents(this.total, true), categoryCents: {} };
      this.categories.forEach((category) => { if (this.amounts[category]?.trim()) budget.categoryCents[category] = amountCents(this.amounts[category], true); });
      assertBudget(budget);
      await changeFinance((finance) => { finance.budgets[this.month] = budget; });
      this.dirty = false; this.stack.pop();
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Text(`${this.month} 月度预算`).fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Text('金额留空表示不设置此项预算。充值不会占用预算。').fontColor($r('app.color.text_secondary'))
          TextInput({ text: this.total, placeholder: '月度总预算（元）' }).onChange((value: string) => { this.total = value; this.dirty = true; })
            .accessibilityText('月度总预算金额')
          GridRow({ columns: 12, gutter: 16 }) {
            ForEach(this.categories, (category: string) => {
              GridCol({ span: { xs: 12, sm: 12, md: 6, lg: 4 } }) {
                Column({ space: 8 }) {
                  Text(category).fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
                  Text(`本月已用 ${money(this.spent[category] ?? 0)}`).fontColor($r('app.color.text_secondary')).width('100%')
                  TextInput({ text: this.amounts[category] ?? '', placeholder: '分类预算（元）' })
                    .onChange((value: string) => { this.amounts[category] = value; this.dirty = true; }).accessibilityText(`${category}分类预算金额`)
                }.width('100%').padding(16).borderRadius(16).backgroundColor($r('app.color.surface'))
              }
            }, (category: string) => category)
          }
          if (this.message) { Text(this.message).fontColor($r('app.color.danger')) }
          Button(this.busy ? '保存中…' : '保存全部预算').enabled(!this.busy).onClick(() => this.save()).accessibilityText('保存月度总预算和分类预算')
        }.width('100%').constraintSize({ maxWidth: 1100 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '预算设置' }, backIcon: { action: () => this.leave() } } })
    .onBackPressed(() => { this.leave(); return true; })
  }
}
