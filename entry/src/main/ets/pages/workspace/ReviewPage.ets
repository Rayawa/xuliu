import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { KEY_REVISION, KEY_DAY, ROUTE_REVIEW_DETAIL, MAX_REVIEW_ITEMS } from '../../config/constants';
import { ReviewItem } from '../../models/Workspace';
import { ReviewAction, ReviewDeletion, ReviewRow, ReviewListSource, ReviewDraft } from '../../models/ReviewModels';
import { collectReviewSources } from '../../domain/workspace/StudyPlan';
import { createReview, deleteReview, restoreReview, completeReview, completeReviewStep, selectReview, requireReview, requireStep } from '../../domain/workspace/ReviewMutation';
import { changeReview } from '../../services/storage/reviewStorage';
import { getWorkspace } from '../../services/storage/storage';
import { localDate, uid } from '../../domain/workspace/WorkspaceDomain';
import { courseTitleCandidate } from '../../domain/courses/TimetableRules';
import { ReviewChapterCard } from '../../components/review/ReviewChapterCard';

@Component
export struct ReviewPage {
  @Consume('pageStack') private stack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @StorageLink(KEY_DAY) @Watch('reload') private day: string = localDate();
  @State private course: string = '';
  @State private chapter: string = '';
  @State private note: string = '';
  @State private courseNames: string[] = [];
  @State private query: string = '';
  @State private error: string = '';
  @State private notice: string = '';
  @State private busy: boolean = false;
  @State private adding: boolean = false;
  @State private deleted: ReviewDeletion | undefined = undefined;
  @State private count: number = 0;
  @State private shownCount: number = 0;
  private expanded: Set<string> = new Set();
  private rows: ReviewListSource = new ReviewListSource();
  private newId: string = uid();

