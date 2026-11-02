import { courseSchool } from '../../domain/courses/TimetableRules';
import { ROUTE_ACADEMIC_IMPORT } from '../../config/constants';
import { KEY_REVISION, KEY_ACCENT } from '../../config/constants';
import { applyStudyPlan } from '../../domain/workspace/StudyAutomation';
import { EntryTarget } from '../../models/Workspace';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { Workspace, WorkspaceEntry, CourseSlot } from '../../models/Workspace';
import { WEEKDAYS, ROUTE_EDITOR, ACCENT_RESOURCES } from '../../config/constants';
import { emptyWorkspace, localDate, addDays, timetableWeekNumber, runsInWeek, validDate } from '../../domain/workspace/WorkspaceDomain';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { EntryCard } from '../../components/workspace/EntryCard';

@Component
export struct PlannerPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop timetable: boolean = false;
  @StorageLink(KEY_REVISION) @Watch('reload') private revision: number = 0;
  @StorageLink(KEY_ACCENT) private accent: number = 0;
  @State private data: Workspace = emptyWorkspace();
  @State private selectedDate: string = localDate();
  @State private month: string = localDate().slice(0, 7);
  @State private error: string = '';
  @State private termStart: string = '';
  @State private weekdays: string[] = WEEKDAYS;

  aboutToAppear(): void { this.reload(); }
  private reload(): void { this.data = getWorkspace(); this.termStart = this.data.timetableSettings.termStartDate; }

  private cells(): string[] {
    const first = new Date(`${this.month}-01T12:00:00`);
    const start = addDays(localDate(first), -((first.getDay() + 6) % 7));
    const cells: string[] = [];
    for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
    return cells;
  }

  private changeMonth(delta: number): void {
    const date = new Date(`${this.month}-01T12:00:00`);
    date.setMonth(date.getMonth() + delta);
    this.month = localDate(date).slice(0, 7);
  }

  private dayItems(day: string): WorkspaceEntry[] {
    return this.data.tasks.filter((v) => v.showOnCalendar !== false && !v.id.startsWith('stage:') &&
      !v.automationKey && (v.due || v.plannedDate) === day)
      .concat(this.data.milestones.filter((v) => v.showOnCalendar !== false && !v.automationKey?.startsWith('study:') && v.date === day));
  }

  private coursesFor(day: string): WorkspaceEntry[] {
    const weekday = new Date(`${day}T12:00:00`).getDay() || 7;
    const week = timetableWeekNumber(this.data.timetableSettings.termStartDate, day);
    if (week === undefined) return [];
    return this.data.courses.filter((course) => courseSchool(course) === this.data.timetableSettings.activeSchool &&
      ((course.schedule ?? []) as CourseSlot[]).some((slot) => slot.weekday === weekday && runsInWeek(slot.weeks ?? '', week)));
  }

  private slotSummary(course: WorkspaceEntry, day: string): string {
    const weekday = new Date(`${day}T12:00:00`).getDay() || 7;
    const week = timetableWeekNumber(this.data.timetableSettings.termStartDate, day);
    return ((course.schedule ?? []) as CourseSlot[]).filter((v) => v.weekday === weekday && week !== undefined && runsInWeek(v.weeks ?? '', week))
      .map((v) => `${v.start}–${v.end} ${v.location}`).join('\n');
  }


  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Row() {
            Button('上月').onClick(() => this.changeMonth(-1)).accessibilityText('查看上个月')
            Text(this.month)
              .layoutWeight(1)
              .textAlign(TextAlign.Center)
              .fontSize(22)
              .fontWeight(FontWeight.Bold)
              .fontColor($r('app.color.text_primary'))
            Button('下月').onClick(() => this.changeMonth(1)).accessibilityText('查看下个月')
          }.width('100%')
          GridRow({ columns: 7 }) {
            ForEach(this.weekdays, (label: string) => {
              GridCol() { Text(label).width('100%').textAlign(TextAlign.Center).padding(8).fontColor($r('app.color.text_secondary')) }
            })
            ForEach(this.cells(), (day: string) => {
              GridCol() {
                Column({ space: 4 }) {
                  Text(String(Number(day.slice(-2))))
                    .fontSize(17)
                    .fontColor(day === this.selectedDate ? $r('app.color.on_accent') : $r('app.color.text_primary'))
                  Text(this.dayItems(day).length > 0 || this.coursesFor(day).length > 0 ? '•' : ' ')
                    .fontSize(12)
                    .fontColor(day === this.selectedDate ? $r('app.color.on_accent') : $r('app.color.text_primary'))
                }.width('100%').padding({ top: 8, bottom: 8 }).borderRadius(12)
                  .backgroundColor(day === this.selectedDate ? ACCENT_RESOURCES[this.accent] : $r('app.color.transparent'))
                  .opacity(day.startsWith(this.month) ? 1 : 0.45)
                  .onClick(() => { this.selectedDate = day; }).accessibilityRole(AccessibilityRoleType.BUTTON)
                  .accessibilityText(`${day}，${this.dayItems(day).length}个安排，${this.coursesFor(day).length}门课`)
              }
            }, (day: string) => day)
          }.width('100%')
          Text(`${this.selectedDate} · 教学周 ${timetableWeekNumber(this.data.timetableSettings.termStartDate, this.selectedDate) ?? '未开始'}`)
            .fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          ForEach(this.coursesFor(this.selectedDate), (course: WorkspaceEntry) => {
            Column({ space: 8 }) {
              Text(course.title).fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
              Text(this.slotSummary(course, this.selectedDate)).fontColor($r('app.color.text_secondary'))
              Button('课程资料')
                .onClick(() => this.pageStack.pushPath({ name: ROUTE_EDITOR, param: { collection: 'courses', id: course.id } as EntryTarget }))
                .accessibilityText(`打开${course.title}课程资料`)
            }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
          }, (course: WorkspaceEntry) => `${course.id}-${this.revision}-${this.selectedDate}`)
          ForEach(this.dayItems(this.selectedDate), (item: WorkspaceEntry) => {
            EntryCard({ item, onOpen: () => this.pageStack.pushPath({ name: ROUTE_EDITOR,
              param: { collection: this.data.tasks.some((v) => v.id === item.id) ? 'tasks' : 'milestones', id: item.id } as EntryTarget }),
              onToggle: () => this.pageStack.pushPath({ name: ROUTE_EDITOR,
                param: { collection: this.data.tasks.some((v) => v.id === item.id) ? 'tasks' : 'milestones', id: item.id } as EntryTarget }) })
          }, (item: WorkspaceEntry) => `${item.id}-${this.revision}`)
          if (!this.dayItems(this.selectedDate).length && !this.coursesFor(this.selectedDate).length) {
            Text('这一天没有安排').fontColor($r('app.color.text_secondary')).padding(24)
          }
          if (this.timetable) {
            Button('重新安排所选日学习').onClick(async () => {
              try {
                const data = getWorkspace(); const result = applyStudyPlan(data, this.selectedDate, true);
                if (result.changed) await saveWorkspace(data);
                this.error = `已添加 ${result.added} 项、恢复 ${result.restored} 项、保留 ${result.preserved} 项；每科每天 10–20 分钟`;
              } catch (error) { this.error = (error as Error).message; }
            }).accessibilityText('按所选日期课表重新安排简短学习，保留完成和改期记录')
            Row() {
              Text('每天按课表安排简短学习').layoutWeight(1).fontColor($r('app.color.text_primary'))
              Toggle({ type: ToggleType.Switch, isOn: this.data.studyAutomation.enabled }).onChange(async (value: boolean) => {
                try { const data = getWorkspace(); data.studyAutomation.enabled = value; await saveWorkspace(data); }
                catch (error) { this.error = (error as Error).message; }
              }).accessibilityText('启用按课表自动安排每天简短学习')
            }.width('100%')
            Text('课表设置').fontSize(20).fontColor($r('app.color.text_primary')).width('100%')
            TextInput({ text: this.termStart, placeholder: '学期开始日期 YYYY-MM-DD' }).onChange((v: string) => { this.termStart = v; })
              .accessibilityText('学期开始日期')
            Select([{ value: '北京大学' }, { value: '北京理工大学' }]).value(this.data.timetableSettings.activeSchool === 'bit' ? '北京理工大学' : '北京大学')
              .onSelect(async (index: number) => {
                const data = getWorkspace(); data.timetableSettings.activeSchool = index === 1 ? 'bit' : 'pku';
                try { await saveWorkspace(data); } catch (error) { this.error = (error as Error).message; }
              }).accessibilityText('切换学校课表')
            Button('保存学期开始日').onClick(async () => {
              if (!validDate(this.termStart)) { this.error = '请填写有效日期'; return; }
              const data = getWorkspace(); data.timetableSettings.termStartDate = this.termStart;
              try { await saveWorkspace(data); } catch (error) { this.error = (error as Error).message; }
            }).accessibilityText('保存学期开始日期')
            Button('教务课表导入与备份').onClick(() => this.pageStack.pushPath({ name: ROUTE_ACADEMIC_IMPORT }))
              .accessibilityText('导入XLSX CSV TSV或ICS，预览修改、合并或替换教务时段，并保留课程内容')

          }
          if (this.error) { Text(this.error).fontColor($r('app.color.danger')) }
        }.width('100%').constraintSize({ maxWidth: 1000 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: this.timetable ? '课表' : '日历' }, backIcon: { action: () => this.pageStack.pop() } } })
  }
}
