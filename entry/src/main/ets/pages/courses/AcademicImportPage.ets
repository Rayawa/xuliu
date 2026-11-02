import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { CourseSlot } from '../../models/Workspace';
import { ImportedCourse, CourseImportRow, parseAcademicRows, groupImportedCourses, flattenImports } from '../../domain/courses/AcademicImport';
import { parseAcademicIcs } from '../../domain/courses/AcademicIcs';
import { parseDelimitedRows } from '../../domain/imports/DelimitedText';
import { readXlsx } from '../../services/workbooks/XlsxReader';
import { chooseImportFile, importText } from '../../services/files/ImportFile';
import { commitAcademicImport } from '../../services/storage/academicStorage';
import { getWorkspace, courseCheckpoints, readCourseCheckpoint } from '../../services/storage/storage';
import { exportDocument } from '../../services/files/WorkspaceFiles';
import { ImportedCourseEditor } from '../../components/courses/ImportedCourseEditor';
import { MAX_COURSE_IMPORT_BYTES, WEEKDAYS } from '../../config/constants';
import { leaveWithUnsaved } from '../../ui/navigation/unsavedChanges';

@Component
export struct AcademicImportPage {
  @Consume('pageStack') private stack: NavPathStack;
  @State private school: string = 'pku';
  @State private term: string = '';
  @State private termStart: string = '';
  @State private drafts: ImportedCourse[] = [];
  @State private replaceSchedules: boolean = false;
  @State private pasted: string = '';
  @State private message: string = '';
  @State private fileName: string = '';
  @State private busy: boolean = false;
  @State private reading: boolean = false;
  @State private editingKey: string = '';
  @State private visible: number = 8;
  @State private previewRevision: number = 0;
  @State private termDirty: boolean = false;
  private generation: number = 0;
  private alive: boolean = true;

  aboutToAppear(): void {
    const data = getWorkspace(); this.school = data.timetableSettings.activeSchool; this.termStart = data.timetableSettings.termStartDate;
  }
  aboutToDisappear(): void { this.alive = false; this.generation++; }
  private leave(): void {
    if (this.busy && !this.reading) return;
    leaveWithUnsaved(this.getUIContext().getPromptAction(), this.stack, this.drafts.length > 0 || !!this.pasted.trim() || this.termDirty);
  }

  private parsedText(text: string): ImportedCourse[] {
    if (text.includes('BEGIN:VCALENDAR')) {
      const result = parseAcademicIcs(text, this.school, this.termStart);
      if (result.skipped) this.message = `跳过${result.skipped}个事件：${result.notices.join('；')}`;
      return result.courses;
    }
    return parseAcademicRows(parseDelimitedRows(text), this.school);
  }

  private async choose(): Promise<void> {
    if (this.busy) return;
    const generation = ++this.generation; this.busy = true; this.reading = true; this.message = '';
    const cancelled = (): boolean => !this.alive || generation !== this.generation;
    try {
      const file = await chooseImportFile(this.getUIContext().getHostContext() as common.UIAbilityContext,
        ['.xlsx', '.csv', '.tsv', '.ics'], MAX_COURSE_IMPORT_BYTES, cancelled);
      if (!file || cancelled()) return;
      let courses: ImportedCourse[];
      if (file.extension === 'xlsx') {
        const sheets = await readXlsx(file.bytes, cancelled); const rows: CourseImportRow[] = [];
        for (const sheet of sheets) {
          if (cancelled()) return;
          rows.push(...flattenImports(parseAcademicRows(sheet.rows, this.school, cancelled)));
        }
        courses = groupImportedCourses(rows);
      } else courses = this.parsedText(importText(file.bytes));
      if (cancelled()) return;
      this.drafts = courses; this.editingKey = ''; this.fileName = file.name; this.visible = 8; this.previewRevision++;
      this.message = `${courses.length ? `识别${courses.length}门课程、${courses.reduce((sum, course) => sum + course.schedule.length, 0)}个时段。请核对预览后确认。` : '没有识别到课程，请选择教务系统导出的原文件。'}${this.message}`;
    } catch (error) { if (!cancelled()) this.message = (error as Error).message; }
    finally { if (!cancelled()) { this.busy = false; this.reading = false; } }
  }

  private async apply(): Promise<void> {
    if (this.busy || !this.drafts.length || this.editingKey) return;
    this.busy = true;
    try {
      const normalized = groupImportedCourses(flattenImports(this.drafts));
      await commitAcademicImport(normalized, this.replaceSchedules, this.term.trim(), this.school);
      this.drafts = []; this.fileName = ''; this.pasted = ''; this.termDirty = false;
      this.message = `已${this.replaceSchedules ? '替换对应教务时段' : '合并'}${normalized.length}门课程。原课程ID、手动时段、笔记、附件和进度保留；导入前完整备份已保存在本机。`;
    } catch (error) { this.message = (error as Error).message; }
    finally { this.busy = false; }
  }

