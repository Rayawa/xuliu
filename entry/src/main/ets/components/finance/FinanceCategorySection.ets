import { FinanceEntry } from '../../models/Workspace';
import { FINANCE_DETAIL_BATCH_SIZE } from '../../config/constants';
import { FinanceBreakdownData, FinanceCategoryGroup, FinancePurposeGroup, emptyFinanceBreakdown } from '../../domain/finance/FinanceBreakdown';
import { money } from '../../domain/workspace/WorkspaceDomain';
import { FinanceEntryCard } from './FinanceEntryCard';

@Component
export struct FinanceCategorySection {
  @Prop title: string = '';
  @Prop @Watch('reset') month: string = '';
  @Prop revision: number = 0;
  @Prop data: FinanceBreakdownData = emptyFinanceBreakdown();
  onEdit: (entry: FinanceEntry) => void = () => {};
  onDelete: (entry: FinanceEntry) => void = () => {};
  @State private expanded: boolean = false;
  @State private categoryLabel: string | undefined = undefined;
  @State private purposeLabel: string | undefined = undefined;
  @State private categoryLimit: number = FINANCE_DETAIL_BATCH_SIZE;
  @State private purposeLimit: number = FINANCE_DETAIL_BATCH_SIZE;
  @State private entryLimit: number = FINANCE_DETAIL_BATCH_SIZE;

  private reset(): void {
    this.expanded = false;
    this.categoryLabel = undefined;
    this.purposeLabel = undefined;
    this.categoryLimit = FINANCE_DETAIL_BATCH_SIZE;
    this.purposeLimit = FINANCE_DETAIL_BATCH_SIZE;
    this.entryLimit = FINANCE_DETAIL_BATCH_SIZE;
  }

  private toggleCategory(label: string): void {
    this.categoryLabel = this.categoryLabel === label ? undefined : label;
    this.purposeLabel = undefined;
    this.purposeLimit = FINANCE_DETAIL_BATCH_SIZE;
    this.entryLimit = FINANCE_DETAIL_BATCH_SIZE;
  }

  @Builder
  private purposeRow(purpose: FinancePurposeGroup) {
    Button(`${this.purposeLabel === purpose.label ? '收起' : '展开'} ${purpose.label} · ${purpose.entries.length}笔 · ${money(purpose.amountCents)}`)
      .width('100%').onClick(() => {
        this.purposeLabel = this.purposeLabel === purpose.label ? undefined : purpose.label;
        this.entryLimit = FINANCE_DETAIL_BATCH_SIZE;
      })
      .accessibilityText(`${this.purposeLabel === purpose.label ? '收起' : '展开'}用途${purpose.label}，${purpose.entries.length}笔，合计${money(purpose.amountCents)}`)
    if (this.purposeLabel === purpose.label) {
      ForEach(purpose.entries.slice(0, this.entryLimit), (entry: FinanceEntry) => {
        FinanceEntryCard({ entry, onEdit: this.onEdit, onDelete: this.onDelete })
      }, (entry: FinanceEntry) => entry.id)
      if (this.entryLimit < purpose.entries.length) {
        Button('显示更多账目').onClick(() => { this.entryLimit += FINANCE_DETAIL_BATCH_SIZE; })
          .accessibilityText(`显示${purpose.label}下一批账目`)
      }
    }
  }

  @Builder
  private categoryRow(category: FinanceCategoryGroup) {
    Button(`${this.categoryLabel === category.label ? '收起' : '展开'} ${category.label} · ${category.count}笔 · ${money(category.amountCents)}`)
      .width('100%').onClick(() => this.toggleCategory(category.label))
      .accessibilityText(`${this.categoryLabel === category.label ? '收起' : '展开'}分类${category.label}，${category.count}笔，合计${money(category.amountCents)}`)
    if (this.categoryLabel === category.label) {
      ForEach(category.purposes.slice(0, this.purposeLimit), (purpose: FinancePurposeGroup) => {
        this.purposeRow(purpose)
      }, (purpose: FinancePurposeGroup) => purpose.label)
      if (this.purposeLimit < category.purposes.length) {
        Button('显示更多用途').onClick(() => { this.purposeLimit += FINANCE_DETAIL_BATCH_SIZE; })
          .accessibilityText(`显示${category.label}下一批用途`)
      }
    }
  }

  build() {
    Column({ space: 10 }) {
      Button(`${this.expanded ? '收起' : '展开'}${this.title} · ${this.data.categories.length}类 · ${this.data.count}笔 · ${money(this.data.amountCents)}`)
        .width('100%').onClick(() => { this.expanded = !this.expanded; })
        .accessibilityText(`${this.expanded ? '收起' : '展开'}本月${this.title}，${this.data.categories.length}类，${this.data.count}笔，合计${money(this.data.amountCents)}`)
      if (this.expanded) {
        if (!this.data.count) {
          Text('本月暂无账目').fontColor($r('app.color.text_secondary'))
        }
        ForEach(this.data.categories.slice(0, this.categoryLimit), (category: FinanceCategoryGroup) => {
          this.categoryRow(category)
        }, (category: FinanceCategoryGroup) => `${this.month}:${category.label}:${this.revision}`)
        if (this.categoryLimit < this.data.categories.length) {
          Button('显示更多分类').onClick(() => { this.categoryLimit += FINANCE_DETAIL_BATCH_SIZE; })
            .accessibilityText(`显示${this.title}下一批分类`)
        }
      }
    }.width('100%').padding(12).borderRadius(16).backgroundColor($r('app.color.surface_secondary'))
  }
}
