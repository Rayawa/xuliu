import { LengthMetrics } from '@kit.ArkUI';
import { ReviewItem, ReviewStep } from '../../models/Workspace';
import { ReviewAction, emptyReviewItem } from '../../models/ReviewModels';
import { stepTodaySummary } from '../../domain/workspace/ReviewDomain';

@Component
export struct ReviewChapterCard {
  @Prop item: ReviewItem = emptyReviewItem();
  @Prop day: string = '';
  @Prop expanded: boolean = false;
  @Prop busy: boolean = false;
  onAction: (action: ReviewAction) => void = () => {};
  private act(kind: string, value?: boolean, stepId?: string): void { this.onAction({ kind, itemId: this.item.id, stepId, value }); }
  build() {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        Checkbox().select(this.item.done).enabled(!this.busy).onChange((value: boolean) => this.act('done', value))
          .accessibilityText(`${this.item.done ? '标记未完成' : '标记完成'}：${this.item.course} ${this.item.chapter}`)
        Button(`${this.item.chapter}${this.expanded ? ' · 收起' : ' · 展开'}`).layoutWeight(1).onClick(() => this.act('expand'))
          .accessibilityText(`${this.item.course} ${this.item.chapter}，${this.expanded ? '收起' : '展开'}详情`)
      }.width('100%')
      Text([this.item.done ? '已完成' : '未完成', stepTodaySummary(this.item, this.day)].filter((value) => !!value).join(' · '))
        .fontColor($r('app.color.text_secondary')).width('100%')
      if (this.item.selectedDate === this.day || !this.item.done) {
        Button(this.item.selectedDate === this.day ? '取消今天' : '今天学').enabled(!this.busy)
          .onClick(() => this.act('selected', this.item.selectedDate !== this.day))
          .accessibilityText(`${this.item.selectedDate === this.day ? '取消今天学习' : '安排今天学习'}：${this.item.course} ${this.item.chapter}`)
      }
      if (this.expanded) {
        if (this.item.note) { Text(this.item.note).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).width('100%') }
        if (this.item.steps?.length) { Text(`小任务 · ${this.item.steps.filter((step) => step.done).length}/${this.item.steps.length}`).fontColor($r('app.color.text_secondary')).width('100%') }
        ForEach(this.item.steps ?? [], (step: ReviewStep) => {
          Column({ space: 6 }) {
            Row({ space: 8 }) {
              Checkbox().select(step.done).enabled(!this.busy).onChange((value: boolean) => this.act('step-done', value, step.id))
                .accessibilityText(`${step.done ? '标记未完成' : '完成'}小任务${step.title}`)
              Text(step.title).layoutWeight(1).fontColor($r('app.color.text_primary'))
            }.width('100%')
            if (step.selectedDate === this.day || !step.done) {
              Button(step.selectedDate === this.day ? '取消今天' : '今天做').enabled(!this.busy)
                .onClick(() => this.act('step-selected', step.selectedDate !== this.day, step.id)).accessibilityText(`切换小任务${step.title}的今日安排`)
            }
          }.width('100%')
        }, (step: ReviewStep) => step.id)
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button('编辑与原有记录').onClick(() => this.act('detail')).accessibilityText(`编辑${this.item.chapter}、管理小任务并查看原笔记附件和用时`)
          Button('删除项目').enabled(!this.busy).fontColor($r('app.color.danger')).onClick(() => this.act('delete')).accessibilityText(`删除复习项目${this.item.chapter}，原有来源记录保留，可撤销`)
        }
      }
    }.padding(16).width('100%').borderRadius(18).backgroundColor($r('app.color.surface')).alignItems(HorizontalAlign.Start)
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
  }
}
