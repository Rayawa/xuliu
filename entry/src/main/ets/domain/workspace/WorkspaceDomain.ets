import { eventCourses } from './CourseEvents';
import { ResearchPage } from '../../models/Workspace';
import { Workspace, WorkspaceEntry, Block, DailyRecord } from '../../models/Workspace';
import { COLLECTIONS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, MS_PER_DAY, DEFAULT_TERM_START, STUDY_RULE_VERSION } from '../../config/constants';

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function localDate(date: Date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localTime(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function validDate(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}

export function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function emptyWorkspace(): Workspace {
  return {
    version: 6, tasks: [], milestones: [], courses: [], learning: [], research: [], ideas: [], tools: [],
    habits: [], routines: [], reminders: [], media: [], recipes: [], pages: [], daily: {}, timeEntries: [],
    timetableSettings: { termStartDate: DEFAULT_TERM_START, activeSchool: 'pku' },
    studyAutomation: { enabled: true, processedKeys: [], ruleVersion: STUDY_RULE_VERSION },
    reviewPool: { version: 1, items: [], removedSources: [] },
    finance: { entries: [], budgets: {}, expenseCategories: EXPENSE_CATEGORIES.slice(),
      incomeCategories: INCOME_CATEGORIES.slice(), storedValueAccounts: [] },
    themes: {}
  };
}

export function collectionTitle(key: string): string {
  return COLLECTIONS.find((item) => item.key === key)?.title ?? '记录';
}

export function entries(data: Workspace, key: string): WorkspaceEntry[] {
  switch (key) {
    case 'tasks': return data.tasks;
    case 'milestones': return data.milestones;
    case 'courses': return data.courses;
    case 'learning': return data.learning;
    case 'research': return data.research;
    case 'ideas': return data.ideas;
    case 'tools': return data.tools;
    case 'habits': return data.habits;
    case 'routines': return data.routines;
    case 'reminders': return data.reminders;
    case 'media': return data.media;
    case 'recipes': return data.recipes;
    case 'thoughts': return data.pages.filter((item) => item.space === 'thoughts');
    case 'free': return data.pages.filter((item) => item.space === 'free');
    default: return [];
  }
}

export function replaceEntries(data: Workspace, key: string, value: WorkspaceEntry[]): void {
  switch (key) {
    case 'tasks': data.tasks = value; break;
    case 'milestones': data.milestones = value; break;
    case 'courses': data.courses = value; break;
    case 'learning': data.learning = value; break;
    case 'research': data.research = value; break;
    case 'ideas': data.ideas = value; break;
    case 'tools': data.tools = value; break;
    case 'habits': data.habits = value; break;
    case 'routines': data.routines = value; break;
    case 'reminders': data.reminders = value; break;
    case 'media': data.media = value; break;
    case 'recipes': data.recipes = value; break;
    case 'thoughts':
    case 'free': data.pages = data.pages.filter((item) => item.space !== key).concat(value); break;
  }
}

export function createEntry(key: string): WorkspaceEntry {
  const id = uid();
  switch (key) {
    case 'tasks': return { id, title: '', area: '生活', source: '手动', done: false, today: true, elapsed: 0, showOnCalendar: false,
      mode: 'single', status: '未开始', progress: 0, progressLogs: [], blocks: [] };
    case 'milestones': return { id, title: '', date: localDate(), time: '', location: '', requirements: '', area: '生活',
      done: false, mode: 'single', blocks: [] };
    case 'courses': return { id, title: '', term: '', teacher: '', location: '', school: 'pku', progress: 0,
      requirements: '', schedule: [], blocks: [] };
    case 'learning': return { id, title: '', category: '技术', progress: 0, goal: '', resources: [], blocks: [] };
    case 'research': return { id, title: '', status: '收集箱', summary: '', objective: '', next: '', progress: 0,
      pages: starterResearchPages() };
    case 'ideas': return { id, title: '', note: '', createdAt: new Date().toISOString() };
    case 'tools': return { id, title: '', status: '使用中', description: '', url: '', version: '', kind: 'tool',
      versions: [], websites: [], blocks: [] };
    case 'habits': return { id, title: '', streak: 0, today: false, schedule: '每天' };
    case 'routines': return { id, title: '', note: '' };
    case 'reminders': return { id, title: '', type: 'custom', times: ['09:00'], enabled: true };
    case 'media': return { id, title: '', kind: '书籍', status: '想看', progress: '', blocks: [] };
    case 'recipes': return { id, title: '', ingredients: '', note: '', blocks: [] };
    default: return { id, title: '', space: key, parentId: null, kind: 'page', blocks: [] };
  }
}

export function entrySubtitle(item: WorkspaceEntry): string {
  const date = item.due || item.date || item.plannedDate || '';
  const status = item.done ? '已完成' : (item.status || item.area || item.category || item.kind || '');
  return [status, date, item.location || item.teacher || item.note || item.description || ''].filter((v) => v.length > 0).join(' · ');
}

export function toggleComplete(item: WorkspaceEntry, key: string): void {
  if (key === 'habits') {
    const today = localDate();
    const wasDone = item.lastCompletedDate === today;
    if (wasDone) {
      item.streak = Math.max(0, (item.streak ?? 0) - 1);
      item.lastCompletedDate = undefined;
    } else {
      item.streak = item.lastCompletedDate === addDays(today, -1) ? (item.streak ?? 0) + 1 : 1;
      item.lastCompletedDate = today;
    }
    item.today = !wasDone;
    return;
  }
  item.done = !item.done;
  item.completedDate = item.done ? localDate() : undefined;
  if (key === 'tasks') {
    item.progress = item.done ? 100 : 0;
    item.status = item.done ? '已完成' : '未开始';
  }
}

export function defaultPlannedDate(item: WorkspaceEntry): string | undefined {
  const deadline = item.due || ((item.courseId || item.alsoTask) ? item.date : undefined);
  const cancelled = deadline && item.plannedDate === item.dismissedTodayDate && !item.automationKey && !item.id.startsWith('stage:') && item.mode !== 'multi';
  if (item.plannedDate && !cancelled) return item.plannedDate;
  if (item.mode === 'multi' || item.automationKey || !deadline || !validDate(deadline)) return undefined;
  return addDays(deadline, -2);
}
export function workCompleted(item: WorkspaceEntry): boolean { return item.done === true || item.status === '已完成'; }
export function workScheduledForDate(item: WorkspaceEntry, day: string): boolean {
  if (defaultPlannedDate(item) === day) return true;
  if (item.mode !== 'multi') return item.due === day || !!item.progressLogs?.some((entry) => entry.date === day);
  return (item.startDate || item.due || day) <= day && day <= (item.due || '9999-12-31') || !!item.progressLogs?.some((entry) => entry.date === day);
}
export function planWorkForDate(item: WorkspaceEntry, day: string): void {
  if (workCompleted(item)) return;
  item.plannedDate = day; item.dismissedTodayDate = undefined;
}
export function isToday(item: WorkspaceEntry, day: string = localDate(), collection: string = 'tasks'): boolean {
  const node = collection === 'milestones'; const taskNode = !!item.courseId || item.alsoTask === true;
  if ((!node || taskNode) && item.dismissedTodayDate === day) return false;
  if (!node && workCompleted(item)) return (item.completedDate || item.progressLogs?.slice().reverse().find((entry) => entry.progress === 100)?.date) === day;
  if (node && taskNode && item.done) return item.completedDate === day;
  if (!node || taskNode) {
    if (item.progressedDates?.includes(day) || (item.progressedDates?.length && item.plannedDate === day)) return true;
    if (item.progressedDates?.length && item.plannedDate && item.plannedDate > day) return false;
    if (item.mode === 'multi') {
      const deadline = item.due || (node ? item.date : undefined);
      return !!deadline && validDate(deadline) && day >= addDays(deadline, -7) &&
        (item.plannedDate === day || !item.startDate || item.startDate <= day);
    }
  }
  if (node) return item.date === day || (taskNode && defaultPlannedDate(item) === day);
  return item.plannedDate === day || workScheduledForDate(item, day) || (!item.due && !item.plannedDate && item.today === true);
}

export function emptyDaily(): DailyRecord {
  return { note: '', gain: '', problem: '', feeling: '', tomorrow: '' };
}

export function starterResearchPages(blocks: Block[] = []): ResearchPage[] {
  return [
    { id: uid(), title: '研究总览', blocks },
    { id: uid(), title: '资料与线索', blocks: [] },
    { id: uid(), title: '阶段结论', blocks: [] }
  ];
}

export function blocksFor(item: WorkspaceEntry): Block[] {
  if (item.pages && item.pages.length > 0) return item.pages[0].blocks;
  return item.blocks ?? [];
}

export function setBlocks(item: WorkspaceEntry, value: Block[]): void {
  if (item.pages && item.pages.length > 0) item.pages[0].blocks = value;
  else item.blocks = value;
}

export function removeEntry(data: Workspace, key: string, id: string): void {
  // Keep descendants as independent records; no hidden cascade deletion.
  replaceEntries(data, key, entries(data, key).filter((item) => item.id !== id));
  data.tasks.forEach((item) => {
    if (item.parentId === id) item.parentId = undefined;
    if (item.parentMilestoneId === id) item.parentMilestoneId = undefined;
    if (item.courseId === id) item.courseId = undefined;
  });
  data.milestones.forEach((item) => {
    if (item.courseId === id) item.courseId = undefined;
    // Keep the original link so past events can show that their course was removed.
  });
  data.pages.forEach((item) => { if (item.parentId === id) item.parentId = null; });
}

export function money(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function weekNumber(start: string, day: string): number {
  const first = new Date(`${start}T00:00:00Z`).getTime();
  const current = new Date(`${day}T00:00:00Z`).getTime();
  return Math.floor((current - first) / MS_PER_DAY / 7) + 1;
}

export function timetableWeekNumber(start: string, day: string): number | undefined {
  const actual = weekNumber(start, day);
  if (actual < 1) return undefined;
  return actual <= 3 ? actual - 4 : actual - 3;
}

export function runsInWeek(rule: string, week: number): boolean {
  const raw = rule.normalize('NFKC').replace(/[−－]/g, '-').trim();
  if (!raw) return true;
  const oddOnly = /单/.test(raw);
  const evenOnly = !oddOnly && /双/.test(raw);
  const segments = raw.replace(/第/g, '').replace(/[()（）]/g, ' ')
    .replace(/[单双]\s*周?/g, '').replace(/周次?|教学/g, '')
    .split(/[,，、;；/]+/).map((v) => v.trim()).filter((v) => !!v);
  const hasNumbers = segments.some((segment) => /-?\d+/.test(segment));
  const included = !hasNumbers || segments.some((segment) => {
    const range = segment.match(/^(-?\d+)\s*(?:至|[—–~～-])\s*(-?\d+)$/);
    if (range) return week >= Math.min(Number(range[1]), Number(range[2])) && week <= Math.max(Number(range[1]), Number(range[2]));
    return (segment.match(/-?\d+/g) ?? []).some((value) => Number(value) === week);
  });
  if (!included) return false;
  return oddOnly ? Math.abs(week) % 2 === 1 : evenOnly ? Math.abs(week) % 2 === 0 : true;
}

export function initialPlannedDate(item: WorkspaceEntry): string | undefined {
  if (item.plannedDate || item.mode === 'multi' || item.automationKey) return item.plannedDate;
  const deadline = item.due || ((item.courseId || item.alsoTask) ? item.date : undefined);
  if (!deadline || !validDate(deadline)) return undefined;
  const planned = addDays(deadline, -2);
  return planned < localDate() ? localDate() : planned;
}

export function validateEntry(item: WorkspaceEntry, key: string, data: Workspace): string {
  if (!item.title.trim()) return '请填写标题';
  if (item.title.length > 500) return '标题最多 500 字';
  for (const value of [item.due, item.date, item.startDate, item.plannedDate]) {
    if (value && !validDate(value)) return '日期格式为 YYYY-MM-DD，请填写有效日期';
  }
  for (const value of [item.time, item.dueTime]) {
    if (value && !validTime(value)) return '时间格式为 HH:mm';
  }
  const original = entries(data, key).find((v) => v.id === item.id);
  if ((key === 'tasks' || key === 'milestones') &&
    ((item.due && item.due < localDate() && item.due !== original?.due) ||
      (item.plannedDate && item.plannedDate < localDate() && item.plannedDate !== original?.plannedDate) ||
      (key === 'milestones' && item.date && item.date < localDate() && item.date !== original?.date))) {
    return '新选的截止日和推进日不能早于今天；已有历史日期可原样保留';
  }
  if (item.dueTime && !item.due) return '截止时间需要同时填写截止日期';
  if (item.startDate && item.due && item.startDate > item.due) return '开始日期不能晚于截止日期';
  if (key === 'milestones' && item.time && !item.date) return '设置时间前请先选择日期';
  if (key === 'milestones' && item.linkedCourseId && item.linkedCourseId !== original?.linkedCourseId &&
    !eventCourses(data.courses).some((course) => course.id === item.linkedCourseId)) return '请选择有效的关联课程';
  if (item.courseId && key === 'milestones' && (!item.date || !item.time)) return '课程任务必须填写日期和时间';
  if (item.parentId) {
    const visited: Set<string> = new Set([item.id]);
    let parent = item.parentId;
    while (parent) {
      if (visited.has(parent)) return '父级关联不能形成循环';
      visited.add(parent);
      parent = entries(data, key).find((v) => v.id === parent)?.parentId ?? '';
    }
  }
  if (key === 'reminders' && item.enabled && !(item.times?.length) && !item.intervalMinutes) return '启用提醒前请设置时间或间隔';
  if (key === 'reminders' && item.times?.some((v) => !validTime(v))) return '提醒时间格式为 HH:mm，用逗号分隔';
  if (key === 'reminders' && item.intervalMinutes !== undefined &&
    (!Number.isInteger(item.intervalMinutes) || item.intervalMinutes < 1 || item.intervalMinutes > 1440)) return '提醒间隔为 1–1440 分钟';
  if (item.url && !/^https?:\/\//i.test(item.url)) return '网址需以 https:// 或 http:// 开头';
  return '';
}
