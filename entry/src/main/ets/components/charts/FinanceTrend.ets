import { FinanceTrendPoint } from '../../domain/finance/FinanceDomain';
import { money } from '../../domain/workspace/WorkspaceDomain';

@Component
export struct FinanceTrend {
  @Prop @Watch('dataChanged') data: FinanceTrendPoint[] = [];
  @State private selected: number = 0;
  @State private widthVp: number = 300;

  private dataChanged(): void { this.selected = Math.max(0, Math.min(this.selected, this.data.length - 1)); }
  private actualPeak(): number { return Math.max(0, ...this.data.map((point) => Math.max(point.income, point.expense))); }
  private peak(): number { return Math.max(1, ...this.data.map((point) => Math.max(point.income, point.expense))); }
  private points(income: boolean): number[][] {
    return this.data.map((point, index): number[] => [16 + index / Math.max(1, this.data.length - 1) * 688, 190 - (income ? point.income : point.expense) / this.peak() * 170]);
  }

  build() {
    Column({ space: 12 }) {
      Text('本月每日收支').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      Text(`最高 ${money(this.actualPeak())} · 点击图表查看某一天`).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      if (this.data.length > 0) {
        Shape() {
          Polyline().points([[16, 190], [704, 190]]).stroke($r('app.color.border')).strokeWidth(1).fill($r('app.color.transparent'))
          Polyline().points([[16, 105], [704, 105]]).stroke($r('app.color.border')).strokeWidth(1).fill($r('app.color.transparent'))
          Polyline().points([[16, 20], [704, 20]]).stroke($r('app.color.border')).strokeWidth(1).fill($r('app.color.transparent'))
          Polyline().points(this.points(true)).stroke($r('app.color.chart_income')).strokeWidth(3).fill($r('app.color.transparent'))
          Polyline().points(this.points(false)).stroke($r('app.color.chart_expense')).strokeWidth(3).fill($r('app.color.transparent'))
        }.viewPort({ x: 0, y: 0, width: 720, height: 210 }).width('100%').height(190)
          .onAreaChange((_old: Area, area: Area) => {
            const width = Number(area.width);
            if (Number.isFinite(width) && width > 0) this.widthVp = width;
          })
          .onClick((event: ClickEvent) => {
            const ratio = Math.max(0, Math.min(1, (event.x / this.widthVp * 720 - 16) / 688));
            this.selected = Math.round(ratio * (this.data.length - 1));
          })
          .accessibilityRole(AccessibilityRoleType.BUTTON).accessibilityText('本月每日收入和支出趋势')
          .accessibilityDescription('触摸图表选择日期，也可使用下方前一天和后一天按钮查看数值')
        Row() {
          Text(this.data[0].date.slice(5)).fontColor($r('app.color.text_secondary'))
          Blank()
          Text(this.data[this.data.length - 1].date.slice(5)).fontColor($r('app.color.text_secondary'))
        }.width('100%')
        Text(`${this.data[Math.min(this.selected, this.data.length - 1)].date} · 收入 ${money(this.data[Math.min(this.selected, this.data.length - 1)].income)} · 支出 ${money(this.data[Math.min(this.selected, this.data.length - 1)].expense)}`)
          .fontColor($r('app.color.text_primary')).accessibilityGroup(true)
        Row({ space: 12 }) {
          Button('前一天').enabled(this.selected > 0).onClick(() => { this.selected--; }).accessibilityText('查看趋势图前一天的收支')
          Button('后一天').enabled(this.selected < this.data.length - 1).onClick(() => { this.selected++; }).accessibilityText('查看趋势图后一天的收支')
        }
      }
    }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
      .border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 12, color: $r('app.color.card_shadow'), offsetY: 3 })
  }
}
