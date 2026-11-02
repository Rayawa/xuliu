import { courseSchool } from '../../domain/courses/TimetableRules';
import { AttachmentPanel } from '../../components/workspace/AttachmentPanel';
import { Attachment } from '../../models/Workspace';
import { transferStudyToPool } from '../../domain/workspace/ReviewDomain';
import { common } from '@kit.AbilityKit';
import { openLink } from '../../services/links/openLink';
import { ProgressLog } from '../../models/Workspace';
import { plannedStages } from '../../domain/workspace/StudyPlan';
import { EntryTarget } from '../../models/Workspace';
import { HdsNavDestination, HdsNavDestinationTitleMode } from '@kit.UIDesignKit';
import { LengthMetrics } from '@kit.ArkUI';
import { WorkspaceEntry, Block, CourseSlot, LearningResource, Website, ToolVersion } from '../../models/Workspace';
import { AREAS, TASK_STATUSES, RESEARCH_STATUSES, ROUTE_EDITOR, ROUTE_FOCUS } from '../../config/constants';
import { getWorkspace, saveWorkspace } from '../../services/storage/storage';
import { blocksFor, collectionTitle, createEntry, entries, localDate, localTime, removeEntry, replaceEntries,
  setBlocks, uid, validateEntry, initialPlannedDate } from '../../domain/workspace/WorkspaceDomain';
import { DocumentEditor } from '../../components/workspace/DocumentEditor';

@Component
export struct EditorPage {
  @Consume('pageStack') private pageStack: NavPathStack;
  @Prop collection: string = 'tasks';
  @Prop entryId: string = '';
  @State private item: WorkspaceEntry = createEntry('tasks');
  @State private blocks: Block[] = [];
  @State private error: string = '';
  @State private busy: boolean = false;
  @State private dirty: boolean = false;
  @State private pendingAttachments: boolean = false;
  private pendingScopes: Set<string> = new Set();
  @State private weekday: number = 1;
  @State private start: string = '08:00';
  @State private end: string = '09:00';
  @State private weekRule: string = '';
  @State private resourceTitle: string = '';
  @State private resourceUrl: string = '';
  @State private websiteTitle: string = '';
  @State private websiteUrl: string = '';
  @State private versionLabel: string = '';
  @State private versionUrl: string = '';
  @State private subtaskTitle: string = '';
  @State private reviewChapter: string = '';
  @State private reviewNote: string = '';
  @State private completedToday: boolean = false;
  private original: string = '';

  aboutToAppear(): void {
    this.item = entries(getWorkspace(), this.collection).find((item) => item.id === this.entryId) ?? createEntry(this.collection);
    this.blocks = blocksFor(this.item);
    this.original = JSON.stringify(this.item);
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
    if (this.pendingAttachments) { this.error = '请先完成或取消所选附件上传'; return; }
    const data = getWorkspace();
    this.error = validateEntry(this.item, this.collection, data);
    if (this.error) return;
    this.busy = true;
    try {
      const list = entries(data, this.collection);
      const index = list.findIndex((item) => item.id === this.item.id);
      if (this.entryId && index < 0) throw new Error('此记录已变化或移除，请返回列表重新打开');
      if (index >= 0) this.item.elapsed = list[index].elapsed;
      else if (this.collection === 'tasks' || this.collection === 'milestones') this.item.plannedDate = initialPlannedDate(this.item);
      if (index >= 0) list[index] = this.item; else list.push(this.item);
      replaceEntries(data, this.collection, list);
      data.tasks = data.tasks.concat(plannedStages(data, localDate()));
      if (this.collection === 'tasks' && this.item.mode === 'multi') {
        const logs = this.item.progressLogs ?? [];
        const previous = logs[logs.length - 1];
        if (!previous || previous.progress !== Number(this.item.progress ?? 0) || previous.status !== this.item.status) {
          logs.push({ id: uid(), date: localDate(), progress: Number(this.item.progress ?? 0), status: this.item.status ?? '未开始', note: '' });
          this.item.progressLogs = logs;
        }
      }
      await saveWorkspace(data);
      this.dirty = false;
      this.original = JSON.stringify(this.item);
      if (close) this.pageStack.pop();
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
    }
  }

