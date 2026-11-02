import { reviewSourceKeys, chapterVisible, stepVisible, stepTodaySummary, reviewTodayCounts } from '../../domain/workspace/ReviewDomain';
import { ReviewItem, ReviewStep } from '../../models/Workspace';
import { KEY_REVISION, KEY_USERNAME, KEY_ACCENT, KEY_DAY } from '../../config/constants';
import { LengthMetrics } from '@kit.ArkUI';
import { Workspace, WorkspaceEntry, EntryTarget } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { emptyWorkspace, isToday, localDate, toggleComplete } from '../../domain/workspace/WorkspaceDomain';
import { ACCENT_RESOURCES, ROUTE_COLLECTION, ROUTE_EDITOR, ROUTE_DAILY, ROUTE_CALENDAR, ROUTE_FOCUS,
  ROUTE_TIMETABLE, ROUTE_REVIEW, ROUTE_FINANCE } from '../../config/constants';
import { EntryCard } from '../../components/workspace/EntryCard';

@Component
export struct TodayPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @StorageLink(KEY_USERNAME) private username: string = '朋友';
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  @State private data: Workspace = emptyWorkspace();
  @StorageLink(KEY_DAY) @Watch('reload') private day: string = localDate();
  @State private error: string = '';

  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.data = getWorkspace(); this.day = localDate(); }

  private open(collection: string, id: string): void {
    const target: EntryTarget = { collection, id };
    this.pageStack.pushPath({ name: ROUTE_EDITOR, param: target });
  }

  private async toggle(id: string, collection: string): Promise<void> {
    try {
      const data = getWorkspace();
      const list = collection === 'tasks' ? data.tasks : collection === 'habits' ? data.habits : data.milestones;
      const item = list.find((v) => v.id === id);
      if (item) { toggleComplete(item, collection); await saveWorkspace(data); }
    } catch (error) { this.error = (error as Error).message; }
  }

  private async completeReview(id: string, stepId: string = ''): Promise<void> {
    try {
      const data = getWorkspace(); const item = data.reviewPool?.items.find((v) => v.id === id);
      if (!item) return;
      if (stepId) {
        const step = item.steps?.find((v) => v.id === stepId);
        if (!step) return;
        step.done = !step.done; step.completedDate = step.done ? localDate() : undefined;
      } else {
        if (!item.done) item.previousProgress = item.progress;
        item.done = !item.done; item.progress = item.done ? 100 : item.previousProgress ?? 0;
        item.completedDate = item.done ? localDate() : undefined;
        if (!item.done) item.previousProgress = undefined;
      }
      await saveWorkspace(data);
    } catch (error) { this.error = (error as Error).message; }
  }

  private todayTasks(): WorkspaceEntry[] {
    const sources = reviewSourceKeys(this.data);
    return this.data.tasks.filter((v) => isToday(v) && !sources.has(`task:${v.id}`));
  }

  private todayNodes(): WorkspaceEntry[] {
    const sources = reviewSourceKeys(this.data);
    return this.data.milestones.filter((v) => isToday(v) && !sources.has(`milestone:${v.id}`));
  }

  private pendingCount(): number {
    const review = reviewTodayCounts(this.data.reviewPool?.items ?? [], this.day);
    return this.todayTasks().filter((v) => !v.done).length + this.todayNodes().filter((v) => !v.done).length + review.total - review.completed;
  }

  @Builder
  private statistic(label: string, value: string) {
    Column({ space: 8 }) {
      Text(value).fontSize(30).fontWeight(FontWeight.Bold).fontColor(ACCENT_RESOURCES[this.accent])
      Text(label).fontSize(13).fontColor($r('app.color.text_secondary'))
    }.padding(20).width('100%').borderRadius(18).backgroundColor($r('app.color.surface'))
      .accessibilityGroup(true).accessibilityText(`${label}，${value}`)
  }

  @Builder
  private quickButton(label: string, route: string) {
    Button(label).type(ButtonType.Normal).borderRadius(12).fontColor(ACCENT_RESOURCES[this.accent])
      .backgroundColor($r('app.color.surface_secondary')).onClick(() => this.pageStack.pushPath({ name: route }))
      .accessibilityText(`打开${label}`)
  }

  build() {
    Scroll() {
      Column({ space: 22 }) {
        Column({ space: 10 }) {
          Text(this.day.replace(/-/g, ' / ')).fontSize(14).fontColor($r('app.color.text_secondary'))
          Text(`你好，${this.username}`).fontSize(30).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Text('把注意力，留给值得的事情。').fontSize(16).fontColor($r('app.color.text_secondary'))
        }.width('100%').alignItems(HorizontalAlign.Start)
        GridRow({ columns: 12, gutter: 12 }) {
          GridCol({ span: { xs: 6, sm: 6, md: 3, lg: 3 } }) { this.statistic('今日待办', String(this.pendingCount())) }
          GridCol({ span: { xs: 6, sm: 6, md: 3, lg: 3 } }) { this.statistic('完成任务', String(this.data.tasks.filter((v) => v.completedDate === this.day).length)) }
          GridCol({ span: { xs: 6, sm: 6, md: 3, lg: 3 } }) { this.statistic('专注分钟', String(this.data.timeEntries.filter((v) => v.date === this.day).reduce((sum, v) => sum + v.minutes, 0))) }
          GridCol({ span: { xs: 6, sm: 6, md: 3, lg: 3 } }) { this.statistic('习惯打卡', `${this.data.habits.filter((v) => v.lastCompletedDate === this.day).length}/${this.data.habits.length}`) }
        }
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          this.quickButton('日历', ROUTE_CALENDAR)
          this.quickButton('课表', ROUTE_TIMETABLE)
          this.quickButton('专注', ROUTE_FOCUS)
          this.quickButton('复习池', ROUTE_REVIEW)
          this.quickButton('记账', ROUTE_FINANCE)
          this.quickButton('每日复盘', ROUTE_DAILY)
        }.width('100%')
        if (this.error) { Text(this.error).fontColor($r('app.color.danger')) }
        GridRow({ columns: 12, gutter: 20 }) {
          GridCol({ span: { xs: 12, sm: 12, md: 7, lg: 8 } }) {
            Column({ space: 12 }) {
              Row() {
                Text('今日行动').fontSize(22).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).layoutWeight(1)
                Button('＋ 任务').onClick(() => this.open('tasks', '')).accessibilityText('添加今日任务')
              }.width('100%')
              ForEach(this.todayTasks(), (item: WorkspaceEntry) => {
                EntryCard({ item, collection: 'tasks', onOpen: () => this.open('tasks', item.id), onToggle: () => this.toggle(item.id, 'tasks') })
              }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
              ForEach(this.todayNodes(), (item: WorkspaceEntry) => {
                EntryCard({ item, collection: 'milestones', onOpen: () => this.open('milestones', item.id), onToggle: () => this.toggle(item.id, 'milestones') })
              }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
              if (this.todayTasks().length === 0 && this.todayNodes().length === 0 && reviewTodayCounts(this.data.reviewPool?.items ?? [], this.day).total === 0) {
                Text('今天还没有安排。选一件小事，开始就很好。').width('100%').padding(24)
                  .fontColor($r('app.color.text_secondary')).backgroundColor($r('app.color.surface')).borderRadius(16)
              }
              ForEach((this.data.reviewPool?.items ?? []).filter((v) => chapterVisible(v, this.day) || v.steps?.some((s) => stepVisible(s, this.day))), (review: ReviewItem) => {
                Column({ space: 10 }) {
                  Row({ space: 8 }) {
                    Checkbox().select(review.done).onChange(() => this.completeReview(review.id))
                      .accessibilityText(`复习章节${review.course}${review.chapter}`)
                    Text(`${review.course} · ${review.chapter}`).layoutWeight(1).fontColor($r('app.color.text_primary'))
                    Text(stepTodaySummary(review, this.day)).fontColor($r('app.color.text_secondary'))
                  }.width('100%')
                  ForEach((review.steps ?? []).filter((step) => stepVisible(step, this.day)), (step: ReviewStep) => {
                    Row({ space: 8 }) {
                      Checkbox().select(step.done).onChange(() => this.completeReview(review.id, step.id)).accessibilityText(`复习小任务${step.title}`)
                      Text(`${review.course} · ${review.chapter} · ${step.title}`).fontColor($r('app.color.text_primary'))
                    }.width('100%').padding({ left: 24 })
                  }, (step: ReviewStep) => step.id)
                }.width('100%').padding(16).borderRadius(16).backgroundColor($r('app.color.surface'))
              }, (review: ReviewItem) => `${review.id}-${this.revision}`)
              Text('即将截止').fontSize(20).fontWeight(FontWeight.Bold).width('100%').fontColor($r('app.color.text_primary'))
              ForEach(this.data.tasks.filter((v) => !v.done && !!v.due).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')).slice(0, 5),
                (item: WorkspaceEntry) => {
                  EntryCard({ item, onOpen: () => this.open('tasks', item.id), onToggle: () => this.toggle(item.id, 'tasks') })
                }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
            }.width('100%').alignItems(HorizontalAlign.Start)
          }
          GridCol({ span: { xs: 12, sm: 12, md: 5, lg: 4 } }) {
            Column({ space: 12 }) {
              Text('每天一点').fontSize(22).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
              ForEach(this.data.habits, (item: WorkspaceEntry) => {
                EntryCard({ item, collection: 'habits', onOpen: () => this.open('habits', item.id), onToggle: () => this.toggle(item.id, 'habits') })
              }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
              Button('管理习惯').onClick(() => this.pageStack.pushPath({ name: ROUTE_COLLECTION, param: 'habits' })).accessibilityText('管理习惯与打卡')
              Column({ space: 10 }) {
                Text('留下一点收获').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
                Text(this.data.daily[this.day]?.gain || '今天学到了什么，或有什么值得记住？').fontColor($r('app.color.text_secondary'))
                Button('写今日复盘').onClick(() => this.pageStack.pushPath({ name: ROUTE_DAILY })).accessibilityText('打开今日复盘')
              }.padding(20).width('100%').borderRadius(18).backgroundColor($r('app.color.surface'))
            }.width('100%').margin({ top: 12 }).alignItems(HorizontalAlign.Start)
          }
        }
      }.width('100%').constraintSize({ maxWidth: 1280 }).padding(20).alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').backgroundColor($r('app.color.background'))
  }
}
