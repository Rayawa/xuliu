import { ChartDatum } from '../../models/Workspace';
import { CHART_PALETTE } from '../../config/constants';
import { money } from '../../domain/workspace/WorkspaceDomain';

interface ChartSlice { label: string; value: number; categories: string[]; }

@Component
export struct FinanceDistribution {
  @Prop data: ChartDatum[] = [];
  @Prop title: string = '支出分类';
  @Prop selectedCategories: string[] = [];
  @State private expanded: boolean = false;
  onSelect: (categories: string[]) => void = () => {};

  private slices(): ChartSlice[] {
    const slices = this.data.slice(0, this.data.length > 9 ? 8 : 9).map((item): ChartSlice => ({ label: item.label, value: item.value, categories: [item.label] }));
    if (this.data.length > 9) {
      const rest = this.data.slice(8);
      slices.push({ label: '其余分类', value: rest.reduce((sum, item) => sum + item.value, 0), categories: rest.map((item) => item.label) });
    }
    return slices;
  }

  private sliceSelected(slice: ChartSlice): boolean {
    return this.selectedCategories.length === slice.categories.length && slice.categories.every((category) => this.selectedCategories.includes(category));
  }

  private choose(slice: ChartSlice): void { this.onSelect(this.sliceSelected(slice) ? [] : slice.categories); }

  build() {
    Column({ space: 14 }) {
      Text(this.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      if (this.data.length > 0) {
        Stack() {
          DataPanel({ values: this.slices().map((slice) => slice.value), max: this.data.reduce((sum, item) => sum + item.value, 0), type: DataPanelType.Circle })
            .width('100%').height('100%').valueColors(CHART_PALETTE).trackBackgroundColor($r('app.color.chart_track'))
            .closeEffect(true).strokeWidth(30).accessibilityLevel('no')
          Column({ space: 6 }) {
            Text(money(this.data.reduce((sum, item) => sum + item.value, 0)))
              .fontSize(21)
              .fontWeight(FontWeight.Bold)
              .fontColor($r('app.color.text_primary'))
            Text('本月合计').fontSize(13).fontColor($r('app.color.text_secondary'))
          }.accessibilityGroup(true)
        }.width('100%').constraintSize({ maxWidth: 220 }).aspectRatio(1)
        ForEach(this.slices(), (slice: ChartSlice, index: number) => {
          Button({ type: ButtonType.Normal }) {
            Row({ space: 10 }) {
              Blank().width(12).height(12).borderRadius(6).backgroundColor(CHART_PALETTE[index]).accessibilityLevel('no')
              Text(slice.label).layoutWeight(1).fontColor($r('app.color.text_primary'))
              Text(`${money(slice.value)} · ${(slice.value / Math.max(1, this.data.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%`)
                .fontSize(14).fontColor($r('app.color.text_secondary'))
            }.width('100%')
          }.width('100%').padding(10).borderRadius(12)
            .backgroundColor(this.sliceSelected(slice) ? $r('app.color.surface_secondary') : $r('app.color.surface'))
            .onClick(() => this.choose(slice)).accessibilitySelected(this.sliceSelected(slice))
            .accessibilityText(`${slice.label}，${money(slice.value)}，占比百分之${(slice.value / Math.max(1, this.data.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}`)
            .accessibilityDescription('选择后筛选对应账目明细，再次选择取消筛选')
        }, (slice: ChartSlice) => `${slice.label}-${slice.value}`)
        if (this.data.length > 9) {
          Button(this.expanded ? '收起全部分类' : '展开全部分类').onClick(() => { this.expanded = !this.expanded; }).accessibilityText('展开或收起其余分类明细')
          if (this.expanded) {
            ForEach(this.data.slice(8), (item: ChartDatum) => {
              Button(`${item.label} · ${money(item.value)}`).onClick(() => this.onSelect([item.label])).accessibilityText(`查看${item.label}分类明细`)
            }, (item: ChartDatum) => item.label)
          }
        }
      } else { Text('本月没有该类型账目').fontColor($r('app.color.text_secondary')).padding(24) }
    }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
  }
}
