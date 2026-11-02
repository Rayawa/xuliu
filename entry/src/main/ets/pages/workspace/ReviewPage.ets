import { assertReviewItem, normalizeChapter, stepTodaySummary } from '../../domain/workspace/ReviewDomain';
import { KEY_REVISION } from '../../config/constants';
import { collectReviewSources } from '../../domain/workspace/StudyPlan';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { ReviewItem, ReviewStep } from '../../models/Workspace';
import { localDate, uid } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';

@Component
export struct ReviewPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private items: ReviewItem[] = [];
  @State private course: string = '';
  @State private chapter: string = '';
  private stepDrafts: Map<string, string> = new Map();
  @State private query: string = '';
  @State private error: string = '';
  @State private deleted: ReviewItem | undefined = undefined;

  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.items = getWorkspace().reviewPool?.items ?? []; }

  private async update(item: ReviewItem): Promise<void> {
    try {
      const data = getWorkspace();
      if (!data.reviewPool) data.reviewPool = { version: 1, items: [] };
      item.course = item.course.trim(); item.chapter = normalizeChapter(item.chapter);
      assertReviewItem(data.reviewPool.items, item);
      const index = data.reviewPool.items.findIndex((v) => v.id === item.id);
      if (index < 0) data.reviewPool.items.push(item); else data.reviewPool.items[index] = item;
      await saveWorkspace(data);
    } catch (error) { this.error = (error as Error).message; }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Text('把复习拆成可以完成的小步').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Search({ value: this.query, placeholder: '搜索课程或章节' }).onChange((v: string) => { this.query = v; }).accessibilityText('搜索复习池')
          GridRow({ columns: 12, gutter: 16 }) {
            ForEach(this.items.filter((v) => `${v.course} ${v.chapter}`.includes(this.query)), (item: ReviewItem) => {
              GridCol({ span: { xs: 12, sm: 12, md: 6, lg: 4 } }) {
                Column({ space: 10 }) {
                  TextInput({ text: item.course, placeholder: '课程' }).onChange((v: string) => { item.course = v; })
                    .onBlur(() => this.update(item)).accessibilityText('修改复习课程')
                  TextInput({ text: item.chapter, placeholder: '章节' }).onChange((v: string) => { item.chapter = v; })
                    .onBlur(() => this.update(item)).accessibilityText('修改复习章节')
                  Text(stepTodaySummary(item, localDate()) || (item.done ? '已完成' : '未完成')).fontColor($r('app.color.text_secondary'))
                  TextArea({ text: item.note, placeholder: '进度与备注' }).onChange((v: string) => { item.note = v; })
                    .onBlur(() => this.update(item)).accessibilityText(`${item.chapter}进度与备注`)
                  ForEach(item.steps ?? [], (step: ReviewStep) => {
                    Row() {
                      Checkbox().select(step.done).onChange((value: boolean) => {
                        step.done = value; step.completedDate = value ? localDate() : undefined; this.update(item);
                      }).accessibilityText(`完成复习小任务${step.title}`)
                      Text(step.title).layoutWeight(1).fontColor($r('app.color.text_primary'))
                      Button('今天学').enabled(!step.done).onClick(() => { step.selectedDate = localDate(); this.update(item); }).accessibilityText(`安排今天学习${step.title}`)
                      Button('删除')
                        .onClick(() => { item.steps = item.steps?.filter((v) => v.id !== step.id); this.update(item); })
                        .accessibilityText(`删除小任务${step.title}`)
                    }
                  }, (step: ReviewStep) => step.id)
                  TextInput({ text: this.stepDrafts.get(item.id) ?? '', placeholder: '新增小任务' })
                    .onChange((v: string) => { this.stepDrafts.set(item.id, v); })
                    .accessibilityText('复习小任务标题')
                  Button('加入小任务').onClick(() => {
                    const title = this.stepDrafts.get(item.id)?.trim() ?? '';
                    if (!title) return;
                    const steps = item.steps ?? []; steps.push({ id: uid(), title, done: false });
                    item.steps = steps; this.stepDrafts.delete(item.id); this.update(item);
                  }).accessibilityText('添加复习小任务')
                  Button(item.done ? '取消完成' : '标记完成').onClick(() => {
                    if (!item.done) item.previousProgress = item.progress;
                    item.done = !item.done;
                    item.progress = item.done ? 100 : item.previousProgress ?? 0;
                    item.completedDate = item.done ? localDate() : undefined;
                    if (!item.done) item.previousProgress = undefined;
                    this.update(item);
                  }).accessibilityText(`切换${item.chapter}完成状态`)
                  Button('安排到今天').enabled(!item.done).onClick(() => { item.selectedDate = localDate(); this.update(item); }).accessibilityText('安排该章节今天复习')
                  Button('以后再学').onClick(() => { item.selectedDate = undefined; this.update(item); }).accessibilityText('移出今日复习安排')
                  Button('删除章节').onClick(async () => {
                    try {
                      const data = getWorkspace(); if (!data.reviewPool) return;
                      data.reviewPool.items = data.reviewPool.items.filter((v) => v.id !== item.id);
                      data.reviewPool.removedSources = (data.reviewPool.removedSources ?? []).concat(item.sources);
                      await saveWorkspace(data); this.deleted = item;
                    } catch (error) { this.error = (error as Error).message; }
                  }).accessibilityText('删除此复习章节，保留来源记录，可撤销')
                }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
              }
            }, (item: ReviewItem) => `${item.id}-${this.revision}`)
          }
          Button('归集已有复习任务').onClick(async () => {
            try { const data = getWorkspace(); const count = collectReviewSources(data); await saveWorkspace(data); this.error = `已归集 ${count} 条复习来源`; }
            catch (error) { this.error = (error as Error).message; }
          }).accessibilityText('将尚未归集的复习任务和课程节点加入复习池')
          Text('添加复习章节').fontSize(20).fontColor($r('app.color.text_primary'))
          TextInput({ text: this.course, placeholder: '课程名称' }).onChange((v: string) => { this.course = v; }).accessibilityText('复习课程名称')
          TextInput({ text: this.chapter, placeholder: '章节名称' }).onChange((v: string) => { this.chapter = v; }).accessibilityText('复习章节名称')
          Button('添加章节').onClick(async () => {
            if (!this.course.trim() || !this.chapter.trim()) { this.error = '请填写课程与章节'; return; }
            await this.update({ id: uid(), course: this.course.trim(), chapter: this.chapter.trim(), progress: 0,
              note: '', done: false, sources: [], steps: [] });
            this.chapter = '';
          }).accessibilityText('添加章节到复习池')
          if (this.deleted) {
            Button('撤销删除章节').onClick(async () => {
              try {
                const data = getWorkspace(); if (!data.reviewPool || !this.deleted) return;
                const item = this.deleted;
                data.reviewPool.items.push(item);
                data.reviewPool.removedSources = data.reviewPool.removedSources?.filter((s) => !item.sources.some((v) => v.kind === s.kind && v.id === s.id));
                await saveWorkspace(data); this.deleted = undefined;
              } catch (error) { this.error = (error as Error).message; }
            }).accessibilityText('撤销最近一次复习章节删除')
          }
          Text(this.error).fontColor($r('app.color.danger'))
        }.width('100%').constraintSize({ maxWidth: 1200 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '复习池' }, backIcon: { action: () => this.pageStack.pop() } } })
  }
}
