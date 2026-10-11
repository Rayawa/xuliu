"use client";

import { reminderTones, type ReminderTone } from "@/lib/reminder-alerts";
import type { useReminderAlerts } from "./useReminderAlerts";

export default function ReminderAlertsSettings({ alerts, readOnly }: { alerts: ReturnType<typeof useReminderAlerts>; readOnly: boolean }) {
  const { settings, permission, busy } = alerts;
  return <section className="panel alertPreferences" aria-label="通知与提示音设置">
    <div className="alertPreferenceHead"><h3>通知与提示音</h3><span>仅当前账号 · 当前设备</span></div>
    <div className="alertPreferenceGrid">
      <div className="alertPreferenceItem">
        <strong>系统通知</strong>

        <div className="alertPreferenceActions">
          <button className="softButton" role="switch" aria-checked={settings.notifications && permission === "granted"} disabled={readOnly || busy || permission === "checking" || permission === "unsupported"} onClick={() => void alerts.toggleNotifications()}>{settings.notifications ? "关闭系统通知" : "开启系统通知"}</button>
          <button className="softButton" disabled={readOnly || busy || !settings.notifications || permission !== "granted"} onClick={() => void alerts.testNotification()}>测试通知</button>
        </div>
        <small>{permission === "unsupported" ? "浏览器不支持通知" : permission === "denied" ? "通知权限已阻止" : permission === "granted" ? "通知权限已开启" : permission === "checking" ? "正在检查通知权限" : "通知权限未开启"}</small>
      </div>
      <div className="alertPreferenceItem">
        <div className="alertSoundHead"><strong>提示音</strong><button className="softButton" role="switch" aria-label="提示音开关" aria-checked={settings.sound} disabled={readOnly} onClick={() => void alerts.toggleSound()}>{settings.sound ? "已开启" : "已静音"}</button></div>
        <label className="alertSoundChoice">提示音类型<select aria-label="提示音类型" value={settings.tone} disabled={readOnly} onChange={(event) => alerts.update({ tone: event.target.value as ReminderTone })}>{Object.entries(reminderTones).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="alertVolume">提醒音量 <output>{settings.volume}%{settings.volume === 0 ? " · 静音" : ""}</output><input aria-label="提醒音量" type="range" min="0" max="100" step="5" value={settings.volume} disabled={readOnly} onChange={(event) => alerts.update({ volume: Number(event.target.value) })} /></label>
        <button className="softButton" disabled={readOnly} onClick={() => void alerts.previewSound()}>试听提示音</button>
        {settings.sound && !alerts.audioReady && <small>点击试听启用声音</small>}
      </div>
    </div>
    {alerts.message && <p className="alertFeedback" role="status">{alerts.message}</p>}

    {readOnly && <p className="alertFeedback">只读空间</p>}
  </section>;
}
