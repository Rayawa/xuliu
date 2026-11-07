import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { DailyRecord } from '../../models/Workspace';
import { emptyDaily, localDate, validDate } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';

@Component
export struct DailyPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @State private day: string = localDate();
  @State private record: DailyRecord = emptyDaily();
  @State private message: string = '';
  @State private dirty: boolean = false;

  aboutToAppear(): void { this.load(); }
  private load(): void { this.record = getWorkspace().daily[this.day] ?? emptyDaily(); this.dirty = false; }

  private leave(): void {
    if (!this.dirty) { this.pageStack.pop(); return; }
    this.getUIContext().getPromptAction().showDialog({ title: '放弃未保存的复盘？', message: '保存后可以按日期随时查看。',
      buttons: [{ text: '继续编辑', color: $r('app.color.accent') }, { text: '放弃更改', color: $r('app.color.danger') }]
    }).then((result) => { if (result.index === 1) this.pageStack.pop(); });
  }

  @Builder
  private field(title: string, value: string, change: (value: string) => void) {
    Column({ space: 8 }) {
      Text(title).fontSize(18).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
      TextArea({ text: value, placeholder: title }).constraintSize({ minHeight: 100 }).maxLength(4000)
        .backgroundColor($r('app.color.surface')).fontColor($r('app.color.text_primary'))
        .onChange((v: string) => { change(v); this.dirty = true; }).accessibilityText(title)
    }.width('100%')
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          TextInput({ text: this.day, placeholder: 'YYYY-MM-DD' }).onChange((v: string) => { this.day = v; }).accessibilityText('复盘日期')
          Button('读取该日复盘').enabled(!this.dirty).onClick(() => {
            if (validDate(this.day)) this.load(); else this.message = '请填写有效日期';
          }).accessibilityText('读取所选日期的复盘，修改日期前请先保存')
          GridRow({ columns: 12, gutter: 20 }) {
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              Column({ space: 16 }) {
                this.field('今日记录', this.record.note, (v: string) => { this.record.note = v; })
                this.field('收获', this.record.gain, (v: string) => { this.record.gain = v; })
                this.field('遇到的问题', this.record.problem, (v: string) => { this.record.problem = v; })
              }
            }
            GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
              Column({ space: 16 }) {
                this.field('此刻的感受', this.record.feeling, (v: string) => { this.record.feeling = v; })
                this.field('明天的安排', this.record.tomorrow, (v: string) => { this.record.tomorrow = v; })
              }
            }
          }
          Text(this.message).fontColor($r('app.color.text_secondary'))
          Button('保存复盘').onClick(async () => {
            if (!validDate(this.day)) { this.message = '请填写有效日期'; return; }
            try {
              const data = getWorkspace(); data.daily[this.day] = this.record; await saveWorkspace(data);
              this.dirty = false; this.message = '已保存到本机';
            } catch (error) { this.message = (error as Error).message; }
          }).accessibilityText('保存每日复盘')
        }.width('100%').constraintSize({ maxWidth: 1100 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('每日复盘', () => this.leave()))
    .onBackPressed(() => { this.leave(); return true; })
  }
}
