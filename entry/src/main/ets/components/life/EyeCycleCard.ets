import { LengthMetrics } from '@kit.ArkUI';
import { KEY_LIFE_REVISION, EYE_FOCUS_MS, EYE_REST_MS } from '../../config/constants';
import { LifeView } from '../../models/LifeModels';
import { lifeRuntime } from '../../services/life/LifeRuntime';
import { clockText } from '../../domain/life/TimerState';

@Component
export struct EyeCycleCard {
  @StorageLink(KEY_LIFE_REVISION) @Watch('reload') private revision: number = 0;
  @State private view: LifeView = lifeRuntime().snapshot();
  @State private showDetails: boolean = false;
  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.view = lifeRuntime().snapshot(); }
  private phase(): string { return this.view.eye.phase === 'focus' ? '专注用眼' : '休息眼睛'; }
  build() {
    Column({ space: 14 }) {
      Text('眼睛休息循环').fontSize(23).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      if (this.view.eye.status === 'idle') {
        Text('专注30分钟 · 休息5分钟').fontColor($r('app.color.text_secondary')).width('100%')
        Button('开始循环').enabled(this.view.enabled).onClick(() => lifeRuntime().eyeAction('start')).accessibilityText('手动开始三十分钟专注、五分钟休息的眼睛循环')
      } else {
        Text(`${this.phase()}${this.view.eye.status === 'paused' ? ' · 已暂停' : ''}`).fontColor($r('app.color.text_secondary')).width('100%')
        Text(clockText(this.view.eyeRemainingSeconds)).fontSize(38).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
          .accessibilityText(`${this.phase()}剩余${Math.floor(this.view.eyeRemainingSeconds / 60)}分${this.view.eyeRemainingSeconds % 60}秒`)
        Progress({ value: Math.max(0, 100 * (1 - this.view.eyeRemainingSeconds * 1000 / (this.view.eye.phase === 'focus' ? EYE_FOCUS_MS : EYE_REST_MS))), total: 100, type: ProgressType.Linear })
          .width('100%').color($r('app.color.accent')).accessibilityText(`${this.phase()}当前周期进度`)
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(10) } }) {
          Button(this.view.eye.status === 'running' ? '暂停' : '继续').enabled(this.view.enabled)
            .onClick(() => lifeRuntime().eyeAction(this.view.eye.status === 'running' ? 'pause' : 'resume')).accessibilityText('暂停或继续眼睛休息循环')
          Button('结束循环').enabled(this.view.enabled).onClick(() => lifeRuntime().eyeAction('stop')).accessibilityText('结束眼睛休息循环，恢复未开始状态')
          Button(this.showDetails ? '收起周期与记录' : '周期与记录').onClick(() => { this.showDetails = !this.showDetails; }).accessibilityText('展开或收起眼睛循环周期与完成轮数')
        }
        if (this.showDetails) {
          Text(`专注30分钟 · 休息5分钟\n已完成${this.view.eye.completedRounds}轮\n${this.view.eye.phase === 'focus' ? '下一次：休息5分钟' : '结束后：自动开始30分钟'}`)
            .fontColor($r('app.color.text_secondary')).width('100%')
        }
      }
    }.padding(20).width('100%').borderRadius(20).backgroundColor($r('app.color.surface')).alignItems(HorizontalAlign.Start)
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
  }
}
