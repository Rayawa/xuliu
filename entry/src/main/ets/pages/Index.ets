import { AcademicImportPage } from './courses/AcademicImportPage';
import { ROUTE_ACADEMIC_IMPORT } from '../config/constants';
import { AttachmentPage } from './documents/AttachmentPage';
import { Attachment } from '../models/Workspace';
import { ROUTE_ATTACHMENT } from '../config/constants';
import { refreshStudyPlan } from '../services/study/StudyService';
import { KEY_REVISION, KEY_DAY } from '../config/constants';
import { KEY_READY, KEY_SAVE_ERROR, KEY_ACTIVE, KEY_REMINDERS } from '../config/constants';
import { HdsNavigation, HdsNavigationTitleMode, HdsTabs } from '@kit.UIDesignKit';
import { EntryTarget } from '../models/Workspace';
import { TodayPage } from './main/TodayPage';
import { LibraryPage } from './main/LibraryPage';
import { MyPage } from './main/MyPage';
import { CollectionPage } from './workspace/CollectionPage';
import { EditorPage } from './workspace/EditorPage';
import { PlannerPage } from './workspace/PlannerPage';
import { DailyPage } from './workspace/DailyPage';
import { ReviewPage } from './workspace/ReviewPage';
import { FinancePage } from './finance/FinancePage';
import { FinanceEntryPage } from './finance/FinanceEntryPage';
import { BudgetPage } from './finance/BudgetPage';
import { FinanceSettingsPage } from './finance/FinanceSettingsPage';
import { StoredValuePage } from './finance/StoredValuePage';
import { ROUTE_FINANCE_ENTRY, ROUTE_FINANCE_BUDGET, ROUTE_FINANCE_SETTINGS, ROUTE_STORED_VALUE } from '../config/constants';
import { FocusPage } from './focus/FocusPage';
import { InfoPage } from './settings/InfoPage';
import { CloudPage } from './cloud/CloudPage';
import { CloudWebPage } from './cloud/CloudWebPage';
import { retrySave, getWorkspace, saveWorkspace } from '../services/storage/storage';
import { localDate, localTime } from '../domain/workspace/WorkspaceDomain';
import { ROUTE_COLLECTION, ROUTE_EDITOR, ROUTE_CALENDAR, ROUTE_TIMETABLE, ROUTE_DAILY, ROUTE_REVIEW,
  ROUTE_FINANCE, ROUTE_FOCUS, ROUTE_CLOUD, ROUTE_WEB, ROUTE_LOG, ROUTE_PRIVACY } from '../config/constants';

@Entry({ useSharedStorage: true })
@Component
struct Index {
  @Provide('pageStack') private pageStack: NavPathStack = new NavPathStack();
  @StorageLink(KEY_REVISION) @Watch('workspaceChanged') private revision: number = 0;
  @StorageLink(KEY_READY) @Watch('workspaceChanged') private ready: boolean = false;
  @StorageLink(KEY_SAVE_ERROR) private saveError: string = '';
  @StorageLink(KEY_ACTIVE) @Watch('activityChanged') private active: boolean = true;
  @StorageLink(KEY_REMINDERS) private remindersEnabled: boolean = true;
  @State private selected: number = 0;
  private reminderTimer: number = -1;
  private checkingReminder: boolean = false;
  private reminderStartedAt: number = Date.now();
  private titles: string[] = ['今日', '任务', '学习', '生活', '我的'];

  onPageShow(): void { this.startReminderTimer(); this.workspaceChanged(); }
  private workspaceChanged(): void {
    if (AppStorage.get<string>(KEY_DAY) !== localDate()) AppStorage.setOrCreate(KEY_DAY, localDate());
    if (this.ready && this.active) refreshStudyPlan().catch((error: Error) => { this.saveError = error.message; });
  }
  onPageHide(): void { this.stopReminderTimer(); }
  aboutToDisappear(): void { this.stopReminderTimer(); }
  private activityChanged(): void { this.stopReminderTimer(); if (this.active) { this.startReminderTimer(); this.workspaceChanged(); } }
  private stopReminderTimer(): void { if (this.reminderTimer >= 0) clearInterval(this.reminderTimer); this.reminderTimer = -1; }
  private startReminderTimer(): void { if (this.reminderTimer < 0 && this.active) this.reminderTimer = setInterval(() => this.checkReminders(), 15000); }

