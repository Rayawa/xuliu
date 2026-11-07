// Wire format follows Serenitycheng/xuliu workspace-state-schema.ts, version 6.
export interface Attachment {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
}

export interface Block {
  id: string;
  type: string;
  text?: string;
  checked?: boolean;
  url?: string;
  rows?: string[][];
  inlineRuns?: InlineRun[];
  embeddedImages?: Attachment[];
  embeddedFiles?: Attachment[];
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
  headingLevel?: number;
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  textAlign?: string;
  fontFamily?: string;
}

export interface ProgressLog {
  id: string;
  date: string;
  progress: number;
  status: string;
  note: string;
}

export interface CourseSlot {
  id: string;
  weekday: number;
  start: string;
  end: string;
  location: string;
  weeks?: string;
  source?: string;
}

export interface LearningResource {
  id: string;
  title: string;
  type: string;
  url: string;
  progress: number;
}

export interface ResearchPage {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Website {
  id: string;
  title: string;
  description: string;
  url: string;
}

export interface ToolVersion {
  id: string;
  label: string;
  url: string;
  note: string;
  createdAt: string;
}

// Related record families share the document editor, but retain their original fields.
export interface WorkspaceEntry {
  id: string;
  title: string;
  area?: string;
  source?: string;
  due?: string;
  dueTime?: string;
  date?: string;
  time?: string;
  done?: boolean;
  today?: boolean;
  elapsed?: number;
  completedDate?: string;
  dismissedTodayDate?: string;
  plannedDate?: string;
  progressedDates?: string[];
  parentId?: string | null;
  parentMilestoneId?: string;
  courseId?: string;
  linkedCourseId?: string;
  courseLinkReviewed?: boolean;
  showOnCalendar?: boolean;
  parentCandidate?: boolean;
  requirements?: string;
  attachments?: Attachment[];
  outcomeText?: string;
  outcomeAttachments?: Attachment[];
  blocks?: Block[];
  mode?: string;
  startDate?: string;
  status?: string;
  progress?: number | string;
  progressLogs?: ProgressLog[];
  alsoTask?: boolean;
  assessmentType?: string;
  eventDateKind?: string;
  automationKey?: string;
  location?: string;
  term?: string;
  teacher?: string;
  school?: string;
  schedule?: CourseSlot[] | string;
  category?: string;
  goal?: string;
  resources?: LearningResource[];
  summary?: string;
  objective?: string;
  next?: string;
  pages?: ResearchPage[];
  note?: string;
  createdAt?: string;
  description?: string;
  url?: string;
  version?: string;
  kind?: string;
  websites?: Website[];
  currentVersionId?: string;
  versions?: ToolVersion[];
  streak?: number;
  lastCompletedDate?: string;
  type?: string;
  times?: string[];
  intervalMinutes?: number;
  enabled?: boolean;
  lastFired?: string;
  snoozedUntil?: number;
  ingredients?: string;
  space?: string;
}

export interface FinanceEntry {
  id: string;
  type: string;
  amountCents: number;
  category: string;
  date: string;
  time: string;
  note: string;
  purpose?: string;
  relatedProject: string;
  createdAt: string;
  updatedAt: string;
  origin: string;
  merchant?: string;
  storedValueAccountId?: string;
  bonusCents?: number;
}

export interface Budget {
  totalCents: number;
  categoryCents: Record<string, number>;
}

export interface PaymentRule {
  category: string;
  purpose: string;
}

export interface StoredValueAccount {
  id: string;
  name: string;
  openingBalanceCents: number;
}

export interface FinanceState {
  entries: FinanceEntry[];
  budgets: Record<string, Budget>;
  expenseCategories: string[];
  incomeCategories: string[];
  merchantCategories?: Record<string, string>;
  paymentRules?: Record<string, PaymentRule>;
  storedValueAccounts?: StoredValueAccount[];
}

export interface DailyRecord {
  note: string;
  gain: string;
  problem: string;
  feeling: string;
  tomorrow: string;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  targetKind?: string;
  minutes: number;
  date: string;
  mode: string;
  note?: string;
}

export interface ReviewSource {
  kind: string;
  id: string;
}

export interface ReviewStep {
  id: string;
  title: string;
  done: boolean;
  selectedDate?: string;
  completedDate?: string;
}

export interface ReviewItem {
  id: string;
  course: string;
  chapter: string;
  progress: number;
  note: string;
  done: boolean;
  previousProgress?: number;
  selectedDate?: string;
  completedDate?: string;
  sources: ReviewSource[];
  steps?: ReviewStep[];
}

export interface ReviewPool {
  version: number;
  items: ReviewItem[];
  removedSources?: ReviewSource[];
}

export interface FocusSettings {
  minutes: number;
  sound: boolean;
  volume: number;
}

export interface TimetableSettings {
  termStartDate: string;
  activeSchool: string;
}

export interface StudyAutomation {
  enabled: boolean;
  processedKeys: string[];
  ruleVersion?: number;
}

export interface Workspace {
  version: number;
  tasks: WorkspaceEntry[];
  milestones: WorkspaceEntry[];
  courses: WorkspaceEntry[];
  learning: WorkspaceEntry[];
  research: WorkspaceEntry[];
  ideas: WorkspaceEntry[];
  tools: WorkspaceEntry[];
  habits: WorkspaceEntry[];
  routines: WorkspaceEntry[];
  reminders: WorkspaceEntry[];
  media: WorkspaceEntry[];
  recipes: WorkspaceEntry[];
  pages: WorkspaceEntry[];
  daily: Record<string, DailyRecord>;
  timeEntries: TimeEntry[];
  focusSettings?: FocusSettings;
  timetableSettings: TimetableSettings;
  studyAutomation: StudyAutomation;
  reviewPool?: ReviewPool;
  finance: FinanceState;
  themes: Record<string, string>;
}

export interface CollectionDefinition {
  key: string;
  title: string;
  caption: string;
  group: string;
  symbol: Resource;
}

export interface EntryTarget {
  courseId?: string;
  linkedCourseId?: string;
  initialDate?: string;
  toolKind?: string;
  collection: string;
  id: string;
}

export interface CloudAccount {
  id: string;
  username: string;
  displayName: string;
}

export interface CloudRecord {
  owner: string;
  readOnly: boolean;
  data: Workspace | null;
  updatedAt: string | null;
  revision: number;
}

export interface ChartDatum {
  label: string;
  value: number;
}
