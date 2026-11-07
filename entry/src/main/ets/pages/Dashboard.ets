import {
  BlurStrategy, HdsNavigation, HdsNavigationTitleMode, HdsTabs,
  HdsTabsController, ScrollEffectType,
} from '@kit.UIDesignKit';
import { LengthMetrics, SymbolGlyphModifier } from '@kit.ArkUI';
import {
  ACCENT_RESOURCES, HDS_MATERIAL_TYPE_ADAPTIVE,
  KEY_ACCENT, KEY_ACTIVE, KEY_CLOUD_SESSION, KEY_DAY, KEY_READY,
  KEY_IMMERSIVE_MATERIAL_LEVEL, KEY_REMINDERS, KEY_REVISION, KEY_SAVE_ERROR, MAIN_TAB_MY,
  ROUTE_ACADEMIC_IMPORT, ROUTE_AI, ROUTE_ALERT_SETTINGS, ROUTE_ATTACHMENT, ROUTE_CALENDAR,
  ROUTE_CLOUD, ROUTE_COLLECTION, ROUTE_DAILY, ROUTE_EDITOR, ROUTE_FINANCE,
  ROUTE_FINANCE_BUDGET, ROUTE_FINANCE_ENTRY, ROUTE_FINANCE_SETTINGS, ROUTE_FOCUS,
  ROUTE_LOG, ROUTE_PRIVACY, ROUTE_REVIEW, ROUTE_REVIEW_DETAIL, ROUTE_STORED_VALUE,
  ROUTE_TIMETABLE, ROUTE_WEB, ROUTE_WORK_ADVANCE, ROUTE_YIYAN,
} from '../config/constants';
import { localDate } from '../domain/workspace/WorkspaceDomain';
import { Attachment, EntryTarget } from '../models/Workspace';
import { retrySave } from '../services/storage/storage';
import { lifeRuntime } from '../services/life/LifeRuntime';
import { refreshStudyPlan } from '../services/study/StudyService';
import { setSaveError, syncCurrentDay } from '../state/appState';
import { FrameScheduler } from '../utils/runtime/FrameScheduler';
import { LifeOverlay } from '../components/life/LifeOverlay';
import { TodayPage } from './main/TodayPage';
import { LibraryPage } from './main/LibraryPage';
import { MyPage } from './main/MyPage';
import lazy { AlertSettingsPage } from './settings/AlertSettingsPage';
import lazy { AppLogPage } from './settings/AppLogPage';
import lazy { PrivacyPage } from './settings/PrivacyPage';
import lazy { WorkAdvancePage } from './workspace/WorkAdvancePage';
import lazy { ReviewDetailPage } from './review/ReviewDetailPage';
import lazy { YiyanPage } from './yiyan/YiyanPage';
import lazy { AiAssistantPage } from './ai/AiAssistantPage';
import lazy { AcademicImportPage } from './courses/AcademicImportPage';
import lazy { AttachmentPage } from './documents/AttachmentPage';
import lazy { CollectionPage } from './workspace/CollectionPage';
import lazy { EditorPage } from './workspace/EditorPage';
import lazy { PlannerPage } from './workspace/PlannerPage';
import lazy { DailyPage } from './workspace/DailyPage';
import lazy { ReviewPage } from './workspace/ReviewPage';
import lazy { FinancePage } from './finance/FinancePage';
import lazy { FinanceEntryPage } from './finance/FinanceEntryPage';
import lazy { BudgetPage } from './finance/BudgetPage';
import lazy { FinanceSettingsPage } from './finance/FinanceSettingsPage';
import lazy { StoredValuePage } from './finance/StoredValuePage';
import lazy { FocusPage } from './focus/FocusPage';
import lazy { CloudPage } from './cloud/CloudPage';
import lazy { CloudWebPage } from './cloud/CloudWebPage';

interface MainTab {
  label: string;
  icon: Resource;
}

