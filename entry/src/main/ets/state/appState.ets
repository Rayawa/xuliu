import {
  DEFAULT_IMMERSIVE_MATERIAL_LEVEL, DEFAULT_LIGHT_FIELD_LEVEL, DEFAULT_VIBRATION_LEVEL,
  KEY_CLOUD_SESSION, KEY_DAY, KEY_IMMERSIVE_MATERIAL_LEVEL, KEY_LIFE_REVISION,
  KEY_LIGHT_FIELD_LEVEL, KEY_REMINDERS, KEY_VIBRATION_LEVEL,
} from '../config/constants';
import { localDate } from '../domain/workspace/WorkspaceDomain';
import { KEY_ACTIVE, KEY_READY, KEY_REVISION, KEY_SAVE_ERROR } from '../config/constants';

export function initializeAppState(): void {
  AppStorage.setOrCreate(KEY_DAY, localDate());
  AppStorage.setOrCreate(KEY_LIFE_REVISION, 0);
  AppStorage.setOrCreate(KEY_ACTIVE, true);
  AppStorage.setOrCreate(KEY_READY, false);
  AppStorage.setOrCreate(KEY_REVISION, 0);
  AppStorage.setOrCreate(KEY_SAVE_ERROR, '');
  AppStorage.setOrCreate(KEY_VIBRATION_LEVEL, DEFAULT_VIBRATION_LEVEL);
  AppStorage.setOrCreate(KEY_LIGHT_FIELD_LEVEL, DEFAULT_LIGHT_FIELD_LEVEL);
  AppStorage.setOrCreate(KEY_IMMERSIVE_MATERIAL_LEVEL, DEFAULT_IMMERSIVE_MATERIAL_LEVEL);
}

export function setApplicationActive(value: boolean): void {
  setChanged(KEY_ACTIVE, value);
}

export function publishWorkspaceChange(): void {
  AppStorage.setOrCreate(KEY_REVISION, (AppStorage.get<number>(KEY_REVISION) ?? 0) + 1);
}

function setChanged<T>(key: string, value: T): void {
  if (AppStorage.get<T>(key) !== value) AppStorage.setOrCreate(key, value);
}

export function syncCurrentDay(): void {
  setChanged(KEY_DAY, localDate());
}

export function setStorageReady(value: boolean): void {
  setChanged(KEY_READY, value);
}

export function setSaveError(message: string): void {
  setChanged(KEY_SAVE_ERROR, message);
}

export function workspaceRevision(): number {
  return AppStorage.get<number>(KEY_REVISION) ?? 0;
}

export function publishLifeChange(): void {
  AppStorage.setOrCreate(KEY_LIFE_REVISION, (AppStorage.get<number>(KEY_LIFE_REVISION) ?? 0) + 1);
}

export function publishCloudSessionChange(epoch: number): void {
  setChanged(KEY_CLOUD_SESSION, epoch);
}

export function applicationActive(): boolean {
  return AppStorage.get<boolean>(KEY_ACTIVE) ?? true;
}

export function remindersEnabled(): boolean {
  return AppStorage.get<boolean>(KEY_REMINDERS) ?? true;
}

export function immersiveMaterialLevel(): number {
  return AppStorage.get<number>(KEY_IMMERSIVE_MATERIAL_LEVEL) ?? DEFAULT_IMMERSIVE_MATERIAL_LEVEL;
}
