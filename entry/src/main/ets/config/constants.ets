import { CollectionDefinition } from '../models/Workspace';

export const APP_NAME: string = '序流';
export const APP_VERSION: string = '1.0.0';
export const HDS_MATERIAL_TYPE_ADAPTIVE: number = 100;
export const HDS_MATERIAL_LEVEL_GENTLE: number = 1;
export const HDS_TITLE_SIZE_SMALL: number = 0;
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
export const KEY_VIBRATION_LEVEL: string = 'vibrationLevel';
export const KEY_LIGHT_FIELD_LEVEL: string = 'lightFieldLevel';
export const KEY_IMMERSIVE_MATERIAL_LEVEL: string = 'immersiveMaterialLevel';
export const DEFAULT_VIBRATION_LEVEL: number = 1;
export const DEFAULT_LIGHT_FIELD_LEVEL: number = 1;
export const DEFAULT_IMMERSIVE_MATERIAL_LEVEL: number = 1;
// 我的页面布局节奏，数值与 Dashboard 的列表页常量保持一致。
export const CONTENT_MAX_WIDTH: number = 1440;
export const LIST_PAGE_HORIZONTAL_PADDING: number = 14;
export const LIST_SECTION_SPACING: number = 14;
export const LIST_SECTION_CONTENT_GAP: number = 8;
export const LIST_SECTION_TITLE_START_PADDING: number = 4;
export const LIST_ITEM_PREFIX_MARGIN: number = 8;
export const LIST_ITEM_SUFFIX_MARGIN: number = 8;
export const LIST_ITEM_DIVIDER_HORIZONTAL_MARGIN: number = 16;
export const LIST_SECTION_DIVIDER_VERTICAL_MARGIN: number = 2;
export const CONTENT_ENTER_DURATION_MS: number = 280;
export const PAGE_TRANSITION_DURATION_MS: number = 300;
export const PAGE_EXIT_DURATION_MS: number = 220;
export const STAGGER_ENTER_DURATION_MS: number = 500;
export const STAGGER_ENTER_DELAY_MS: number = 100;
export const STAGGER_ENTER_INTERVAL_MS: number = 125;
export const MAIN_TAB_MY: number = 4;
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
export const DOCUMENT_COLOR_NAMES: string[] = ['正文', '海蓝', '青色', '紫色', '琥珀', '强调红'];
export const DOCUMENT_COLOR_RESOURCES: Resource[] = [$r('app.color.text_primary'), $r('app.color.accent'), $r('app.color.accent_blue'), $r('app.color.accent_plum'), $r('app.color.accent_amber'), $r('app.color.danger')];

export const KEY_CLOUD_SESSION: string = 'cloudSessionEpoch';
export const ROUTE_ATTACHMENT: string = 'attachment';
export const FILE_TRANSFER_TIMEOUT_MS: number = 120000;
export const BLOB_API_ORIGIN: string = 'https://vercel.com/api/blob';
export const BLOB_API_VERSION: string = '12';
export const BLOB_MULTIPART_MIN_BYTES: number = 5 * 1024 * 1024;
export const BLOB_PART_BYTES: number = 8 * 1024 * 1024;

export const MAX_BLOCK_TEXT_CHARS: number = 4000;
export const MAX_RESEARCH_PAGES: number = 2000;
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
export const FINANCE_DETAIL_BATCH_SIZE: number = 50;
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

export const ROUTE_AI: string = 'aiAssistant';
export const MAX_AI_STREAM_BYTES: number = 8 * 1024 * 1024;
export const MAX_AI_REQUEST_BYTES: number = 200000;
export const MAX_AI_TEXT_CHARS: number = 32000;
export const MAX_AI_MESSAGES: number = 30;
export const AI_TIMEOUT_MS: number = 65000;

export const ROUTE_YIYAN: string = 'yiyan';
export const KEY_YIYAN_CARD: string = 'yiyanPublicCard';
export const KEY_YIYAN_CLARITY: string = 'yiyanImageClarity';
export const YIYAN_DEFAULT_CLARITY: number = 80;
export const YIYAN_REFRESH_DELAY_MS: number = 2100;
export const YIYAN_PREFETCH_DELAY_MS: number = 2200;
export const YIYAN_MAX_IMAGE_BYTES: number = 4 * 1024 * 1024;
export const YIYAN_PROXY_TIMEOUT_MS: number = 10000;
export const YIYAN_DIRECT_TIMEOUT_MS: number = 3500;
export const YIYAN_MAX_RESPONSE_BYTES: number = 8 * 1024 * 1024;

export const ROUTE_REVIEW_DETAIL: string = 'reviewDetail';
export const MAX_REVIEW_ITEMS: number = 500;
export const MAX_REVIEW_STEPS: number = 50;
export const MAX_REVIEW_SOURCES: number = 2000;
export const MAX_REVIEW_REMOVED_SOURCES: number = 30000;
export const ROUTE_WORK_ADVANCE: string = 'workAdvance';

export const KEY_LIFE_REVISION: string = 'lifeRuntimeRevision';
export const ALERT_SETTINGS_PREFIX: string = 'reminderAlerts:';
export const ROUTE_ALERT_SETTINGS: string = 'alertSettings';
export const EYE_FOCUS_MS: number = 30 * 60000;
export const EYE_REST_MS: number = 5 * 60000;
export const DEFAULT_FOCUS_VOLUME: number = 40;
export const ALERT_TONE_IDS: string[] = ['soft', 'clear', 'double'];
export const ALERT_TONE_LABELS: string[] = ['柔和铃声', '清脆提示', '双音提示'];