@Entry({ useSharedStorage: true })
@Component
struct Dashboard {
  @Provide('pageStack') private pageStack: NavPathStack = new NavPathStack();
  private tabsController: HdsTabsController = new HdsTabsController();
  @StorageLink(KEY_REVISION) @Watch('workspaceChanged') private revision: number = 0;
  @StorageLink(KEY_READY) @Watch('workspaceChanged') private ready: boolean = false;
  @StorageLink(KEY_SAVE_ERROR) private saveError: string = '';
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  @StorageLink(KEY_IMMERSIVE_MATERIAL_LEVEL) private immersiveMaterialLevel: number = 1;
  @StorageLink(KEY_ACTIVE) @Watch('activityChanged') private active: boolean = true;
  @StorageLink(KEY_REMINDERS) @Watch('workspaceChanged') private remindersEnabled: boolean = true;
  @State private selected: number = 0;
  @State private mainVisible: boolean = true;
  @StorageLink(KEY_DAY) @Watch('workspaceChanged') private day: string = localDate();
  @StorageLink(KEY_CLOUD_SESSION) @Watch('workspaceChanged') private cloudSession: number = 0;
  private tabs: MainTab[] = [
    { label: '今日', icon: $r('sys.symbol.house') },
    { label: '任务', icon: $r('sys.symbol.checkmark_circle') },
    { label: '学习', icon: $r('sys.symbol.book') },
    { label: '生活', icon: $r('sys.symbol.heart') },
    { label: '我的', icon: $r('sys.symbol.person') },
  ];
  private studyRefresh: FrameScheduler = new FrameScheduler();
  private wasReady: boolean = false;

  onPageShow(): void {
    lifeRuntime().setActive(this.active);
    this.workspaceChanged();
    this.scheduleStudyRefresh();
  }

  private workspaceChanged(): void {
    syncCurrentDay();
    if (this.ready) lifeRuntime().workspaceChanged();
    if (this.ready && !this.wasReady) this.scheduleStudyRefresh();
    this.wasReady = this.ready;
  }

  private scheduleStudyRefresh(): void {
    if (!this.ready || !this.active) return;
    this.studyRefresh.request(this.getUIContext(), (): void => {
      if (this.ready && this.active) refreshStudyPlan().catch((error: Error) => setSaveError(error.message));
    });
  }

  onPageHide(): void { this.studyRefresh.cancel(); lifeRuntime().setActive(false); }
  aboutToDisappear(): void { this.studyRefresh.cancel(); lifeRuntime().setActive(false); }
  private activityChanged(): void {
    lifeRuntime().setActive(this.active);
    if (this.active) { this.workspaceChanged(); this.scheduleStudyRefresh(); }
    else this.studyRefresh.cancel();
  }

  private tabStyle(tab: MainTab): BottomTabBarStyle {
    const selectedColor = ACCENT_RESOURCES[Math.max(0, Math.min(ACCENT_RESOURCES.length - 1, this.accent))];
    return new BottomTabBarStyle({
      normal: new SymbolGlyphModifier(tab.icon).fontColor([$r('app.color.text_secondary')]),
      selected: new SymbolGlyphModifier(tab.icon).fontColor([selectedColor]),
    }, tab.label).labelStyle({
      selectedColor,
      unselectedColor: $r('app.color.text_secondary'),
    });
  }

