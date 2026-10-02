"use client";

import { reminderTones, type ReminderTone } from "@/lib/reminder-alerts";
import type { useReminderAlerts } from "./useReminderAlerts";

export default function ReminderAlertsSettings({ alerts, readOnly }: { alerts: ReturnType<typeof useReminderAlerts>; readOnly: boolean }) {
  const { settings, permission, busy } = alerts;
  return <section className="panel alertPreferences" aria-label="通知与提示音设置">
    <div className="alertPreferenceHead"><h3>通知与提示音</h3><span>仅当前账号 · 当前设备</span></div>
    <div className="alertPreferenceGrid">
      <div className="alertPreferenceItem">
        <strong>切到其他网页也能提醒</strong>
        <p>使用系统通知，点击通知可返回序流；序流页面内的弹窗始终保留。</p>
        <div className="alertPreferenceActions">
          <button className="softButton" role="switch" aria-checked={settings.notifications && permission === "granted"} disabled={readOnly || busy || permission === "checking" || permission === "unsupported"} onClick={() => void alerts.toggleNotifications()}>{settings.notifications ? "关闭系统通知" : "开启系统通知"}</button>
          <button className="softButton" disabled={readOnly || busy || !settings.notifications || permission !== "granted"} onClick={() => void alerts.testNotification()}>测试通知</button>
        </div>
        <small>{permission === "unsupported" ? "此浏览器不支持，请使用支持通知的浏览器打开网站。" : permission === "denied" ? "通知被阻止：请在地址栏的网站权限里允许通知。" : permission === "granted" ? "浏览器已允许通知；也请检查系统勿扰模式。" : "首次开启时，请在浏览器弹出的权限提示中选择允许。"}</small>
      </div>
      <div className="alertPreferenceItem">
        <div className="alertSoundHead"><strong>提示音</strong><button className="softButton" role="switch" aria-label="提示音开关" aria-checked={settings.sound} disabled={readOnly} onClick={() => void alerts.toggleSound()}>{settings.sound ? "已开启" : "已静音"}</button></div>
        <label className="alertSoundChoice">提示音类型<select aria-label="提示音类型" value={settings.tone} disabled={readOnly} onChange={(event) => alerts.update({ tone: event.target.value as ReminderTone })}>{Object.entries(reminderTones).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="alertVolume">提醒音量 <output>{settings.volume}%{settings.volume === 0 ? " · 静音" : ""}</output><input aria-label="提醒音量" type="range" min="0" max="100" step="5" value={settings.volume} disabled={readOnly} onChange={(event) => alerts.update({ volume: Number(event.target.value) })} /></label>
        <button className="softButton" disabled={readOnly} onClick={() => void alerts.previewSound()}>试听提示音</button>
        <small>只调节序流提示音，不改变系统音量。{settings.sound && !alerts.audioReady ? "刷新后请点击页面或试听一次以激活声音。" : "声音仍受系统音量、设备静音和浏览器限制。"}</small>
      </div>
    </div>
    {alerts.message && <p className="alertFeedback" role="status">{alerts.message}</p>}
    <p className="alertLimitations">请保持网页和浏览器打开。后台标签页、锁屏、休眠可能延迟提醒；不支持浏览器关闭后的定时推送。系统通知本身静音，由上方设置单独控制提示音。</p>
    {readOnly && <p className="alertFeedback">正在查看对方的空间；这里的提醒和通知设置不会触发或被修改。</p>}
  </section>;
}