export const MAX_PASTE_CHARS: number = MAX_FILE_BYTES;
export const MAX_PASTE_TOKENS: number = 50000;
export const MAX_PASTE_DEPTH: number = 64;
export const MAX_DOCUMENT_HISTORY_STEPS: number = 20;
export const MAX_DOCUMENT_HISTORY_CHARS: number = 4000000;

export const LEARNING_RESOURCE_TYPES: string[] = ['B站课程', '书籍', '软件', '网站', '线下课程', '其他'];
export const MAX_LEARNING_RESOURCES: number = 2000;
export const MAX_LEARNING_RESOURCE_URL: number = 2000;
export const LINKED_TASK_BATCH_SIZE: number = 20;

export const TOOL_KINDS: string[] = ['工具', '网站合集'];
export const TOOL_FILTERS: string[] = ['全部', '工具', '网站合集'];
export const TOOL_STATUSES: string[] = ['想法', '开发中', '迭代中', '已完成', '已归档'];
export const MAX_COLLECTION_WEBSITES: number = 200;
export const MAX_TOOL_VERSIONS: number = 2000;
export const MAX_TOOL_URL_LENGTH: number = 2000;
export const TOOL_VERSION_BATCH_SIZE: number = 20;

export const CALENDAR_WEEKDAYS: string[] = ['日', '一', '二', '三', '四', '五', '六'];
export const CALENDAR_MONTH_LABELS: string[] = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
export const CALENDAR_FIRST_MONTH: string = '0001-01';
export const CALENDAR_LAST_MONTH: string = '9999-12';
export const CALENDAR_WIDE_WIDTH: number = 720;
export const CALENDAR_INLINE_LIMIT: number = 2;

export const ASSESSMENT_TYPES: string[] = ['exam', 'quiz', 'submission', 'presentation'];
export const ASSESSMENT_LABELS: string[] = ['考试', '测验', '作业提交', '报告 / 展示'];
export const EVENT_DATE_KINDS: string[] = ['occurs', 'deadline'];
export const EVENT_DATE_LABELS: string[] = ['发生时间', '提交截止'];

// Exact legacy generated lines; personal edits are deliberately not matched.
export const LEGACY_STUDY_SOURCE: string = '由“课表学习计划”依据 Obsidian《学习首页》自动创建。';
export const LEGACY_STUDY_METHOD_LINES: string[] = [
  "学习方法：看笔记并补充课堂笔记。",
  "学习方法：用 GPT 二次整理本节学习笔记。仅用于学习整理，正式考核不使用 GenAI。",
  "学习方法：先独立完成本次 Seminar 的题目。",
  "学习方法：订正课前独立完成的题目。",
  "学习方法：只补充本次 Seminar 中做错或不会的部分。",
  "学习方法：用 GPT 总结课本和 PPT，形成笔记并完成预习。",
  "学习方法：看笔记、跟例题，并在原笔记上补充课堂内容。",
  "学习方法：复习本节笔记；本单元结束时，用 GPT 总结知识框架和题型，进行一次单元总复习。",
  "学习方法：看笔记和例题，重点理解题目为什么使用当前方法。",
  "学习方法：用 GPT 总结课本，形成笔记并完成预习。",
  "学习方法：在已有笔记上补充老师强调的规则、例外和计算方法。",
  "学习方法：练习本节税收题目，并复习笔记。",
  "学习方法：整理或转录本节 Course Notes，形成可上课使用的 Full Course Notes，并快速预习。",
  "学习方法：直接在转录版 Course Notes 上补充课堂笔记。",
  "学习方法：用 GPT 整理本节笔记，再独立完成本节 Question Bank。",
  "学习方法：Lecture 看笔记并补笔记；Seminar 订正课前独立完成的题目。",
  "学习方法：Lecture 用 GPT 二次整理学习笔记；Seminar 只补充错题或不会的部分。正式考核不使用 GenAI。",
  "学习方法：阅读课本，独立尝试本次 Tutorial questions；Lecture 不另外安排预习。",
  "学习方法：看总结笔记并补充课堂内容；订正 Tutorial questions，记录不会或做错的点。",
  "学习方法：用 GPT 最后整理一次 Lecture 笔记；Tutorial 只复习错题和相关知识点。",
  "学习方法：结合课堂内容，在已有笔记上补充老师强调的重点。",
  "学习方法：需要时再用 GPT 整理课本和课堂内容；本专题结束时，整理老师强调的原理、关键词和可分析的现实问题。",
  "学习方法：用 GPT 分析已有错题、总结本节题型，再复习笔记并完成自测。",
  "学习方法：结合本节规则完成自主练习，再复习笔记。",
  "学习方法：用 GPT 整理本节笔记，再独立练习本节 Question Bank。",
  "学习方法：Lecture 用 GPT 总结 PPT 并预习；Seminar 先独立完成练习题。",
  "学习方法：Lecture 看笔记并补笔记；Seminar 订正答案；Workshop 实际完成操作。",
  "学习方法：Lecture 用 GPT 二次整理笔记；Seminar 只补充错题或不会的部分；Workshop 独立重做关键操作。",
  "学习方法：Lecture 用 GPT 总结 PPT 和课本并预习；Tutorial 阅读课本并完成练习题。",
  "学习方法：Lecture 根据总结笔记补充课堂内容；Tutorial 订正练习题并记录不会或做错的点。",
  "学习方法：Lecture 用 GPT 最后整理一次笔记；Tutorial 只复习错题和相关知识点。",
  "学习方法：需要时用 GPT 整理课本和课堂内容；专题结束时整理老师强调的原理、关键词和可分析的现实问题。"
];
