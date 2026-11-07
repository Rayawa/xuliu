import { SessionCookies } from './SessionCookies';
import { CLOUD_ORIGIN } from '../config/constants';
import { CloudAccount } from '../models/Workspace';
import { publishCloudSessionChange } from './appState';

const cookies = new SessionCookies();
let account: CloudAccount | undefined;
let visibleAccounts: CloudAccount[] = [];
let epoch: number = 0;
const invalidationListeners: Set<() => void> = new Set();

export function sessionEpoch(): number { return epoch; }
export function sessionCookie(path: string = '/'): string { return cookies.header(path); }
export function acceptSessionCookies(values: string[], path: string): void { cookies.accept(values, path, CLOUD_ORIGIN.replace(/^https:\/\//, '').split('/')[0]); }
export function currentCloudAccount(): CloudAccount | undefined {
  return account ? JSON.parse(JSON.stringify(account)) as CloudAccount : undefined;
}
export function currentCloudAccounts(): CloudAccount[] {
  return JSON.parse(JSON.stringify(visibleAccounts)) as CloudAccount[];
}

export function setCloudAccount(value: CloudAccount, accounts: CloudAccount[] = []): void {
  if (account?.id !== value.id) {
    epoch++; cookies.clearPath('/api/yiyan');
    invalidationListeners.forEach((listener) => listener());
  }
  account = value; visibleAccounts = accounts;
  publishCloudSessionChange(epoch);
}

export function clearCloudSession(): void {
  epoch++; cookies.clear(); account = undefined; visibleAccounts = [];
  invalidationListeners.forEach((listener) => listener());
  publishCloudSessionChange(epoch);
}

export function onSessionInvalidated(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return (): void => { invalidationListeners.delete(listener); };
}
