import { NativeNotifications } from './NativeNotifications';
import { common } from '@kit.AbilityKit';
import { FocusSettings, WorkspaceEntry } from '../../models/Workspace';
import { PomodoroSession, EyeCycle, AlertSettings, LifePopup, LifeView, LegacyFocusSession } from '../../models/LifeModels';
import { focusSettings, alertSettings, pomodoroElapsed, idleEyeCycle, startEyeCycle, advanceEyeCycle, eyeRemaining } from '../../domain/life/TimerState';
import { ReminderScheduler } from '../../domain/life/ReminderScheduler';
import { ReminderSound } from './ReminderSound';
import { getWorkspace, saveWorkspace, readSetting, setSetting } from '../storage/storage';
import { currentCloudAccount } from '../../state/cloudSession';
import { applicationActive, publishLifeChange, remindersEnabled, syncCurrentDay } from '../../state/appState';
import { localDate, localTime, uid } from '../../domain/workspace/WorkspaceDomain';
import { KEY_FOCUS_SESSION, ALERT_SETTINGS_PREFIX, MAX_FOCUS_MINUTES } from '../../config/constants';

export interface FocusPatch { minutes?: number; sound?: boolean; volume?: number; }
export interface AlertPatch { sound?: boolean; tone?: string; volume?: number; notifications?: boolean; }

class LifeRuntime {
  private ready: boolean = false;
  private active: boolean = false;
  private owner: string = '';
  private settings: FocusSettings = focusSettings();
  private alerts: AlertSettings = alertSettings();
  private sessions: Map<string, PomodoroSession> = new Map();
  private focus: PomodoroSession | undefined;
  private eye: EyeCycle = idleEyeCycle();
  private reminders: WorkspaceEntry[] = [];
  private scheduler: ReminderScheduler = new ReminderScheduler();
  private notifications: NativeNotifications = new NativeNotifications();
  private notificationPermission: string = 'checking';
  private sound: ReminderSound = new ReminderSound();
  private timer: number = -1;
  private dayTimer: number = -1;
  private focusMessage: string = '';
  private message: string = '';
  private popup: LifePopup | undefined;
  private signals: LifePopup[] = [];
  private eyeAnnounced: number = 0;
  private signature: string = '';
  private scopeVersion: number = 0;
  private alertVersion: number = 0;
  private alertsReady: boolean = false;
  private focusViews: Set<string> = new Set();
  private masterEnabled: boolean = true;
  private ticking: boolean = false;
  private dismissing: boolean = false;

