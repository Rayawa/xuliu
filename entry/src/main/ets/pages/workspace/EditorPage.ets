import { hdsPageTitle } from '../../ui/navigation/hdsTitleBar';
import { assessmentLabel, eventCourses, eventDateKindLabel } from '../../domain/workspace/CourseEvents';
import { CourseEventList } from '../../components/workspace/CourseEventList';
import { normalizeWebsiteUrl, toolVersions, currentToolVersion, setCurrentToolVersion } from '../../domain/workspace/ToolDetails';
import { courseSchool, courseTitleCandidate } from '../../domain/courses/TimetableRules';
import { AttachmentPanel } from '../../components/workspace/AttachmentPanel';
import { Attachment } from '../../models/Workspace';
import { transferStudyToPool } from '../../domain/workspace/ReviewDomain';
import { common } from '@kit.AbilityKit';
import { openLink } from '../../services/links/openLink';
import { ProgressLog } from '../../models/Workspace';
import { EntryTarget } from '../../models/Workspace';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { WorkspaceEntry, Block, CourseSlot, LearningResource, Website, ToolVersion, ResearchPage } from '../../models/Workspace';
import { AREAS, TASK_STATUSES, RESEARCH_STATUSES, ROUTE_AI, ROUTE_EDITOR, MAX_RESEARCH_PAGES, LEARNING_RESOURCE_TYPES, MAX_LEARNING_RESOURCES, MAX_LEARNING_RESOURCE_URL, MAX_TOOL_URL_LENGTH, MAX_COLLECTION_WEBSITES, MAX_TOOL_VERSIONS, TOOL_VERSION_BATCH_SIZE, TOOL_KINDS, TOOL_STATUSES,
  ASSESSMENT_TYPES, ASSESSMENT_LABELS, EVENT_DATE_KINDS, EVENT_DATE_LABELS } from '../../config/constants';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { blocksFor, collectionTitle, createEntry, entries, localDate, removeEntry, replaceEntries,
  setBlocks, uid, validateEntry, initialPlannedDate, starterResearchPages, validDate } from '../../domain/workspace/WorkspaceDomain';
import { DocumentEditor } from '../../components/workspace/DocumentEditor';
import { SubjectLinkedTasks } from '../../components/workspace/SubjectLinkedTasks';

interface TaskSubject {
  id: string;
  title: string;
  area: string;
}

