"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReminderSoundPlayer } from "@/lib/reminder-alerts";
import { pomodoroElapsed, pomodoroStorageKey, restorePomodoroSession, type PomodoroSession } from "@/lib/pomodoro";
import type { FocusSettings } from "@/lib/task-time";
import "./FocusTimer.css";

const clock = (seconds: number) => String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");

export function usePomodoroTimer({ scope, enabled, preview, settings }: { scope: string; enabled: boolean; preview: boolean; settings: FocusSettings }) {
  const [session, setSession] = useState<PomodoroSession | null>(null);
  const sessionRef = useRef<PomodoroSession | null>(null);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState("");
  const [sound] = useState(() => new ReminderSoundPlayer());
  const storageKey = pomodoroStorageKey(scope);
  const storageRef = useRef(storageKey);
  const latest = useRef({ enabled, settings });
  latest.current = { enabled, settings };
  const write = useCallback((next: PomodoroSession | null) => {
    sessionRef.current = next; setSession(next); setNow(Date.now());
    if (!preview) try {
      if (next) sessionStorage.setItem(storageRef.current, JSON.stringify(next));
      else sessionStorage.removeItem(storageRef.current);
    } catch { setMessage("计时仍可使用，刷新后可能无法保留本轮。"); }
  }, [preview]);

  useEffect(() => {
    if (storageRef.current !== storageKey && sessionRef.current && !preview) try {
      const value = sessionRef.current;
      sessionStorage.setItem(storageRef.current, JSON.stringify({ ...value, elapsed: pomodoroElapsed(value, Date.now()), startedAt: null }));
    } catch { /* Preserve other account snapshots without affecting workspace data. */ }
    storageRef.current = storageKey;
    let restored: PomodoroSession | null = null;
    if (!preview) try { restored = restorePomodoroSession(JSON.parse(sessionStorage.getItem(storageKey) || "null")); } catch { /* Invalid local snapshots do not change cloud data. */ }
    sessionRef.current = restored; setSession(restored); setNow(Date.now()); setMessage("");
  }, [storageKey, preview]);
  useEffect(() => () => sound.dispose(), [sound]);
  useEffect(() => {
    if (!enabled || session?.startedAt == null) return;
    const tick = () => {
      const value = sessionRef.current;
      if (!value || value.startedAt === null || !latest.current.enabled) return;
      const at = Date.now(); setNow(at);
      if (pomodoroElapsed(value, at) >= value.duration) {
        write({ ...value, elapsed: value.duration, startedAt: null });
        setMessage("时间到。");
        const options = latest.current.settings;
        if (options.sound && options.volume > 0 && !sound.play("double", options.volume)) setMessage("时间到。提示音未能播放，可在设置中试听。");
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [enabled, session?.id, session?.startedAt, sound, write]);

  const start = () => {
    if (!enabled || sessionRef.current?.startedAt != null) return;
    const value = sessionRef.current;
    const next = value && value.elapsed < value.duration ? { ...value, startedAt: Date.now() } : { id: crypto.randomUUID(), duration: settings.minutes * 60, elapsed: 0, startedAt: Date.now() };
    setMessage(""); write(next);
    const key = storageRef.current;
    if (settings.sound) void sound.unlock().then((ready) => {
      if (!ready && storageRef.current === key && sessionRef.current?.id === next.id) setMessage("提示音尚未激活，计时仍会继续。");
    }).catch(() => { if (storageRef.current === key && sessionRef.current?.id === next.id) setMessage("提示音尚未激活，计时仍会继续。"); });
  };
  const pause = () => {
    const value = sessionRef.current;
    if (value && enabled) write({ ...value, elapsed: pomodoroElapsed(value, Date.now()), startedAt: null });
  };
  const previewSound = async () => {
    const key = storageRef.current;
    if (settings.volume === 0) { setMessage("当前提示音音量为 0。"); return; }
    try {
      const ready = await sound.unlock();
      if (storageRef.current === key) setMessage(ready && sound.play("double", settings.volume) ? "正在试听提示音。" : "无法播放提示音，请检查浏览器声音权限。");
    } catch { if (storageRef.current === key) setMessage("浏览器暂时无法播放提示音。"); }
  };
  const elapsed = session ? pomodoroElapsed(session, now) : 0;
  return {
    session, running: session?.startedAt != null, finished: Boolean(session && elapsed >= session.duration), enabled, settings, message,
    seconds: session ? Math.max(0, Math.ceil(session.duration - elapsed)) : settings.minutes * 60,
    start, pause, previewSound, reset: () => { if (enabled) { setMessage(""); write(null); } },
  };
}
export type PomodoroController = ReturnType<typeof usePomodoroTimer>;

export default function FocusTimer({ controller: c, onSettings }: { controller: PomodoroController; onSettings: (value: FocusSettings) => void }) {
  return <section className="panel focusPanel pomodoroPanel" aria-label="番茄钟">
    <h2>番茄钟</h2>
    <div className="timerValue" role="timer" aria-label="番茄钟剩余时间">{clock(c.seconds)}</div>
    <div className="timerActions"><button type="button" className="primaryButton" disabled={!c.enabled} onClick={() => c.running ? c.pause() : c.start()}>{c.running ? "暂停" : c.finished ? "再来一轮" : c.session ? "继续" : "开始"}</button><button type="button" className="softButton" disabled={!c.enabled || !c.session} onClick={c.reset}>重置</button></div>
    <details className="focusSettings"><summary>时长与声音</summary><label>番茄钟时长（分钟）<input aria-label="番茄钟时长（分钟）" type="number" min="1" max="180" value={c.settings.minutes} disabled={!c.enabled || Boolean(c.session)} onChange={(event) => { const minutes = Number(event.target.value); if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 180) onSettings({ ...c.settings, minutes }); }} /></label><label className="focusSoundToggle"><input type="checkbox" checked={c.settings.sound} disabled={!c.enabled} onChange={(event) => onSettings({ ...c.settings, sound: event.target.checked })} />结束时播放提示音</label><label>提示音音量 · {c.settings.volume}%<input aria-label="提示音音量" type="range" min="0" max="100" value={c.settings.volume} disabled={!c.enabled} onChange={(event) => onSettings({ ...c.settings, volume: Number(event.target.value) })} /></label><button type="button" className="softButton" onClick={() => void c.previewSound()}>试听提示音</button></details>
    {c.message && <p className="focusMessage" role="status">{c.message}</p>}
  </section>;
}
