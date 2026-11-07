import { EyeCycleCard } from '../../components/life/EyeCycleCard';
import { ReminderProjects } from '../../components/life/ReminderProjects';
import { KEY_REVISION, KEY_ACCENT } from '../../config/constants';
import { CollectionDefinition } from '../../models/Workspace';
import { COLLECTIONS, ROUTE_COLLECTION, ACCENT_RESOURCES } from '../../config/constants';
import { entries } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace } from '../../services/storage/storage';
import { CollectionTile } from '../../components/workspace/CollectionTile';

@Component
export struct LibraryPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop group: string = '学习';
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  @State private counts: Record<string, number> = {};

  aboutToAppear(): void { this.reload(); }

  private reload(): void {
    const data = getWorkspace();
    const counts: Record<string, number> = {};
    this.collections().forEach((item) => { counts[item.key] = entries(data, item.key).length; });
    this.counts = counts;
  }

  private collections(): CollectionDefinition[] {
    if (this.group === '学习') return COLLECTIONS.filter((v) => ['学习', '工作', '思考'].includes(v.group));
    return COLLECTIONS.filter((v) => v.group === this.group);
  }

  build() {
    Scroll() {
      Column() {
        Column({ space: 16 }) {
          Blank().height(100).width('100%').accessibilityLevel('no')
          Text(this.group === '学习' ? '学习与创造' : '生活有序').fontSize(28).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary')).width('100%')
          Text(this.group === '学习' ? '让知识、灵感和行动连在一起。' : '照顾好日常，也照顾好自己。')
            .fontColor($r('app.color.text_secondary')).width('100%')
          if (this.group === '生活') { EyeCycleCard(); ReminderProjects() }
          GridRow({ columns: 12, gutter: 16 }) {
            ForEach(this.collections(), (item: CollectionDefinition) => {
              GridCol({ span: { xs: 12, sm: 12, md: 6, lg: 4 } }) {
                CollectionTile({ item, count: this.counts[item.key] ?? 0,
                  accent: ACCENT_RESOURCES[Math.max(0, Math.min(ACCENT_RESOURCES.length - 1, this.accent))],
                  onOpen: () => this.pageStack.pushPath({ name: ROUTE_COLLECTION, param: item.key }) })
              }
            }, (item: CollectionDefinition) => `${item.key}-${this.revision}`)
          }
          Blank().height(112).width('100%').accessibilityLevel('no')
        }.width('100%').constraintSize({ maxWidth: 1280 }).padding(20)
      }.width('100%').alignItems(HorizontalAlign.Center)
    }.width('100%').height('100%').backgroundColor($r('app.color.background'))
  }
}
