import { YiyanLibraryCard } from '../../models/YiyanModels';
import { YiyanImage } from './YiyanImage';

@Component
export struct YiyanLibraryCardView {
  @Prop card: YiyanLibraryCard = { id: '', text: '', source: '', image: '', publishedAt: '' };
  @State private expanded: boolean = false;
  build() {
    Column({ space: 12 }) {
      ForEach(this.card.image ? [this.card.image] : [], (source: string) => { YiyanImage({ source }) }, (source: string) => source)
      if (this.card.text) {
        if (this.expanded) {
          Text(this.card.text).fontSize(18).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.LocalDevice).width('100%')
        } else {
          Text(this.card.text).fontSize(18).fontColor($r('app.color.text_primary')).maxLines(8)
            .textOverflow({ overflow: TextOverflow.Ellipsis }).copyOption(CopyOptions.LocalDevice).width('100%')
        }
      }
      if (this.card.text.length > 200 || this.card.text.split('\n').length > 8) {
        Button(this.expanded ? '收起正文' : '展开正文').onClick(() => { this.expanded = !this.expanded; }).accessibilityText('展开或收起此条文集图文正文')
      }
      if (this.card.source) { Text(`—— ${this.card.source}`).fontColor($r('app.color.text_secondary')).width('100%') }
      if (this.card.publishedAt) { Text(this.card.publishedAt.slice(0, 10)).fontSize(12).fontColor($r('app.color.text_secondary')).width('100%') }
    }.padding(16).borderRadius(18).backgroundColor($r('app.color.surface')).width('100%').alignItems(HorizontalAlign.Start)
  }
}
