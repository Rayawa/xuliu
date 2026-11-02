import { WEEKDAYS } from '../../config/constants';
import { ImportedCourse, assertImportedCourses } from '../../domain/courses/AcademicImport';
import { repairImportedSlot } from '../../domain/courses/TimetableRules';
import { CourseSlot } from '../../models/Workspace';
import { LengthMetrics } from '@kit.ArkUI';
import { uid } from '../../domain/workspace/WorkspaceDomain';

@Component
export struct ImportedCourseEditor {
  @Prop draft: ImportedCourse = { key: '', title: '', teacher: '', location: '', weeks: '', school: 'pku', schedule: [] };
  onApply: (draft: ImportedCourse) => void = () => {};
  onCancel: () => void = () => {};
  @State private title: string = '';
  @State private teacher: string = '';
  @State private location: string = '';
  @State private weeks: string = '';
  @State private slots: CourseSlot[] = [];
  @State private visibleSlots: number = 20;
  @State private message: string = '';

  aboutToAppear(): void {
    this.title = this.draft.title; this.teacher = this.draft.teacher; this.location = this.draft.location; this.weeks = this.draft.weeks;
    this.slots = JSON.parse(JSON.stringify(this.draft.schedule)) as CourseSlot[];
  }

  private slotChange(id: string, field: string, value: string): void {
    const next = JSON.parse(JSON.stringify(this.slots)) as CourseSlot[]; const slot = next.find((item) => item.id === id); if (!slot) return;
    if (field === 'day') slot.weekday = Number(value);
    else if (field === 'start') slot.start = value;
    else if (field === 'end') slot.end = value;
    else if (field === 'location') slot.location = value;
    else slot.weeks = value;
    this.slots = next;
  }

  private apply(): void {
    try {
      const draft: ImportedCourse = { key: this.draft.key, title: this.title.trim(), teacher: this.teacher.trim(), location: this.location.trim(),
        weeks: this.weeks.trim(), school: this.draft.school, schedule: this.slots.map((slot) => {
          const next = repairImportedSlot(slot, this.draft.school); if (!next.location) next.location = this.location.trim();
          if (!next.weeks) next.weeks = this.weeks.trim(); return next;
        }) };
      assertImportedCourses([draft]); this.onApply(draft);
    } catch (error) { this.message = (error as Error).message; }
  }

  @Builder
  private input(label: string, value: string, change: (text: string) => void) {
    TextInput({ text: value, placeholder: label }).maxLength(500).onChange(change).accessibilityText(label)
  }

  build() {
    Column({ space: 12 }) {
      this.input('课程名称', this.title, (value: string) => { this.title = value; })
      this.input('教师', this.teacher, (value: string) => { this.teacher = value; })
      this.input('默认地点', this.location, (value: string) => { this.location = value; })
      this.input('默认周次', this.weeks, (value: string) => { this.weeks = value; })
      ForEach(this.slots.slice(0, this.visibleSlots), (slot: CourseSlot) => {
        Column({ space: 8 }) {
          Select([{ value: '周一' }, { value: '周二' }, { value: '周三' }, { value: '周四' }, { value: '周五' }, { value: '周六' }, { value: '周日' }])
            .selected(slot.weekday - 1)
              .value(`周${WEEKDAYS[slot.weekday - 1]}`)
              .onSelect((index: number) => this.slotChange(slot.id, 'day', String(index + 1)))
            .accessibilityText('预览时段的星期')
          this.input('开始时间 HH:mm', slot.start, (value: string) => this.slotChange(slot.id, 'start', value))
          this.input('结束时间 HH:mm', slot.end, (value: string) => this.slotChange(slot.id, 'end', value))
          this.input('本时段地点', slot.location, (value: string) => this.slotChange(slot.id, 'location', value))
          this.input('本时段周次', slot.weeks ?? '', (value: string) => this.slotChange(slot.id, 'weeks', value))
          Button('移除此时段').onClick(() => { this.slots = this.slots.filter((item) => item.id !== slot.id); }).accessibilityText('从导入预览中移除此课程时段')
        }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface_secondary'))
      }, (slot: CourseSlot) => slot.id)
      if (this.visibleSlots < this.slots.length) { Button('显示更多时段').onClick(() => { this.visibleSlots += 20; }).accessibilityText('继续显示本课程的导入时段') }
      Button('添加预览时段').onClick(() => {
        if (this.slots.length >= 1000) { this.message = '每门课程最多1000个时段'; return; }
        this.slots = this.slots.concat([{ id: uid(), weekday: 1, start: '08:00', end: '09:00', location: this.location, weeks: this.weeks, source: this.draft.school } as CourseSlot]);
      }).accessibilityText('在导入预览中新增课程时段')
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button('应用预览修改').onClick(() => this.apply()).accessibilityText('只修改当前导入预览，尚不写入工作台')
        Button('取消修改').onClick(() => this.onCancel()).accessibilityText('取消当前课程预览修改')
      }
      if (this.message) { Text(this.message).fontColor($r('app.color.danger')) }
    }.width('100%')
  }
}
