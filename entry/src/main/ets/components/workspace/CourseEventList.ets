import { KEY_REVISION, LINKED_TASK_BATCH_SIZE, ROUTE_EDITOR } from '../../config/constants';
import { assessmentLabel, eventDateLabel } from '../../domain/workspace/CourseEvents';
import { reviewSourceKeys } from '../../domain/workspace/ReviewDomain';
import { EntryTarget, WorkspaceEntry } from '../../models/Workspace';
import { getWorkspace } from '../../services/storage/storage';

@Component
export struct CourseEventList {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @Prop @Watch('courseChanged') courseId: string = '';
  @Prop ordinary: boolean = false;
  @State private records: WorkspaceEntry[] = [];
  @State private visible: number = LINKED_TASK_BATCH_SIZE;

  aboutToAppear(): void { this.reload(); }

  private courseChanged(): void {
    this.visible = LINKED_TASK_BATCH_SIZE;
    this.reload();
  }

  private reload(): void {
    if (!this.courseId) {
      this.records = [];
      return;
    }
    const data = getWorkspace();
    const hidden = reviewSourceKeys(data);
    this.records = data.milestones.filter((item) => !hidden.has(`milestone:${item.id}`) &&
      (this.ordinary ? !item.courseId && item.linkedCourseId === this.courseId : item.courseId === this.courseId && !item.automationKey));
  }

  private metadata(item: WorkspaceEntry): string {
    return [item.done ? '已完成' : '未完成', assessmentLabel(item.assessmentType), eventDateLabel(item)]
      .filter((value) => !!value).join(' · ');
  }

  build() {
    if (this.records.length) {
      Column({ space: 8 }) {
        Text(this.ordinary ? '相关事项与考核' : '课程任务').fontSize(18).fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary')).width('100%')
        ForEach(this.records.slice(0, this.visible), (item: WorkspaceEntry) => {
          Button({ type: ButtonType.Normal }) {
            Column({ space: 4 }) {
              Text(item.title).fontColor($r('app.color.text_primary')).width('100%')
              Text(this.metadata(item)).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
            }.padding(12).width('100%').alignItems(HorizontalAlign.Start)
          }.width('100%').borderRadius(12).backgroundColor($r('app.color.surface_secondary'))
            .onClick(() => this.stack.pushPath({ name: ROUTE_EDITOR, param: { collection: 'milestones', id: item.id } as EntryTarget }))
            .accessibilityText(`打开${item.title}，${this.metadata(item)}`)
        }, (item: WorkspaceEntry) => `${item.id}:${this.revision}`)
        if (this.visible < this.records.length) {
          Button('显示更多').onClick(() => { this.visible += LINKED_TASK_BATCH_SIZE; })
            .accessibilityText(this.ordinary ? '显示下一批课程事项' : '显示下一批课程任务')
        }
      }.width('100%')
    }
  }
}