  @Builder
  private destination(name: string, param: Object) {
    if (name === ROUTE_COLLECTION) {
      CollectionPage({ collection: param as string })
    } else if (name === ROUTE_EDITOR) {
      EditorPage({
        collection: (param as EntryTarget).collection,
        entryId: (param as EntryTarget).id,
        initialToolKind: (param as EntryTarget).toolKind ?? '',
        initialDate: (param as EntryTarget).initialDate ?? '',
        initialCourseId: (param as EntryTarget).courseId ?? '',
        initialLinkedCourseId: (param as EntryTarget).linkedCourseId ?? '',
      })
    } else if (name === ROUTE_CALENDAR) {
      PlannerPage()
    } else if (name === ROUTE_TIMETABLE) {
      PlannerPage({ timetable: true })
    } else if (name === ROUTE_ACADEMIC_IMPORT) {
      AcademicImportPage()
    } else if (name === ROUTE_DAILY) {
      DailyPage()
    } else if (name === ROUTE_REVIEW_DETAIL) {
      ReviewDetailPage({ itemId: param as string })
    } else if (name === ROUTE_REVIEW) {
      ReviewPage()
    } else if (name === ROUTE_FINANCE) {
      FinancePage()
    } else if (name === ROUTE_FINANCE_ENTRY) {
      FinanceEntryPage({ entryId: param as string })
    } else if (name === ROUTE_FINANCE_BUDGET) {
      BudgetPage({ month: param as string })
    } else if (name === ROUTE_FINANCE_SETTINGS) {
      FinanceSettingsPage()
    } else if (name === ROUTE_STORED_VALUE) {
      StoredValuePage()
    } else if (name === ROUTE_WORK_ADVANCE) {
      WorkAdvancePage({ target: param as EntryTarget })
    } else if (name === ROUTE_FOCUS) {
      FocusPage()
    } else if (name === ROUTE_YIYAN) {
      YiyanPage()
    } else if (name === ROUTE_AI) {
      AiAssistantPage({ targetCourseId: (param as string) ?? '' })
    } else if (name === ROUTE_ALERT_SETTINGS) {
      AlertSettingsPage()
    } else if (name === ROUTE_CLOUD) {
      CloudPage()
    } else if (name === ROUTE_WEB) {
      CloudWebPage()
    } else if (name === ROUTE_LOG) {
      AppLogPage()
    } else if (name === ROUTE_ATTACHMENT) {
      AttachmentPage({ attachment: param as Attachment })
    } else if (name === ROUTE_PRIVACY) {
      PrivacyPage()
    }
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      HdsNavigation(this.pageStack) {
        Column() {
          if (this.saveError) {
            Row({ space: 8 }) {
              Text(this.saveError).layoutWeight(1).fontColor($r('app.color.danger'))
              Button('重试')
                .enabled(this.ready)
                .onClick(async () => { try { await retrySave(); } catch (_) {} })
                .accessibilityText('重试保存本机数据')
            }
            .width('100%')
            .margin({ top: 96 })
            .padding(12)
            .backgroundColor($r('app.color.surface'))
          }
          if (!this.ready) {
            Column({ space: 16 }) {
              LoadingProgress().width(48).height(48).accessibilityText('正在读取工作台')
              Text('正在读取你的工作台…').fontColor($r('app.color.text_secondary'))
            }
            .width('100%')
            .layoutWeight(1)
            .justifyContent(FlexAlign.Center)
          } else {
            HdsTabs({ controller: this.tabsController, index: this.selected }) {
              TabContent() { TodayPage() }
                .tabBar(this.tabStyle(this.tabs[0])).accessibilityText('今日标签页')
              TabContent() { CollectionPage({ collection: 'tasks', embedded: true }) }
                .tabBar(this.tabStyle(this.tabs[1])).accessibilityText('任务标签页')
              TabContent() { LibraryPage({ group: '学习' }) }
                .tabBar(this.tabStyle(this.tabs[2])).accessibilityText('学习标签页')
              TabContent() { LibraryPage({ group: '生活' }) }
                .tabBar(this.tabStyle(this.tabs[3])).accessibilityText('生活标签页')
              TabContent() { MyPage({ active: this.selected === MAIN_TAB_MY }) }
                .tabBar(this.tabStyle(this.tabs[4])).accessibilityText('我的标签页')
            }
            .barPosition(BarPosition.End)
            .barWidth(320)
            .cachedMaxCount(5, TabsCacheMode.CACHE_LATEST_SWITCHED)
            .scrollable(false)
            .vertical(false)
            .barOverlap(true)
            .blurStrategy(BlurStrategy.ENABLE)
            .barFloatingStyle({
              barBottomMargin: 28,
              lightColor: ACCENT_RESOURCES[Math.max(0, Math.min(ACCENT_RESOURCES.length - 1, this.accent))],
              gradientMask: { maskColor: $r('app.color.transparent'), maskHeight: 92 },
              systemMaterialEffect: {
                materialType: HDS_MATERIAL_TYPE_ADAPTIVE,
                materialLevel: this.immersiveMaterialLevel,
              },
            })
            .onChange((index: number) => { this.selected = index; })
            .layoutWeight(1)
            .width('100%')
            .accessibilityText('主标签：今日、任务、学习、生活、我的')
          }
        }
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.background'))
      }
      .onNavBarStateChange((visible: boolean) => { this.mainVisible = visible; })
      .mode(NavigationMode.Stack)
      .navDestination(this.destination)
      .titleMode(HdsNavigationTitleMode.MINI)
      .hideBackButton(true)
      .titleBar({
        style: {
          scrollEffectOpts: {
            enableScrollEffect: false,
            scrollEffectType: ScrollEffectType.GRADIENT_BLUR,
            blurEffectiveStartOffset: LengthMetrics.vp(0),
            blurEffectiveEndOffset: LengthMetrics.vp(20),
          },
          originalStyle: {
            backgroundStyle: { backgroundColor: $r('app.color.transparent') },
            contentStyle: { titleStyle: { mainTitleColor: $r('app.color.text_primary') } },
          },
          scrollEffectStyle: {
            backgroundStyle: { backgroundColor: $r('app.color.transparent') },
            contentStyle: { titleStyle: { mainTitleColor: $r('app.color.text_primary') } },
          },
          systemMaterialEffect: {
            materialType: HDS_MATERIAL_TYPE_ADAPTIVE,
            materialLevel: this.immersiveMaterialLevel,
          },
        },
        content: { title: { mainTitle: `序流 · ${this.tabs[this.selected].label}` } },
      })
      .width('100%')
      .height('100%')
      .backgroundColor($r('app.color.background'))
      .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP, LayoutSafeAreaEdge.BOTTOM])
      LifeOverlay().margin({ bottom: this.mainVisible ? 112 : 24 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background'))
  }
}
