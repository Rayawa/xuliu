import { common } from '@kit.AbilityKit';
import {
  APP_VERSION, CONTENT_MAX_WIDTH, LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN, LIST_PAGE_HORIZONTAL_PADDING,
  LIST_SECTION_CONTENT_GAP, LIST_SECTION_DIVIDER_VERTICAL_MARGIN, LIST_SECTION_SPACING,
  LIST_SECTION_TITLE_START_PADDING, ROUTE_AI, ROUTE_CLOUD, ROUTE_COLLECTION, ROUTE_LOG, ROUTE_PRIVACY,
  ROUTE_YIYAN,
} from '../../config/constants';
import { appendDemo } from '../../domain/workspace/DemoData';
import { localDate } from '../../domain/workspace/WorkspaceDomain';
import { Workspace } from '../../models/Workspace';
import { decodeWorkspace, getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { exportDocument, readDocument } from '../../services/files/WorkspaceFiles';
import { SettingsLinkRow } from '../../components/settings/SettingsLinkRow';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { cancelStaggerEnterAnimation, startStaggerEnterAnimation } from '../../ui/animation/motion';
import { scrollByAxis } from '../../ui/interaction/scroll';

interface MyAction {
  label: string;
  icon: Resource;
  action: () => void;
}

const MY_PAGE_WIDE_WIDTH: number = 840;

@Component
export struct MyPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop @Watch('onActiveChanged') active: boolean = false;
  @State private contentWidth: number = 0;
  @State private message: string = '';
  @State private pendingImport: Workspace | undefined = undefined;
  @State private busy: boolean = false;
  @State private animStep: number = 0;
  private scroller: Scroller = new Scroller();
  private enterAnimationPlayed: boolean = false;
  private enterAnimationTimers: number[] = [];

  aboutToAppear(): void {
    if (this.active) this.startPageAnimationOnce();
  }

  aboutToDisappear(): void {
    cancelStaggerEnterAnimation(this.enterAnimationTimers);
    this.enterAnimationTimers = [];
  }

  private onActiveChanged(): void {
    if (this.active) this.startPageAnimationOnce();
  }

  private startPageAnimationOnce(): void {
    if (this.enterAnimationPlayed) return;
    this.enterAnimationPlayed = true;
    this.animStep = 0;
    this.enterAnimationTimers =
      startStaggerEnterAnimation(this.getUIContext(), 5, (step: number): void => { this.animStep = step; });
  }

  private requiredStep(group: string): number {
    if (this.contentWidth >= MY_PAGE_WIDE_WIDTH) {
      if (group === 'identity' || group === 'information' || group === 'settings') return 1;
      if (group === 'more') return 2;
      return 3;
    }
    if (group === 'identity') return 1;
    if (group === 'settings') return 2;
    if (group === 'more') return 3;
    if (group === 'help') return 4;
    return 5;
  }

  private async exportData(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const saved = await exportDocument(this.getUIContext().getHostContext() as common.UIAbilityContext,
        JSON.stringify(getWorkspace(), null, 2), `序流工作台-${localDate()}.json`);
      this.message = saved ? '已导出工作台备份' : '已取消导出';
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async importData(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const raw = await readDocument(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (raw) this.pendingImport = decodeWorkspace(raw);
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async confirmImport(): Promise<void> {
    if (!this.pendingImport || this.busy) return;
    this.busy = true;
    try {
      await saveWorkspace(this.pendingImport, false);
      this.pendingImport = undefined;
      this.message = '导入完成';
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async addDemo(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await saveWorkspace(appendDemo(getWorkspace()));
      this.message = '已追加演示内容，可随时编辑或删除';
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private moreActions(): MyAction[] {
    return [
      { label: '一言图文与文集', icon: $r('app.media.contact'),
        action: () => this.pageStack.pushPath({ name: ROUTE_YIYAN }) },
      { label: '原生 AI 助手', icon: $r('app.media.api'),
        action: () => this.pageStack.pushPath({ name: ROUTE_AI }) },
      { label: '账号与云端同步', icon: $r('app.media.submit'),
        action: () => this.pageStack.pushPath({ name: ROUTE_CLOUD }) },
      { label: '管理提醒', icon: $r('app.media.attention'),
        action: () => this.pageStack.pushPath({ name: ROUTE_COLLECTION, param: 'reminders' }) },
      { label: '导出工作台 JSON', icon: $r('app.media.share'),
        action: () => { this.exportData(); } },
      { label: '导入工作台 JSON', icon: $r('app.media.log'),
        action: () => { this.importData(); } },
      { label: '添加演示内容', icon: $r('app.media.tutorial'),
        action: () => { this.addDemo(); } },
    ];
  }

  private helpActions(): MyAction[] {
    return [
      { label: '更新日志', icon: $r('app.media.app_log'),
        action: () => this.pageStack.pushPath({ name: ROUTE_LOG }) },
      { label: '隐私说明', icon: $r('app.media.privacy'),
        action: () => this.pageStack.pushPath({ name: ROUTE_PRIVACY }) },
    ];
  }

  @Builder
  private appIdentity(): void {
    Column({ space: LIST_SECTION_CONTENT_GAP }) {
      Image($r('app.media.xuliu_start'))
        .width(100)
        .height(100)
        .borderRadius(22)
        .margin({ bottom: 10 })
        .accessibilityText('序流应用图标')
      Text('序流')
        .fontSize(30)
        .fontWeight(800)
        .fontColor($r('app.color.diff_content'))
        .textAlign(TextAlign.Center)
        .accessibilityText('序流')
      Text('个人学习与生活工作台')
        .fontSize(20)
        .fontWeight(600)
        .fontColor($r('app.color.v3_text_secondary'))
        .textAlign(TextAlign.Center)
        .accessibilityText('个人学习与生活工作台')
    }
    .width('100%')
    .padding({ top: 18, bottom: 18, left: 12, right: 12 })
    .opacity(this.animStep >= this.requiredStep('identity') ? 1 : 0)
    .translate({ y: this.animStep >= this.requiredStep('identity') ? 0 : 20 })
    .accessibilityGroup(true)
    .accessibilityText('序流应用图标和名称')
  }

  @Builder
  private versionInformation(): void {
    Column({ space: 5 }) {
      Text(`版本 ${APP_VERSION}`)
        .fontSize(12)
        .fontColor($r('app.color.v3_text_secondary'))
        .accessibilityText(`版本${APP_VERSION}`)
      Text('记录由你整理，进度由你掌握。')
        .fontSize(12)
        .fontColor($r('app.color.v3_text_secondary'))
        .accessibilityText('记录由你整理，进度由你掌握')
      Text('本机数据由你管理；云端操作需主动确认。')
        .fontSize(12)
        .fontColor($r('app.color.v3_text_secondary'))
        .accessibilityText('本机数据由你管理，云端操作需主动确认')
    }
    .width('100%')
    .padding({ top: 14 })
    .opacity(this.animStep >= this.requiredStep('information') ? 1 : 0)
    .translate({ y: this.animStep >= this.requiredStep('information') ? 0 : 20 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText(`序流版本${APP_VERSION}。本机数据由你管理；云端操作需主动确认。`)
  }

  @Builder
  private sectionTitle(title: string): void {
    Text(title)
      .fontSize(14)
      .fontWeight(FontWeight.Bold)
      .fontColor($r('app.color.diff_content'))
      .width('100%')
      .padding({ left: LIST_SECTION_TITLE_START_PADDING })
      .accessibilityText(title)
  }

  @Builder
  private actionSection(title: string, items: MyAction[], group: string): void {
    Column({ space: LIST_SECTION_CONTENT_GAP }) {
      this.sectionTitle(title)
      Column() {
        ForEach(items, (item: MyAction, index: number) => {
          SettingsLinkRow({ label: item.label, icon: item.icon, onOpen: item.action })
          if (index < items.length - 1) {
            Divider()
              .color($r('app.color.v3_chart_grid'))
              .margin({
                left: LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN,
                right: LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN,
              })
              .accessibilityText(`${title}栏目分隔线`)
          }
        }, (item: MyAction) => item.label)
      }
      .width('100%')
      .borderRadius(16)
      .backgroundColor($r('app.color.v3_surface'))
      .shadow({ radius: 8, color: $r('app.color.v3_shadow'), offsetY: 2 })
      .clip(true)
      .accessibilityGroup(false).accessibilityLevel('no')
      .accessibilityText(`${title}栏目`)
    }
    .width('100%')
    .opacity(this.animStep >= this.requiredStep(group) ? 1 : 0)
    .translate({ y: this.animStep >= this.requiredStep(group) ? 0 : 20 })
  }

  @Builder
  private settingsSection(): void {
    Column({ space: LIST_SECTION_CONTENT_GAP }) {
      this.sectionTitle('设置')
      SettingsPanel({ onMessage: (message: string) => { this.message = message; } })
    }
    .width('100%')
    .opacity(this.animStep >= this.requiredStep('settings') ? 1 : 0)
    .translate({ y: this.animStep >= this.requiredStep('settings') ? 0 : 20 })
    .accessibilityGroup(false).accessibilityLevel('no')
    .accessibilityText('设置')
  }

  @Builder
  private pendingImportSection(): void {
    if (this.pendingImport) {
      Column({ space: 10 }) {
        Text(`待导入：${this.pendingImport.tasks.length} 个任务、${this.pendingImport.courses.length} 门课程、${this.pendingImport.pages.length} 页笔记。确认后替换本机工作台。`)
          .fontColor($r('app.color.v3_text_primary')).width('100%')
        Row({ space: 8 }) {
          Button('确认替换本机工作台').enabled(!this.busy)
            .fontColor($r('app.color.danger'))
            .onClick(() => this.confirmImport())
            .accessibilityText('确认用预览的备份替换本机工作台')
          Button('取消导入').enabled(!this.busy)
            .onClick(() => { this.pendingImport = undefined; })
            .accessibilityText('取消导入工作台')
        }.width('100%')
      }
      .width('100%').padding(16).borderRadius(16)
      .backgroundColor($r('app.color.v3_surface'))
      .shadow({ radius: 8, color: $r('app.color.v3_shadow'), offsetY: 2 })
      .accessibilityText('导入工作台预览与确认')
    }
  }

  @Builder
  private settingsAndLinks(): void {
    Column({ space: LIST_SECTION_SPACING }) {
      this.settingsSection()
      Divider()
        .margin({
          top: LIST_SECTION_DIVIDER_VERTICAL_MARGIN,
          bottom: LIST_SECTION_DIVIDER_VERTICAL_MARGIN,
        })
        .color($r('app.color.border'))
        .opacity(this.animStep >= this.requiredStep('more') ? 1 : 0)
        .accessibilityText('设置与更多栏目分隔线')
      this.actionSection('更多', this.moreActions(), 'more')
      if (this.pendingImport) {
        this.pendingImportSection()
      }
      Divider()
        .margin({
          top: LIST_SECTION_DIVIDER_VERTICAL_MARGIN,
          bottom: LIST_SECTION_DIVIDER_VERTICAL_MARGIN,
        })
        .color($r('app.color.border'))
        .opacity(this.animStep >= this.requiredStep('help') ? 1 : 0)
        .accessibilityText('更多与帮助栏目分隔线')
      this.actionSection('帮助', this.helpActions(), 'help')
      if (this.message) {
        Text(this.message)
          .fontSize(14)
          .fontColor($r('app.color.v3_text_secondary'))
          .width('100%')
          .accessibilityText(this.message)
      }
    }
    .width('100%')
    .accessibilityText('设置、更多与帮助列表')
  }

  build() {
    Stack() {
      if (this.contentWidth >= MY_PAGE_WIDE_WIDTH) {
        Column() {
          Row({ space: 16 }) {
            Column() {
              Blank()
                .height(100)
                .width('100%')
              Column({ space: 14 }) {
                this.appIdentity()
                Divider()
                  .color($r('app.color.border'))
                  .opacity(this.animStep >= this.requiredStep('information') ? 1 : 0)
                  .accessibilityText('应用名称与版本信息分隔线')
                this.versionInformation()
              }
              .layoutWeight(1)
              .width('100%')
              .justifyContent(FlexAlign.Center)
            }
            .layoutWeight(4)
            .height('100%')
            .padding({ left: LIST_PAGE_HORIZONTAL_PADDING, right: LIST_PAGE_HORIZONTAL_PADDING })
            .accessibilityGroup(false).accessibilityLevel('no')
            .accessibilityText('固定显示的应用名称和版本信息')

            Divider()
              .vertical(true)
              .height('100%')
              .color($r('app.color.border'))
              .accessibilityText('应用信息与功能列表分隔线')

            Scroll(this.scroller) {
              Column() {
                Blank().height(110).width('100%')
                this.settingsAndLinks()
                Blank().height(110).width('100%')
              }
              .width('100%')
              .padding({ left: LIST_PAGE_HORIZONTAL_PADDING, right: LIST_PAGE_HORIZONTAL_PADDING })
            }
            .layoutWeight(6)
            .height('100%')
            .scrollBar(BarState.Off)
            .edgeEffect(EdgeEffect.Spring, { alwaysEnabled: true })
            .accessibilityText('可滚动的设置、更多与帮助列表')
          }
          .layoutWeight(1)
          .width('100%')
          .constraintSize({ maxWidth: CONTENT_MAX_WIDTH })
          .padding({ left: LIST_PAGE_HORIZONTAL_PADDING, right: LIST_PAGE_HORIZONTAL_PADDING })
          .alignItems(VerticalAlign.Top)
          .accessibilityGroup(false).accessibilityLevel('no')
          .accessibilityText('左侧固定应用信息，右侧可滚动功能列表')
        }
        .width('100%')
        .height('100%')
        .alignItems(HorizontalAlign.Center)
        .backgroundColor($r('app.color.background'))
      } else {
        Scroll(this.scroller) {
          Column({ space: LIST_SECTION_SPACING }) {
            Blank().height(100).width('100%')
            this.appIdentity()
            Divider()
              .color($r('app.color.border'))
              .opacity(this.animStep >= this.requiredStep('settings') ? 1 : 0)
              .accessibilityText('应用信息与功能列表分隔线')
            this.settingsAndLinks()
            Divider()
              .color($r('app.color.border'))
              .opacity(this.animStep >= this.requiredStep('information') ? 1 : 0)
              .accessibilityText('功能列表与版本信息分隔线')
            this.versionInformation()
            Blank().height(110).width('100%')
          }
          .width('100%')
          .constraintSize({ maxWidth: CONTENT_MAX_WIDTH })
          .padding({ left: LIST_PAGE_HORIZONTAL_PADDING, right: LIST_PAGE_HORIZONTAL_PADDING })
        }
        .width('100%')
        .height('100%')
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.Spring, { alwaysEnabled: true })
        .backgroundColor($r('app.color.background'))
        .accessibilityText('可滚动的我的页面')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background'))
    .onAxisEvent((event: AxisEvent): void => scrollByAxis(this.scroller, event))
    .onAreaChange((_oldValue: Area, newValue: Area): void => {
      const width = Number(newValue.width);
      if (Number.isFinite(width) && width > 0) this.contentWidth = width;
    })
    .accessibilityText('我的与关于页面')
  }
}
