import { common, wantAgent } from '@kit.AbilityKit';
import { notificationManager } from '@kit.NotificationKit';

/** Own notifications only. No permission prompt occurs in initialization, permission checks or delivery. */
export class NativeNotifications {
  private bundle: string = '';
  private ability: string = '';
  initialize(context: common.UIAbilityContext): void { this.bundle = context.abilityInfo.bundleName; this.ability = context.abilityInfo.name; }
  async permission(): Promise<string> {
    if (!canIUse('SystemCapability.Notification.Notification')) return 'unsupported';
    try { return await notificationManager.isNotificationEnabled() ? 'granted' : 'denied'; } catch (_) { return 'error'; }
  }
  async request(context: common.UIAbilityContext): Promise<boolean> {
    if (!canIUse('SystemCapability.Notification.Notification')) return false;
    if (await notificationManager.isNotificationEnabled()) return true;
    await notificationManager.requestEnableNotification(context);
    return await notificationManager.isNotificationEnabled();
  }
  async settings(context: common.UIAbilityContext): Promise<void> {
    if (!canIUse('SystemCapability.Notification.NotificationSettings')) throw new Error('当前设备不支持打开通知设置');
    await notificationManager.openNotificationSettings(context);
  }
  private prefix(owner: string): string { return `xuliu-life:${encodeURIComponent(owner)}:`; }
  private label(owner: string, key: string): string { return this.prefix(owner) + encodeURIComponent(key); }
  async publish(owner: string, key: string, title: string, body: string, allowed: () => boolean): Promise<boolean> {
    if (!this.bundle || !this.ability || !allowed() || await this.permission() !== 'granted') return false;
    const agent = await wantAgent.getWantAgent({ wants: [{ bundleName: this.bundle, abilityName: this.ability }],
      operationType: wantAgent.OperationType.START_ABILITY, requestCode: 0, wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG] });
    if (!allowed()) return false;
    const request: notificationManager.NotificationRequest = {
      id: 0, label: this.label(owner, key), notificationSlotType: notificationManager.SlotType.OTHER_TYPES, isAlertOnce: true,
      tapDismissed: true, autoDeletedTime: Date.now() + 86400000, wantAgent: agent,
      content: { notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
        normal: { title: title.slice(0, 300) || '序流提醒', text: body.slice(0, 900) || '提醒时间到了。' } },
      // SDK NotificationFlagStatus.TYPE_CLOSE is 2. These fields are writable starting with minimum API23.
      notificationFlags: { soundEnabled: 2, vibrationEnabled: 2 }
    };
    await notificationManager.publish(request);
    if (!allowed()) { await this.cancel(owner, key); return false; }
    return true;
  }
  async cancel(owner: string, key: string): Promise<void> {
    if (!canIUse('SystemCapability.Notification.Notification')) return;
    try { await notificationManager.cancel(0, this.label(owner, key)); } catch (_) {}
  }
  async clear(owner: string): Promise<void> {
    if (!owner || !canIUse('SystemCapability.Notification.Notification')) return;
    try {
      const records = await notificationManager.getActiveNotifications(); const prefix = this.prefix(owner);
      for (const record of records) if (record.label?.startsWith(prefix)) await notificationManager.cancel(record.id ?? 0, record.label).catch(() => {});
    } catch (_) {}
  }
}