  private leave(): void {
    if (!this.pendingAttachments && !this.dirty && JSON.stringify(this.item) === this.original) {
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
    })
    if (this.item.mode === 'multi') {
      ForEach(this.item.progressLogs ?? [], (log: ProgressLog) => {
        Text(`${log.date} · ${log.progress}% · ${log.status}`).fontColor($r('app.color.text_secondary'))
      }, (log: ProgressLog) => log.id)
    }
    this.field('任务要求', this.item.requirements ?? '', (v: string) => { this.item.requirements = v; }, true)
    this.selectField('所属课程', getWorkspace().courses.find((v) => v.id === this.item.courseId)?.title ?? '无',
      ['无'].concat(getWorkspace().courses.map((v) => v.title)), (v: string) => {
        this.item.courseId = getWorkspace().courses.find((c) => c.title === v)?.id;
      })
    this.selectField('父任务', getWorkspace().tasks.find((v) => v.id === this.item.parentId)?.title ?? '无',
      ['无'].concat(getWorkspace().tasks.filter((v) => v.id !== this.item.id).map((v) => v.title)), (v: string) => {
        this.item.parentId = getWorkspace().tasks.find((c) => c.title === v)?.id;
      })
    Button('开始专注').onClick(async () => {
      await this.save(false);
      if (!this.error) this.pageStack.pushPath({ name: ROUTE_FOCUS, param: { collection: this.collection, id: this.item.id } as EntryTarget });
    }).accessibilityText('保存任务并开始专注计时')
    Text(`累计专注 ${this.item.elapsed ?? 0} 分钟`).fontColor($r('app.color.text_secondary'))
  }

  @Builder
  private milestoneFields() {
    this.selectField('领域', this.item.area ?? '生活', AREAS, (v: string) => { this.item.area = v; })
    this.field('日期 YYYY-MM-DD', this.item.date ?? '', (v: string) => { this.item.date = v; })
    this.field('时间 HH:mm', this.item.time ?? '', (v: string) => { this.item.time = v; })
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
    if (!this.item.courseId && !this.item.automationKey) {
      this.switchField('同时作为任务', this.item.alsoTask ?? false, (v: boolean) => { this.item.alsoTask = v; })
      if (this.item.alsoTask) {
        this.field('计划推进日 YYYY-MM-DD', this.item.plannedDate ?? '', (v: string) => { this.item.plannedDate = v || undefined; })
      }
    }
    this.switchField('完成事项', this.item.done ?? false, (v: boolean) => {
      this.item.done = v; this.item.completedDate = v ? localDate() : undefined;
    })
    if (!this.item.courseId) {
    this.selectField('关联课程', getWorkspace().courses.find((v) => v.id === this.item.linkedCourseId)?.title ?? '无',
      ['无'].concat(getWorkspace().courses.map((v) => v.title)), (v: string) => {
        this.item.linkedCourseId = getWorkspace().courses.find((c) => c.title === v)?.id;
        this.item.assessmentType = this.item.linkedCourseId ? 'exam' : undefined;
        this.item.eventDateKind = this.item.linkedCourseId ? 'occurs' : undefined;
      })
    }
  }

  @Builder
  private courseFields() {
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
    Button('添加课程任务').onClick(async () => {
      await this.save(false);
      if (this.error) return;
      const data = getWorkspace();
      const node = createEntry('milestones');
      node.title = `${this.item.title} · 新任务`; node.courseId = this.item.id; node.date = localDate(); node.time = localTime(); node.area = '课内';
      data.milestones.push(node); await saveWorkspace(data);
      this.pageStack.pushPath({ name: ROUTE_EDITOR, param: { collection: 'milestones', id: node.id } as EntryTarget });
    }).accessibilityText('添加课程任务与成果记录')
  }

  @Builder
  private resourceFields() {
    ForEach(this.item.resources ?? [], (resource: LearningResource) => {
      Row() {
        Text(`${resource.title} · ${resource.progress}%`).layoutWeight(1).fontColor($r('app.color.text_primary'))
        Button('打开').onClick(() => this.visit(resource.url)).accessibilityText(`打开学习资源${resource.title}`)
        Button('+10%').onClick(() => { resource.progress = Math.min(100, resource.progress + 10); this.touched(); })
          .accessibilityText(`推进${resource.title}学习进度`)
        Button('移除').onClick(() => { this.item.resources = this.item.resources?.filter((v) => v.id !== resource.id); this.touched(); })
          .accessibilityText(`移除资源${resource.title}`)
      }
    }, (resource: LearningResource) => `${resource.id}-${resource.progress}`)
    this.field('资源名称', this.resourceTitle, (v: string) => { this.resourceTitle = v; })
    this.field('资源链接', this.resourceUrl, (v: string) => { this.resourceUrl = v; })
    Button('添加学习资源').onClick(() => {
      if (!this.resourceTitle.trim()) return;
      const resources = this.item.resources ?? [];
      resources.push({ id: uid(), title: this.resourceTitle.trim(), type: '网站', url: this.resourceUrl, progress: 0 });
      this.item.resources = resources; this.resourceTitle = ''; this.resourceUrl = ''; this.touched();
    }).accessibilityText('添加学习资源')
  }

  @Builder
  private toolFields() {
    this.selectField('类型', this.item.kind === 'collection' ? '网站合集' : '工具', ['工具', '网站合集'],
      (v: string) => { this.item.kind = v === '网站合集' ? 'collection' : 'tool'; })
    this.field('网址', this.item.url ?? '', (v: string) => { this.item.url = v; })
    if (this.item.url) { Button('打开工具链接').onClick(() => this.visit(this.item.url ?? '')).accessibilityText('在系统浏览器打开工具链接') }
    this.selectField('状态', this.item.status ?? '想法', ['想法', '开发中', '迭代中', '已完成', '已归档'], (v: string) => { this.item.status = v; })
    this.field('说明', this.item.description ?? '', (v: string) => { this.item.description = v; }, true)
    this.field('当前版本', this.item.version ?? '', (v: string) => { this.item.version = v; })
    ForEach(this.item.websites ?? [], (site: Website) => {
      Row() {
        Text(`${site.title}\n${site.url}`).layoutWeight(1).fontColor($r('app.color.text_primary'))
        Button('打开').onClick(() => this.visit(site.url)).accessibilityText(`打开网站${site.title}`)
        Button('移除').onClick(() => { this.item.websites = this.item.websites?.filter((v) => v.id !== site.id); this.touched(); })
          .accessibilityText(`移除网站${site.title}`)
      }
    }, (site: Website) => site.id)
    this.field('网站名称', this.websiteTitle, (v: string) => { this.websiteTitle = v; })
    this.field('网站链接', this.websiteUrl, (v: string) => { this.websiteUrl = v; })
    Button('加入合集').onClick(() => {
      if (!this.websiteTitle.trim() || !/^https?:\/\//.test(this.websiteUrl)) { this.error = '请填写网站名称和有效链接'; return; }
      const websites = this.item.websites ?? [];
      websites.push({ id: uid(), title: this.websiteTitle.trim(), description: '', url: this.websiteUrl });
      this.item.websites = websites; this.websiteTitle = ''; this.websiteUrl = ''; this.touched();
    }).accessibilityText('添加网站到合集')
    ForEach(this.item.versions ?? [], (version: ToolVersion) => {
      Button(`设为当前：${version.label}`).onClick(() => {
        this.item.currentVersionId = version.id; this.item.version = version.label; this.item.url = version.url; this.touched();
      }).accessibilityText(`切换到工具版本${version.label}`)
    }, (version: ToolVersion) => version.id)
    this.field('新版本名称', this.versionLabel, (v: string) => { this.versionLabel = v; })
    this.field('新版本链接', this.versionUrl, (v: string) => { this.versionUrl = v; })
    Button('保存版本').onClick(() => {
      if (!this.versionLabel.trim()) return;
      const versions = this.item.versions ?? [];
      versions.push({ id: uid(), label: this.versionLabel, url: this.versionUrl, note: '', createdAt: new Date().toISOString() });
      this.item.versions = versions; this.versionLabel = ''; this.versionUrl = ''; this.touched();
    }).accessibilityText('保存工具版本历史')
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
    } else if (this.collection === 'learning') {
      this.field('分类', this.item.category ?? '', (v: string) => { this.item.category = v; })
      this.field('学习目标', this.item.goal ?? '', (v: string) => { this.item.goal = v; }, true)
      this.resourceFields()
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
    if (['courses', 'learning', 'research'].includes(this.collection) || (this.collection === 'tasks' && this.item.mode === 'multi')) {
      Text(`进度 ${Number(this.item.progress ?? 0)}%`).fontColor($r('app.color.text_primary'))
      Slider({ value: Number(this.item.progress ?? 0), min: 0, max: 100, step: 1 })
        .onChange((value: number) => {
          this.item.progress = Math.round(value);
          if (this.collection === 'tasks') {
            this.item.done = value === 100;
            this.item.status = value === 100 ? '已完成' : value > 0 ? '进行中' : '未开始';
            this.item.completedDate = this.item.done ? localDate() : undefined;
          }
          this.touched();
        }).accessibilityText('调整完成进度百分比')
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
                if (!['habits', 'reminders', 'routines', 'ideas'].includes(this.collection) && this.item.kind !== 'folder') {
                  DocumentEditor({ blocks: this.blocks, onPendingChange: (value: boolean) => this.pending('document', value), onChange: (blocks: Block[]) => {
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
    .titleBar({ content: { title: { mainTitle: `${this.entryId ? '编辑' : '新建'}${collectionTitle(this.collection)}` },
      backIcon: { action: () => this.leave() } } })
    .onBackPressed(() => { this.leave(); return true; })
  }
}
