import { common } from '@kit.AbilityKit';
import { Workspace } from '../../models/Workspace';
import { KEY_USERNAME, KEY_THEME, KEY_ACCENT, KEY_REMINDERS, ROUTE_CLOUD, ROUTE_LOG, ROUTE_PRIVACY,
  ROUTE_COLLECTION, APP_VERSION, ACCENT_RESOURCES } from '../../config/constants';
import { decodeWorkspace, getWorkspace, saveWorkspace, setSetting } from '../../services/storage/storage';
import { exportDocument, readDocument } from '../../services/files/WorkspaceFiles';
import { appendDemo } from '../../domain/workspace/DemoData';
import { localDate } from '../../domain/workspace/WorkspaceDomain';

@Component
export struct MyPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @StorageLink(KEY_USERNAME) private username: string = '朋友';
  @StorageLink(KEY_THEME) private theme: number = 0;
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  @StorageLink(KEY_REMINDERS) private reminders: boolean = true;
  @State private nameDraft: string = '';
  @State private message: string = '';
  @State private pendingImport: Workspace | undefined = undefined;
  @State private busy: boolean = false;

  aboutToAppear(): void { this.nameDraft = this.username; }

  private async setting(key: string, value: string | number | boolean): Promise<void> {
    try { await setSetting(key, value); this.message = '设置已保存'; }
    catch (error) { this.message = (error as Error).message; }
  }

  private async exportData(): Promise<void> {
    this.busy = true;
    try {
      const saved = await exportDocument(this.getUIContext().getHostContext() as common.UIAbilityContext,
        JSON.stringify(getWorkspace(), null, 2), `序流工作台-${localDate()}.json`);
      this.message = saved ? '已导出工作台备份' : '已取消导出';
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async importData(): Promise<void> {
    this.busy = true;
    try {
      const raw = await readDocument(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (raw) this.pendingImport = decodeWorkspace(raw);
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  build() {
    Scroll() {
      Column({ space: 18 }) {
        Text('我的序流').fontSize(28).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        Text('让记录贴近你自己的节奏。').fontColor($r('app.color.text_secondary')).width('100%')
        GridRow({ columns: 12, gutter: 20 }) {
          GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
            Column({ space: 16 }) {
              Text('偏好设置').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
              TextInput({ text: this.nameDraft, placeholder: '怎么称呼你' }).maxLength(30)
                .onChange((v: string) => { this.nameDraft = v; }).accessibilityText('设置首页称呼')
              Button('保存称呼').onClick(() => this.setting(KEY_USERNAME, this.nameDraft.trim() || '朋友')).accessibilityText('保存首页显示的称呼')
              Select([{ value: '跟随系统' }, { value: '浅色' }, { value: '深色' }]).selected(this.theme)
                .value(['跟随系统', '浅色', '深色'][this.theme]).onSelect((index: number) => this.setting(KEY_THEME, index))
                .accessibilityText('设置外观：跟随系统、浅色或深色')
              Text('主题色').fontColor($r('app.color.text_primary'))
              Select([{ value: '松绿' }, { value: '湖蓝' }, { value: '梅紫' }, { value: '暖金' }]).selected(this.accent)
                .value(['松绿', '湖蓝', '梅紫', '暖金'][this.accent]).onSelect((index: number) => this.setting(KEY_ACCENT, index))
                .accessibilityText('设置主题强调色')
              Row() {
                Text('应用前台提醒').layoutWeight(1).fontColor($r('app.color.text_primary'))
                Toggle({ type: ToggleType.Switch, isOn: this.reminders }).onChange((v: boolean) => this.setting(KEY_REMINDERS, v))
                  .accessibilityText('启用或关闭应用前台提醒')
              }.width('100%')
              Button('管理提醒')
                .onClick(() => this.pageStack.pushPath({ name: ROUTE_COLLECTION, param: 'reminders' }))
                .accessibilityText('管理运动休息睡眠与自定义提醒')
            }.width('100%').padding(20).borderRadius(20).backgroundColor($r('app.color.surface'))
          }
          GridCol({ span: { xs: 12, sm: 12, md: 6 } }) {
            Column({ space: 16 }) {
              Text('工作台与数据').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
              Button('账号与云端同步').onClick(() => this.pageStack.pushPath({ name: ROUTE_CLOUD })).accessibilityText('打开账号与手动云端同步')
              Button('导出工作台 JSON').enabled(!this.busy).onClick(() => this.exportData()).accessibilityText('导出完整工作台备份文件')
              Button('导入工作台 JSON').enabled(!this.busy).onClick(() => this.importData()).accessibilityText('选择序流工作台备份并预览')
              if (this.pendingImport) {
                Text(`待导入：${this.pendingImport.tasks.length} 个任务、${this.pendingImport.courses.length} 门课程、${this.pendingImport.pages.length} 页笔记。确认后替换本机工作台。`)
                  .fontColor($r('app.color.text_primary'))
                Button('确认替换本机工作台').onClick(async () => {
                  if (!this.pendingImport) return;
                  try { await saveWorkspace(this.pendingImport); this.pendingImport = undefined; this.message = '导入完成'; }
                  catch (error) { this.message = (error as Error).message; }
                }).accessibilityText('确认用预览的备份替换本机工作台')
                Button('取消导入').onClick(() => { this.pendingImport = undefined; }).accessibilityText('取消导入工作台')
              }
              Button('添加演示内容').onClick(async () => {
                try { await saveWorkspace(appendDemo(getWorkspace())); this.message = '已追加演示内容，可随时编辑或删除'; }
                catch (error) { this.message = (error as Error).message; }
              }).accessibilityText('追加示例任务课程习惯笔记，不替换已有记录')
              Button('更新日志').onClick(() => this.pageStack.pushPath({ name: ROUTE_LOG })).accessibilityText('查看序流更新日志')
              Button('隐私说明').onClick(() => this.pageStack.pushPath({ name: ROUTE_PRIVACY })).accessibilityText('查看序流隐私说明')
              Text(`序流 ${APP_VERSION}`).fontSize(13).fontColor($r('app.color.text_secondary'))
            }.width('100%').padding(20).borderRadius(20).backgroundColor($r('app.color.surface'))
          }
        }
        Text(this.message).fontColor($r('app.color.text_secondary')).accessibilityText(this.message || '设置状态')
      }.width('100%').constraintSize({ maxWidth: 1100 }).padding(20)
    }.width('100%').height('100%').backgroundColor($r('app.color.background'))
  }
}
