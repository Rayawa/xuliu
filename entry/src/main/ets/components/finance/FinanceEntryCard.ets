import { FinanceEntry } from '../../models/Workspace';
import { expenseDetailCategory } from '../../domain/finance/FinanceCategories';
import { money } from '../../domain/workspace/WorkspaceDomain';

@Component
export struct FinanceEntryCard {
  @Require @Prop entry: FinanceEntry;
  onEdit: (entry: FinanceEntry) => void = () => {};
  onDelete: (entry: FinanceEntry) => void = () => {};

  build() {
    Column({ space: 8 }) {
      Text(`${this.entry.date} ${this.entry.time} · ${this.entry.category}`)
        .fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
      Text(`${this.entry.type === 'expense' ? '−' : '+'}${money(this.entry.amountCents)}${this.entry.type === 'topup' ? `（实付${money(this.entry.amountCents - (this.entry.bonusCents ?? 0))}，赠送${money(this.entry.bonusCents ?? 0)}）` : ''}`)
        .fontSize(20).fontColor($r('app.color.text_primary')).width('100%')
      Text([this.entry.merchant, this.entry.type === 'expense' ? expenseDetailCategory(this.entry) : this.entry.purpose,
        this.entry.note, this.entry.relatedProject].filter((value) => !!value).join(' · '))
        .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      Row({ space: 8 }) {
        Button('编辑').onClick(() => this.onEdit(this.entry)).accessibilityText(`编辑${this.entry.date}的${this.entry.category}账目`)
        Button('删除').onClick(() => this.onDelete(this.entry)).accessibilityText(`删除${this.entry.date}的${this.entry.category}账目`)
      }
    }.width('100%').padding(16).borderRadius(16).backgroundColor($r('app.color.surface'))
  }
}