  private reload(): void {
    const data = getWorkspace(); const items = data.reviewPool?.items ?? []; this.count = items.length;
    this.courseNames = Array.from(new Set(data.courses.filter((item) => courseTitleCandidate(item.title)).map((item) => item.title).concat(items.map((item) => item.course))));
    const query = this.query.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    const filtered = items.filter((item) => `${item.course}${item.chapter}`.normalize('NFKC').toLowerCase().replace(/\s+/g, '').includes(query));
    const groups: Map<string, ReviewItem[]> = new Map(); filtered.forEach((item) => groups.set(item.course, (groups.get(item.course) ?? []).concat([item])));
    const rows: ReviewRow[] = [];
    groups.forEach((values, course) => {
      rows.push({ id: `course:${course}`, kind: 'course', title: course });
      values.forEach((item) => rows.push({ id: item.id, kind: 'chapter', title: item.chapter, item }));
    });
    this.rows.replace(rows); this.shownCount = filtered.length;
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return; this.busy = true; this.error = ''; this.notice = '';
    try { await action(); } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; }
  }
  private act(action: ReviewAction): void {
    if (action.kind === 'expand') {
      if (this.expanded.has(action.itemId)) this.expanded.delete(action.itemId); else this.expanded.add(action.itemId);
      this.reload(); return;
    }
    if (action.kind === 'detail') { this.stack.pushPath({ name: ROUTE_REVIEW_DETAIL, param: action.itemId }); return; }
    this.run(async () => {
      await changeReview((data) => {
        const item = requireReview(data, action.itemId);
        if (action.kind === 'delete') this.deleted = deleteReview(data, action.itemId);
        else if (action.kind === 'done') completeReview(item, action.value === true, localDate());
        else if (action.kind === 'selected') selectReview(item, action.value === true, localDate());
        else if (action.kind === 'step-done') completeReviewStep(requireStep(item, action.stepId ?? ''), action.value === true, localDate());
        else if (action.kind === 'step-selected') selectReview(requireStep(item, action.stepId ?? ''), action.value === true, localDate());
      });
    });
  }
  private async addChapter(): Promise<void> {
    const draft: ReviewDraft = { course: this.course, chapter: this.chapter, note: this.note };
    await changeReview((data) => { createReview(data, draft, this.newId); });
    this.chapter = ''; this.note = ''; this.adding = false; this.newId = uid(); this.notice = '已加入复习池，尚未安排到今天';
  }

  @Builder
  private addForm() {
    if (this.adding) {
      Column({ space: 12 }) {
        TextInput({ text: this.course, placeholder: '选择或填写课程' }).maxLength(500).enabled(!this.busy)
          .onChange((value: string) => { this.course = value; }).accessibilityText('新增复习项目的课程名称，可直接填写')
        if (this.courseNames.length) {
          Select(this.courseNames.map((name): SelectOption => ({ value: name }))).value('选择已有课程').enabled(!this.busy)
            .onSelect((index: number) => { this.course = this.courseNames[index]; }).accessibilityText('选择工作台或复习池中的已有课程')
        }
        TextInput({ text: this.chapter, placeholder: '章节或学习内容' }).maxLength(500).enabled(!this.busy)
          .onChange((value: string) => { this.chapter = value; }).onSubmit(() => this.run(() => this.addChapter())).accessibilityText('复习章节或学习内容，回车保存')
        TextArea({ text: this.note, placeholder: '备注（可选）' }).maxLength(4000).enabled(!this.busy)
          .onChange((value: string) => { this.note = value; }).accessibilityText('新增复习项目备注，最多四千字')
        Button('加入复习池').enabled(!this.busy).onClick(() => this.run(() => this.addChapter())).accessibilityText('保存新复习项目，不创建普通任务或自动选择今天')
      }.width('100%').padding(16).borderRadius(16).backgroundColor($r('app.color.surface'))
    }
  }
  build() {
    HdsNavDestination() {
      List({ space: 14 }) {
        ListItem() {
          Column({ space: 14 }) {
            Text('把复习拆成可以完成的小步').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
            Search({ value: this.query, placeholder: '搜索课程或章节' }).onChange((value: string) => { this.query = value; this.reload(); }).accessibilityText('搜索复习池中的课程或章节')
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
              Button(this.adding ? '收起新增' : '新增项目').enabled(!this.busy && this.count < MAX_REVIEW_ITEMS)
                .onClick(() => { this.adding = !this.adding; }).accessibilityText('展开或收起复习池新增项目表单')
              Button('归集已有复习任务').enabled(!this.busy).onClick(() => this.run(async () => {
                let count = 0; await changeReview((data) => { count = collectReviewSources(data); }); this.notice = `已归集${count}条复习来源，原记录完整保留`;
              })).accessibilityText('归集可明确识别的复习来源，排除正式作业和已移除来源')
            }
            this.addForm()
            if (this.deleted) {
              Text(`已删除${this.deleted.kind === 'step' ? this.deleted.step?.title ?? '' : this.deleted.item?.chapter ?? ''}`).fontColor($r('app.color.text_secondary'))
              Button('撤销删除').enabled(!this.busy).onClick(() => this.run(async () => {
                const removed = this.deleted; if (!removed) return;
                await changeReview((data) => restoreReview(data, removed)); this.deleted = undefined;
              })).accessibilityText('按原位置恢复最近删除的复习项目，不覆盖现有项目')
            }
            if (this.error) { Text(this.error).fontColor($r('app.color.danger')).width('100%') }
            if (this.notice) { Text(this.notice).fontColor($r('app.color.text_secondary')).width('100%') }
            Text(`显示${this.shownCount}/${this.count}个项目`).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
          }.width('100%').alignItems(HorizontalAlign.Start)
        }
        LazyForEach(this.rows, (row: ReviewRow) => {
          ListItem() {
            if (row.kind === 'course') { Text(row.title).fontSize(21).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%') }
            else if (row.item) {
              ReviewChapterCard({ item: row.item, day: this.day, expanded: this.expanded.has(row.id),
                busy: this.busy, onAction: (action: ReviewAction) => this.act(action) })
            }
          }
        }, (row: ReviewRow) => `${row.kind}:${row.id}-${this.rows.version}`)
      }.width('100%').height('100%').cachedCount(2).padding(16).constraintSize({ maxWidth: 1100 }).backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('复习池', () => this.stack.pop()))
    .onShown(() => this.reload())
  }
}
