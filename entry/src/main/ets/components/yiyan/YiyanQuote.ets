import { YIYAN_DEFAULT_CLARITY } from '../../config/constants';
import { YiyanCard } from '../../models/YiyanModels';
import { YiyanImage } from './YiyanImage';

@Component
export struct YiyanQuote {
  @Prop card: YiyanCard = { provider: 'yiyan', id: '', text: '', source: '', image: '', publishedAt: '' };
  @Prop clarity: number = YIYAN_DEFAULT_CLARITY;
  @Prop compact: boolean = false;
  @State private expanded: boolean = false;
  build() {
    Column({ space: 12 }) {
      ForEach(this.card.image ? [this.card.image] : [], (source: string) => { YiyanImage({ source, clarity: this.clarity, compact: this.compact }) }, (source: string) => source)
      if (this.expanded) {
        Text(this.card.text).fontSize(this.compact ? 17 : 21).fontColor($r('app.color.text_primary')).lineHeight(this.compact ? 26 : 32)
          .copyOption(CopyOptions.LocalDevice).width('100%').accessibilityText(`一言：${this.card.text}`)
      } else {
        Text(this.card.text).fontSize(this.compact ? 17 : 21).fontColor($r('app.color.text_primary')).lineHeight(this.compact ? 26 : 32)
          .maxLines(this.compact ? 4 : 6).textOverflow({ overflow: TextOverflow.Ellipsis })
          .copyOption(CopyOptions.LocalDevice).width('100%').accessibilityText(`一言：${this.card.text}`)
      }
      if (this.card.text.length > 160 || this.card.text.split('\n').length > 6) {
        Button(this.expanded ? '收起全文' : '展开全文').onClick(() => { this.expanded = !this.expanded; }).accessibilityText(this.expanded ? '收起一言正文' : '展开一言完整正文')
      }
      if (this.card.source) { Text(`—— ${this.card.source}`).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%') }
      if (this.card.publishedAt) { Text(this.card.publishedAt.slice(0, 10)).fontSize(12).fontColor($r('app.color.text_secondary')).width('100%') }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
