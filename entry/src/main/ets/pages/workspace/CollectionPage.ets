import { LengthMetrics } from '@kit.ArkUI';
import { KEY_REVISION } from '../../config/constants';
import { EntryTarget } from '../../models/Workspace';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { WorkspaceEntry } from '../../models/Workspace';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { collectionTitle, entries, toggleComplete } from '../../domain/workspace/WorkspaceDomain';
import { EntryCard } from '../../components/workspace/EntryCard';
import { ROUTE_EDITOR } from '../../config/constants';

@Component
export struct CollectionPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop collection: string = 'tasks';
  @Prop embedded: boolean = false;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @State private records: WorkspaceEntry[] = [];
  @State private query: string = '';
  @State private filter: string = '全部';
  @State private sort: string = '最近添加';
  @State private error: string = '';

  aboutToAppear(): void { this.reload(); }

  private reload(): void {
    let list = entries(getWorkspace(), this.collection);
    const query = this.query.trim().toLowerCase();
    if (query) list = list.filter((v) => `${v.title} ${v.note ?? ''} ${v.requirements ?? ''}`.toLowerCase().includes(query));
    if (this.filter === '未完成') list = list.filter((v) => !v.done);
    if (this.filter === '已完成') list = list.filter((v) => v.done);
    if (this.sort === '截止时间') list.sort((a, b) => (a.due || a.date || '9999').localeCompare(b.due || b.date || '9999'));
    else list.reverse();
    this.records = list;
  }

  private async toggle(id: string): Promise<void> {
    try {
      const data = getWorkspace();
      const item = entries(data, this.collection).find((v) => v.id === id);
      if (item) { toggleComplete(item, this.collection); await saveWorkspace(data); }
    } catch (error) { this.error = (error as Error).message; }
  }

  @Builder
  private content() {
      Column({ space: 12 }) {
        if (this.embedded) {
          Row({ space: 12 }) {
            Button('任务').onClick(() => { this.collection = 'tasks'; this.reload(); }).accessibilityText('切换到任务列表')
            Button('事项').onClick(() => { this.collection = 'milestones'; this.reload(); }).accessibilityText('切换到事项列表')
          }.width('100%')
        }
        Search({ value: this.query, placeholder: `搜索${collectionTitle(this.collection)}` })
          .onChange((v: string) => { this.query = v; this.reload(); }).accessibilityText('搜索记录')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Select([{ value: '全部' }, { value: '未完成' }, { value: '已完成' }]).value(this.filter)
            .onSelect((_i: number, v: string) => { this.filter = v; this.reload(); }).accessibilityText('按完成状态筛选')
          Select([{ value: '最近添加' }, { value: '截止时间' }]).value(this.sort)
            .onSelect((_i: number, v: string) => { this.sort = v; this.reload(); }).accessibilityText('记录排序')
          Button('＋ 新建').onClick(() => this.pageStack.pushPath({ name: ROUTE_EDITOR, param: { collection: this.collection, id: '' } as EntryTarget }))
            .accessibilityText(`新建${collectionTitle(this.collection)}`)
        }.width('100%')
        if (this.error) { Text(this.error).fontColor($r('app.color.danger')) }
        List({ space: 12 }) {
          ForEach(this.records, (item: WorkspaceEntry) => {
            ListItem() {
              EntryCard({ item, collection: this.collection,
                onOpen: () => this.pageStack.pushPath({ name: ROUTE_EDITOR, param: { collection: this.collection, id: item.id } as EntryTarget }),
                onToggle: () => this.toggle(item.id) })
            }
          }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
          if (this.records.length === 0) {
            ListItem() {
              Column({ space: 12 }) {
                Text('留一点空间，给下一件想做的事').fontSize(18).fontColor($r('app.color.text_primary'))
                Text('点击“新建”开始记录，数据保存在本机。').fontColor($r('app.color.text_secondary'))
              }.width('100%').padding(32)
            }
          }
        }.layoutWeight(1).width('100%')
      }.width('100%').height('100%').padding(20).backgroundColor($r('app.color.background'))
  }

  build() {
    if (this.embedded) {
      this.content()
    } else {
      HdsNavDestination() { this.content() }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: collectionTitle(this.collection) }, backIcon: { action: () => this.pageStack.pop() } } })
      .onShown(() => this.reload())
    }
  }
}