  private async checkReminders(): Promise<void> {
    this.workspaceChanged();
    if (!this.ready || !this.active || !this.remindersEnabled || this.checkingReminder) return;
    this.checkingReminder = true;
    try {
      const data = getWorkspace();
      const now = Date.now(); const key = `${localDate()}T${localTime()}`;
      const reminder = data.reminders.find((v) => {
        if (!v.enabled || (v.snoozedUntil ?? 0) > now || v.lastFired === key) return false;
        if (v.snoozedUntil && v.snoozedUntil <= now) return true;
        if ((v.times ?? []).includes(localTime())) return true;
        if (v.type === 'break' && v.intervalMinutes) {
          const last = v.lastFired ? new Date(v.lastFired).getTime() : this.reminderStartedAt;
          return now - last >= v.intervalMinutes * 60000;
        }
        return false;
      });
      if (!reminder) return;
      reminder.lastFired = key; reminder.snoozedUntil = undefined; await saveWorkspace(data);
      const result = await this.getUIContext().getPromptAction().showDialog({ title: reminder.title, message: '给自己一点照顾，休息片刻。',
        buttons: [{ text: '知道了', color: $r('app.color.accent') }, { text: '稍后五分钟', color: $r('app.color.accent') }] });
      if (result.index === 1) {
        const current = getWorkspace(); const item = current.reminders.find((v) => v.id === reminder.id);
        if (item) { item.snoozedUntil = Date.now() + 300000; await saveWorkspace(current); }
      }
    } catch (_) { /* Persistence errors are surfaced by the global save banner. */ }
    finally { this.checkingReminder = false; }
  }

  @Builder
  private destination(name: string, param: Object) {
    if (name === ROUTE_COLLECTION) { CollectionPage({ collection: param as string }) }
    else if (name === ROUTE_EDITOR) { EditorPage({ collection: (param as EntryTarget).collection, entryId: (param as EntryTarget).id }) }
    else if (name === ROUTE_CALENDAR) { PlannerPage() }
    else if (name === ROUTE_TIMETABLE) { PlannerPage({ timetable: true }) }
    else if (name === ROUTE_ACADEMIC_IMPORT) { AcademicImportPage() }
    else if (name === ROUTE_DAILY) { DailyPage() }
    else if (name === ROUTE_REVIEW) { ReviewPage() }
    else if (name === ROUTE_FINANCE) { FinancePage() }
    else if (name === ROUTE_FINANCE_ENTRY) { FinanceEntryPage({ entryId: param as string }) }
    else if (name === ROUTE_FINANCE_BUDGET) { BudgetPage({ month: param as string }) }
    else if (name === ROUTE_FINANCE_SETTINGS) { FinanceSettingsPage() }
    else if (name === ROUTE_STORED_VALUE) { StoredValuePage() }
    else if (name === ROUTE_FOCUS) { FocusPage({ target: (param as EntryTarget) ?? { collection: 'tasks', id: '' } }) }
    else if (name === ROUTE_CLOUD) { CloudPage() }
    else if (name === ROUTE_WEB) { CloudWebPage() }
    else if (name === ROUTE_LOG) { InfoPage() }
    else if (name === ROUTE_ATTACHMENT) { AttachmentPage({ attachment: param as Attachment }) }
    else if (name === ROUTE_PRIVACY) { InfoPage({ privacy: true }) }
  }

  build() {
    HdsNavigation(this.pageStack) {
      Column() {
        if (this.saveError) {
          Row({ space: 8 }) {
            Text(this.saveError).layoutWeight(1).fontColor($r('app.color.danger'))
            Button('重试').enabled(this.ready).onClick(async () => { try { await retrySave(); } catch (_) {} }).accessibilityText('重试保存本机数据')
          }.padding(12).backgroundColor($r('app.color.surface'))
        }
        if (!this.ready) {
          Column({ space: 16 }) {
            LoadingProgress().width(48).height(48).accessibilityText('正在读取工作台')
            Text('正在读取你的工作台…').fontColor($r('app.color.text_secondary'))
          }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
        } else {
          HdsTabs({ index: this.selected }) {
            TabContent() { TodayPage() }.tabBar('今日')
            TabContent() { CollectionPage({ collection: 'tasks', embedded: true }) }.tabBar('任务')
            TabContent() { LibraryPage({ group: '学习' }) }.tabBar('学习')
            TabContent() { LibraryPage({ group: '生活' }) }.tabBar('生活')
            TabContent() { MyPage() }.tabBar('我的')
          }.barPosition(BarPosition.End).scrollable(false).onChange((index: number) => { this.selected = index; })
            .layoutWeight(1).width('100%').accessibilityText('主标签：今日、任务、学习、生活、我的')
        }
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.mode(NavigationMode.Stack).navDestination(this.destination).titleMode(HdsNavigationTitleMode.MINI).hideBackButton(true)
      .titleBar({ content: { title: { mainTitle: `序流 · ${this.titles[this.selected]}` } } })
  }
}
