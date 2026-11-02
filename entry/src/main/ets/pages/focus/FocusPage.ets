import { KEY_FOCUS_SESSION } from '../../config/constants';
import { KEY_ACTIVE } from '../../config/constants';
import { TimeEntry } from '../../models/Workspace';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { WorkspaceEntry, EntryTarget } from '../../models/Workspace';
import { DEFAULT_FOCUS_MINUTES, MAX_FOCUS_MINUTES } from '../../config/constants';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { localDate, uid } from '../../domain/workspace/WorkspaceDomain';

interface FocusSession {
  id: string;
  targetId: string;
  collection: string;
  startedAt: number;
  elapsedMs: number;
  durationMinutes: number;
  running: boolean;
}

@Component
export struct FocusPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop target: EntryTarget = { collection: 'tasks', id: '' };
  @StorageLink(KEY_ACTIVE) @Watch('activityChanged') private active: boolean = true;
  @State private tasks: WorkspaceEntry[] = [];
  @State private selectedId: string = 'standalone';
  @State private manualMinutes: string = '';
  @State private manualNote: string = '';
  @State private history: TimeEntry[] = [];
  @State private minutes: number = DEFAULT_FOCUS_MINUTES;
  @State private elapsed: number = 0;
  @State private running: boolean = false;
  @State private message: string = '';
  private timer: number = -1;
  private visible: boolean = false;
  private session: FocusSession = { id: '', targetId: '', collection: 'tasks', startedAt: 0, elapsedMs: 0,
    durationMinutes: DEFAULT_FOCUS_MINUTES, running: false };
  private saving: boolean = false;

  aboutToAppear(): void {
    this.tasks = getWorkspace().tasks.concat(getWorkspace().milestones);
    this.selectedId = this.target.id || 'standalone';
    const existing = AppStorage.get<FocusSession>(KEY_FOCUS_SESSION);
    if (existing) { this.session = existing; this.selectedId = existing.targetId; this.minutes = existing.durationMinutes; }
    else this.minutes = getWorkspace().focusSettings?.minutes ?? DEFAULT_FOCUS_MINUTES;
    this.history = getWorkspace().timeEntries.slice().reverse();
    this.running = this.session.running; this.tick();
  }

  private activityChanged(): void { this.stopTimer(); if (this.active && this.visible) this.startTimer(); }
  private stopTimer(): void { if (this.timer >= 0) clearInterval(this.timer); this.timer = -1; }
  private startTimer(): void { this.tick(); if (this.timer < 0) this.timer = setInterval(() => this.tick(), 1000); }
  aboutToDisappear(): void { this.visible = false; this.stopTimer(); }

  private tick(): void {
    this.elapsed = Math.floor((this.session.elapsedMs + (this.session.running ? Date.now() - this.session.startedAt : 0)) / 1000);
    if (this.session.running && this.elapsed >= this.session.durationMinutes * 60 && !this.saving) {
      this.elapsed = this.session.durationMinutes * 60; this.finish();
    }
  }

  private toggle(): void {
    if (!this.session.id) {
      this.session = { id: uid(), targetId: this.selectedId,
        collection: this.selectedId === 'standalone' ? 'standalone' : getWorkspace().tasks.some((v) => v.id === this.selectedId) ? 'tasks' : 'milestones',
        startedAt: Date.now(), elapsedMs: 0, durationMinutes: this.minutes, running: true };
    } else if (this.session.running) {
      this.session.elapsedMs += Date.now() - this.session.startedAt; this.session.running = false;
    } else { this.session.startedAt = Date.now(); this.session.running = true; }
    this.running = this.session.running;
    AppStorage.setOrCreate(KEY_FOCUS_SESSION, this.session); this.tick();
  }

  private async finish(): Promise<void> {
    if (!this.session.id || this.saving) return;
    this.saving = true;
    if (this.session.running) this.session.elapsedMs += Date.now() - this.session.startedAt;
    this.session.running = false; this.running = false;
    const seconds = Math.min(this.session.durationMinutes * 60, Math.floor(this.session.elapsedMs / 1000));
    if (seconds < 60) { this.message = '专注不足一分钟，尚未计入记录'; this.saving = false; return; }
    try {
      const data = getWorkspace();
      if (!data.timeEntries.some((v) => v.id === this.session.id)) {
        data.timeEntries.push({ id: this.session.id, taskId: this.session.targetId,
          targetKind: this.session.collection === 'milestones' ? 'milestone' : 'task', minutes: Math.floor(seconds / 60), date: localDate(), mode: '番茄钟' });
        const item = (this.session.collection === 'tasks' ? data.tasks : data.milestones).find((v) => v.id === this.session.targetId);
        if (item) item.elapsed = (item.elapsed ?? 0) + Math.floor(seconds / 60);
        data.focusSettings = { minutes: this.minutes, sound: false, volume: 50 };
        await saveWorkspace(data);
      }
      this.history = getWorkspace().timeEntries.slice().reverse();
      AppStorage.delete(KEY_FOCUS_SESSION);
      this.session.id = ''; this.session.elapsedMs = 0; this.elapsed = 0;
      this.message = `已记录 ${Math.floor(seconds / 60)} 分钟。休息一下，看看远处。`;
    } catch (error) { this.message = (error as Error).message; }
    finally { this.saving = false; }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 24 }) {
          Text('专注此刻').fontSize(30).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Select(([{ value: '独立专注' }] as SelectOption[]).concat(this.tasks.map((v): SelectOption => ({ value: v.title }))))
            .value(this.tasks.find((v) => v.id === this.selectedId)?.title ?? '独立专注')
            .enabled(!this.session.id)
              .onSelect((index: number) => { this.selectedId = index === 0 ? 'standalone' : this.tasks[index - 1].id; })
              .accessibilityText('选择专注任务')
          Text(`专注时长 ${this.minutes} 分钟`).fontColor($r('app.color.text_secondary'))
          Slider({ value: this.minutes, min: 1, max: MAX_FOCUS_MINUTES, step: 1 }).enabled(!this.session.id)
            .onChange((v: number) => { this.minutes = Math.round(v); }).accessibilityText('设置专注时长，1到180分钟')
          Stack() {
            Progress({ value: this.elapsed, total: this.minutes * 60, type: ProgressType.Ring })
              .width(240).height(240).color($r('app.color.accent')).backgroundColor($r('app.color.chart_track'))
              .accessibilityText(`已专注${Math.floor(this.elapsed / 60)}分钟`)
            Text(`${String(Math.floor(Math.max(0, this.minutes * 60 - this.elapsed) / 60)).padStart(2, '0')}:${String(Math.max(0, this.minutes * 60 - this.elapsed) % 60).padStart(2, '0')}`)
              .fontSize(42).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
          }
          Button(this.running ? '暂停' : '开始 / 继续').onClick(() => this.toggle()).accessibilityText(this.running ? '暂停专注计时' : '开始或继续专注计时')
          Button(this.saving ? '保存中…' : '结束并记录')
            .enabled(!this.saving && !!this.session.id)
            .onClick(() => this.finish())
            .accessibilityText('结束专注并保存用时')
          if (this.session.id) {
            Button('放弃本次计时').onClick(() => {
              this.getUIContext().getPromptAction().showDialog({ title: '放弃本次专注？', message: '此次未保存的用时将被清除。',
                buttons: [{ text: '继续专注', color: $r('app.color.accent') }, { text: '放弃', color: $r('app.color.danger') }]
              }).then((result) => {
                if (result.index !== 1) return;
                AppStorage.delete(KEY_FOCUS_SESSION); this.session.id = ''; this.session.running = false;
                this.session.elapsedMs = 0; this.running = false; this.elapsed = 0;
              });
            }).accessibilityText('放弃当前尚未保存的专注计时')
          }
          Text('手动补录').fontSize(20).fontColor($r('app.color.text_primary'))
          TextInput({ text: this.manualMinutes, placeholder: '分钟数，1–1440' }).type(InputType.Number)
            .onChange((v: string) => { this.manualMinutes = v; }).accessibilityText('手动记录的分钟数')
          TextInput({ text: this.manualNote, placeholder: '用时备注' }).onChange((v: string) => { this.manualNote = v; }).accessibilityText('手动记录用时备注')
          Button('记录用时').onClick(async () => {
            const minutes = Number(this.manualMinutes);
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { this.message = '请输入 1–1440 的整数分钟'; return; }
            try {
              const data = getWorkspace(); const isMilestone = data.milestones.some((v) => v.id === this.selectedId);
              data.timeEntries.push({ id: uid(), taskId: this.selectedId, targetKind: isMilestone ? 'milestone' : 'task',
                minutes, date: localDate(), mode: '手动补录', note: this.manualNote });
              const linked = (isMilestone ? data.milestones : data.tasks).find((v) => v.id === this.selectedId);
              if (linked) linked.elapsed = (linked.elapsed ?? 0) + minutes;
              await saveWorkspace(data); this.history = getWorkspace().timeEntries.slice().reverse();
              this.manualMinutes = ''; this.manualNote = ''; this.message = '用时已记录';
            } catch (error) { this.message = (error as Error).message; }
          }).accessibilityText('保存补录的专注用时')
          Text('最近用时').fontSize(20).fontColor($r('app.color.text_primary'))
          ForEach(this.history.slice(0, 30), (entry: TimeEntry) => {
            Text(`${entry.date} · ${this.tasks.find((v) => v.id === entry.taskId)?.title ?? '独立专注'} · ${entry.minutes}分钟 · ${entry.mode}`)
              .fontColor($r('app.color.text_secondary')).width('100%')
          }, (entry: TimeEntry) => entry.id)
          Text(this.message).fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center)
          Text('离开页面后计时按真实时间继续，返回时结算；应用进程结束后未保存的计时会丢失。')
            .fontSize(13).fontColor($r('app.color.text_secondary'))
        }.width('100%').constraintSize({ maxWidth: 600 }).padding(24)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '专注计时' }, backIcon: { action: () => this.pageStack.pop() } } })
    .onShown(() => { this.visible = true; this.startTimer(); })
    .onHidden(() => { this.visible = false; this.stopTimer(); })
  }
}
