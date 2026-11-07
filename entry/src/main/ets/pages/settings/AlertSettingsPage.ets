import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { KEY_LIFE_REVISION, ALERT_TONE_IDS, ALERT_TONE_LABELS } from '../../config/constants';
import { lifeRuntime, AlertPatch } from '../../services/life/LifeRuntime';
import { LifeView } from '../../models/LifeModels';

@Component
export struct AlertSettingsPage {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_LIFE_REVISION) @Watch('reload') private revision: number = 0;
  @State private view: LifeView = lifeRuntime().snapshot();
  @State private volume: number = 30;
  @State private notice: string = '';
  @State private busy: boolean = false;
  private dragging: boolean = false;
  aboutToAppear(): void { this.reload(); }
  private reload(): void { const next = lifeRuntime().snapshot(); if (next.scope !== this.view.scope) { this.dragging = false; this.notice = ''; } this.view = next; if (!this.dragging) this.volume = this.view.alerts.volume; }
  private async update(patch: AlertPatch): Promise<void> {
    if (this.busy) return; this.busy = true;
    try { await lifeRuntime().saveAlerts(patch); this.dragging = false; this.reload(); this.notice = '提醒设置已保存'; }
    catch (error) { this.notice = (error as Error).message; }
    finally { this.busy = false; }
  }
  private async toggleNotifications(): Promise<void> {
    if (this.busy) return; this.busy = true; this.notice = '';
    try {
      if (this.view.alerts.notifications) await lifeRuntime().saveAlerts({ notifications: false });
      else await lifeRuntime().enableNotifications(this.getUIContext().getHostContext() as common.UIAbilityContext);
    } catch (error) { this.notice = (error as Error).message; }
    finally { this.busy = false; }
  }
  private async openNotifications(): Promise<void> {
    if (this.busy) return; this.busy = true;
    try { await lifeRuntime().openNotificationSettings(this.getUIContext().getHostContext() as common.UIAbilityContext); }
    catch (error) { this.notice = (error as Error).message; }
    finally { this.busy = false; }
  }
  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 18 }) {
          Text('提醒设置').fontSize(26).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          Text('仅当前账号 · 当前设备').fontColor($r('app.color.text_secondary')).width('100%')
          Text('系统通知').fontSize(19).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          Text(this.view.notificationPermission === 'checking' ? '正在读取通知权限' : this.view.notificationPermission === 'granted' ? '系统通知权限已开启' : this.view.notificationPermission === 'unsupported' ? '当前设备不支持系统通知' : this.view.notificationPermission === 'error' ? '暂时无法读取通知权限' : '系统通知未开启')
            .fontColor($r('app.color.text_secondary')).width('100%')
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            Button(this.view.alerts.notifications ? '关闭系统通知' : '开启系统通知')
              .enabled(this.view.enabled && !this.busy && !this.view.alertsLoading && this.view.notificationPermission !== 'unsupported')
              .onClick(() => this.toggleNotifications()).accessibilityText('由你主动开启或关闭生活提醒系统通知，只有开启操作会请求授权')
            Button('系统通知设置').enabled(this.view.enabled && !this.busy && this.view.notificationPermission !== 'unsupported')
              .onClick(() => this.openNotifications()).accessibilityText('由你主动打开本应用的系统通知权限设置')
            Button('测试通知').enabled(this.view.enabled && !this.busy && this.view.alerts.notifications && this.view.notificationPermission === 'granted')
              .onClick(() => lifeRuntime().previewNotification()).accessibilityText('主动提交一条静音测试通知，不修改提醒时间')
          }
          Row() {
            Text('提示音').fontSize(19).layoutWeight(1).fontColor($r('app.color.text_primary'))
            Toggle({ type: ToggleType.Switch, isOn: this.view.alerts.sound }).enabled(this.view.enabled && !this.view.alertsLoading && !this.busy)
              .onChange((value: boolean) => this.update({ sound: value })).accessibilityText('启用或关闭生活提醒和眼睛循环的提示音')
          }.width('100%')
          Select(ALERT_TONE_LABELS.map((value): SelectOption => ({ value }))).selected(ALERT_TONE_IDS.indexOf(this.view.alerts.tone))
            .value(ALERT_TONE_LABELS[ALERT_TONE_IDS.indexOf(this.view.alerts.tone)]).enabled(!this.busy && this.view.enabled && !this.view.alertsLoading)
            .onSelect((index: number) => this.update({ tone: ALERT_TONE_IDS[index] })).accessibilityText('选择柔和铃声、清脆提示或双音提示')
          Text(`提醒音量 ${Math.round(this.volume)}%${this.volume === 0 ? ' · 静音' : ''}`).fontColor($r('app.color.text_secondary')).width('100%')
          Slider({ value: this.volume, min: 0, max: 100, step: 5 }).enabled(!this.busy && this.view.enabled && !this.view.alertsLoading)
            .onChange((value: number, mode: SliderChangeMode) => { this.volume = value; this.dragging = true;
              if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.update({ volume: value });
            }).accessibilityText('设置生活提醒提示音音量，不修改系统音量')
          Button('试听提示音').enabled(this.view.enabled && !this.view.alertsLoading).onClick(() => lifeRuntime().previewSound(false)).accessibilityText('试听当前所选提示音，不修改提醒时间，也不开始循环')
          Text('计时在应用运行时投递提醒；回到前台时按经过的时间更新。系统通知静音，提示音由本页独立控制；应用关闭后不会安排后台闹钟。')
            .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
          if (this.notice) { Text(this.notice).fontColor($r('app.color.text_secondary')).width('100%') }
          if (this.view.message) { Text(this.view.message).fontColor($r('app.color.text_secondary')).width('100%') }
        }.width('100%').constraintSize({ maxWidth: 700 }).padding(20).alignItems(HorizontalAlign.Start)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('提醒设置', () => this.stack.pop()))
    .onShown(() => lifeRuntime().refreshNotificationPermission())
  }
}
