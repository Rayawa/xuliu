import { LengthMetrics } from '@kit.ArkUI';
import { KEY_LIFE_REVISION, ROUTE_FOCUS } from '../../config/constants';
import { LifeView } from '../../models/LifeModels';
import { lifeRuntime } from '../../services/life/LifeRuntime';
import { clockText } from '../../domain/life/TimerState';

@Component
export struct LifeOverlay {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_LIFE_REVISION) @Watch('reload') private revision: number = 0;
  @State private view: LifeView = lifeRuntime().snapshot();
  @State private busy: boolean = false;
  @State private notice: string = '';
  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.view = lifeRuntime().snapshot(); }
  private async dismiss(snooze: boolean): Promise<void> {
    if (this.busy) return; this.busy = true;
    try { await lifeRuntime().dismissPopup(snooze); this.notice = ''; }
    catch (error) { this.notice = (error as Error).message; }
    finally { this.busy = false; }
  }
  private showFocus(): void {
    const paths = this.stack.getAllPathName(); if (paths[paths.length - 1] !== ROUTE_FOCUS) this.stack.pushPath({ name: ROUTE_FOCUS });
  }
  build() {
    Column({ space: 10 }) {
      if (this.view.enabled && this.view.pomodoro && !this.view.finished && !this.view.focusVisible) {
        Row({ space: 10 }) {
          Text(`番茄钟 · ${clockText(this.view.remainingSeconds)}${this.view.pomodoro.startedAt === undefined ? ' · 已暂停' : ''}`)
            .layoutWeight(1).fontColor($r('app.color.text_primary'))
          Button('查看').onClick(() => this.showFocus()).accessibilityText('查看跨页面继续的番茄钟')
        }.width('100%').padding(10).borderRadius(14).backgroundColor($r('app.color.surface_secondary'))
      }
      if (this.view.enabled && this.view.popup) {
        Column({ space: 10 }) {
          Text(this.view.popup.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          Text(this.view.popup.body).fontColor($r('app.color.text_secondary')).width('100%')
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(10) } }) {
            Button('知道了').enabled(!this.busy).onClick(() => this.dismiss(false)).accessibilityText('关闭当前提示，生活间隔提醒从现在重新计时')
            if (this.view.popup.reminderId) { Button('稍后5分钟').enabled(!this.busy).onClick(() => this.dismiss(true)).accessibilityText('将当前生活提醒延迟五分钟，其他提醒不变') }
          }
          if (this.notice) { Text(this.notice).fontColor($r('app.color.danger')) }
        }.width('100%').padding(16).borderRadius(18).backgroundColor($r('app.color.surface'))

      }
    }.width('100%').constraintSize({ maxWidth: 520 }).padding(12).hitTestBehavior(HitTestMode.Transparent)
  }
}
