import { KEY_DAY } from '../config/constants';
import { localDate } from '../domain/workspace/WorkspaceDomain';
import { KEY_ACTIVE, KEY_READY, KEY_REVISION, KEY_SAVE_ERROR } from '../config/constants';

export function initializeAppState(): void {
  AppStorage.setOrCreate(KEY_DAY, localDate());
  AppStorage.setOrCreate(KEY_ACTIVE, true);
  AppStorage.setOrCreate(KEY_READY, false);
  AppStorage.setOrCreate(KEY_REVISION, 0);
  AppStorage.setOrCreate(KEY_SAVE_ERROR, '');
}

export function setApplicationActive(value: boolean): void {
  AppStorage.setOrCreate(KEY_ACTIVE, value);
}

export function publishWorkspaceChange(): void {
  AppStorage.setOrCreate(KEY_REVISION, (AppStorage.get<number>(KEY_REVISION) ?? 0) + 1);
}
