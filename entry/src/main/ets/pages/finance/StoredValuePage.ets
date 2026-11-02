import { leaveWithUnsaved } from '../../ui/navigation/unsavedChanges';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { StoredValueAccount } from '../../models/Workspace';
import { amountInput, saveStoredAccount, storedValueSummaries, StoredValueSummary } from '../../domain/finance/FinanceDomain';
import { KEY_REVISION } from '../../config/constants';
import { getWorkspace } from '../../services/storage/storage';
import { changeFinance } from '../../services/storage/financeStorage';
import { money } from '../../domain/workspace/WorkspaceDomain';

@Component
export struct StoredValuePage {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private accounts: StoredValueSummary[] = [];
  @State private name: string = '';
  @State private opening: string = '';
  @State private editingId: string = '';
  @State private message: string = '';
  @State private dirty: boolean = false;
  @State private busy: boolean = false;

  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.accounts = storedValueSummaries(getWorkspace().finance); }

  private leave(): void { if (this.busy) return; leaveWithUnsaved(this.getUIContext().getPromptAction(), this.stack, this.dirty); }

  private remove(account: StoredValueAccount): void {
    if (getWorkspace().finance.entries.some((entry) => entry.storedValueAccountId === account.id)) { this.message = '该项目有关联账目，请保留它以便核对历史'; return; }
    this.getUIContext().getPromptAction().showDialog({ title: '删除储值项目？', message: `${account.name}，期初余额${money(account.openingBalanceCents)}`,
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '删除', color: $r('app.color.danger') }]
    }).then(async (result) => {
      if (result.index !== 1) return;
      try {
        await changeFinance((finance) => {
          if (finance.entries.some((entry) => entry.storedValueAccountId === account.id)) throw new Error('项目已有关联账目，不能删除');
          finance.storedValueAccounts = finance.storedValueAccounts?.filter((entry) => entry.id !== account.id);
        });
      } catch (error) { this.message = (error as Error).message; }
    }).catch(() => {});
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          GridRow({ columns: 12, gutter: 16 }) {
            ForEach(this.accounts, (account: StoredValueSummary) => {
              GridCol({ span: { xs: 12, sm: 12, md: 6, lg: 4 } }) {
                Column({ space: 10 }) {
                  Text(account.name).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
                  Text(`可用余额 ${money(account.balance)}`).fontSize(22).fontColor($r('app.color.accent'))
                  Text(`累计实付 ${money(account.paid)}\n累计赠送 ${money(account.bonus)}\n已消费 ${money(account.spent)}`)
                    .fontColor($r('app.color.text_secondary'))
                  Button('修改项目')
                    .onClick(() => { this.editingId = account.id; this.name = account.name; this.opening = amountInput(account.openingBalanceCents); })
                    .accessibilityText(`修改储值项目${account.name}`)
                  Button('删除空项目').onClick(() => this.remove(account)).accessibilityText(`删除没有关联账目的${account.name}`)
                }.width('100%').padding(20).borderRadius(20).backgroundColor($r('app.color.surface'))
              }
            }, (account: StoredValueAccount) => `${account.id}-${this.revision}`)
          }
          Text(this.editingId ? '修改储值项目' : '新增储值项目').fontSize(20).fontColor($r('app.color.text_primary'))
          TextInput({ text: this.name, placeholder: '项目名称' })
            .maxLength(40)
            .onChange((value: string) => { this.name = value; this.dirty = true; })
            .accessibilityText('储值项目名称')
          TextInput({ text: this.opening, placeholder: '期初余额（元）' })
            .onChange((value: string) => { this.opening = value; this.dirty = true; })
            .accessibilityText('储值期初余额金额')
          Button(this.busy ? '保存中…' : '保存项目').enabled(!this.busy).onClick(async () => {
            if (this.busy) return; this.busy = true;
            try {
              await changeFinance((finance) => { saveStoredAccount(finance, this.name, this.opening, this.editingId); });
              this.editingId = ''; this.name = ''; this.opening = ''; this.message = '储值项目已保存'; this.dirty = false;
            } catch (error) { this.message = (error as Error).message; }
            finally { this.busy = false; }
          }).accessibilityText('保存储值项目名称和期初余额')
          if (this.editingId) { Button('取消修改')
            .onClick(() => { this.editingId = ''; this.name = ''; this.opening = ''; this.dirty = false; })
            .accessibilityText('取消储值项目修改') }
          if (this.message) { Text(this.message).fontColor($r('app.color.text_secondary')) }
        }.width('100%').constraintSize({ maxWidth: 1100 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '储值项目' }, backIcon: { action: () => this.leave() } } })
    .onBackPressed(() => { this.leave(); return true; })
  }
}
