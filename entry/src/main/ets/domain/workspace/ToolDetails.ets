import { url } from '@kit.ArkTS';
import { ToolVersion, WorkspaceEntry } from '../../models/Workspace';

export function normalizeWebsiteUrl(value: string): string {
  const input = value.trim();
  if (!input || /\s/.test(input)) return '';
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
  const hostWithPort = /^[^/?#\s:]+\.\w+:\d+(?:[/?#]|$)/.test(input);
  const candidate = input.startsWith('//') ? `https:${input}` : hasScheme && !hostWithPort ? input : `https://${input}`;
  try {
    const parsed = url.URL.parseURL(candidate);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

export function toolVersions(item: WorkspaceEntry): ToolVersion[] {
  if (item.versions?.length) return item.versions;
  if (!item.version && !item.url) return [];
  return [{
    id: item.currentVersionId || `legacy-${item.id}`,
    label: item.version || '当前版本',
    url: item.url ?? '',
    note: '从原有工具记录迁移',
    createdAt: ''
  }];
}

export function currentToolVersion(item: WorkspaceEntry): ToolVersion | undefined {
  const versions = toolVersions(item);
  return versions.find((version) => version.id === item.currentVersionId) ?? versions[0];
}

export function setCurrentToolVersion(item: WorkspaceEntry, versions: ToolVersion[], id: string): void {
  const current = versions.find((version) => version.id === id);
  if (!current) return;
  item.versions = versions;
  item.currentVersionId = current.id;
  item.version = current.label;
  item.url = current.url;
}
