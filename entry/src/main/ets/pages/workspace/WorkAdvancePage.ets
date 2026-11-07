import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { EntryTarget, WorkspaceEntry } from '../../models/Workspace';
import { KEY_REVISION } from '../../config/constants';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { entries, localDate, addDays, validDate, workCompleted } from '../../domain/workspace/WorkspaceDomain';
import { advanceWork } from '../../domain/workspace/WorkSchedule';

@Component
export struct WorkAdvancePage {
  @Consume('pageStack') private stack: NavPathStack;
  @Prop target: EntryTarget = { collection: 'tasks', id: '' };
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private item: WorkspaceEntry | undefined = undefined;
  @State private nextDate: string = '';
  @State private error: string = '';
  @State private busy: boolean = false;
  aboutToAppear(): void {
    this.reload(); const today = localDate();
    this.nextDate = this.item?.progressedDates?.includes(today) && this.item.plannedDate && this.item.plannedDate > today ? this.item.plannedDate : addDays(today, 1);
  }
  private reload(): void { this.item = entries(getWorkspace(), this.target.collection).find((item) => item.id === this.target.id); }
  private async saveAdvance(): Promise<void> {
    if (this.busy) return; this.busy = true; this.error = '';
    try {
      const data = getWorkspace(); const item = entries(data, this.target.collection).find((value) => value.id === this.target.id);
      if (!item || !['tasks', 'milestones'].includes(this.target.collection) || (this.target.collection === 'milestones' && !item.courseId && !item.alsoTask)) throw new Error('任务已移除或不支持续做，请返回列表');
      advanceWork(item, localDate(), this.nextDate); await saveWorkspace(data); this.stack.pop();
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; }
  }
  private pickerDate(): Date {
    const tomorrow = addDays(localDate(), 1);
    return new Date(`${validDate(this.nextDate) && this.nextDate >= tomorrow && this.nextDate <= '2100-12-31' ? this.nextDate : tomorrow}T12:00:00`);
  }
  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 18 }) {
          Text(this.item?.title ?? '任务已移除').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          Text('标记今天已推进，下次继续同一条任务。完成状态与截止日期保持原值。').fontColor($r('app.color.text_secondary')).width('100%')
          if (this.item?.due || this.item?.date) { Text(`原截止或事项日期：${this.item?.due || this.item?.date}`).fontColor($r('app.color.text_secondary')).width('100%') }
          TextInput({ text: this.nextDate, placeholder: '下次继续日期 YYYY-MM-DD' }).maxLength(10).enabled(!this.busy)
            .onChange((value: string) => { this.nextDate = value; }).onSubmit(() => this.saveAdvance()).accessibilityText('填写明天或之后的继续日期，回车保存今日推进')
          DatePicker({ start: new Date(`${addDays(localDate(), 1)}T12:00:00`), end: new Date('2100-12-31T12:00:00'), selected: this.pickerDate() })
            .onDateChange((date: Date) => { this.nextDate = localDate(date); }).enabled(!this.busy).height(180).width('100%').accessibilityText('选择下次继续任务的日期，也可在输入框填写')
          if (this.error) { Text(this.error).fontColor($r('app.color.danger')).width('100%') }
          Button(this.busy ? '保存中…' : '今日已推进').enabled(!this.busy && !!this.item && !workCompleted(this.item))
            .onClick(() => this.saveAdvance()).accessibilityText('标记今日已推进并保存下次继续日期，不生成额外阶段')
        }.width('100%').constraintSize({ maxWidth: 800 }).padding(20).alignItems(HorizontalAlign.Start)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('今天先到这', () => this.stack.pop()))
  }
}
