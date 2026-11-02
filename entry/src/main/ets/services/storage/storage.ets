import { uid } from '../../domain/workspace/WorkspaceDomain';
import { KEY_REVISION } from '../../config/constants';
import { assertWorkspace } from '../../domain/workspace/WorkspaceValidation';
import { util } from '@kit.ArkTS';
import { common, ConfigurationConstant } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { fileIo as fs } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Workspace } from '../../models/Workspace';
import { emptyWorkspace } from '../../domain/workspace/WorkspaceDomain';
import { publishWorkspaceChange } from '../../state/appState';
import { KEY_USERNAME, KEY_THEME, KEY_ACCENT, KEY_REMINDERS, KEY_READY, KEY_SAVE_ERROR,
  STORAGE_FILE, WORKSPACE_FILE, MAX_FILE_BYTES } from '../../config/constants';

let preferenceStore: preferences.Preferences | undefined;
let applicationContext: common.ApplicationContext | undefined;
let workspace: Workspace = emptyWorkspace();
let workspacePath: string = '';
let ready: boolean = false;
let recoveredFromBackup: boolean = false;
let writes: Promise<void> = Promise.resolve();

export function decodeWorkspace(raw: string): Workspace {
  if (new util.TextEncoder().encodeInto(raw).byteLength > MAX_FILE_BYTES) throw new Error('工作台数据超过 2 MB，请先整理附件');
  const value = JSON.parse(raw) as Workspace;
  if (!value || value.version !== 6 || !Array.isArray(value.tasks) || !Array.isArray(value.milestones) ||
    !Array.isArray(value.courses) || !Array.isArray(value.learning) || !Array.isArray(value.research) ||
    !Array.isArray(value.ideas) || !Array.isArray(value.tools) || !Array.isArray(value.habits) ||
    !Array.isArray(value.routines) || !Array.isArray(value.reminders) || !Array.isArray(value.media) ||
    !Array.isArray(value.recipes) || !Array.isArray(value.pages) || !Array.isArray(value.timeEntries) ||
    !value.daily || !value.finance || !Array.isArray(value.finance.entries) || !value.finance.budgets ||
    !Array.isArray(value.finance.expenseCategories) || !Array.isArray(value.finance.incomeCategories) || !value.themes) {
    throw new Error('不是受支持的序流 version 6 工作台文件');
  }
  if (!value.timetableSettings) value.timetableSettings = emptyWorkspace().timetableSettings;
  if (!value.studyAutomation) value.studyAutomation = emptyWorkspace().studyAutomation;
  assertWorkspace(value);
  return value;
}

export async function loadPersistedState(context: common.UIAbilityContext): Promise<void> {
  applicationContext = context.getApplicationContext();
  preferenceStore = await preferences.getPreferences(context, { name: STORAGE_FILE });
  AppStorage.setOrCreate(KEY_USERNAME, await preferenceStore.get(KEY_USERNAME, '朋友'));
  AppStorage.setOrCreate(KEY_THEME, await preferenceStore.get(KEY_THEME, 0));
  AppStorage.setOrCreate(KEY_ACCENT, await preferenceStore.get(KEY_ACCENT, 0));
  AppStorage.setOrCreate(KEY_REMINDERS, await preferenceStore.get(KEY_REMINDERS, true));
  applyTheme(AppStorage.get<number>(KEY_THEME) ?? 0);
  workspacePath = `${context.filesDir}/${WORKSPACE_FILE}`;
  if (fs.accessSync(workspacePath)) {
    try {
      workspace = decodeWorkspace(fs.readTextSync(workspacePath));
    } catch (error) {
      // Preserve the damaged file. A recoverable backup is never silently discarded.
      if (!fs.accessSync(`${workspacePath}.bak`)) throw new Error('本地数据读取失败，原文件已保留。请重启或从备份恢复');
      workspace = decodeWorkspace(fs.readTextSync(`${workspacePath}.bak`));
      recoveredFromBackup = true;
      AppStorage.setOrCreate(KEY_SAVE_ERROR, '主文件读取失败，已读取上一份备份；请先导出数据');
    }
  }
  ready = true;
  AppStorage.setOrCreate(KEY_READY, true);
  publishWorkspaceChange();
}

export function getWorkspace(): Workspace {
  return JSON.parse(JSON.stringify(workspace)) as Workspace;
}

