import { CollectionDefinition } from '../models/Workspace';

export const APP_NAME: string = '序流';
export const APP_VERSION: string = '1.0.0';
export const UPSTREAM_COMMIT: string = '26cd01e2c62a030ff79fbdb58c47d8b7cca70d29';
export const CLOUD_ORIGIN: string = 'https://xuliu-ai-web-one.vercel.app';
export const STORAGE_FILE: string = 'app_storage';
export const WORKSPACE_FILE: string = 'workspace-v6.json';
export const KEY_USERNAME: string = 'username';
export const KEY_THEME: string = 'themeMode';
export const KEY_FOCUS_SESSION: string = 'focusSession';
export const KEY_READY: string = 'storageReady';
export const KEY_REVISION: string = 'workspaceRevision';
export const KEY_SAVE_ERROR: string = 'saveError';
export const KEY_DAY: string = 'currentDate';
export const KEY_ACTIVE: string = 'applicationActive';
export const KEY_ACCENT: string = 'accentIndex';
export const KEY_REMINDERS: string = 'remindersEnabled';
export const ROUTE_COLLECTION: string = 'collection';
export const ROUTE_EDITOR: string = 'editor';
export const ROUTE_FOCUS: string = 'focus';
export const ROUTE_CALENDAR: string = 'calendar';
export const ROUTE_TIMETABLE: string = 'timetable';
export const ROUTE_REVIEW: string = 'review';
export const ROUTE_FINANCE: string = 'finance';
export const ROUTE_DAILY: string = 'daily';
export const ROUTE_CLOUD: string = 'cloud';
export const ROUTE_WEB: string = 'web';
export const ROUTE_LOG: string = 'log';
export const ROUTE_PRIVACY: string = 'privacy';
export const MAX_FILE_BYTES: number = 2_000_000;
export const MAX_ATTACHMENT_BYTES: number = 50 * 1024 * 1024;
export const HTTP_TIMEOUT_MS: number = 30000;
export const DEFAULT_TERM_START: string = '2026-08-31';
export const STUDY_RULE_VERSION: number = 4;
export const DAILY_STUDY_DURATION: string = '10–20 分钟';
export const STUDY_EXCLUDED_COURSES: string[] = ['跆拳道', '气候与社会', '形势与政策', '形策'];
export const DEFAULT_FOCUS_MINUTES: number = 25;
export const MAX_FOCUS_MINUTES: number = 180;
export const SECONDS_PER_MINUTE: number = 60;
export const MS_PER_DAY: number = 86400000;
export const AREAS: string[] = ['课内', '课外', '工作', '生活', '思考'];
export const TASK_STATUSES: string[] = ['未开始', '进行中', '已暂停', '已完成'];
export const RESEARCH_STATUSES: string[] = ['收集箱', '研究中', '验证中', '已归档'];
export const EXPENSE_CATEGORIES: string[] = ['餐饮', '日常生活', '购物', '交通', '住房', '通讯', '娱乐', '医疗健康', '教育', '校园卡充值', '人情往来', '亲情卡', '金融保险', '其他'];
export const INCOME_CATEGORIES: string[] = ['工资', '兼职', '奖学金', '报销', '礼金', '其他收入'];
export const WEEKDAYS: string[] = ['一', '二', '三', '四', '五', '六', '日'];
export const BLOCK_TYPES: string[] = ['text', 'heading', 'checklist', 'link', 'table', 'image', 'file'];
export const BLOCK_LABELS: string[] = ['正文', '标题', '待办', '链接', '表格', '图片', '文件'];
export const ACCENT_RESOURCES: Resource[] = [
  $r('app.color.accent'), $r('app.color.accent_blue'), $r('app.color.accent_plum'), $r('app.color.accent_amber')
];
export const COLLECTIONS: CollectionDefinition[] = [
  { key: 'tasks', title: '任务', caption: '短期行动、长期目标与阶段推进', group: '安排', symbol: $r('sys.symbol.checkmark_circle') },
  { key: 'milestones', title: '事项', caption: '考试、提交与重要日期', group: '安排', symbol: $r('sys.symbol.flag') },
  { key: 'courses', title: '课内课程', caption: '课程资料、课表与学习节点', group: '学习', symbol: $r('sys.symbol.book') },
  { key: 'learning', title: '课外学习', caption: '学习目标、资源与进度', group: '学习', symbol: $r('sys.symbol.graduationcap') },
  { key: 'research', title: '工作与研究', caption: '从问题到验证，持续推进', group: '工作', symbol: $r('sys.symbol.briefcase') },
  { key: 'ideas', title: '灵感收集', caption: '捕捉此刻，留给未来', group: '思考', symbol: $r('sys.symbol.lightbulb') },
  { key: 'thoughts', title: '思考笔记', caption: '整理观点与知识', group: '思考', symbol: $r('sys.symbol.square_and_pencil') },
  { key: 'free', title: '自由空间', caption: '文件夹与自由文档', group: '思考', symbol: $r('sys.symbol.folder') },
  { key: 'tools', title: '工具集', caption: '工具、版本与网站合集', group: '工作', symbol: $r('sys.symbol.square_grid_2x2') },
  { key: 'habits', title: '习惯', caption: '每天一点，慢慢积累', group: '生活', symbol: $r('sys.symbol.sun_max') },
  { key: 'routines', title: '生活流程', caption: '让日常更有节奏', group: '生活', symbol: $r('sys.symbol.list_bullet') },
  { key: 'reminders', title: '提醒', caption: '运动、休息、睡眠与自定义提醒', group: '生活', symbol: $r('sys.symbol.bell') },
  { key: 'media', title: '媒体与书籍', caption: '正在看、想看与书单', group: '生活', symbol: $r('sys.symbol.play_circle') },
  { key: 'recipes', title: '菜谱', caption: '食材、步骤与调整记录', group: '生活', symbol: $r('sys.symbol.heart') }
];

