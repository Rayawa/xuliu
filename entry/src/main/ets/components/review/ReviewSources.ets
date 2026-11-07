import { ReviewSource, WorkspaceEntry, TimeEntry, ProgressLog } from '../../models/Workspace';
import { getWorkspace } from '../../services/storage/storage';
import { KEY_REVISION } from '../../config/constants';
import { blocksFor } from '../../domain/workspace/WorkspaceDomain';
import { DocumentEditor } from '../workspace/DocumentEditor';
import { AttachmentPanel } from '../workspace/AttachmentPanel';

interface SourceView { key: string; source: ReviewSource; record?: WorkspaceEntry; times: TimeEntry[]; }

@Component
export struct ReviewSources {
  @Prop @Watch('reload') sources: ReviewSource[] = [];
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private values: SourceView[] = [];
  @State private visible: number = 20;
  @State private history: number = 20;
  @State private expanded: string = '';
  aboutToAppear(): void { this.reload(); }
  private reload(): void {
    const data = getWorkspace(); const records = new Map<string, WorkspaceEntry>(); const times = new Map<string, TimeEntry[]>();
    data.tasks.forEach((item) => records.set(`task:${item.id}`, item));
    data.milestones.forEach((item) => records.set(`milestone:${item.id}`, item));
    data.timeEntries.forEach((entry) => { const key = `${entry.targetKind ?? 'task'}:${entry.taskId}`; times.set(key, (times.get(key) ?? []).concat([entry])); });
    this.values = this.sources.map((source): SourceView => {
      const key = `${source.kind}:${source.id}`; return { key, source, record: records.get(key), times: (times.get(key) ?? []).reverse() };
    });
  }
  @Builder
  private details(value: SourceView) {
    if (value.record) {
      Column({ space: 12 }) {
        if (value.record.requirements) { Text(value.record.requirements).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).width('100%') }
        if (value.record.outcomeText) { Text(value.record.outcomeText).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).width('100%') }
        if (value.record.note) { Text(value.record.note).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).width('100%') }
        Text(`原记录投入 ${value.record.elapsed ?? 0} 分钟`).fontColor($r('app.color.text_secondary')).width('100%')
        ForEach((value.record.progressLogs ?? []).slice(-this.history).reverse(), (log: ProgressLog) => {
          Text(`${log.date} · ${log.progress}%${log.note ? ` · ${log.note}` : ''}`).fontColor($r('app.color.text_secondary')).width('100%')
        }, (log: ProgressLog) => log.id)
        ForEach(value.times.slice(0, this.history), (entry: TimeEntry) => {
          Text(`${entry.date} · ${entry.minutes}分钟${entry.note ? ` · ${entry.note}` : ''}`).fontColor($r('app.color.text_secondary')).width('100%')
        }, (entry: TimeEntry) => entry.id)
        if ((value.record.progressLogs?.length ?? 0) > this.history || value.times.length > this.history) {
          Button('查看更早历史').onClick(() => { this.history += 20; }).accessibilityText('继续显示原记录更早的进度与专注用时历史')
        }
        DocumentEditor({ blocks: blocksFor(value.record), readOnly: true })
        if (value.record.attachments?.length) {
          AttachmentPanel({ files: value.record.attachments, readOnly: true, title: '原要求与资料附件', scopeId: `${value.source.kind}:${value.source.id}` })
        }
        if (value.record.outcomeAttachments?.length) {
          AttachmentPanel({ files: value.record.outcomeAttachments, readOnly: true, title: '原成果附件', scopeId: `outcome:${value.source.id}` })
        }
      }.width('100%').alignItems(HorizontalAlign.Start)
    } else { Text('原记录已移除，来源编号仍保留。').fontColor($r('app.color.text_secondary')).width('100%') }
  }
  build() {
    Column({ space: 12 }) {
      if (this.values.length) { Text(`原有记录 · ${this.values.length}`).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%') }
      ForEach(this.values.slice(0, this.visible), (value: SourceView) => {
        Column({ space: 10 }) {
          Button(`${value.record?.title ?? value.source.id}${this.expanded === value.key ? ' · 收起' : ' · 查看'}`)
            .onClick(() => { this.expanded = this.expanded === value.key ? '' : value.key; this.history = 20; })
            .accessibilityText(`只读查看原有${value.source.kind === 'task' ? '任务' : '课程节点'}：${value.record?.title ?? value.source.id}`)
          if (this.expanded === value.key) { this.details(value) }
        }.padding(14).width('100%').borderRadius(14).backgroundColor($r('app.color.surface_secondary'))
      }, (value: SourceView) => `${value.key}-${this.revision}`)
      if (this.visible < this.values.length) { Button('继续显示来源记录').onClick(() => { this.visible += 20; }).accessibilityText('显示下一批复习来源记录，原文和附件不会删除') }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
