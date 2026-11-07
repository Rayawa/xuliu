import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { KEY_REVISION, KEY_DAY, MAX_REVIEW_STEPS } from '../../config/constants';
import { ReviewItem, ReviewStep } from '../../models/Workspace';
import { ReviewNames, ReviewDeletion, emptyReviewItem } from '../../models/ReviewModels';
import { getWorkspace } from '../../services/storage/storage';
import { changeReview, changeReviewItem } from '../../services/storage/reviewStorage';
import { renameReview, changeReviewNote, completeReview, completeReviewStep, selectReview, requireStep, addReviewStep,
  renameReviewStep, deleteReviewStep, deleteReview, restoreReview } from '../../domain/workspace/ReviewMutation';
import { stepTodaySummary } from '../../domain/workspace/ReviewDomain';
import { uid, localDate } from '../../domain/workspace/WorkspaceDomain';
import { courseTitleCandidate } from '../../domain/courses/TimetableRules';
import { ReviewSources } from '../../components/review/ReviewSources';

@Component
export struct ReviewDetailPage {
  @Consume('pageStack') private stack: NavPathStack;
  @Prop itemId: string = '';
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @StorageLink(KEY_DAY) private day: string = localDate();
  @State private item: ReviewItem = emptyReviewItem();
  @State private courseDraft: string = '';
  @State private chapterDraft: string = '';
  @State private noteDraft: string = '';
  @State private courseNames: string[] = [];
  @State private error: string = '';
  @State private notice: string = '';
  @State private busy: boolean = false;
  @State private editStepId: string = '';
  @State private stepDraft: string = '';
  @State private newStepDraft: string = '';
  @State private deleted: ReviewDeletion | undefined = undefined;
  private baseCourse: string = '';
  private baseChapter: string = '';
  private baseNote: string = '';
  private baseStep: string = '';
  private newStepId: string = uid();
  private alive: boolean = true;

  aboutToDisappear(): void { this.alive = false; }
  private namesDirty(): boolean { return this.courseDraft !== this.baseCourse || this.chapterDraft !== this.baseChapter; }
  private reload(): void {
    const data = getWorkspace(); const item = data.reviewPool?.items.find((value) => value.id === this.itemId);
    this.item = item ?? emptyReviewItem();
    if (!item) return;
    this.courseNames = Array.from(new Set(data.courses.filter((value) => courseTitleCandidate(value.title)).map((value) => value.title)
      .concat((data.reviewPool?.items ?? []).map((value) => value.course))));
    if (!this.namesDirty()) this.resetNames();
    if (this.noteDraft === this.baseNote) { this.baseNote = item.note; this.noteDraft = item.note; }
  }
  private resetNames(): void {
    const item = getWorkspace().reviewPool?.items.find((value) => value.id === this.itemId); if (!item) return;
    this.baseCourse = item.course; this.baseChapter = item.chapter; this.courseDraft = item.course; this.chapterDraft = item.chapter;
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return; this.busy = true; this.error = ''; this.notice = '';
    try { await action(); } catch (error) { if (this.alive) this.error = (error as Error).message; }
    finally { if (this.alive) this.busy = false; }
  }
  private async saveNames(): Promise<void> {
    const names: ReviewNames = { course: this.courseDraft, chapter: this.chapterDraft };
    const expected: ReviewNames = { course: this.baseCourse, chapter: this.baseChapter };
    await changeReview((data) => renameReview(data, this.itemId, names, expected)); this.resetNames(); this.notice = '项目名称已保存';
  }
  private async saveNote(): Promise<void> {
    const note = this.noteDraft; const expected = this.baseNote;
    await changeReviewItem(this.itemId, (item) => changeReviewNote(item, note, expected)); this.baseNote = note; this.notice = '备注已保存';
  }
  private async addStep(): Promise<void> {
    await changeReviewItem(this.itemId, (item) => addReviewStep(item, this.newStepDraft, this.newStepId));
    this.newStepDraft = ''; this.newStepId = uid(); this.notice = '小任务已添加，尚未安排到今天';
  }
  private async saveStep(): Promise<void> {
    const id = this.editStepId; const title = this.stepDraft; const expected = this.baseStep;
    await changeReviewItem(this.itemId, (item) => renameReviewStep(item, id, title, expected)); this.editStepId = ''; this.stepDraft = ''; this.notice = '小任务已保存';
  }
  private leave(): void {
    if (this.busy) return;
    if (!this.namesDirty() && this.noteDraft === this.baseNote && !this.newStepDraft && !this.editStepId) { this.stack.pop(); return; }
    this.getUIContext().getPromptAction().showDialog({ title: '离开复习项目？', message: '尚未保存的名称、备注或小任务输入将被丢弃。已保存的完成状态和安排会保留。',
      buttons: [{ text: '继续编辑', color: $r('app.color.accent') }, { text: '放弃输入', color: $r('app.color.danger') }] })
      .then((answer) => { if (answer.index === 1 && this.alive) this.stack.pop(); }).catch(() => {});
  }

