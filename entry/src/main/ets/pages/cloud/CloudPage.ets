import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { currentCloudAccount, currentCloudAccounts } from '../../state/cloudSession';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { CloudApi } from '../../services/api/CloudApi';
import { CloudAccount, CloudRecord } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { ROUTE_AI, ROUTE_WEB, CLOUD_ORIGIN } from '../../config/constants';

@Component
export struct CloudPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @State private username: string = '';
  @State private password: string = '';
  @State private account: CloudAccount | undefined = undefined;
  @State private accounts: CloudAccount[] = [];
  @State private owner: string = '';
  @State private record: CloudRecord | undefined = undefined;
  @State private message: string = '';
  @State private busy: boolean = false;
  private api: CloudApi = new CloudApi();
  private alive: boolean = true;

  aboutToAppear(): void {
    this.account = currentCloudAccount(); this.accounts = currentCloudAccounts(); this.owner = this.account?.id ?? '';
  }

  aboutToDisappear(): void { this.alive = false; this.password = ''; this.api.dispose(); }

  private async login(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const account = await this.api.login(this.username, this.password);
      this.password = '';
      const session = await this.api.session();
      if (!this.alive) return;
      this.account = account; this.accounts = session.visibleAccounts; this.owner = account.id;
      this.record = await this.api.read(this.owner); this.message = '已登录，尚未更改本机或云端数据';
    } catch (error) { if (this.alive) this.message = (error as Error).message; }
    finally { if (this.alive) this.busy = false; }
  }

  private async read(): Promise<void> {
    this.busy = true; this.record = undefined;
    try { const record = await this.api.read(this.owner); if (this.alive) this.record = record; }
    catch (error) { if (this.alive) this.message = (error as Error).message; }
    finally { if (this.alive) this.busy = false; }
  }

  private async download(): Promise<void> {
    const record = this.record;
    if (!record?.data) { this.message = '云端还没有保存的工作台'; return; }
    const result = await this.getUIContext().getPromptAction().showDialog({ title: '用云端内容替换本机工作台？',
      message: '本机现有内容将被替换。建议先在“我的”导出备份。云端内容不会被修改。',
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '下载并替换', color: $r('app.color.danger') }] });
    if (result.index !== 1) return;
    this.busy = true;
    try { await saveWorkspace(record.data, false); this.message = '已下载到本机，可离线编辑'; }
    catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async upload(): Promise<void> {
    if (!this.record || this.record.readOnly || this.owner !== this.account?.id) { this.message = '只能写入自己的空间'; return; }
    const revision = this.record.revision;
    const result = await this.getUIContext().getPromptAction().showDialog({ title: '上传本机工作台？',
      message: `将本机完整工作台保存到“${this.account.displayName}”空间，以已读取版本 ${revision} 为基础。云端已变化时会拒绝覆盖。`,
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '确认上传', color: $r('app.color.accent') }] });
    if (result.index !== 1) return;
    this.busy = true;
    try {
      const result = await this.api.save(getWorkspace(), revision);
      this.record = await this.api.read(this.owner); this.message = `已保存到云端，版本 ${result.revision}`;
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 18 }) {
          Text('连接你的序流空间').fontSize(28).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Text(`服务地址：${CLOUD_ORIGIN}`).fontColor($r('app.color.text_secondary'))
          Text('本机工作台可以独立使用。云端操作由你手动发起，密码和会话不会写入本地存储。').fontColor($r('app.color.text_secondary'))
          if (!this.account) {
            TextInput({ text: this.username, placeholder: '用户名' }).onChange((v: string) => { this.username = v; }).accessibilityText('序流云端用户名')
            TextInput({ text: this.password, placeholder: '密码' }).type(InputType.Password).onChange((v: string) => { this.password = v; })
              .accessibilityText('序流云端密码')
            Button(this.busy ? '登录中…' : '登录').enabled(!this.busy && !!this.username.trim() && !!this.password)
              .onClick(() => this.login()).accessibilityText('登录序流云端账号')
          } else {
            Text(`当前账号：${this.account.displayName}`).fontSize(20).fontColor($r('app.color.text_primary'))
            Select(this.accounts.map((v): SelectOption => ({ value: v.displayName })))
              .value(this.accounts.find((v) => v.id === this.owner)?.displayName ?? '')
              .enabled(!this.busy).onSelect((index: number) => { this.owner = this.accounts[index].id; this.read(); }).accessibilityText('选择可访问的云端空间')
            Text(`版本 ${this.record?.revision ?? '—'} · ${this.record?.readOnly ? '只读空间' : '自己的空间'}`)
              .fontColor($r('app.color.text_secondary'))
            if (this.record?.data) {
              Text(`云端：${this.record.data.tasks.length} 个任务、${this.record.data.courses.length} 门课程、${this.record.data.pages.length} 页笔记`)
                .fontColor($r('app.color.text_primary'))
            }
            Button('重新读取云端').enabled(!this.busy).onClick(() => this.read()).accessibilityText('读取最新云端版本')
            Button('下载云端到本机').enabled(!this.busy && !!this.record?.data).onClick(() => this.download()).accessibilityText('预览确认后用云端数据替换本机')
            Button('上传本机到自己的云端').enabled(!this.busy && !!this.record && !this.record.readOnly && this.owner === this.account.id)
              .onClick(() => this.upload()).accessibilityText('预览确认后上传本机工作台，使用版本冲突保护')
            Button('退出登录').enabled(!this.busy).onClick(async () => {
              try { await this.api.logout(); } catch (_) {}
              this.account = undefined; this.record = undefined; this.accounts = []; this.password = '';
            }).accessibilityText('退出序流云端账号')
          }
          Text(this.message).fontColor($r('app.color.text_secondary')).accessibilityText(this.message || '云端连接状态')
          Button('原生AI助手').onClick(() => this.pageStack.pushPath({ name: ROUTE_AI })).accessibilityText('使用已登录账号打开原生AI助手')
          Button('打开完整云端工作台').onClick(() => this.pageStack.pushPath({ name: ROUTE_WEB }))
            .accessibilityText('打开官方云端工作台网页')
          Text('网页使用独立会话，需要单独登录。原生AI与附件可使用当前账号，依赖上游服务配置。')
            .fontColor($r('app.color.text_secondary')).fontSize(13)
        }.width('100%').constraintSize({ maxWidth: 720 }).padding(24)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('账号与云端', () => this.pageStack.pop()))
  }
}