export const DOCUMENT_SIZE_NAMES: string[] = ['small', 'normal', 'large', 'xlarge'];
export const DOCUMENT_COLOR_NAMES: string[] = ['正文', '松绿', '湖蓝', '梅紫', '暖金', '强调红'];
export const DOCUMENT_COLOR_RESOURCES: Resource[] = [$r('app.color.text_primary'), $r('app.color.accent'), $r('app.color.accent_blue'), $r('app.color.accent_plum'), $r('app.color.accent_amber'), $r('app.color.danger')];

export const KEY_CLOUD_SESSION: string = 'cloudSessionEpoch';
export const ROUTE_ATTACHMENT: string = 'attachment';
export const FILE_TRANSFER_TIMEOUT_MS: number = 120000;
export const BLOB_API_ORIGIN: string = 'https://vercel.com/api/blob';
export const BLOB_API_VERSION: string = '12';
export const BLOB_MULTIPART_MIN_BYTES: number = 5 * 1024 * 1024;
export const BLOB_PART_BYTES: number = 8 * 1024 * 1024;

export const MAX_BLOCK_TEXT_CHARS: number = 4000;
export const MAX_DOCUMENT_BLOCKS: number = 2000;
export const MAX_ATTACHMENTS: number = 50;
export const MAX_TABLE_ROWS: number = 100;
export const MAX_TABLE_COLUMNS: number = 30;
export const MAX_TABLE_CELL_CHARS: number = 500;

export const ROUTE_FINANCE_ENTRY: string = 'financeEntry';
export const ROUTE_FINANCE_BUDGET: string = 'financeBudget';
export const ROUTE_FINANCE_SETTINGS: string = 'financeSettings';
export const ROUTE_STORED_VALUE: string = 'storedValue';
export const MAX_FINANCE_CENTS: number = 10000000000;
export const MAX_FINANCE_ENTRIES: number = 20000;
export const MAX_FINANCE_CATEGORIES: number = 200;
export const MAX_STORED_VALUE_ACCOUNTS: number = 100;
export const CHART_PALETTE: Resource[] = [
  $r('app.color.accent'), $r('app.color.accent_blue'), $r('app.color.accent_plum'), $r('app.color.accent_amber'),
  $r('app.color.chart_teal'), $r('app.color.chart_rose'), $r('app.color.chart_slate'), $r('app.color.chart_lime'), $r('app.color.chart_rust')
];

export const MAX_BILL_IMPORT_BYTES: number = 8 * 1024 * 1024;
export const MAX_COURSE_IMPORT_BYTES: number = 10 * 1024 * 1024;
export const MAX_XLSX_ENTRY_BYTES: number = 32 * 1024 * 1024;
export const MAX_XLSX_DECODED_BYTES: number = 64 * 1024 * 1024;
export const MAX_XLSX_ZIP_ENTRIES: number = 4096;
export const MAX_XLSX_SHEETS: number = 64;
export const MAX_XLSX_ROWS: number = 50000;
export const MAX_XLSX_COLUMNS: number = 256;
export const MAX_XLSX_CELLS: number = 500000;
export const MAX_XLSX_CELL_CHARS: number = 32768;

export const COURSE_TIME_ZONE: string = 'Asia/Shanghai';
export const ROUTE_ACADEMIC_IMPORT: string = 'academicImport';
