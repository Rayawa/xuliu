import { KEY_REVISION, LINKED_TASK_BATCH_SIZE, ROUTE_EDITOR } from '../../config/constants';
import { reviewSourceKeys } from '../../domain/workspace/ReviewDomain';
import { entrySubtitle } from '../../domain/workspace/WorkspaceDomain';
import { EntryTarget, WorkspaceEntry } from '../../models/Workspace';
import { getWorkspace } from '../../services/storage/storage';

@Component
export struct SubjectLinkedTasks {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @Prop @Watch('subjectChanged') subjectId: string = '';
  @State private tasks: WorkspaceEntry[] = [];
  @State private visible: number = LINKED_TASK_BATCH_SIZE;

  aboutToAppear(): void { this.reload(); }

  private subjectChanged(): void {
    this.visible = LINKED_TASK_BATCH_SIZE;
    this.reload();
  }

  private reload(): void {
    if (!this.subjectId) {
      this.tasks = [];
      return;
    }
    const data = getWorkspace();
    const excluded = reviewSourceKeys(data);
    this.tasks = data.tasks.filter((task) => task.courseId === this.subjectId && !excluded.has(`task:${task.id}`));
  }

  build() {
    if (this.tasks.length) {
      Column({ space: 10 }) {
        Text(`关联学习任务 · ${this.tasks.length}项`).fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        ForEach(this.tasks.slice(0, this.visible), (task: WorkspaceEntry) => {
          Button({ type: ButtonType.Normal }) {
            Column({ space: 4 }) {
              Text(task.title).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
              Text(`${task.mode === 'multi' ? '长期任务' : '短期任务'} · ${entrySubtitle(task)}`)
                .fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
              if (task.requirements) {
                Text(task.requirements).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%').maxLines(2)
              }
              if (task.attachments?.length) {
                Text(`${task.attachments.length}个要求附件`).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
              }
            }.width('100%').padding(12).alignItems(HorizontalAlign.Start)
          }.width('100%').backgroundColor($r('app.color.surface_secondary')).borderRadius(12)
            .onClick(() => this.stack.pushPath({ name: ROUTE_EDITOR, param: { collection: 'tasks', id: task.id } as EntryTarget }))
            .accessibilityText(`查看与修改关联任务${task.title}，${entrySubtitle(task)}`)
        }, (task: WorkspaceEntry) => `${task.id}:${this.revision}`)
        if (this.visible < this.tasks.length) {
          Button('显示更多任务').onClick(() => { this.visible += LINKED_TASK_BATCH_SIZE; }).accessibilityText('显示下一批关联学习任务')
        }
      }.width('100%').alignItems(HorizontalAlign.Start)
    }
  }
}
