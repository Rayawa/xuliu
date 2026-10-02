"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { alertSettingsKey, defaultAlertSettings, normalizeAlertSettings, notificationPermission, ReminderSoundPlayer, showSystemReminder, type AlertSettings } from "@/lib/reminder-alerts";

export function useReminderAlerts(owner: string) {
  const [settings, setSettings] = useState<AlertSettings>(defaultAlertSettings);
  const settingsRef = useRef<AlertSettings>(defaultAlertSettings);
  const [permission, setPermission] = useState<ReturnType<typeof notificationPermission> | "checking">("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const player = useRef(new ReminderSoundPlayer());
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    const soundPlayer = player.current;
    settingsRef.current = defaultAlertSettings;
    setSettings(defaultAlertSettings);
    setAudioReady(false);
    setMessage("");
    try {
      const raw = localStorage.getItem(alertSettingsKey(owner));
      settingsRef.current = normalizeAlertSettings(raw ? JSON.parse(raw) : null);
      setSettings(settingsRef.current);
    } catch { setMessage("浏览器未允许保存设置，本次打开仍可使用。"); }
    const refreshPermission = () => setPermission(notificationPermission());
    const activateAudio = () => {
      if (settingsRef.current.sound) void soundPlayer.unlock().then((ready) => { if (alive.current) setAudioReady(ready); }).catch(() => {});
    };
    refreshPermission();
    window.addEventListener("focus", refreshPermission);
    document.addEventListener("visibilitychange", refreshPermission);
    document.addEventListener("pointerdown", activateAudio);
    document.addEventListener("keydown", activateAudio);
    return () => {
      alive.current = false;
      soundPlayer.dispose();
      window.removeEventListener("focus", refreshPermission);
      document.removeEventListener("visibilitychange", refreshPermission);
      document.removeEventListener("pointerdown", activateAudio);
      document.removeEventListener("keydown", activateAudio);
    };
  }, [owner]);

  const update = useCallback((patch: Partial<AlertSettings>) => {
    const next = normalizeAlertSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    if (!next.sound || next.volume === 0) player.current.stop();
    try { localStorage.setItem(alertSettingsKey(owner), JSON.stringify(next)); }
    catch { setMessage("设置仅对本次打开有效：浏览器禁止保存本地设置。"); }
  }, [owner]);

  const toggleNotifications = async () => {
    if (settingsRef.current.notifications) { update({ notifications: false }); setMessage("系统通知已关闭，页面弹窗仍然保留。"); return; }
    if (notificationPermission() === "unsupported") { setMessage("当前浏览器不支持系统通知，请尝试在 Chrome 或 Edge 中打开 HTTPS 网站。"); return; }
    setBusy(true);
    try {
      // Must be invoked directly by a user click, never by a timer or page load.
      const result = await Notification.requestPermission();
      if (!alive.current) return;
      setPermission(result);
      update({ notifications: result === "granted" });
      setMessage(result === "granted" ? "已开启。可以点“测试通知”检查系统是否允许显示。" : result === "denied" ? "通知被浏览器阻止。请点击地址栏的网站权限，将通知改为允许。" : "尚未授权，继续使用页面弹窗。");
    } catch { setMessage("无法请求通知权限，页面弹窗仍可使用。"); }
    finally { if (alive.current) setBusy(false); }
  };

  const toggleSound = async () => {
    const enabled = !settingsRef.current.sound;
    update({ sound: enabled });
    if (!enabled) { setMessage("提示音已关闭。"); return; }
    try {
      const ready = await player.current.unlock();
      if (alive.current) { setAudioReady(ready); setMessage(ready ? "提示音已开启，可以选择铃声并试听。" : "当前浏览器无法播放提示音。"); }
    } catch { if (alive.current) setMessage("声音尚未激活，请点击“试听提示音”重试。"); }
  };

  const previewSound = async () => {
    try {
      const ready = await player.current.unlock();
      if (!alive.current) return;
      setAudioReady(ready);
      const current = settingsRef.current;
      const played = player.current.play(current.tone, current.volume);
      setMessage(played ? "正在试听所选提示音，不会修改提醒时间。" : current.volume === 0 ? "当前音量为 0%，请调高后试听。" : "声音被浏览器限制，请点击页面后再试。");
    } catch { if (alive.current) setMessage("当前无法播放声音，页面和系统通知不受影响。"); }
  };

  const testNotification = async () => {
    setBusy(true);
    try {
      const shown = await showSystemReminder(owner, "test", "序流 · 通知测试", "看到这条提示，说明系统通知可以使用。提醒音量请在网页内单独设置。", () => alive.current && settingsRef.current.notifications);
      if (alive.current) setMessage(shown ? "已提交测试通知。如果未看到，请检查系统通知中心和勿扰设置。" : "请先开启系统通知并允许浏览器通知权限。");
    } catch { if (alive.current) setMessage("测试通知发送失败，请检查浏览器通知权限；页面弹窗仍保留。"); }
    finally { if (alive.current) setBusy(false); }
  };

  const deliver = useCallback(async (id: string, title: string, body: string, background: boolean, stillAllowed: () => boolean) => {
    const current = settingsRef.current;
    if (!alive.current || !stillAllowed()) return false;
    let delivered = false;
    if (current.sound && current.volume > 0) {
      try {
        delivered = player.current.play(current.tone, current.volume);
        if (!delivered) { setAudioReady(false); setMessage("提示音尚未激活或被浏览器暂停。回到页面点“试听提示音”，其他提醒仍保留。"); }
      } catch { setMessage("提示音播放失败，其他提醒仍保留。"); }
    }
    if (background && current.notifications) {
      try {
        delivered = await showSystemReminder(owner, id, title, body, () => alive.current && settingsRef.current.notifications && stillAllowed()) || delivered;
        if (notificationPermission() !== "granted" && alive.current) setMessage("系统通知权限已被关闭，请重新允许；页面弹窗仍保留。");
      } catch { if (alive.current) setMessage("系统通知暂时发送失败，返回序流时仍会显示页面提醒。"); }
    }
    return delivered;
  }, [owner]);

  return { settings, permission, message, busy, audioReady, update, toggleNotifications, toggleSound, previewSound, testNotification, deliver };
}