  @Builder
  private namesForm() {
    Column({ space: 12 }) {
      Text('复习项目').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      TextInput({ text: this.courseDraft, placeholder: '课程' }).maxLength(500).enabled(!this.busy)
        .onChange((value: string) => { this.courseDraft = value; }).accessibilityText('修改复习课程名称，保存后生效')
      Select(this.courseNames.map((name): SelectOption => ({ value: name }))).value('选择已有课程').enabled(!this.busy)
        .onSelect((index: number) => { this.courseDraft = this.courseNames[index]; }).accessibilityText('选择已有课程，也可直接输入自定课程名')
      TextInput({ text: this.chapterDraft, placeholder: '章节或学习内容' }).maxLength(500).enabled(!this.busy)
        .onChange((value: string) => { this.chapterDraft = value; }).onSubmit(() => this.run(() => this.saveNames())).accessibilityText('修改复习章节，回车保存项目名称')
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button('保存项目名称').enabled(!this.busy && this.namesDirty()).onClick(() => this.run(() => this.saveNames())).accessibilityText('只保存课程和章节名称，保留完成、小任务和来源')
        Button('重新读取名称').enabled(!this.busy).onClick(() => this.resetNames()).accessibilityText('放弃名称输入，重新读取最新课程和章节名称')
      }
      Text(stepTodaySummary(this.item, this.day) || (this.item.done ? '已完成' : '未完成')).fontColor($r('app.color.text_secondary')).width('100%')
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button(this.item.done ? '标记未完成' : '标记完成').enabled(!this.busy).onClick(() => this.run(() => changeReviewItem(this.itemId,
          (item) => completeReview(item, !this.item.done, localDate())))).accessibilityText('切换章节完成状态，保留完成前进度和来源')
        if (this.item.selectedDate === this.day || !this.item.done) {
          Button(this.item.selectedDate === this.day ? '取消今天' : '今天学').enabled(!this.busy).onClick(() => this.run(() => changeReviewItem(this.itemId,
            (item) => selectReview(item, this.item.selectedDate !== this.day, localDate())))).accessibilityText('切换章节今日选择，不改变小任务的独立安排')
        }
      }
    }.padding(16).width('100%').borderRadius(16).backgroundColor($r('app.color.surface'))
  }
  @Builder
  private noteForm() {
    Column({ space: 10 }) {
      Text('进度与备注').fontSize(20).fontColor($r('app.color.text_primary')).width('100%')
      TextArea({ text: this.noteDraft, placeholder: '写下复习进度或备注' }).maxLength(4000).enabled(!this.busy)
        .onChange((value: string) => { this.noteDraft = value; }).accessibilityText('编辑复习进度与备注，最多四千字，单独保存不会覆盖其他字段')
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button('保存备注').enabled(!this.busy && this.noteDraft !== this.baseNote).onClick(() => this.run(() => this.saveNote())).accessibilityText('核对备注基线后保存当前输入')
        Button('重新读取备注').enabled(!this.busy).onClick(() => { this.baseNote = this.item.note; this.noteDraft = this.item.note; }).accessibilityText('放弃备注输入，读取最新已保存备注')
      }
      if (this.noteDraft !== this.baseNote && this.item.note !== this.baseNote) {
        Text(`已保存备注已变化，请核对：\n${this.item.note}`).fontColor($r('app.color.danger')).copyOption(CopyOptions.LocalDevice).width('100%')
      }
    }.padding(16).width('100%').borderRadius(16).backgroundColor($r('app.color.surface'))
  }
  @Builder
  private stepsForm() {
    Column({ space: 12 }) {
      Text(`小任务 · ${(this.item.steps ?? []).filter((step) => step.done).length}/${this.item.steps?.length ?? 0}`).fontSize(20).fontColor($r('app.color.text_primary')).width('100%')
      ForEach(this.item.steps ?? [], (step: ReviewStep) => {
        Column({ space: 8 }) {
          Row({ space: 8 }) {
            Checkbox().select(step.done).enabled(!this.busy).onChange((value: boolean) => this.run(() => changeReviewItem(this.itemId,
              (item) => completeReviewStep(requireStep(item, step.id), value, localDate())))).accessibilityText(`切换小任务${step.title}完成状态`)
            Text(step.title).layoutWeight(1).fontColor($r('app.color.text_primary'))
          }.width('100%')
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            if (step.selectedDate === this.day || !step.done) {
              Button(step.selectedDate === this.day ? '取消今天' : '今天做').enabled(!this.busy).onClick(() => this.run(() => changeReviewItem(this.itemId,
                (item) => selectReview(requireStep(item, step.id), step.selectedDate !== this.day, localDate())))).accessibilityText(`切换${step.title}的独立今日安排`)
            }
            Button('修改').enabled(!this.busy).onClick(() => { this.editStepId = step.id; this.baseStep = step.title; this.stepDraft = step.title; }).accessibilityText(`修改小任务${step.title}`)
            Button('删除').enabled(!this.busy).onClick(() => this.run(() => changeReviewItem(this.itemId, (item) => {
              this.deleted = deleteReviewStep(item, step.id); if (this.editStepId === step.id) { this.editStepId = ''; this.stepDraft = ''; }
            }))).accessibilityText(`删除小任务${step.title}，可按原位置撤销`)
          }
        }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface_secondary'))
      }, (step: ReviewStep) => `${step.id}-${this.revision}`)
      if (this.editStepId) {
        TextInput({ text: this.stepDraft, placeholder: '修改小任务内容' }).maxLength(500).enabled(!this.busy)
          .onChange((value: string) => { this.stepDraft = value; }).onSubmit(() => this.run(() => this.saveStep())).accessibilityText('修改选中的小任务标题，回车保存')
        Row({ space: 8 }) {
          Button('保存小任务').enabled(!this.busy).onClick(() => this.run(() => this.saveStep())).accessibilityText('只修改小任务标题，保留完成日期和今日选择')
          Button('取消修改').enabled(!this.busy).onClick(() => { this.editStepId = ''; this.stepDraft = ''; }).accessibilityText('放弃小任务标题修改')
        }
      }
      TextInput({ text: this.newStepDraft, placeholder: '新增小任务' }).maxLength(500).enabled(!this.busy && (this.item.steps?.length ?? 0) < MAX_REVIEW_STEPS)
        .onChange((value: string) => { this.newStepDraft = value; }).onSubmit(() => this.run(() => this.addStep())).accessibilityText('新增复习小任务内容，回车添加')
      Button('添加小任务').enabled(!this.busy && (this.item.steps?.length ?? 0) < MAX_REVIEW_STEPS).onClick(() => this.run(() => this.addStep())).accessibilityText('添加独立小任务，最多五十个，不自动选择今天')
    }.padding(16).width('100%').borderRadius(16).backgroundColor($r('app.color.surface'))
  }
  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          if (this.deleted) {
            Text(`已删除${this.deleted.kind === 'step' ? this.deleted.step?.title ?? '' : this.deleted.item?.chapter ?? ''}`).fontColor($r('app.color.text_secondary'))
            Button('撤销删除').enabled(!this.busy).onClick(() => this.run(async () => {
              const deleted = this.deleted; if (!deleted) return;
              await changeReview((data) => restoreReview(data, deleted)); this.deleted = undefined;
            })).accessibilityText('按原位置恢复最近删除的复习项目或小任务，不覆盖现有数据')
          }
          if (this.error) { Text(this.error).fontColor($r('app.color.danger')).width('100%') }
          if (this.notice) { Text(this.notice).fontColor($r('app.color.text_secondary')).width('100%') }
          if (this.item.id) {
            this.namesForm()
            this.noteForm()
            this.stepsForm()
            ReviewSources({ sources: this.item.sources })
            Button('删除整个复习项目').enabled(!this.busy).fontColor($r('app.color.danger')).onClick(() => this.run(() => changeReview((data) => {
              this.deleted = deleteReview(data, this.itemId);
            }))).accessibilityText('删除当前复习项目，保留所有原始来源、笔记、附件和历史，可撤销')
          } else { Text('此复习项目已移除，可撤销本次删除或返回列表。').fontColor($r('app.color.text_secondary')) }
        }.width('100%').constraintSize({ maxWidth: 1100 }).padding(16).alignItems(HorizontalAlign.Start)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle('复习项目详情', () => this.leave()))
    .onBackPressed(() => { this.leave(); return true; })
    .onShown(() => this.reload())
  }
}