  private async exportBackup(): Promise<void> {
    try {
      const backup = courseCheckpoints(this.school)[0];
      if (!backup) { this.message = '该学校还没有导入前备份'; return; }
      const saved = await exportDocument(this.getUIContext().getHostContext() as common.UIAbilityContext,
        readCourseCheckpoint(backup.name), `序流导入前完整备份-${backup.name}`);
      if (saved) this.message = '已导出完整工作台备份，包含当时的个人记录；可在“我的”预览后导入恢复';
    } catch (error) { this.message = (error as Error).message; }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          Text('从教务系统导入课程').fontSize(26).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          Text('支持XLSX、CSV、TSV和ICS。可识别星期矩阵、课程明细与北大/北理节次；请先核对学校、学期起始日和导入预览。')
            .fontColor($r('app.color.text_secondary'))
          Select([{ value: '北京大学' }, { value: '北京理工大学' }]).value(this.school === 'bit' ? '北京理工大学' : '北京大学')
            .enabled(!this.busy && !this.drafts.length).onSelect((index: number) => { this.school = index === 1 ? 'bit' : 'pku'; })
            .accessibilityText('选择本文件对应的学校，有预览时需先完成或取消导入')
          Text(`小学期第-3周起始日：${this.termStart}`).fontColor($r('app.color.text_secondary'))
          TextInput({ text: this.term, placeholder: '新建课程的学期名称（可选）' }).maxLength(500)
            .onChange((value: string) => { this.term = value; this.termDirty = true; }).accessibilityText('导入后新建课程的学期名称，不改既有课程学期')
          Button(this.reading ? '读取文件中…' : '选择教务课表文件')
            .enabled(!this.busy)
            .onClick(() => this.choose())
            .accessibilityText('选择XLSX CSV TSV或ICS课表文件并生成预览')
          TextArea({ text: this.pasted, placeholder: '也可粘贴CSV、制表符课表或ICS文本' })
            .maxLength(MAX_COURSE_IMPORT_BYTES)
            .constraintSize({ minHeight: 100, maxHeight: 220 })
            .onChange((value: string) => { this.pasted = value; }).accessibilityText('粘贴课表文本')
          Button('解析粘贴内容').enabled(!this.busy && !!this.pasted.trim()).onClick(() => {
            try { this.message = ''; this.drafts = this.parsedText(this.pasted); this.editingKey = ''; this.fileName = '粘贴内容'; this.previewRevision++; this.visible = 8; }
            catch (error) { this.message = (error as Error).message; }
          }).accessibilityText('将粘贴的课表内容解析为导入预览')
          if (this.drafts.length) {
            Text(`${this.fileName} · ${this.drafts.length}门课程`).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
            Row() {
              Text('替换对应课程的教务时段').layoutWeight(1).fontColor($r('app.color.text_primary'))
              Toggle({ type: ToggleType.Switch, isOn: this.replaceSchedules }).enabled(!this.busy)
                .onChange((value: boolean) => { this.replaceSchedules = value; }).accessibilityText('重新导入只替换本文件对应课程的教务时段，保留手动时段和全部课程内容')
            }.width('100%')
            ForEach(this.drafts.slice(0, this.visible), (course: ImportedCourse) => {
              Column({ space: 10 }) {
                Text(course.title).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
                Text([course.teacher, course.location, `${course.schedule.length}个时段`].filter((value) => !!value).join(' · '))
                  .fontColor($r('app.color.text_secondary'))
                ForEach(course.schedule.slice(0, 3), (slot: CourseSlot) => {
                  Text(`周${WEEKDAYS[slot.weekday - 1]} ${slot.start}–${slot.end} ${slot.location} ${slot.weeks ?? ''}`)
                    .fontColor($r('app.color.text_secondary'))
                }, (slot: CourseSlot) => slot.id)
                if (this.editingKey === course.key) {
                  ImportedCourseEditor({ draft: course, onApply: (value: ImportedCourse) => {
                    const next = this.drafts.slice(); const index = next.findIndex((item) => item.key === course.key);
                    if (index >= 0) next[index] = value; this.drafts = next; this.editingKey = ''; this.previewRevision++;
                  }, onCancel: () => { this.editingKey = ''; } })
                } else {
                  Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
                    Button('修改预览')
                      .enabled(!this.busy && !this.editingKey)
                      .onClick(() => { this.editingKey = course.key; })
                      .accessibilityText(`修改${course.title}的导入预览`)
                    Button('移出预览')
                      .enabled(!this.busy)
                      .onClick(() => { this.drafts = this.drafts.filter((item) => item.key !== course.key); })
                      .accessibilityText(`不导入${course.title}`)
                  }
                }
              }.width('100%').padding(18).borderRadius(18).backgroundColor($r('app.color.surface'))
            }, (course: ImportedCourse) => `${course.key}-${this.previewRevision}`)
            if (this.visible < this.drafts.length) { Button('显示更多课程预览').onClick(() => { this.visible += 8; }).accessibilityText('显示下一批导入课程') }
            Button(this.busy ? '保存备份并导入中…' : this.replaceSchedules ? '确认重新导入课表' : '确认合并课程与课表')
              .enabled(!this.busy && !this.editingKey).onClick(() => this.apply()).accessibilityText('确认导入已核对的课程，先备份完整工作台，再保留课程内容合并时段')
            Button('取消此次导入')
              .enabled(!this.busy)
              .onClick(() => { this.drafts = []; this.editingKey = ''; this.fileName = ''; })
              .accessibilityText('取消全部导入预览，不修改现有课程')
          }
          Button('导出最近导入前完整备份').enabled(!this.busy).onClick(() => this.exportBackup()).accessibilityText('导出当前学校最近一次导入前的完整工作台备份')
          if (this.message) { Text(this.message).fontColor($r('app.color.text_secondary')) }
        }.width('100%').constraintSize({ maxWidth: 1100 }).padding(20)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }.titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar({ content: { title: { mainTitle: '教务课表导入' }, backIcon: { action: () => this.leave() } } })
    .onBackPressed(() => { this.leave(); return true; })
  }
}
