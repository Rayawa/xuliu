import { LengthMetrics } from '@kit.ArkUI';
import { KEY_REVISION, ROUTE_ALERT_SETTINGS, ROUTE_EDITOR } from '../../config/constants';
import { WorkspaceEntry, EntryTarget } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { validateEntry } from '../../domain/workspace/WorkspaceDomain';
import { lifeRuntime } from '../../services/life/LifeRuntime';

@Component
export struct ReminderProjects {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private reminders: WorkspaceEntry[] = [];
  @State private visible: number = 20;
  @State private message: string = '';
  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.reminders = getWorkspace().reminders; }
  private edit(id: string): void { this.stack.pushPath({ name: ROUTE_EDITOR, param: { collection: 'reminders', id } as EntryTarget }); }
  private async toggle(id: string, enabled: boolean): Promise<void> {
    try {
      const data = getWorkspace(); const item = data.reminders.find((value) => value.id === id); if (!item) return;
      item.enabled = enabled; const error = validateEntry(item, 'reminders', data); if (error) throw new Error(error); await saveWorkspace(data);
    } catch (error) { this.message = (error as Error).message; }
  }
  private async remove(item: WorkspaceEntry): Promise<void> {
    try {
      const answer = await this.getUIContext().getPromptAction().showDialog({ title: '删除提醒？', message: `删除“${item.title}”？其他提醒和已有记录不变。`,
        buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '删除', color: $r('app.color.danger') }] });
      if (answer.index !== 1) return;
      const data = getWorkspace(); data.reminders = data.reminders.filter((value) => value.id !== item.id); await saveWorkspace(data);
    } catch (error) { this.message = (error as Error).message; }
  }
  build() {
    Column({ space: 14 }) {
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Text('生活提醒').fontSize(23).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
        Button('提醒设置').onClick(() => this.stack.pushPath({ name: ROUTE_ALERT_SETTINGS })).accessibilityText('打开当前账号与设备的提醒声音设置，打开时不播放声音')
        Button('新增提醒').onClick(() => this.edit('')).accessibilityText('新增生活提醒项目')
      }.width('100%')
      ForEach(this.reminders.slice(0, this.visible), (item: WorkspaceEntry) => {
        Column({ space: 8 }) {
          Row({ space: 8 }) {
            Text(item.title).layoutWeight(1).fontSize(18).fontColor($r('app.color.text_primary'))
            Toggle({ type: ToggleType.Switch, isOn: item.enabled === true }).onChange((value: boolean) => this.toggle(item.id, value))
              .accessibilityText(`${item.enabled ? '关闭' : '开启'}提醒${item.title}`)
          }.width('100%')
          Text([item.type === 'break' ? `每${item.intervalMinutes ?? 20}分钟` : '', ...(item.times ?? [])].filter((value) => !!value).join(' / ') || '尚未设置时间')
            .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
          Button('更多').bindMenu([
            { value: '编辑提醒', action: () => this.edit(item.id) },
            { value: '预览提醒', action: () => lifeRuntime().previewReminder(item.id) },
            { value: '删除提醒', action: () => this.remove(item) }
          ]).accessibilityText(`${item.title}的编辑、安静预览和删除操作`)
        }.padding(14).width('100%').borderRadius(14).backgroundColor($r('app.color.surface_secondary'))
      }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
      if (!this.reminders.length) { Text('暂无提醒，可按自己的节奏添加。').fontColor($r('app.color.text_secondary')).width('100%') }
      if (this.visible < this.reminders.length) { Button('显示更多提醒').onClick(() => { this.visible += 20; }).accessibilityText('显示下一批提醒项目') }
      if (this.message) { Text(this.message).fontColor($r('app.color.danger')).width('100%') }
    }.padding(20).width('100%').borderRadius(20).backgroundColor($r('app.color.surface')).alignItems(HorizontalAlign.Start)
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
  }
}