@Component
export struct EditorPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop collection: string = 'tasks';
  @Prop entryId: string = '';
  @Prop initialToolKind: string = '';
  @Prop initialDate: string = '';
  @Prop initialCourseId: string = '';
  @Prop initialLinkedCourseId: string = '';
  @State private item: WorkspaceEntry = createEntry('tasks');
  @State private blocks: Block[] = [];
  @State private error: string = '';
  @State private busy: boolean = false;
  @State private documentVisible: boolean = true;
  @State private dirty: boolean = false;
  @State private pendingAttachments: boolean = false;
  private pendingScopes: Set<string> = new Set();
  @State private weekday: number = 1;
  @State private start: string = '08:00';
  @State private end: string = '09:00';
  @State private weekRule: string = '';
  @State private taskSubjects: TaskSubject[] = [];
  @State private resourceType: string = LEARNING_RESOURCE_TYPES[0];
  @State private resourceTitle: string = '';
  @State private resourceUrl: string = '';
  @State private websiteFormOpen: boolean = false;
  @State private editingWebsiteId: string = '';
  @State private websiteDescription: string = '';
  @State private websiteQuery: string = '';
  @State private versionFormOpen: boolean = false;
  @State private editingVersionId: string = '';
  @State private versionNote: string = '';
  @State private visibleToolVersions: number = TOOL_VERSION_BATCH_SIZE;
  @State private websiteTitle: string = '';
  @State private websiteUrl: string = '';
  @State private versionLabel: string = '';
  @State private versionUrl: string = '';
  @State private subtaskTitle: string = '';
  @State private reviewChapter: string = '';
  @State private reviewNote: string = '';
  @State private completedToday: boolean = false;
  private original: string = '';
  private researchBaseline: string = '';
  @State private researchPageId: string = '';

  aboutToAppear(): void {
    this.refreshTaskSubjects();
    const saved = entries(getWorkspace(), this.collection).find((item) => item.id === this.entryId);
    const draft = saved ?? createEntry(this.collection);
    if (!saved && this.collection === 'tools' && this.initialToolKind === 'collection') {
      draft.kind = 'collection';
      draft.status = '常用';
    }
    if (!saved && this.collection === 'milestones') {
      if (validDate(this.initialDate)) draft.date = this.initialDate;
      if (this.initialCourseId) {
        draft.courseId = this.initialCourseId;
        draft.time = '00:00';
        draft.area = '课内';
      } else {
        draft.eventDateKind = 'occurs';
        draft.linkedCourseId = this.initialLinkedCourseId || undefined;
        if (draft.linkedCourseId) draft.area = '课内';
      }
    }
    this.loadDraft(draft, saved !== undefined);
  }

  private loadDraft(item: WorkspaceEntry, exists: boolean): void {
    if (this.collection === 'research') {
      this.researchBaseline = exists ? JSON.stringify(item) : '';
      if (!item.pages?.length) {
        item.pages = starterResearchPages(item.blocks ?? []);
        item.blocks = undefined;
      }
      if (!item.pages.some((page) => page.id === this.researchPageId)) this.researchPageId = item.pages[0].id;
    }
    this.item = item;
    this.blocks = this.collection === 'research' ? [] : blocksFor(item);
    this.original = JSON.stringify(item);
  }

  private researchPage(): ResearchPage | undefined {
    return this.item.pages?.find((page) => page.id === this.researchPageId);
  }

  private addResearchPage(): void {
    if (this.busy || this.pendingAttachments) return;
    const pages = this.item.pages ?? [];
    if (pages.length >= MAX_RESEARCH_PAGES) return;
    const page: ResearchPage = { id: uid(), title: '未命名页面', blocks: [] };
    this.item.pages = pages.concat([page]);
    this.researchPageId = page.id;
    this.touched();
  }

  private async removeResearchPage(id: string): Promise<void> {
    const page = this.item.pages?.find((value) => value.id === id);
    if (!page || this.busy || this.pendingAttachments || (this.item.pages?.length ?? 0) <= 1) return;
    try {
      const answer = await this.getUIContext().getPromptAction().showDialog({
        title: '移除研究页面',
        message: `保存项目后将移除“${page.title || '未命名页面'}”及其笔记。`,
        buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '移除', color: $r('app.color.danger') }]
      });
      if (answer.index !== 1 || this.busy || this.pendingAttachments) return;
      const pages = this.item.pages ?? [];
      const index = pages.findIndex((value) => value.id === id);
      if (index < 0 || pages.length <= 1) return;
      this.item.pages = pages.filter((value) => value.id !== id);
      this.researchPageId = this.item.pages[Math.min(index, this.item.pages.length - 1)].id;
      this.touched();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  private updateResearchPage(id: string, title?: string, blocks?: Block[]): void {
    const page = this.item.pages?.find((value) => value.id === id);
    if (!page) return;
    if (title !== undefined) page.title = title;
    if (blocks !== undefined) page.blocks = blocks;
    this.touched();
  }

  private pending(scope: string, value: boolean): void {
    if (value) this.pendingScopes.add(scope); else this.pendingScopes.delete(scope);
    this.pendingAttachments = this.pendingScopes.size > 0;
  }

  private touched(): void {
    this.item = JSON.parse(JSON.stringify(this.item)) as WorkspaceEntry;
    this.dirty = true;
  }

  private async save(close: boolean = true): Promise<void> {
    if (this.busy) return;
    if (this.websiteFormOpen || this.versionFormOpen) {
      this.error = '请先保存或取消网站或版本表单';
      return;
    }
    if (this.pendingAttachments) { this.error = '请先等待当前粘贴或附件操作完成'; return; }
    const data = getWorkspace();
    this.error = validateEntry(this.item, this.collection, data);
    if (this.error) return;
    this.busy = true;
    let submittedResearch = '';
    try {
      const list = entries(data, this.collection);
      const index = list.findIndex((item) => item.id === this.item.id);
      if (this.entryId && index < 0) throw new Error('此记录已变化或移除，请返回列表重新打开');
      if (this.collection === 'research' && index >= 0 && JSON.stringify(list[index]) !== this.researchBaseline) {
        throw new Error('研究项目已在其他位置更新，当前草稿仍保留。请核对最新记录后再编辑。');
      }
      if (index >= 0) this.item.elapsed = list[index].elapsed;
      else if (this.collection === 'tasks' || this.collection === 'milestones') this.item.plannedDate = initialPlannedDate(this.item);
      if (this.collection === 'milestones') {
        const previous = list[index];
        if (!this.item.courseId && !this.item.automationKey) {
          this.item.courseLinkReviewed = true;
          if (this.item.linkedCourseId) this.item.area = '课内';
          if (this.item.alsoTask && !this.item.plannedDate && (!previous?.alsoTask || previous.date !== this.item.date)) {
            this.item.plannedDate = initialPlannedDate(this.item);
          }
        }
        if (previous?.plannedDate !== this.item.plannedDate) this.item.dismissedTodayDate = undefined;
      }
      if (index >= 0) list[index] = this.item; else list.push(this.item);
      replaceEntries(data, this.collection, list);
      if (this.collection === 'tasks' && this.item.mode === 'multi') {
        const logs = this.item.progressLogs ?? [];
        const previous = logs[logs.length - 1];
        if (!previous || previous.progress !== Number(this.item.progress ?? 0) || previous.status !== this.item.status) {
          logs.push({ id: uid(), date: localDate(), progress: Number(this.item.progress ?? 0), status: this.item.status ?? '未开始', note: '' });
          this.item.progressLogs = logs;
        }
      }
      if (this.collection === 'research') submittedResearch = JSON.stringify(this.item);
      await saveWorkspace(data);
      if (submittedResearch) {
        this.researchBaseline = submittedResearch;
        this.original = submittedResearch;
        if (JSON.stringify(this.item) !== submittedResearch) {
          this.error = '已保存提交时的内容，之后的编辑仍在草稿中。';
          return;
        }
      }
      this.dirty = false;
      this.original = JSON.stringify(this.item);
      if (close) this.pageStack.pop();
    } catch (error) {
      if (submittedResearch) {
        const current = getWorkspace().research.find((item) => item.id === this.item.id);
        if (JSON.stringify(current) === submittedResearch) this.researchBaseline = submittedResearch;
      }
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  private leave(): void {
    if (this.busy) return;
    if (!this.websiteFormOpen && !this.versionFormOpen && !this.pendingAttachments && !this.dirty && JSON.stringify(this.item) === this.original) {
      this.pageStack.pop();
      return;
    }
    this.getUIContext().getPromptAction().showDialog({ title: '离开编辑？', message: '尚未保存的更改将被丢弃。',
      buttons: [{ text: '继续编辑', color: $r('app.color.accent') }, { text: '放弃更改', color: $r('app.color.danger') }]
    }).then((result) => { if (result.index === 1) this.pageStack.pop(); });
  }

  private async visit(url: string): Promise<void> {
    try { await openLink(this.getUIContext().getHostContext() as common.UIAbilityContext, url); }
    catch (error) { this.error = (error as Error).message; }
  }

  private deleteRecord(): void {
    this.getUIContext().getPromptAction().showDialog({ title: '删除记录', message: `删除“${this.item.title}”？关联的子记录将保留。`,
      buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '删除', color: $r('app.color.danger') }]
    }).then(async (result) => {
      if (result.index !== 1) return;
      try {
        const data = getWorkspace();
        removeEntry(data, this.collection, this.item.id);
        await saveWorkspace(data);
        this.dirty = false;
        this.pageStack.pop();
      } catch (error) { this.error = (error as Error).message; }
    });
  }

  @Builder
  private field(label: string, value: string, change: (value: string) => void, multiline: boolean = false) {
    Column({ space: 6 }) {
      Text(label).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      if (multiline) {
        TextArea({ text: value, placeholder: label }).constraintSize({ minHeight: 90 }).maxLength(4000)
          .fontColor($r('app.color.text_primary')).backgroundColor($r('app.color.surface_secondary'))
          .onChange((text: string) => { change(text); this.touched(); }).accessibilityText(label)
      } else {
        TextInput({ text: value, placeholder: label }).maxLength(500)
          .fontColor($r('app.color.text_primary')).backgroundColor($r('app.color.surface_secondary'))
          .onChange((text: string) => { change(text); this.touched(); }).accessibilityText(label)
      }
    }.width('100%')
  }

  @Builder
  private selectField(label: string, value: string, options: string[], change: (value: string) => void) {
    Column({ space: 6 }) {
      Text(label).fontColor($r('app.color.text_secondary')).fontSize(14)
      Select(options.map((value): SelectOption => ({ value }))).value(value).width('100%')
        .onSelect((index: number) => { change(options[index]); this.touched(); }).accessibilityText(label)
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private switchField(label: string, value: boolean, change: (value: boolean) => void) {
    Row() {
      Text(label).layoutWeight(1).fontColor($r('app.color.text_primary'))
      Toggle({ type: ToggleType.Switch, isOn: value }).onChange((value: boolean) => { change(value); this.touched(); })
        .accessibilityText(label)
    }.width('100%').constraintSize({ minHeight: 48 })
  }

  private refreshTaskSubjects(): void {
    if (this.collection !== 'tasks') return;
    const data = getWorkspace();
    this.taskSubjects = data.courses.filter((course) => courseTitleCandidate(course.title))
      .map((course): TaskSubject => ({ id: course.id, title: course.title.trim(), area: '课内' }))
      .concat(data.learning.filter((subject) => subject.title.trim())
        .map((subject): TaskSubject => ({ id: subject.id, title: subject.title.trim(), area: '课外' })));
  }

  private currentSubjectLabel(): string {
    if (!this.item.courseId) return '无';
    const subject = this.taskSubjects.find((value) => value.id === this.item.courseId);
    return subject ? `${subject.area} · ${subject.title}` : '原关联科目不可选';
  }

  @Builder
  private taskSubjectField() {
    Column({ space: 6 }) {
      Text('所属学习科目').fontColor($r('app.color.text_secondary')).fontSize(14)
      Select([{ value: '无' } as SelectOption].concat(this.taskSubjects.map((subject): SelectOption =>
        ({ value: `${subject.area} · ${subject.title}` })))).value(this.currentSubjectLabel()).width('100%')
        .onSelect((index: number) => {
          if (index === 0) {
            this.item.courseId = undefined;
          } else {
            const subject = this.taskSubjects[index - 1];
            if (!subject) return;
            this.item.courseId = subject.id;
            this.item.area = subject.area;
            this.item.source = subject.title;
          }
          this.touched();
        }).accessibilityText(`所属学习科目，当前${this.currentSubjectLabel()}`)
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private taskFields() {
    this.selectField('领域', this.item.area ?? '生活', AREAS, (v: string) => { this.item.area = v; })
    this.selectField('任务类型', this.item.mode === 'multi' ? '跨日任务' : '单次任务', ['单次任务', '跨日任务'],
      (v: string) => { this.item.mode = v === '跨日任务' ? 'multi' : 'single'; })
    this.field('计划推进日 YYYY-MM-DD', this.item.plannedDate ?? '', (v: string) => { this.item.plannedDate = v || undefined; })
    this.field('截止日期 YYYY-MM-DD', this.item.due ?? '', (v: string) => { this.item.due = v || undefined; })
    this.field('截止时间 HH:mm', this.item.dueTime ?? '', (v: string) => { this.item.dueTime = v || undefined; })
    if (this.item.mode === 'multi') {
      this.field('开始日期 YYYY-MM-DD', this.item.startDate ?? '', (v: string) => { this.item.startDate = v || undefined; })
    }
    this.switchField('加入今日', this.item.today ?? false, (v: boolean) => { this.item.today = v; })
    this.switchField('显示在日历', this.item.showOnCalendar ?? true, (v: boolean) => { this.item.showOnCalendar = v; })
    this.selectField('状态', this.item.status ?? '未开始', TASK_STATUSES, (v: string) => {
      this.item.status = v; this.item.done = v === '已完成';
      this.item.completedDate = this.item.done ? localDate() : undefined;
      if (this.item.done) this.item.progress = 100;
      else if (this.item.progress === 100) this.item.progress = 0;
    })
    if (this.item.mode === 'multi') {
      ForEach(this.item.progressLogs ?? [], (log: ProgressLog) => {
        Text(`${log.date} · ${log.progress}% · ${log.status}`).fontColor($r('app.color.text_secondary'))
      }, (log: ProgressLog) => log.id)
    }
    this.field('任务要求', this.item.requirements ?? '', (v: string) => { this.item.requirements = v; }, true)
    this.taskSubjectField()
    this.selectField('父任务', getWorkspace().tasks.find((v) => v.id === this.item.parentId)?.title ?? '无',
      ['无'].concat(getWorkspace().tasks.filter((v) => v.id !== this.item.id).map((v) => v.title)), (v: string) => {
        this.item.parentId = getWorkspace().tasks.find((c) => c.title === v)?.id;
      })
    Text(`累计专注 ${this.item.elapsed ?? 0} 分钟`).fontColor($r('app.color.text_secondary'))
  }

  private eventCourseName(): string {
    if (!this.item.linkedCourseId) return '不关联课程';
    const course = getWorkspace().courses.find((value) => value.id === this.item.linkedCourseId);
    if (!course) return '课程已移除';
    return courseTitleCandidate(course.title) ? course.title : '原关联不是有效课程';
  }

  @Builder
  private eventCourseFields() {
    Select([{ value: '不关联课程' } as SelectOption].concat(eventCourses(getWorkspace().courses)
      .map((course): SelectOption => ({ value: course.title })))).value(this.eventCourseName()).width('100%')
      .onSelect((index: number) => {
        const course = eventCourses(getWorkspace().courses)[index - 1];
        if (index !== 0 && !course) return;
        this.item.linkedCourseId = course?.id;
        if (course) this.item.area = '课内';
        this.touched();
      }).accessibilityText(`事项关联课程，当前${this.eventCourseName()}`)
    this.selectField('考核类型', assessmentLabel(this.item.assessmentType) || '未设置', ['未设置'].concat(ASSESSMENT_LABELS),
      (value: string) => { this.item.assessmentType = ASSESSMENT_TYPES[ASSESSMENT_LABELS.indexOf(value)]; })
    this.selectField('日期含义', eventDateKindLabel(this.item.eventDateKind) || '未区分', ['未区分'].concat(EVENT_DATE_LABELS),
      (value: string) => { this.item.eventDateKind = EVENT_DATE_KINDS[EVENT_DATE_LABELS.indexOf(value)]; })
  }

  private async createCourseRecord(ordinary: boolean): Promise<void> {
    if (this.busy || this.pendingAttachments) return;
    if (this.dirty || !getWorkspace().courses.some((course) => course.id === this.item.id)) {
      await this.save(false);
      if (this.error || this.dirty) return;
    }
    const course = getWorkspace().courses.find((value) => value.id === this.item.id);
    if (!course) return;
    const target: EntryTarget = {
      collection: 'milestones', id: '',
      courseId: ordinary ? undefined : course.id,
      linkedCourseId: ordinary ? course.id : undefined
    };
    this.pageStack.pushPath({ name: ROUTE_EDITOR, param: target });
  }

  @Builder
  private milestoneFields() {
    if (!this.item.courseId && !this.item.automationKey) {
      this.eventCourseFields()
    }
    if (!this.item.linkedCourseId || this.item.courseId) {
      this.selectField('领域', this.item.area ?? '生活', AREAS, (value: string) => { this.item.area = value; })
    }
    this.field(this.item.eventDateKind === 'deadline' ? '截止日期 YYYY-MM-DD' :
      this.item.eventDateKind === 'occurs' ? '发生日期 YYYY-MM-DD' : '日期 YYYY-MM-DD',
      this.item.date ?? '', (value: string) => { this.item.date = value; })
    this.field(this.item.eventDateKind === 'deadline' ? '截止时间 HH:mm' :
      this.item.eventDateKind === 'occurs' ? '发生时间 HH:mm' : '时间 HH:mm',
      this.item.time ?? '', (value: string) => { this.item.time = value; })
    this.field('地点', this.item.location ?? '', (v: string) => { this.item.location = v; })
    this.field('要求', this.item.requirements ?? '', (v: string) => { this.item.requirements = v; }, true)
    if (this.item.automationKey?.startsWith('study:') && !this.item.done) {
      this.field('复习章节', this.reviewChapter, (v: string) => { this.reviewChapter = v; })
      this.field('复习进度与备注', this.reviewNote, (v: string) => { this.reviewNote = v; }, true)
      this.switchField('今日已完成这个复习章节', this.completedToday, (v: boolean) => { this.completedToday = v; })
      Button('保存到复习池').onClick(async () => {
        try {
          const data = getWorkspace();
          const error = validateEntry(this.item, this.collection, data); if (error) throw new Error(error);
          const index = data.milestones.findIndex((v) => v.id === this.item.id);
          if (index < 0) throw new Error('请先保存自动学习任务');
          data.milestones[index] = this.item;
          transferStudyToPool(data, this.item.id, this.reviewChapter, this.reviewNote, this.completedToday);
          await saveWorkspace(data); this.dirty = false; this.pageStack.pop();
        } catch (error) { this.error = (error as Error).message; }
      }).accessibilityText('保存当前编辑并将自动学习任务归入指定复习章节')
    }
    this.field('成果说明', this.item.outcomeText ?? '', (v: string) => { this.item.outcomeText = v; }, true)
    if (!this.item.automationKey) {
      this.switchField('显示在日历', this.item.showOnCalendar ?? true, (value: boolean) => { this.item.showOnCalendar = value; })
      if (this.item.courseId) {
        this.selectField('任务周期', this.item.mode === 'multi' ? '长期任务' : '短期任务', ['短期任务', '长期任务'],
          (value: string) => {
            this.item.mode = value === '长期任务' ? 'multi' : 'single';
            this.item.parentCandidate = this.item.mode === 'multi';
          })
        this.switchField('作为上级任务备选', this.item.parentCandidate ?? this.item.mode === 'multi',
          (value: boolean) => { this.item.parentCandidate = value; })
      } else {
        this.switchField('同时作为任务', this.item.alsoTask ?? false, (value: boolean) => { this.item.alsoTask = value || undefined; })
      }
      this.field('计划推进日 YYYY-MM-DD', this.item.plannedDate ?? '', (value: string) => { this.item.plannedDate = value || undefined; })
    }
    this.switchField(this.item.courseId ? '完成课程任务' : '完成事项', this.item.done ?? false, (value: boolean) => {
      this.item.done = value;
      this.item.completedDate = value ? this.item.completedDate ?? localDate() : undefined;
    })
  }

  @Builder
  private courseFields() {
    Button('课程AI助手').enabled(!this.busy && !this.pendingAttachments).onClick(async () => {
      await this.save(false);
      if (!this.error) this.pageStack.pushPath({ name: ROUTE_AI, param: this.item.id });
    }).accessibilityText('保存当前课程并打开原生AI助手，云端需已有同编号课程')
    this.field('学期', this.item.term ?? '', (v: string) => { this.item.term = v; })
    this.field('教师', this.item.teacher ?? '', (v: string) => { this.item.teacher = v; })
    this.field('地点', this.item.location ?? '', (v: string) => { this.item.location = v; })
    this.selectField('所属课表', courseSchool(this.item) === 'bit' ? '北京理工大学' : '北京大学', ['北京大学', '北京理工大学'],
      (v: string) => { this.item.school = v === '北京大学' ? 'pku' : 'bit'; })
    this.field('课程要求', this.item.requirements ?? '', (v: string) => { this.item.requirements = v; }, true)
    Text('课程时段').fontSize(18).fontColor($r('app.color.text_primary'))
    ForEach((this.item.schedule ?? []) as CourseSlot[], (slot: CourseSlot) => {
      Row({ space: 8 }) {
        Text(`周${slot.weekday} ${slot.start}–${slot.end} ${slot.weeks ?? ''}`).layoutWeight(1)
          .fontColor($r('app.color.text_primary'))
        Button('移除').onClick(() => {
          this.item.schedule = (this.item.schedule as CourseSlot[]).filter((v) => v.id !== slot.id); this.touched();
        }).accessibilityText('移除课程时段')
      }
    }, (slot: CourseSlot) => slot.id)
    this.selectField('星期', String(this.weekday), ['1', '2', '3', '4', '5', '6', '7'], (v: string) => { this.weekday = Number(v); })
    this.field('开始 HH:mm', this.start, (v: string) => { this.start = v; })
    this.field('结束 HH:mm', this.end, (v: string) => { this.end = v; })
    this.field('周次（如 1-16 或 1-16单周）', this.weekRule, (v: string) => { this.weekRule = v; })
    Button('添加时段').onClick(() => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(this.end) || this.start >= this.end) {
        this.error = '请填写有效的课程开始与结束时间'; return;
      }
      const slots = (this.item.schedule ?? []) as CourseSlot[];
      slots.push({ id: uid(), weekday: this.weekday, start: this.start, end: this.end,
        location: this.item.location ?? '', weeks: this.weekRule, source: 'manual' });
      this.item.schedule = slots; this.touched(); this.error = '';
    }).accessibilityText('添加课程时段')
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      Button('添加课程任务').enabled(!this.busy && !this.pendingAttachments).onClick(() => this.createCourseRecord(false))
        .accessibilityText('新建当前课程的任务')
      if (courseTitleCandidate(this.item.title)) {
        Button('添加课程事项').enabled(!this.busy && !this.pendingAttachments).onClick(() => this.createCourseRecord(true))
          .accessibilityText('新建关联当前课程的事项')
      }
    }.width('100%')

  }

  private addLearningResource(): void {
    const resources = this.item.resources ?? [];
    if (resources.length >= MAX_LEARNING_RESOURCES) return;
    const url = this.resourceUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      this.error = '资源链接需以 http:// 或 https:// 开头';
      return;
    }
    const resource: LearningResource = {
      id: uid(), title: this.resourceTitle.trim() || '未命名资源',
      type: this.resourceType, url, progress: 0
    };
    this.item.resources = resources.concat([resource]);
    this.resourceTitle = '';
    this.resourceUrl = '';
    this.resourceType = LEARNING_RESOURCE_TYPES[0];
    this.error = '';
    this.touched();
  }

  @Builder
  private resourceFields() {
    Text('学习资源').fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
    ForEach(this.item.resources ?? [], (resource: LearningResource) => {
      Column({ space: 6 }) {
        Text(resource.title).fontColor($r('app.color.text_primary')).width('100%')
        Text(resource.type || '其他').fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          if (resource.url) {
            Button('打开').onClick(() => this.visit(resource.url)).accessibilityText(`打开学习资源${resource.title}`)
          }
          Button('移除').onClick(() => {
            this.item.resources = this.item.resources?.filter((value) => value.id !== resource.id);
            this.touched();
          }).accessibilityText(`移除学习资源${resource.title}`)
        }.width('100%')
      }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface_secondary'))
    }, (resource: LearningResource) => resource.id)
    TextInput({ text: this.resourceTitle, placeholder: '资源名称' }).maxLength(500)
      .onChange((value: string) => { this.resourceTitle = value; }).accessibilityText('新学习资源名称')
    Select(LEARNING_RESOURCE_TYPES.map((value): SelectOption => ({ value }))).value(this.resourceType)
      .onSelect((index: number) => { this.resourceType = LEARNING_RESOURCE_TYPES[index]; })
      .accessibilityText(`学习资源类型，当前${this.resourceType}`)
    TextInput({ text: this.resourceUrl, placeholder: '资源链接（选填）' }).maxLength(MAX_LEARNING_RESOURCE_URL)
      .onChange((value: string) => { this.resourceUrl = value; }).accessibilityText('新学习资源链接，选填')
    Button('添加学习资源').enabled(!this.busy && (this.item.resources?.length ?? 0) < MAX_LEARNING_RESOURCES)
      .onClick(() => this.addLearningResource()).accessibilityText('添加学习资源到当前草稿')
  }

  private openWebsiteForm(site?: Website): void {
    this.editingWebsiteId = site?.id ?? '';
    this.websiteTitle = site?.title ?? '';
    this.websiteUrl = site?.url ?? '';
    this.websiteDescription = site?.description ?? '';
    this.websiteFormOpen = true;
    this.error = '';
  }

  private saveWebsite(): void {
    const title = this.websiteTitle.trim();
    const url = normalizeWebsiteUrl(this.websiteUrl);
    const websites = this.item.websites ?? [];
    if (!title || !url || url.length > MAX_TOOL_URL_LENGTH) {
      this.error = '请填写网站名称和有效的 HTTP 或 HTTPS 地址';
      return;
    }
    if (websites.some((site) => site.id !== this.editingWebsiteId && normalizeWebsiteUrl(site.url) === url)) {
      this.error = '这个网址已在合集中';
      return;
    }
    if (this.editingWebsiteId && !websites.some((site) => site.id === this.editingWebsiteId)) return;
    if (!this.editingWebsiteId && websites.length >= MAX_COLLECTION_WEBSITES) return;
    const website: Website = {
      id: this.editingWebsiteId || uid(), title, url, description: this.websiteDescription.trim()
    };
    this.item.websites = this.editingWebsiteId ? websites.map((site) => site.id === website.id ? website : site) : websites.concat([website]);
    this.websiteFormOpen = false;
    this.websiteQuery = '';
    this.error = '';
    this.touched();
  }

  private moveWebsite(id: string, direction: number): void {
    const websites = (this.item.websites ?? []).slice();
    const index = websites.findIndex((site) => site.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= websites.length) return;
    const site = websites[index];
    websites[index] = websites[target];
    websites[target] = site;
    this.item.websites = websites;
    this.touched();
  }

  private async removeWebsite(site: Website): Promise<void> {
    try {
      const answer = await this.getUIContext().getPromptAction().showDialog({
        title: '移除网站',
        message: `保存合集后将移除“${site.title}”。`,
        buttons: [{ text: '取消', color: $r('app.color.accent') }, { text: '移除', color: $r('app.color.danger') }]
      });
      if (answer.index !== 1 || !this.documentVisible || this.websiteFormOpen || this.busy) return;
      this.item.websites = this.item.websites?.filter((value) => value.id !== site.id);
      this.touched();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  private visibleWebsites(): Website[] {
    const query = this.websiteQuery.trim().toLowerCase();
    return (this.item.websites ?? []).filter((site) => `${site.title} ${site.description} ${site.url}`.toLowerCase().includes(query));
  }

  private openVersionForm(version?: ToolVersion): void {
    this.editingVersionId = version?.id ?? '';
    this.versionLabel = version?.label ?? (toolVersions(this.item).length ? '' : '当前版本');
    this.versionUrl = version?.url ?? '';
    this.versionNote = version?.note ?? '';
    this.versionFormOpen = true;
    this.error = '';
  }

  private saveToolVersion(): void {
    const label = this.versionLabel.trim();
    const url = this.versionUrl.trim();
    const versions = toolVersions(this.item);
    const existing = versions.find((version) => version.id === this.editingVersionId);
    if (!label) {
      this.error = '请填写版本名称';
      return;
    }
    if (url && url !== existing?.url && !/^https?:\/\//i.test(url)) {
      this.error = '版本网址需以 http:// 或 https:// 开头';
      return;
    }
    if (this.editingVersionId && !existing) return;
    if (!existing && versions.length >= MAX_TOOL_VERSIONS) return;
    const updated: ToolVersion = {
      id: existing?.id ?? uid(), label, url, note: this.versionNote.trim(),
      createdAt: existing?.createdAt ?? localDate()
    };
    const next = existing ? versions.map((version) => version.id === updated.id ? updated : version) : versions.concat([updated]);
    setCurrentToolVersion(this.item, next, existing ? (currentToolVersion(this.item)?.id ?? updated.id) : updated.id);
    this.versionFormOpen = false;
    this.error = '';
    this.touched();
  }

  @Builder
  private websiteDirectory() {
    Text(`合集网站 · ${this.item.websites?.length ?? 0}个`).fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
    Search({ value: this.websiteQuery, placeholder: '搜索网站名称、用途或网址' })
      .onChange((value: string) => { this.websiteQuery = value; }).accessibilityText('搜索合集网站')
    Button('添加网站').enabled(!this.websiteFormOpen && !this.busy && (this.item.websites?.length ?? 0) < MAX_COLLECTION_WEBSITES)
      .onClick(() => this.openWebsiteForm()).accessibilityText('添加网站到合集')
    if (this.websiteFormOpen) {
      TextInput({ text: this.websiteTitle, placeholder: '网站名称' }).maxLength(500)
        .onChange((value: string) => { this.websiteTitle = value; }).accessibilityText('网站名称')
      TextInput({ text: this.websiteUrl, placeholder: '网站地址' }).maxLength(MAX_TOOL_URL_LENGTH)
        .onChange((value: string) => { this.websiteUrl = value; }).accessibilityText('网站地址')
      TextArea({ text: this.websiteDescription, placeholder: '用途说明' }).maxLength(500)
        .onChange((value: string) => { this.websiteDescription = value; }).accessibilityText('网站用途说明')
      Row({ space: 8 }) {
        Button('保存网站').onClick(() => this.saveWebsite()).accessibilityText('保存网站到项目草稿')
        Button('取消').onClick(() => { this.websiteFormOpen = false; }).accessibilityText('取消网站编辑')
      }
    }
    ForEach(this.visibleWebsites(), (site: Website) => {
      Column({ space: 6 }) {
        Text(site.title).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        Text(site.description).fontColor($r('app.color.text_secondary')).width('100%')
        Text(site.url).fontColor($r('app.color.text_secondary')).width('100%')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button('打开').onClick(() => this.visit(site.url)).accessibilityText(`打开网站${site.title}`)
          Button('编辑').enabled(!this.websiteFormOpen && !this.busy).onClick(() => this.openWebsiteForm(site)).accessibilityText(`编辑网站${site.title}`)
          Button('上移').enabled(!this.websiteFormOpen && !this.busy && !this.websiteQuery.trim() && this.item.websites?.[0]?.id !== site.id)
            .onClick(() => this.moveWebsite(site.id, -1)).accessibilityText(`上移网站${site.title}`)
          Button('下移').enabled(!this.websiteFormOpen && !this.busy && !this.websiteQuery.trim() &&
            (this.item.websites ?? []).slice(-1)[0]?.id !== site.id)
            .onClick(() => this.moveWebsite(site.id, 1)).accessibilityText(`下移网站${site.title}`)
          Button('移除').enabled(!this.websiteFormOpen && !this.busy).onClick(() => this.removeWebsite(site))
            .accessibilityText(`从草稿移除网站${site.title}`)
        }.width('100%')
      }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface_secondary'))
    }, (site: Website) => JSON.stringify(site))
    if (!this.visibleWebsites().length) {
      Text(this.websiteQuery.trim() ? '没有找到相关网站' : '暂无网站').fontColor($r('app.color.text_secondary'))
    }
  }

  @Builder
  private toolVersionFields() {
    Text(`当前版本 · ${currentToolVersion(this.item)?.label || '未设置'}`).fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
    Button('新增版本').enabled(!this.versionFormOpen && !this.busy && toolVersions(this.item).length < MAX_TOOL_VERSIONS)
      .onClick(() => this.openVersionForm()).accessibilityText('新增并启用工具版本')
    if (this.versionFormOpen) {
      TextInput({ text: this.versionLabel, placeholder: '版本名称' }).maxLength(500)
        .onChange((value: string) => { this.versionLabel = value; }).accessibilityText('版本名称')
      TextInput({ text: this.versionUrl, placeholder: '版本网址（选填）' }).maxLength(MAX_TOOL_URL_LENGTH)
        .onChange((value: string) => { this.versionUrl = value; }).accessibilityText('版本网址')
      TextArea({ text: this.versionNote, placeholder: '版本说明' }).maxLength(4000)
        .onChange((value: string) => { this.versionNote = value; }).accessibilityText('版本说明')
      Row({ space: 8 }) {
        Button('保存版本').onClick(() => this.saveToolVersion()).accessibilityText('保存工具版本到当前草稿')
        Button('取消').onClick(() => { this.versionFormOpen = false; }).accessibilityText('取消版本编辑')
      }
    }
    ForEach(toolVersions(this.item).slice(0, this.visibleToolVersions), (version: ToolVersion) => {
      Column({ space: 6 }) {
        Text(`${version.label} · ${currentToolVersion(this.item)?.id === version.id ? '当前' : version.createdAt || '历史'}`)
          .fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        Text(version.note).fontColor($r('app.color.text_secondary')).width('100%')
        Text(version.url).fontColor($r('app.color.text_secondary')).width('100%')
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          if (version.url) {
            Button('打开').onClick(() => this.visit(version.url)).accessibilityText(`打开工具版本${version.label}`)
          }
          Button('编辑').enabled(!this.versionFormOpen && !this.busy).onClick(() => this.openVersionForm(version))
            .accessibilityText(`编辑工具版本${version.label}`)
          Button('设为当前').enabled(!this.versionFormOpen && !this.busy && currentToolVersion(this.item)?.id !== version.id)
            .onClick(() => {
              setCurrentToolVersion(this.item, toolVersions(this.item), version.id);
              this.touched();
            }).accessibilityText(`将${version.label}设为当前版本`)
        }.width('100%')
      }.width('100%').padding(12).borderRadius(12).backgroundColor($r('app.color.surface_secondary'))
    }, (version: ToolVersion) => `${JSON.stringify(version)}:${currentToolVersion(this.item)?.id === version.id}`)
    if (this.visibleToolVersions < toolVersions(this.item).length) {
      Button('显示更多版本').onClick(() => { this.visibleToolVersions += TOOL_VERSION_BATCH_SIZE; }).accessibilityText('显示下一批工具版本')
    }
  }

  @Builder
  private toolFields() {
    this.selectField('类型', this.item.kind === 'collection' ? '网站合集' : '工具', TOOL_KINDS,
      (value: string) => {
        if (this.websiteFormOpen || this.versionFormOpen) {
          this.error = '请先保存或取消当前表单';
          return;
        }
        this.item.kind = value === '网站合集' ? 'collection' : 'tool';
      })
    this.field(this.item.kind === 'collection' ? '主题说明' : '用途说明', this.item.description ?? '',
      (value: string) => { this.item.description = value; }, true)
    if (this.item.kind === 'collection') {
      this.websiteDirectory()
    } else {
      this.selectField('状态', this.item.status ?? '想法', TOOL_STATUSES, (value: string) => { this.item.status = value; })
      this.toolVersionFields()
    }
  }

  @Builder
  private fields() {
    this.field('标题', this.item.title, (v: string) => { this.item.title = v; })
    if (this.collection === 'tasks') {
      this.taskFields()
    } else if (this.collection === 'milestones') {
      this.milestoneFields()
    } else if (this.collection === 'courses') {
      this.courseFields()
      CourseEventList({ courseId: this.item.id })
      CourseEventList({ courseId: this.item.id, ordinary: true })
      SubjectLinkedTasks({ subjectId: this.item.id })
    } else if (this.collection === 'learning') {
      this.field('分类', this.item.category ?? '', (v: string) => { this.item.category = v; })
      this.field('学习目标', this.item.goal ?? '', (v: string) => { this.item.goal = v; }, true)
      this.resourceFields()
      SubjectLinkedTasks({ subjectId: this.item.id })
    } else if (this.collection === 'research') {
      this.selectField('状态', this.item.status ?? '收集箱', RESEARCH_STATUSES, (v: string) => { this.item.status = v; })
      this.field('项目概述', this.item.summary ?? '', (v: string) => { this.item.summary = v; }, true)
      this.field('研究目标', this.item.objective ?? '', (v: string) => { this.item.objective = v; }, true)
      this.field('下一步行动', this.item.next ?? '', (v: string) => { this.item.next = v; }, true)
    } else if (this.collection === 'tools') {
      this.toolFields()
    } else if (this.collection === 'habits') {
      this.field('频率', typeof this.item.schedule === 'string' ? this.item.schedule as string : '每天',
        (v: string) => { this.item.schedule = v; })
      Text(`连续 ${this.item.streak ?? 0} 天`).fontColor($r('app.color.text_secondary'))
    } else if (this.collection === 'reminders') {
      this.selectField('提醒类型', this.item.type ?? 'custom', ['exercise', 'break', 'sleep', 'custom'], (v: string) => { this.item.type = v; })
      this.field('提醒时间（如 09:00,17:30）', (this.item.times ?? []).join(','),
        (v: string) => { this.item.times = v.split(/[,，]/).map((t) => t.trim()).filter((t) => t.length > 0); })
      if (this.item.type === 'break') {
        this.field('休息间隔（分钟）', String(this.item.intervalMinutes ?? ''),
          (v: string) => { this.item.intervalMinutes = v ? Number(v) : undefined; })
      }
      this.switchField('启用提醒', this.item.enabled ?? false, (v: boolean) => { this.item.enabled = v; })
      Text('提醒在应用前台运行时显示；关闭应用后不会触发。').fontColor($r('app.color.text_secondary'))
    } else if (this.collection === 'media') {
      this.selectField('类型', this.item.kind ?? '书籍', ['书籍', '动画', '影视'], (v: string) => { this.item.kind = v; })
      this.selectField('状态', this.item.status ?? '想看', ['正在看', '想看', '书单'], (v: string) => { this.item.status = v; })
      this.field('阅读 / 观看进度', String(this.item.progress ?? ''), (v: string) => { this.item.progress = v; })
    } else if (this.collection === 'recipes') {
      this.field('食材', this.item.ingredients ?? '', (v: string) => { this.item.ingredients = v; }, true)
      this.field('备注', this.item.note ?? '', (v: string) => { this.item.note = v; }, true)
    } else if (this.collection === 'thoughts' || this.collection === 'free') {
      this.selectField('类型', this.item.kind === 'folder' ? '文件夹' : '页面', ['页面', '文件夹'],
        (v: string) => { this.item.kind = v === '文件夹' ? 'folder' : 'page'; })
      this.selectField('父文件夹', getWorkspace().pages.find((v) => v.id === this.item.parentId)?.title ?? '根目录',
        ['根目录'].concat(entries(getWorkspace(), this.collection).filter((v) => v.kind === 'folder' && v.id !== this.item.id).map((v) => v.title)),
        (v: string) => { this.item.parentId = entries(getWorkspace(), this.collection).find((p) => p.kind === 'folder' && p.title === v)?.id ?? null; })
    } else {
      this.field('内容', this.item.note ?? '', (v: string) => { this.item.note = v; }, true)
    }
    if (this.collection === 'tasks' && this.item.mode === 'multi' && !!this.entryId) {
      TextInput({ text: String(this.item.progress ?? 0), placeholder: '完成进度 0–100' }).type(InputType.Number).maxLength(3)
        .onChange((value: string) => {
          if (!/^\d{1,3}$/.test(value)) return;
          const progress = Math.min(100, Number(value)); this.item.progress = progress;
          this.item.done = progress === 100; this.item.status = progress === 100 ? '已完成' : progress > 0 ? '进行中' : '未开始';
          this.item.completedDate = this.item.done ? localDate() : undefined; this.touched();
        }).accessibilityText('填写已有长期任务进度，零至百分之一百；保存时保留进度历史')
    }
  }

  @Builder
  private researchDocument(id: string) {
    TextInput({ text: this.researchPage()?.title ?? '', placeholder: '研究页面标题' })
      .maxLength(500).enabled(!this.busy)
      .onChange((title: string) => this.updateResearchPage(id, title))
      .accessibilityText('当前研究页面标题')
    DocumentEditor({
      pageVisible: this.documentVisible,
      documentKey: `${this.item.id}:${id}`,
      blocks: this.researchPage()?.blocks ?? [],
      onPendingChange: (value: boolean) => this.pending(`research:${id}`, value),
      onChange: (blocks: Block[]) => this.updateResearchPage(id, undefined, blocks)
    })
  }

  @Builder
  private researchNotebook() {
    Text('项目页面').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      Select((this.item.pages ?? []).map((page): SelectOption => ({ value: page.title || '未命名页面' })))
        .value(this.researchPage()?.title || '未命名页面')
        .enabled(!this.busy && !this.pendingAttachments)
        .onSelect((index: number) => {
          if (this.busy || this.pendingAttachments) return;
          const page = this.item.pages?.[index];
          if (page) this.researchPageId = page.id;
        })
        .accessibilityText(`切换研究页面，共${this.item.pages?.length ?? 0}页，当前${this.researchPage()?.title || '未命名页面'}`)
      Button('新增页面').enabled(!this.busy && !this.pendingAttachments && (this.item.pages?.length ?? 0) < MAX_RESEARCH_PAGES)
        .onClick(() => this.addResearchPage()).accessibilityText('新增研究页面')
      if ((this.item.pages?.length ?? 0) > 1) {
        Button('移除页面').enabled(!this.busy && !this.pendingAttachments)
          .onClick(() => this.removeResearchPage(this.researchPageId)).accessibilityText('移除当前研究页面')
      }
    }.width('100%')
    if (this.researchPageId) {
      ForEach([this.researchPageId], (id: string) => {
        this.researchDocument(id)
      }, (id: string) => id)
    }
  }

  build() {
    HdsNavDestination() {
      Scroll() {
        Column({ space: 16 }) {
          if (this.error) { Text(this.error).fontColor($r('app.color.danger')).accessibilityText(`错误：${this.error}`) }
          GridRow({ columns: 12, gutter: 20 }) {
            GridCol({ span: { xs: 12, sm: 12, md: 12, lg: 5 } }) {
              Column({ space: 14 }) { this.fields() }.width('100%').alignItems(HorizontalAlign.Start)
            }
            GridCol({ span: { xs: 12, sm: 12, md: 12, lg: 7 } }) {
              Column({ space: 16 }) {
                if (this.collection === 'research') {
                  this.researchNotebook()
                } else if (!['habits', 'reminders', 'routines', 'ideas'].includes(this.collection) && this.item.kind !== 'folder') {
                  DocumentEditor({ pageVisible: this.documentVisible, documentKey: `${this.collection}:${this.item.id}:${this.item.pages?.[0]?.id ?? ''}`, blocks: this.blocks, onPendingChange: (value: boolean) => this.pending('document', value), onChange: (blocks: Block[]) => {
                    this.blocks = blocks; setBlocks(this.item, blocks); this.touched();
                  } })
                }
                if (this.collection === 'tasks' || this.collection === 'milestones') {
                  AttachmentPanel({ files: this.item.attachments ?? [], title: '要求与资料附件', scopeId: `requirements:${this.item.id}`,
                    onPendingChange: (value: boolean) => this.pending('requirements', value), onChange: (files: Attachment[]) => {
                      this.item.attachments = files; this.touched();
                    } })
                }
                if (this.collection === 'milestones') {
                  AttachmentPanel({ files: this.item.outcomeAttachments ?? [], title: '成果附件', scopeId: `outcome:${this.item.id}`,
                    onPendingChange: (value: boolean) => this.pending('outcome', value), onChange: (files: Attachment[]) => {
                      this.item.outcomeAttachments = files; this.touched();
                    } })
                }
              }.width('100%').margin({ top: 16 })
            }
          }
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(12), cross: LengthMetrics.vp(12) } }) {
            Button(this.busy ? '保存中…' : '保存').enabled(!this.busy && !this.pendingAttachments).onClick(() => this.save()).accessibilityText('保存记录')
            Button('取消').onClick(() => this.leave()).accessibilityText('取消编辑')
            if (this.entryId) { Button('删除记录').enabled(!this.busy && !this.pendingAttachments).fontColor($r('app.color.danger')).onClick(() => this.deleteRecord()).accessibilityText('删除此记录') }
          }
        }.width('100%').constraintSize({ maxWidth: 1200 }).padding(20).alignItems(HorizontalAlign.Start)
      }.width('100%').height('100%').backgroundColor($r('app.color.background'))
    }
    .titleMode(HdsNavDestinationTitleMode.MINI)
    .titleBar(hdsPageTitle(`${this.entryId ? '编辑' : '新建'}${collectionTitle(this.collection)}`, () => this.leave()))
    .onShown(() => {
      this.documentVisible = true;
      this.refreshTaskSubjects();
      if (this.dirty || this.pendingAttachments) return;
      const saved = entries(getWorkspace(), this.collection).find((entry) => entry.id === this.item.id);
      if (saved) this.loadDraft(saved, true);
    })
    .onHidden(() => { this.documentVisible = false; })
    .onBackPressed(() => { this.leave(); return true; })
  }
}
