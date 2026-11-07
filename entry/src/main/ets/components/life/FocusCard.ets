import { uid } from '../../domain/workspace/WorkspaceDomain';
import { LengthMetrics } from '@kit.ArkUI';
import { KEY_LIFE_REVISION, DEFAULT_FOCUS_VOLUME } from '../../config/constants';
import { LifeView } from '../../models/LifeModels';
import { lifeRuntime, FocusPatch } from '../../services/life/LifeRuntime';
import { clockText } from '../../domain/life/TimerState';

@Component
export struct FocusCard {
  @Prop compact: boolean = false;
  @StorageLink(KEY_LIFE_REVISION) @Watch('reload') private revision: number = 0;
  @State private view: LifeView = lifeRuntime().snapshot();
  @State private showSettings: boolean = false;
  @State private minutesDraft: string = '';
  @State private volumeDraft: number = DEFAULT_FOCUS_VOLUME;
  @State private notice: string = '';
  @State private busy: boolean = false;
  private visibleId: string = uid();
  private minutesDirty: boolean = false;
  private volumeDirty: boolean = false;
  private alive: boolean = true;
  aboutToAppear(): void { this.reload(); }
  aboutToDisappear(): void { this.alive = false; lifeRuntime().setFocusVisible(this.visibleId, false); }
  private reload(): void {
    const next = lifeRuntime().snapshot();
    if (next.scope !== this.view.scope) { this.minutesDirty = false; this.volumeDirty = false; this.notice = ''; }
    this.view = next;
    if (!this.minutesDirty) this.minutesDraft = String(this.view.settings.minutes);
    if (!this.volumeDirty) this.volumeDraft = this.view.settings.volume;
  }
  private async saveSettings(patch: FocusPatch): Promise<void> {
    if (this.busy) return; this.busy = true; this.notice = '';
    try {
      await lifeRuntime().saveFocus(patch);
      if (!this.alive) return;
      if (patch.minutes !== undefined) this.minutesDirty = false;
      if (patch.volume !== undefined) this.volumeDirty = false;
      this.reload();
    } catch (error) { if (this.alive) this.notice = (error as Error).message; }
    finally { if (this.alive) this.busy = false; }
  }
  private totalSeconds(): number { return (this.view.pomodoro?.durationMs ?? this.view.settings.minutes * 60000) / 1000; }
  build() {
    Column({ space: 16 }) {
      Text('番茄钟').fontSize(23).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      Stack() {
        Progress({ value: Math.max(0, this.totalSeconds() - this.view.remainingSeconds), total: this.totalSeconds(), type: ProgressType.Ring })
          .width('100%').height('100%').color($r('app.color.accent')).backgroundColor($r('app.color.chart_track')).accessibilityLevel('no')
        Text(clockText(this.view.remainingSeconds)).fontSize(this.compact ? 34 : 44).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
          .accessibilityText(`番茄钟剩余${Math.floor(this.view.remainingSeconds / 60)}分${this.view.remainingSeconds % 60}秒`)
      }.width('100%').constraintSize({ maxWidth: this.compact ? 180 : 240 }).aspectRatio(1)
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(10) } }) {
        Button(this.view.pomodoro?.startedAt !== undefined ? '暂停' : this.view.finished ? '再来一轮' : this.view.pomodoro ? '继续' : '开始')
          .enabled(this.view.enabled).onClick(() => lifeRuntime().toggleFocus()).accessibilityText('开始、暂停或继续独立番茄钟，不写入任务用时')
        Button('重置').enabled(this.view.enabled && !!this.view.pomodoro).onClick(() => lifeRuntime().resetFocus()).accessibilityText('重置当前番茄钟，本轮不计入历史用时')
        Button(this.showSettings ? '收起时长与声音' : '时长与声音').onClick(() => { this.showSettings = !this.showSettings; }).accessibilityText('展开或收起番茄钟时长和声音设置')
      }
      if (this.showSettings) {
        Column({ space: 12 }) {
          TextInput({ text: this.minutesDraft, placeholder: '番茄钟时长，1–180分钟' }).type(InputType.Number).maxLength(3).enabled(this.view.enabled && !this.view.pomodoro && !this.busy)
            .onChange((value: string) => { this.minutesDraft = value; this.minutesDirty = true; })
            .onSubmit(() => this.saveSettings({ minutes: Number(this.minutesDraft) })).accessibilityText('番茄钟时长，1到180分钟，本轮存在时需先重置')
          Button('保存时长').enabled(this.view.enabled && !this.view.pomodoro && !this.busy && this.minutesDirty)
            .onClick(() => this.saveSettings({ minutes: Number(this.minutesDraft) })).accessibilityText('保存下一轮番茄钟时长')
          Row() {
            Text('结束时播放提示音').layoutWeight(1).fontColor($r('app.color.text_primary'))
            Toggle({ type: ToggleType.Switch, isOn: this.view.settings.sound }).enabled(this.view.enabled && !this.busy)
              .onChange((value: boolean) => this.saveSettings({ sound: value })).accessibilityText('开启或关闭番茄钟结束提示音')
          }.width('100%')
          Text(`提示音音量 ${Math.round(this.volumeDraft)}%`).fontColor($r('app.color.text_secondary')).width('100%')
          Slider({ value: this.volumeDraft, min: 0, max: 100, step: 5 }).enabled(this.view.enabled && !this.busy)
            .onChange((value: number, mode: SliderChangeMode) => {
              this.volumeDraft = value; this.volumeDirty = true;
              if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.saveSettings({ volume: value });
            }).accessibilityText('设置番茄钟提示音音量，不改变系统音量')
          Button('试听提示音').enabled(this.view.enabled).onClick(() => lifeRuntime().previewSound(true)).accessibilityText('试听番茄钟本地双音提示，不开始计时')
        }.width('100%')
      }
      if (this.view.focusMessage) { Text(this.view.focusMessage).fontColor($r('app.color.text_secondary')).width('100%') }
      if (this.notice) { Text(this.notice).fontColor($r('app.color.danger')).width('100%') }
    }.padding(20).width('100%').borderRadius(20).backgroundColor($r('app.color.surface'))
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
      .onVisibleAreaChange([0], (visible: boolean) => lifeRuntime().setFocusVisible(this.visibleId, visible))
  }
}
