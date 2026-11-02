import { KEY_REVISION, KEY_ACCENT } from '../../config/constants';
import { CollectionDefinition } from '../../models/Workspace';
import { COLLECTIONS, ROUTE_COLLECTION, ACCENT_RESOURCES } from '../../config/constants';
import { entries } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace } from '../../services/storage/storage';

@Component
export struct LibraryPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop group: string = '学习';
  @StorageLink(KEY_REVISION) private revision: number = 0;
  @StorageLink(KEY_ACCENT) private accent: number = 0;

  private collections(): CollectionDefinition[] {
    if (this.group === '学习') return COLLECTIONS.filter((v) => ['学习', '工作', '思考'].includes(v.group));
    return COLLECTIONS.filter((v) => v.group === this.group);
  }

  build() {
    Scroll() {
      Column({ space: 16 }) {
        Text(this.group === '学习' ? '学习与创造' : '生活有序').fontSize(28).fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary')).width('100%')
        Text(this.group === '学习' ? '让知识、灵感和行动连在一起。' : '照顾好日常，也照顾好自己。')
          .fontColor($r('app.color.text_secondary')).width('100%')
        GridRow({ columns: 12, gutter: 16 }) {
          ForEach(this.collections(), (item: CollectionDefinition) => {
            GridCol({ span: { xs: 12, sm: 12, md: 6, lg: 4 } }) {
              Column({ space: 12 }) {
                Row() {
                  SymbolGlyph(item.symbol).fontSize(28).fontColor([ACCENT_RESOURCES[this.accent]]).accessibilityLevel('no')
                  Blank()
                  Text(String(entries(getWorkspace(), item.key).length)).fontColor($r('app.color.text_secondary'))
                }.width('100%')
                Text(item.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
                Text(item.caption).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
              }.width('100%').padding(20).borderRadius(20).backgroundColor($r('app.color.surface'))
                .onClick(() => this.pageStack.pushPath({ name: ROUTE_COLLECTION, param: item.key }))
                .accessibilityGroup(true).accessibilityRole(AccessibilityRoleType.BUTTON).accessibilityText(`打开${item.title}，${item.caption}`)
            }
          }, (item: CollectionDefinition) => `${item.key}-${this.revision}`)
        }
      }.width('100%').constraintSize({ maxWidth: 1280 }).padding(20)
    }.width('100%').height('100%').backgroundColor($r('app.color.background'))
  }
}
