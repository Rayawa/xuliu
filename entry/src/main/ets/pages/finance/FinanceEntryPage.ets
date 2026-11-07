import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { FinanceEntryDraft, categoryChoices, newFinanceDraft, saveFinanceEntry } from '../../domain/finance/FinanceDomain';
import { Workspace } from '../../models/Workspace';
import { emptyWorkspace } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace } from '../../services/storage/storage';
import { changeFinance } from '../../services/storage/financeStorage';
import { leaveWithUnsaved } from '../../ui/navigation/unsavedChanges';

@Component
export struct FinanceEntryPage {
  @Consume('pageStack') private stack: NavPathStack;
  @Prop entryId: string = '';
  @State private data: Workspace = emptyWorkspace();
  @State private draft: FinanceEntryDraft = newFinanceDraft();
  @State private dirty: boolean = false;
  @State private busy: boolean = false;
  @State private error: string = '';

  aboutToAppear(): void {
    this.data = getWorkspace();
    const entry = this.data.finance.entries.find((item) => item.id === this.entryId);
    this.draft = newFinanceDraft(entry);
    if (this.entryId && !entry) this.error = '此账目已不存在';
  }

  private leave(): void { if (this.busy) return; leaveWithUnsaved(this.getUIContext().getPromptAction(), this.stack, this.dirty); }

  private async save(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await changeFinance((finance) => { saveFinanceEntry(finance, this.draft, this.entryId); });
      this.dirty = false; this.stack.pop();
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; }
  }

  @Builder
  private field(title: string, value: string, change: (text: string) => void, limit: number = 500) {
    Column({ space: 6 }) {
      Text(title).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      TextInput({ text: value, placeholder: title }).maxLength(limit)
        .backgroundColor($r('app.color.surface')).fontColor($r('app.color.text_primary'))
        .onChange((text: string) => { change(text); this.dirty = true; }).accessibilityText(title)
    }.width('100%')
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Select([{ value: '支出' }, { value: '收入' }, { value: '储值充值' }])
            .value(this.draft.type === 'income' ? '收入' : this.draft.type === 'topup' ? '储值充值' : '支出')
            .onSelect((index: number) => {
              this.draft.type = ['expense', 'income', 'topup'][index];
              this.draft.category = this.draft.type === 'income' ? '其他收入' : this.draft.type === 'topup' ? '储值充值' : '其他';
              if (this.draft.type === 'income') this.draft.storedId = '';
              this.dirty = true;
            }).accessibilityText('账目类型')
          GridRow({ columns: 12, gutter: 20 }) {
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              Column({ space: 14 }) {
                this.field(this.draft.type === 'topup' ? '实付金额（元）' : '金额（元）', this.draft.amount, (text: string) => { this.draft.amount = text; }, 20)
                if (this.draft.type === 'topup') {
                  this.field('赠送金额（元，可为0）', this.draft.bonus, (text: string) => { this.draft.bonus = text; }, 20)
                  Text('到账金额为实付与赠送之和；充值不计入收入、支出和预算。').fontColor($r('app.color.text_secondary'))
                } else {
                  Select(categoryChoices(this.data.finance, this.draft.type).map((value): SelectOption => ({ value })))
                    .value(this.draft.category).onSelect((_index: number, value: string) => { this.draft.category = value; this.dirty = true; })
                    .accessibilityText('选择账目分类')
                  this.field('分类名称（也可新建）', this.draft.category, (text: string) => { this.draft.category = text; }, 40)
                }
                this.field('日期 YYYY-MM-DD', this.draft.date, (text: string) => { this.draft.date = text; }, 10)
                this.field('时间 HH:mm', this.draft.time, (text: string) => { this.draft.time = text; }, 5)
                if (this.draft.type !== 'income') {
                  Select(([{ value: '不使用储值' }] as SelectOption[]).concat((this.data.finance.storedValueAccounts ?? []).map((account): SelectOption => ({ value: account.name }))))
                    .value(this.data.finance.storedValueAccounts?.find((account) => account.id === this.draft.storedId)?.name ?? '不使用储值')
                    .onSelect((index: number) => { this.draft.storedId = index > 0 ? this.data.finance.storedValueAccounts?.[index - 1].id ?? '' : ''; this.dirty = true; })
                    .accessibilityText('选择储值项目')
                }
              }.width('100%')
            }
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              Column({ space: 14 }) {
                this.field('商户', this.draft.merchant, (text: string) => { this.draft.merchant = text; }, 200)
                this.field('识别用途', this.draft.purpose, (text: string) => { this.draft.purpose = text; }, 80)
                this.field('关联项目', this.draft.project, (text: string) => { this.draft.project = text; }, 200)
                this.field('备注', this.draft.note, (text: string) => { this.draft.note = text; })
                if (this.draft.type !== 'topup') {
                  Row() {
                    Text('记住这类交易明细的分类').layoutWeight(1).fontColor($r('app.color.text_primary'))
                    Toggle({ type: ToggleType.Switch, isOn: this.draft.learnDetail })
                      .onChange((value: boolean) => { this.draft.learnDetail = value; this.dirty = true; })
                      .accessibilityText('保存当前商户和交易明细的分类规则')
                  }.width('100%')
                  Row() {
                    Text('记住此商户固定金额的用途').layoutWeight(1).fontColor($r('app.color.text_primary'))
                    Toggle({ type: ToggleType.Switch, isOn: this.draft.learnPayment })
                      .onChange((value: boolean) => { this.draft.learnPayment = value; this.dirty = true; })
                      .accessibilityText('保存当前商户同金额交易的分类和用途规则')
                  }.width('100%')
                }
              }.width('100%')
            }
          }
          if (this.error) { Text(this.error).fontColor($r('app.color.danger')) }
          Button(this.busy ? '保存中…' : '保存账目').enabled(!this.busy).onClick(() => this.save()).accessibilityText('保存账目与选择的规则')
          Button('取消').onClick(() => this.leave()).accessibilityText('取消编辑账目')
        }.width('100%').constraintSize({ maxWidth: 1100 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle(this.entryId ? '编辑账目' : '记一笔', () => this.leave()))
    .onBackPressed(() => { this.leave(); return true; })
  }
}