async function writeSnapshot(raw: string): Promise<void> {
  const temp = `${workspacePath}.tmp`;
  const file = await fs.open(temp, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
  try {
    const bytes = new util.TextEncoder().encodeInto(raw);
    let written = 0;
    while (written < bytes.byteLength) {
      const count = await fs.write(file.fd, bytes.buffer.slice(written));
      if (count <= 0) throw new Error('无法完整写入工作台');
      written += count;
    }
    fs.fsyncSync(file.fd);
  } finally {
    await fs.close(file);
  }
  if (fs.accessSync(workspacePath)) {
    if (recoveredFromBackup) fs.copyFileSync(workspacePath, `${workspacePath}.corrupt-${Date.now()}`);
    else fs.copyFileSync(workspacePath, `${workspacePath}.bak`);
  }
  fs.renameSync(temp, workspacePath);
  recoveredFromBackup = false;
}

export async function saveWorkspace(value: Workspace): Promise<void> {
  if (!ready) throw new Error('工作台尚未加载，暂时无法保存');
  const raw = JSON.stringify(value);
  decodeWorkspace(raw);
  const operation = writes.then(() => writeSnapshot(raw));
  writes = operation.catch((error: Error) => {
    hilog.error(0, 'XuliuStorage', 'Workspace save failed: %{public}s', error.message);
    AppStorage.setOrCreate(KEY_SAVE_ERROR, '本地保存失败，当前更改仍在内存中，请点击重试保存');
  });
  workspace = JSON.parse(raw) as Workspace;
  publishWorkspaceChange();
  await operation;
  AppStorage.setOrCreate(KEY_SAVE_ERROR, '');
}

export async function retrySave(): Promise<void> {
  await saveWorkspace(getWorkspace());
}

export async function flushStorage(): Promise<void> {
  await writes;
  await preferenceStore?.flush();
}

function applyTheme(mode: number): void {
  const colorMode = mode === 1 ? ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT :
    mode === 2 ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK : ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET;
  applicationContext?.setColorMode(colorMode);
}

export async function setSetting(key: string, value: preferences.ValueType): Promise<void> {
  if (!preferenceStore) throw new Error('设置尚未加载');
  const previous = AppStorage.get<preferences.ValueType>(key);
  AppStorage.setOrCreate(key, value);
  if (key === KEY_THEME) applyTheme(value as number);
  try {
    await preferenceStore.put(key, value);
    await preferenceStore.flush();
  } catch (error) {
    if (previous !== undefined) AppStorage.setOrCreate(key, previous);
    if (key === KEY_THEME) applyTheme((previous as number) ?? 0);
    throw new Error('设置保存失败，请重试');
  }
}

export interface WorkspaceCheckpoint { name: string; createdAt: number; bytes: number; }

function checkpointDirectory(): string { return `${workspacePath}.imports`; }

async function writeCheckpoint(raw: string, school: string): Promise<void> {
  const directory = checkpointDirectory();
  if (!fs.accessSync(directory)) fs.mkdirSync(directory);
  const path = `${directory}/${Date.now()}-${school}-${uid()}.json`; const temporary = `${path}.tmp`;
  const file = await fs.open(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
  try {
    const bytes = new util.TextEncoder().encodeInto(raw); let position = 0;
    while (position < bytes.byteLength) {
      const count = await fs.write(file.fd, bytes.buffer.slice(position)); if (count <= 0) throw new Error('导入前备份写入不完整'); position += count;
    }
    fs.fsyncSync(file.fd);
  } finally { await fs.close(file); }
  fs.renameSync(temporary, path);
}

/** Rebase after asynchronous backup I/O; the exact pre-import state must be durable before applying changes. */
export async function saveWithCheckpoint(change: (current: Workspace) => void, school: string): Promise<void> {
  if (!ready || !['pku', 'bit'].includes(school)) throw new Error('工作台尚未就绪或课表类型无效');
  for (let attempt = 0; attempt < 3; attempt++) {
    const version = AppStorage.get<number>(KEY_REVISION) ?? 0;
    const before = getWorkspace(); const next = JSON.parse(JSON.stringify(before)) as Workspace;
    change(next); decodeWorkspace(JSON.stringify(next));
    await writeCheckpoint(JSON.stringify(before), school);
    if ((AppStorage.get<number>(KEY_REVISION) ?? 0) !== version) continue;
    await saveWorkspace(next); return;
  }
  throw new Error('备份期间工作台发生更新，请重新确认导入');
}

export function courseCheckpoints(school: string): WorkspaceCheckpoint[] {
  if (!ready || !['pku', 'bit'].includes(school) || !fs.accessSync(checkpointDirectory())) return [];
  return fs.listFileSync(checkpointDirectory()).filter((name) => name.includes(`-${school}-`) && /^\d+-[a-z]+-[a-z0-9-]+\.json$/.test(name))
    .sort().reverse().map((name): WorkspaceCheckpoint => {
      const createdAt = Number(name.split('-')[0]); const bytes = fs.statSync(`${checkpointDirectory()}/${name}`).size;
      return { name, createdAt, bytes };
    });
}

export function readCourseCheckpoint(name: string): string {
  if (!ready || !/^\d+-(pku|bit)-[a-z0-9-]+\.json$/.test(name)) throw new Error('备份名称无效');
  const raw = fs.readTextSync(`${checkpointDirectory()}/${name}`); decodeWorkspace(raw); return raw;
}
