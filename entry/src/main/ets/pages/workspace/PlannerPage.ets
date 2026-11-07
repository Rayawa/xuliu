import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { LengthMetrics } from '@kit.ArkUI';
import { CalendarCell, CalendarRecord, calendarIndex, monthCells, shiftCalendarMonth, validCalendarMonth } from '../../domain/workspace/CalendarMonth';
import { courseSchool } from '../../domain/courses/TimetableRules';
import { ROUTE_ACADEMIC_IMPORT } from '../../config/constants';
import { KEY_REVISION, KEY_ACCENT, KEY_DAY } from '../../config/constants';
import { applyStudyPlan } from '../../domain/workspace/StudyAutomation';
import { EntryTarget } from '../../models/Workspace';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { Workspace, WorkspaceEntry, CourseSlot } from '../../models/Workspace';
import { WEEKDAYS, ROUTE_EDITOR, ACCENT_RESOURCES, CALENDAR_WEEKDAYS, CALENDAR_MONTH_LABELS,
  CALENDAR_FIRST_MONTH, CALENDAR_LAST_MONTH, CALENDAR_WIDE_WIDTH, CALENDAR_INLINE_LIMIT } from '../../config/constants';
import { emptyWorkspace, localDate, timetableWeekNumber, runsInWeek, validDate, entries, toggleComplete } from '../../domain/workspace/WorkspaceDomain';
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
  @StorageLink(KEY_DAY) private today: string = localDate();
  @State private monthDays: CalendarCell[] = [];
  @State private calendar: Record<string, CalendarRecord[]> = {};
  @State private calendarWidth: number = 0;
  @State private showMonthPicker: boolean = false;
  @State private yearInput: string = '';
  @State private monthInput: number = 0;

  private reload(): void {
    this.data = getWorkspace();
    this.termStart = this.data.timetableSettings.termStartDate;
    this.calendar = calendarIndex(this.data);
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


  private setMonth(month: string): void {
    if (!validCalendarMonth(month)) {
      this.error = '请输入 0001 至 9999 年及有效月份';
      return;
    }
    this.month = month;
    this.monthDays = monthCells(month, this.timetable);
    if (!this.selectedDate.startsWith(month)) {
      const today = localDate();
      this.selectedDate = today.startsWith(month) ? today : `${month}-01`;
    }
    this.error = '';
  }

  private selectDay(day: string): void {
    if (!day.startsWith(this.month)) this.setMonth(day.slice(0, 7));
    this.selectedDate = day;
  }

  private openMonthPicker(): void {
    this.yearInput = this.month.slice(0, 4);
    this.monthInput = Number(this.month.slice(5)) - 1;
    this.showMonthPicker = !this.showMonthPicker;
  }

  private applyMonthPicker(): void {
    const year = this.yearInput.trim();
    const month = `${year.padStart(4, '0')}-${String(this.monthInput + 1).padStart(2, '0')}`;
    if (!/^\d{1,4}$/.test(year) || !validCalendarMonth(month)) {
      this.error = '请输入 0001 至 9999 年及有效月份';
      return;
    }
    this.setMonth(month);
    this.showMonthPicker = false;
  }

  private dayItems(day: string): CalendarRecord[] {
    return this.calendar[day] ?? [];
  }

  private createEvent(): void {
    const today = localDate();
    const initialDate = this.selectedDate >= today ? this.selectedDate : today;
    this.pageStack.pushPath({ name: ROUTE_EDITOR, param: { collection: 'milestones', id: '', initialDate } as EntryTarget });
  }

  @Builder
  private monthToolbar() {
    Row({ space: 6 }) {
      Button('上月').enabled(this.month !== CALENDAR_FIRST_MONTH)
        .onClick(() => this.setMonth(shiftCalendarMonth(this.month, -1))).accessibilityText('查看上个月')
      Button(this.month).layoutWeight(1).onClick(() => this.openMonthPicker()).accessibilityText(`选择年月，当前${this.month}`)
      Button('下月').enabled(this.month !== CALENDAR_LAST_MONTH)
        .onClick(() => this.setMonth(shiftCalendarMonth(this.month, 1))).accessibilityText('查看下个月')
    }.width('100%')
    if (this.showMonthPicker) {
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        TextInput({ text: this.yearInput, placeholder: '年份' }).type(InputType.Number).maxLength(4).width(100)
          .onChange((value: string) => { this.yearInput = value; }).onSubmit(() => this.applyMonthPicker()).accessibilityText('输入日历年份')
        Select(CALENDAR_MONTH_LABELS.map((value): SelectOption => ({ value }))).selected(this.monthInput)
          .value(CALENDAR_MONTH_LABELS[this.monthInput]).onSelect((index: number) => { this.monthInput = index; }).accessibilityText('选择日历月份')
        Button('跳转').onClick(() => this.applyMonthPicker()).accessibilityText('跳转至所选年月')
        Button('取消').onClick(() => { this.showMonthPicker = false; }).accessibilityText('取消年月选择')
      }.width('100%')
    }
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      Button('回到今天').onClick(() => this.selectDay(localDate())).accessibilityText('回到今天和当前月份')
      if (!this.timetable) {
        Button('新建事项').onClick(() => this.createEvent()).accessibilityText('新建日历事项')
      }
    }.width('100%')
  }

  @Builder
  private dayCell(day: string) {
    Column({ space: 2 }) {
      if (day) {
        Button({ type: ButtonType.Normal }) {
          Column({ space: 2 }) {
            Text(String(Number(day.slice(-2)))).fontSize(16)
              .fontColor(day === this.selectedDate ? $r('app.color.on_accent') :
                day === this.today ? $r('app.color.accent') : $r('app.color.text_primary'))
            if (this.dayItems(day).length) {
              Text(`${this.dayItems(day).length}项`).fontSize(11)
                .fontColor(day === this.selectedDate ? $r('app.color.on_accent') : $r('app.color.text_secondary'))
            } else if (this.timetable && this.coursesFor(day).length) {
              Text('有课').fontSize(11)
                .fontColor(day === this.selectedDate ? $r('app.color.on_accent') : $r('app.color.text_secondary'))
            }
          }.width('100%')
        }.width('100%').constraintSize({ minHeight: 44 }).borderRadius(8)
          .backgroundColor(day === this.selectedDate ? ACCENT_RESOURCES[this.accent] : $r('app.color.transparent'))
          .onClick(() => this.selectDay(day)).accessibilitySelected(day === this.selectedDate)
          .accessibilityText(`${day}${day === this.today ? '，今天' : ''}，${this.dayItems(day).length}个安排`)
        if (this.calendarWidth >= CALENDAR_WIDE_WIDTH && !this.timetable) {
          ForEach(this.dayItems(day).slice(0, CALENDAR_INLINE_LIMIT), (record: CalendarRecord) => {
            Button({ type: ButtonType.Normal }) {
              Text(`${record.label} ${record.time ? record.time + ' ' : ''}${record.item.title}`).fontSize(11)
                .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                .fontColor(record.label === '截止' ? $r('app.color.danger') : $r('app.color.text_primary'))
            }.width('100%').padding({ left: 4, right: 4, top: 4, bottom: 4 })
              .backgroundColor($r('app.color.surface_secondary')).borderRadius(6)
              .onClick(() => {
                this.selectDay(day);
                this.pageStack.pushPath({ name: ROUTE_EDITOR, param: record.target });
              }).accessibilityText(`${record.label}${record.time}${record.item.title}`)
          }, (record: CalendarRecord) => `${record.target.collection}:${record.item.id}:${this.revision}`)
        }
      }
    }.width('100%').constraintSize({ minHeight: this.calendarWidth >= CALENDAR_WIDE_WIDTH && !this.timetable ? 88 : 46 })
      .opacity(!day || day.startsWith(this.month) ? 1 : 0.55)
  }

  private async toggleRecord(record: CalendarRecord): Promise<void> {
    try {
      const data = getWorkspace();
      const item = entries(data, record.target.collection).find((entry) => entry.id === record.target.id);
      if (!item) return;
      toggleComplete(item, record.target.collection);
      await saveWorkspace(data);
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          this.monthToolbar()
          GridRow({ columns: 7 }) {
            ForEach(this.timetable ? WEEKDAYS : CALENDAR_WEEKDAYS, (label: string) => {
              GridCol() {
                Text(label).width('100%').textAlign(TextAlign.Center).padding({ top: 6, bottom: 6 })
                  .fontColor($r('app.color.text_secondary')).accessibilityText(`星期${label}`)
              }
            }, (label: string) => label)
            ForEach(this.monthDays, (cell: CalendarCell) => {
              GridCol() { this.dayCell(cell.date) }
            }, (cell: CalendarCell) => `${this.month}:${cell.key}`)
          }.width('100%').onAreaChange((_previous: Area, area: Area) => { this.calendarWidth = Number(area.width); })
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
          ForEach(this.dayItems(this.selectedDate), (record: CalendarRecord) => {
            Column({ space: 4 }) {
              Text(`${record.label}${record.time ? ' · ' + record.time : ''}`).fontSize(13).width('100%')
                .fontColor(record.label === '截止' ? $r('app.color.danger') : $r('app.color.text_secondary'))
              EntryCard({ item: record.item, collection: record.target.collection,
                onOpen: () => this.pageStack.pushPath({ name: ROUTE_EDITOR, param: record.target }),
                onToggle: () => this.toggleRecord(record) })
            }.width('100%')
          }, (record: CalendarRecord) => `${record.target.collection}:${record.item.id}:${this.revision}`)
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
    .titleBar(hdsPageTitle(this.timetable ? '课表' : '日历', () => this.pageStack.pop()))
    .onShown(() => { this.setMonth(this.month); this.reload(); })
  }
}