  initialize(context: common.UIAbilityContext): void {
    this.sound.initialize(context); this.notifications.initialize(context); this.ready = true; this.switchScope(); this.workspaceChanged();
    const old = AppStorage.get<LegacyFocusSession>(KEY_FOCUS_SESSION);
    if (old && typeof old.id === 'string' && Number.isFinite(old.elapsedMs) && old.elapsedMs >= 0 && Number.isInteger(old.durationMinutes) && old.durationMinutes >= 1 && old.durationMinutes <= MAX_FOCUS_MINUTES) {
      this.focus = { id: old.id, durationMs: old.durationMinutes * 60000, elapsedMs: Math.min(old.durationMinutes * 60000, old.elapsedMs),
        startedAt: old.running && Number.isFinite(old.startedAt) && old.startedAt > 0 ? old.startedAt : undefined };
      AppStorage.delete(KEY_FOCUS_SESSION);
    }
    this.setActive(applicationActive());
  }
  private scope(): string { return currentCloudAccount()?.id ?? 'local'; }
  private switchScope(): void {
    const owner = this.scope(); if (owner === this.owner) return;
    if (this.focus) {
      this.focus.elapsedMs = pomodoroElapsed(this.focus, Date.now()); this.focus.startedAt = undefined;
      this.sessions.set(this.owner, this.focus);
    }
    this.sound.stop(); this.notifications.clear(this.owner); this.owner = owner; const version = ++this.scopeVersion;
    this.focus = this.sessions.get(owner); this.eye = idleEyeCycle(); this.eyeAnnounced = 0;
    this.popup = undefined; this.signals = []; this.scheduler.reset(); this.focusMessage = ''; this.message = ''; this.alerts = alertSettings(); this.alertsReady = false;
    const alertVersion = this.alertVersion;
    while (this.sessions.size > 16) this.sessions.delete(this.sessions.keys().next().value as string);
    readSetting(`${ALERT_SETTINGS_PREFIX}${encodeURIComponent(owner)}`, '').then((raw) => {
      if (!this.ready || this.scopeVersion !== version) return;
      if (alertVersion === this.alertVersion) {
        try { this.alerts = alertSettings(JSON.parse(String(raw)) as AlertSettings); } catch (_) { this.alerts = alertSettings(); }
      }
      this.alertsReady = true; if (this.active) this.tick(); this.publish();
    }).catch(() => { if (this.ready && this.scopeVersion === version) { this.alertsReady = true; this.message = '提醒设置读取未完成，本次使用默认设置'; if (this.active) this.tick(); this.publish(); } });
  }
  setActive(active: boolean): void {
    this.active = active; this.sound.setActive(active); if (this.ready && active) this.refreshNotificationPermission();
    if (this.ready) { this.switchScope(); if (active) this.tick(); this.restartClock(); this.publish(); }
  }
  dispose(): void { this.scopeVersion++; this.alertsReady = false; this.owner = ''; this.ready = false; this.active = false; this.stopClock(); this.sound.setActive(false); this.signals = []; this.popup = undefined; this.sessions.clear(); this.focusViews.clear(); this.focus = undefined; this.eye = idleEyeCycle(); }
  workspaceChanged(): void {
    if (!this.ready) return;
    this.switchScope();
    const master = remindersEnabled();
    if (master !== this.masterEnabled) { this.scheduler.reset(); this.masterEnabled = master; }
    if (!master && this.popup?.kind === 'reminder') this.clearPopup();
    const data = getWorkspace(); this.settings = focusSettings(data.focusSettings); this.reminders = data.reminders;
    if (this.popup?.reminderId && !this.reminders.some((item) => item.id === this.popup?.reminderId && item.enabled && (item.snoozedUntil ?? 0) <= Date.now())) this.clearPopup();
    if (this.active) this.tick(); this.restartClock(); this.publish();
  }
  snapshot(): LifeView {
    const now = Date.now(); const remaining = this.focus ? Math.max(0, this.focus.durationMs - pomodoroElapsed(this.focus, now)) : this.settings.minutes * 60000;
    const view: LifeView = { notificationPermission: this.notificationPermission, scope: this.owner, focusVisible: this.focusViews.size > 0, alertsLoading: !this.alertsReady, enabled: this.ready && this.active, settings: this.settings, pomodoro: this.focus, remainingSeconds: Math.ceil(remaining / 1000), finished: !!this.focus && remaining <= 0,
      focusMessage: this.focusMessage, eye: this.eye, eyeRemainingSeconds: Math.ceil(eyeRemaining(this.eye, now) / 1000), alerts: this.alerts, message: this.message, popup: this.popup };
    return JSON.parse(JSON.stringify(view)) as LifeView;
  }
  private publish(): void {
    const signature = JSON.stringify(this.snapshot()); if (signature === this.signature) return; this.signature = signature;
    publishLifeChange();
  }
  private stopClock(): void {
    if (this.timer >= 0) clearInterval(this.timer); this.timer = -1;
    if (this.dayTimer >= 0) clearTimeout(this.dayTimer); this.dayTimer = -1;
  }
  private restartClock(): void {
    this.stopClock(); if (!this.ready || !this.active) return;
    if (this.focus?.startedAt !== undefined || this.eye.status === 'running' || (remindersEnabled() && this.reminders.some((item) => item.enabled))) {
      this.timer = setInterval(() => this.tick(), 1000);
    } else {
      const now = new Date(); const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      this.dayTimer = setTimeout(() => { this.dayTimer = -1; this.tick(); this.restartClock(); }, Math.max(1, next - now.getTime() + 25));
    }
  }
  private tick(): void {
    if (!this.ready || !this.active || this.ticking) return; this.ticking = true;
    try {
      this.switchScope(); const now = Date.now();
      syncCurrentDay();
      if (this.focus?.startedAt !== undefined && pomodoroElapsed(this.focus, now) >= this.focus.durationMs) {
        this.focus.elapsedMs = this.focus.durationMs; this.focus.startedAt = undefined; this.focusMessage = '时间到。';
        this.enqueue({ id: `focus:${this.focus.id}`, kind: 'focus', title: '番茄钟时间到', body: '这一轮已经完成，休息一下吧。' });
        const id = this.focus.id; const owner = this.owner;
        if (this.settings.sound && this.settings.volume > 0) this.sound.play('double', this.settings.volume).then((played) => {
          if (!played && this.active && this.owner === owner && this.focus?.id === id) { this.focusMessage = '时间到。提示音未能播放，可在设置中试听。'; this.publish(); }
        });
        this.restartClock();
      }
      advanceEyeCycle(this.eye, now);
      if (this.eye.transition && this.eye.transition.at !== this.eyeAnnounced) {
        this.eyeAnnounced = this.eye.transition.at; const rest = this.eye.transition.phase === 'rest';
        this.enqueue({ id: `eye:${this.eyeAnnounced}`, kind: 'eye', title: rest ? '该休息眼睛了' : '下一轮已经开始',
          body: rest ? '已专注30分钟。接下来休息5分钟，看看远处、起身活动一下吧。' : '5分钟休息结束，新的30分钟专注计时已自动开始。' });
        this.playAlert();
      }
      if (this.alertsReady && remindersEnabled()) this.scheduler.check(this.reminders, now);
      if (!this.popup) this.nextPopup(now);
      this.publish();
    } finally { this.ticking = false; }
  }
  private enqueue(popup: LifePopup): void {
    this.signals = this.signals.filter((item) => item.kind !== popup.kind); this.signals.push(popup);
  }
  private nextPopup(now: number): void {
    this.popup = this.signals.shift(); if (this.popup) { if (this.popup.kind === 'eye') this.notifyPopup(this.popup); return; }
    if (!this.alertsReady || !remindersEnabled()) return;
    const due = this.scheduler.take(this.reminders, now); const reminder = due && this.reminders.find((item) => item.id === due.id && item.enabled);
    if (!due || !reminder) return;
    this.popup = { id: uid(), kind: 'reminder', reminderId: due.id, firedKey: due.firedKey, title: reminder.title,
      body: due.reason === 'interval' ? `已经过了${reminder.intervalMinutes ?? 20}分钟，看看远处、活动一下吧。完成或关闭后重新计时，也可以稍后5分钟。` : '提醒时间到了。可以完成、稍后5分钟或关闭。' };
    this.playAlert(); this.notifyPopup(this.popup);
    if (due.reason !== 'interval') {
      const data = getWorkspace(); const item = data.reminders.find((value) => value.id === due.id);
      if (item) { item.lastFired = due.firedKey ?? `${localDate()}-${localTime()}`; item.snoozedUntil = undefined; saveWorkspace(data).catch(() => {}); }
    }
  }
  private playAlert(): void {
    const owner = this.owner;
    if (this.alerts.sound && this.alerts.volume > 0) this.sound.play(this.alerts.tone, this.alerts.volume).then((played) => {
      if (!played && this.active && owner === this.owner) { this.message = '提示音未能播放，页面提醒仍然保留'; this.publish(); }
    });
  }
  toggleFocus(): void {
    if (!this.ready || !this.active) return; this.switchScope(); const now = Date.now();
    if (this.focus?.startedAt !== undefined && pomodoroElapsed(this.focus, now) >= this.focus.durationMs) { this.tick(); this.restartClock(); return; }
    if (this.focus?.startedAt !== undefined) {
      this.focus.elapsedMs = pomodoroElapsed(this.focus, now); this.focus.startedAt = undefined;
    } else if (this.focus && this.focus.elapsedMs < this.focus.durationMs) this.focus.startedAt = now;
    else this.focus = { id: uid(), durationMs: this.settings.minutes * 60000, elapsedMs: 0, startedAt: now };
    this.focusMessage = '';
    if (this.popup?.kind === 'focus' && this.popup.id !== `focus:${this.focus?.id}`) this.clearPopup();
    this.tick(); this.restartClock(); this.publish();
  }
  resetFocus(): void {
    if (!this.ready || !this.active) return;
    this.focus = undefined; this.sessions.delete(this.owner); this.focusMessage = ''; this.signals = this.signals.filter((item) => item.kind !== 'focus');
    if (this.popup?.kind === 'focus') this.clearPopup(); this.tick(); this.restartClock(); this.publish();
  }
  eyeAction(action: string): void {
    if (!this.ready || !this.active) return; this.switchScope(); const now = Date.now();
    if (action === 'start') { this.eye = startEyeCycle(now); this.eyeAnnounced = 0; }
    else if (action === 'pause' && this.eye.status === 'running') { advanceEyeCycle(this.eye, now); this.eye.remainingMs = eyeRemaining(this.eye, now); this.eye.deadline = undefined; this.eye.status = 'paused'; }
    else if (action === 'resume' && this.eye.status === 'paused') { this.eye.status = 'running'; this.eye.deadline = now + this.eye.remainingMs; }
    else if (action === 'stop') { this.eye = idleEyeCycle(); this.eyeAnnounced = 0; this.signals = this.signals.filter((item) => item.kind !== 'eye'); if (this.popup?.kind === 'eye') this.clearPopup(); }
    this.tick(); this.restartClock(); this.publish();
  }
  async saveFocus(patch: FocusPatch): Promise<void> {
    if (!this.ready) return; const data = getWorkspace(); const next = focusSettings(data.focusSettings);
    if (patch.minutes !== undefined) {
      if (this.focus && patch.minutes !== this.settings.minutes) throw new Error('本轮计时存在，重置后再修改时长');
      if (!Number.isInteger(patch.minutes) || patch.minutes < 1 || patch.minutes > MAX_FOCUS_MINUTES) throw new Error('时长应为1–180分钟'); next.minutes = patch.minutes;
    }
    if (patch.sound !== undefined) next.sound = patch.sound;
    if (patch.volume !== undefined) { if (!Number.isFinite(patch.volume)) throw new Error('音量无效'); next.volume = Math.max(0, Math.min(100, Math.round(patch.volume))); }
    data.focusSettings = next; await saveWorkspace(data); this.workspaceChanged();
  }
  async saveAlerts(patch: AlertPatch): Promise<void> {
    if (!this.ready || !this.alertsReady) throw new Error('提醒设置仍在读取，请稍后');
    const previous = this.alerts; const next = alertSettings(this.alerts);
    if (patch.sound !== undefined) next.sound = patch.sound; if (patch.tone !== undefined) next.tone = patch.tone;
    if (patch.volume !== undefined) next.volume = patch.volume; if (patch.notifications !== undefined) next.notifications = patch.notifications;
    this.alerts = alertSettings(next); const owner = this.owner; const version = ++this.alertVersion; this.publish();
    if (!this.alerts.sound || this.alerts.volume === 0) this.sound.stop();
    if (!this.alerts.notifications) this.notifications.clear(owner);
    try { await setSetting(`${ALERT_SETTINGS_PREFIX}${encodeURIComponent(owner)}`, JSON.stringify(this.alerts)); }
    catch (error) { if (owner === this.owner && version === this.alertVersion) { this.alerts = previous; this.publish(); } throw error as Error; }
  }
  async previewSound(focus: boolean): Promise<void> {
    const owner = this.owner; const volume = focus ? this.settings.volume : this.alerts.volume;
    const played = volume > 0 && await this.sound.play(focus ? 'double' : this.alerts.tone, volume);
    if (owner !== this.owner || !this.active) return;
    const message = volume === 0 ? '当前提示音音量为0。' : played ? '正在试听提示音。' : '暂时无法播放提示音，请检查设备声音设置。';
    if (focus) this.focusMessage = message; else this.message = message; this.publish();
  }
  async dismissPopup(snooze: boolean = false): Promise<void> {
    const popup = this.popup; if (!popup || this.dismissing) return; this.dismissing = true;
    try {
      if (popup.reminderId) {
        this.scheduler.dismiss(popup.reminderId, this.reminders, Date.now());
        if (snooze) { const data = getWorkspace(); const item = data.reminders.find((value) => value.id === popup.reminderId); if (item) { item.snoozedUntil = Date.now() + 300000; await saveWorkspace(data); } }
      }
      if (this.popup?.id === popup.id) this.clearPopup(); this.tick(); this.publish();
    } finally { this.dismissing = false; }
  }
  private clearPopup(): void {
    if (this.popup && (this.popup.kind === 'eye' || this.popup.kind === 'reminder')) this.notifications.cancel(this.owner, this.popup.reminderId ?? this.popup.id);
    this.popup = undefined;
  }
  private notifyPopup(popup: LifePopup): void {
    const owner = this.owner; const scope = this.scopeVersion;
    if (!this.alerts.notifications) return;
    this.notifications.publish(owner, popup.reminderId ?? popup.id, popup.title, popup.body,
      () => this.ready && this.owner === owner && this.scopeVersion === scope && this.alerts.notifications && this.popup?.id === popup.id)
      .catch(() => { if (this.owner === owner) { this.message = '系统通知未能提交，页面提醒仍然保留'; this.publish(); } });
  }
  async refreshNotificationPermission(): Promise<void> {
    const value = await this.notifications.permission(); if (!this.ready) return;
    this.notificationPermission = value; this.publish();
  }
  async enableNotifications(context: common.UIAbilityContext): Promise<void> {
    const scope = this.scopeVersion;
    try {
      const enabled = await this.notifications.request(context);
      if (!this.ready || scope !== this.scopeVersion) return;
      await this.saveAlerts({ notifications: enabled });
      this.message = enabled ? '系统通知已开启，可使用测试通知核对设备设置' : '系统通知未开启，页面提醒仍然保留';
    } catch (_) { if (scope === this.scopeVersion) this.message = '系统通知未开启，可在系统通知设置中调整；页面提醒仍保留'; }
    await this.refreshNotificationPermission(); this.publish();
  }
  async openNotificationSettings(context: common.UIAbilityContext): Promise<void> {
    await this.notifications.settings(context); await this.refreshNotificationPermission();
  }
  async previewNotification(): Promise<void> {
    const owner = this.owner; const scope = this.scopeVersion;
    try {
      if (!this.alerts.notifications) { this.message = '请先开启系统通知'; this.publish(); return; }
      const shown = await this.notifications.publish(owner, 'test', '序流 · 通知测试', '这是一条测试通知。可在通知中心查看；点击可回到序流。',
        () => this.ready && this.scopeVersion === scope && this.owner === owner && this.alerts.notifications);
      if (this.scopeVersion === scope) this.message = shown ? '已提交通知，可检查通知中心和系统设置' : '通知权限未开启，页面提醒仍保留';
    } catch (_) { if (this.scopeVersion === scope) this.message = '测试通知提交失败，请检查系统通知设置'; }
    this.publish();
  }
  setFocusVisible(id: string, visible: boolean): void {
    if (visible) this.focusViews.add(id); else this.focusViews.delete(id); this.publish();
  }
  previewReminder(id: string): void {
    const reminder = this.reminders.find((item) => item.id === id); if (!reminder) return;
    this.enqueue({ id: uid(), kind: 'preview', title: reminder.title, body: reminder.type === 'break' ? `每${reminder.intervalMinutes ?? 20}分钟自动提醒。本次预览不会改变计时或提醒设置。` : '固定时间到达后会弹出提示。本次预览不会改变提醒设置。' });
    this.tick();
  }
}

const runtime = new LifeRuntime();
export function lifeRuntime(): LifeRuntime { return runtime; }
