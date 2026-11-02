import { CloudAccount } from '../models/Workspace';
import { KEY_CLOUD_SESSION } from '../config/constants';

let cookie: string = '';
let account: CloudAccount | undefined;
let visibleAccounts: CloudAccount[] = [];
let epoch: number = 0;
const invalidationListeners: Set<() => void> = new Set();

export function sessionEpoch(): number { return epoch; }
export function sessionCookie(): string { return cookie; }
export function acceptSessionCookie(value: string): void { cookie = value; }
export function currentCloudAccount(): CloudAccount | undefined {
  return account ? JSON.parse(JSON.stringify(account)) as CloudAccount : undefined;
}
export function currentCloudAccounts(): CloudAccount[] {
  return JSON.parse(JSON.stringify(visibleAccounts)) as CloudAccount[];
}

export function setCloudAccount(value: CloudAccount, accounts: CloudAccount[] = []): void {
  if (account?.id !== value.id) {
    epoch++;
    invalidationListeners.forEach((listener) => listener());
  }
  account = value; visibleAccounts = accounts;
  AppStorage.setOrCreate(KEY_CLOUD_SESSION, epoch);
}

export function clearCloudSession(): void {
  epoch++; cookie = ''; account = undefined; visibleAccounts = [];
  invalidationListeners.forEach((listener) => listener());
  AppStorage.setOrCreate(KEY_CLOUD_SESSION, epoch);
}

export function onSessionInvalidated(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return (): void => { invalidationListeners.delete(listener); };
}
