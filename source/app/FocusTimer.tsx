"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReminderSoundPlayer } from "@/lib/reminder-alerts";
import { elapsedSeconds, restoreFocusSession, type FocusSession, type FocusSettings, type TimeEntry, type WorkTarget } from "@/lib/task-time";

export type FocusChoice = WorkTarget & { title: string; done: boolean; group: "长期任务" | "短期任务" | "事项"; listed: boolean };
const keyOf = (target: WorkTarget) => `${target.kind}:${target.id}`;
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(Math.floor(seconds % 60)).padStart(2,"0")}`;

export function useFocusTimer({ scope, enabled, preview, choices, settings, onRecord }: {
  scope: string; enabled: boolean; preview: boolean; choices: FocusChoice[]; settings: FocusSettings;
  onRecord: (entry: TimeEntry) => void;
}) {
  const [session, setSession] = useState<FocusSession | null>(null);
  const sessionRef = useRef<FocusSession | null>(null);
  const [mode, setMode] = useState<"pomodoro" | "stopwatch">("pomodoro");
  const [selection, setSelection] = useState("");
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState("");
  const sound = useRef(new ReminderSoundPlayer());
  const storageKey = `xuliu:focus-session:v1:${scope}`;
  const current = useRef({ enabled, choices, settings, onRecord });
  current.current = { enabled, choices, settings, onRecord };
  const storageRef = useRef(storageKey);

  const write = (next: FocusSession | null) => {
    sessionRef.current = next; setSession(next); setNow(Date.now());
    if (!preview) try { if (next) sessionStorage.setItem(storageRef.current, JSON.stringify(next)); else sessionStorage.removeItem(storageRef.current); }
    catch { setMessage("当前浏览器不能保存计时状态，刷新前请结束并记入时间。"); }
  };
  useEffect(() => {
    if (storageRef.current !== storageKey && sessionRef.current) {
      const previous = sessionRef.current;
      if (!preview) try { sessionStorage.setItem(storageRef.current, JSON.stringify({ ...previous, elapsed: elapsedSeconds(previous, Date.now()), startedAt: null })); } catch { /* Existing session remains on its original account. */ }
    }
    storageRef.current = storageKey;
    sessionRef.current = null; setSession(null); setSelection(""); setMessage("");
    if (!preview) try {
      const restored = restoreFocusSession(JSON.parse(sessionStorage.getItem(storageKey) || "null"));
      sessionRef.current = restored; setSession(restored);
      if (restored) { setMode(restored.mode); setMessage("已恢复本页计时。若需要声音提醒，请点一次“试听提示音”。"); }
    } catch { /* A malformed local snapshot does not affect cloud data. */ }
    setNow(Date.now());
  }, [storageKey, preview]);
  useEffect(() => () => sound.current.dispose(), []);

  const settle = (automatic = false) => {
    const value = sessionRef.current;
    if (!value || !current.current.enabled) return;
    const seconds = elapsedSeconds(value, Date.now());
    if (seconds < 1) { setMessage("尚无可记录的时间，请先开始计时。"); return; }
    const minutes = Math.max(1, Math.round(seconds / 60));
    try {
      current.current.onRecord({ id: value.id, taskId: value.target.id, targetKind: value.target.kind, minutes, date: day(), mode: value.mode });
      write(null);
      setMessage(`${automatic ? "本轮计时结束，" : ""}已记入 ${minutes} 分钟。`);
      if (automatic && current.current.settings.sound && current.current.settings.volume > 0) {
        if (!sound.current.play("double", current.current.settings.volume)) setMessage(`本轮已记入 ${minutes} 分钟。提示音被浏览器暂停，请点击“试听提示音”激活。`);
      }
    } catch (error) {
      write({ ...value, elapsed: seconds, startedAt: null });
      setMessage(error instanceof Error ? error.message : "时间尚未保存，请重试。");
    }
  };
  const settleRef = useRef(settle); settleRef.current = settle;
  useEffect(() => {
    if (!enabled || !session?.startedAt) return;
    const tick = () => {
      const value = sessionRef.current;
      if (!value?.startedAt || !current.current.enabled) return;
      const at = Date.now(); setNow(at);
      if (elapsedSeconds(value, at) >= (value.mode === "pomodoro" ? value.duration : 86400)) settleRef.current(true);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [enabled, session?.id, session?.startedAt]);

  const selectedKey = session ? keyOf(session.target) : (choices.some(t => keyOf(t) === selection) ? selection : choices.find(t => t.listed && !t.done) ? keyOf(choices.find(t => t.listed && !t.done)!) : "");
  const start = (target?: WorkTarget) => {
    if (!enabled) return;
    const value = sessionRef.current;
    if (value && target && keyOf(value.target) !== keyOf(target)) { setMessage("请先结束当前任务的计时，再切换到另一项任务。"); return; }
    const choice = choices.find(t => keyOf(t) === (target ? keyOf(target) : selectedKey));
    if (!choice) { setMessage("请先选择一项任务。"); return; }
    if (settings.sound) void sound.current.unlock().then(ready => { if (!ready) setMessage("当前浏览器未能激活提示音，计时仍会继续。"); }).catch(() => setMessage("声音尚未激活，请点击试听重试。"));
    if (value?.startedAt != null) return;
    const next = value ? { ...value, startedAt: Date.now() } : { id: crypto.randomUUID(), target: { kind: choice.kind, id: choice.id }, mode, duration: settings.minutes * 60, elapsed: 0, startedAt: Date.now() };
    setSelection(keyOf(next.target));
    write(next); setMessage("");
  };
  const pause = () => { const value = sessionRef.current; if (value && enabled) write({ ...value, elapsed: elapsedSeconds(value, Date.now()), startedAt: null }); };
  const previewSound = async () => {
    if (settings.volume === 0) { setMessage("当前提示音音量为 0，请先调高音量。"); return; }
    try { const ready = await sound.current.unlock(); setMessage(ready && sound.current.play("double", settings.volume) ? "正在试听提示音。" : "无法播放提示音，请检查浏览器声音权限和音量。"); }
    catch { setMessage("浏览器暂时无法播放提示音。"); }
  };
  const elapsed = session ? elapsedSeconds(session, now) : 0;
  const select = useCallback((value: string) => { if (!sessionRef.current) setSelection(value); }, []);
  return { session, mode: session?.mode ?? mode, selectedKey, message, enabled, settings,
    seconds: session ? Math.ceil(session.mode === "pomodoro" ? session.duration - elapsed : elapsed) : mode === "pomodoro" ? settings.minutes * 60 : 0,
    setMode: (next: typeof mode) => { if (!sessionRef.current) setMode(next); },
    select, start, pause, finish: () => settle(), previewSound,
    discard: () => { if (enabled) { write(null); setMessage("已重置本轮，未计入累计时间。"); } },
  };
}
export type FocusController = ReturnType<typeof useFocusTimer>;

export default function FocusTimer({ controller: c, choices, onSettings, onManual, onOpen }: {
  controller: FocusController; choices: FocusChoice[]; onSettings: (value: FocusSettings) => void; onManual: (target: WorkTarget) => void; onOpen: (target: WorkTarget) => void;
}) {
  const selected = choices.find(t => keyOf(t) === c.selectedKey);
  const visibleChoices = choices.filter((choice) => choice.listed || keyOf(choice) === c.selectedKey);
  const groupedChoices = (["长期任务", "短期任务", "事项"] as const).map((group) => ({ group, choices: visibleChoices.filter((choice) => choice.group === group) })).filter((entry) => entry.choices.length);
  const [resetConfirm, setResetConfirm] = useState(false);
  return <section className="panel focusPanel" aria-label="任务计时器">
    <div className="modeSwitch"><button disabled={!c.enabled || Boolean(c.session)} className={c.mode === "pomodoro" ? "active" : ""} onClick={() => c.setMode("pomodoro")}>番茄钟</button><button disabled={!c.enabled || Boolean(c.session)} className={c.mode === "stopwatch" ? "active" : ""} onClick={() => c.setMode("stopwatch")}>正向计时</button></div>
    <div className="timerValue" aria-label="计时剩余或已用时间">{clock(c.seconds)}</div>
    <label className="focusTaskLabel">关联任务或事项<select aria-label="关联任务或事项" value={c.selectedKey} disabled={!c.enabled || Boolean(c.session) || !visibleChoices.length} onChange={e => c.select(e.target.value)}><option value="" disabled>请选择关联对象</option>{groupedChoices.map((entry) => <optgroup key={entry.group} label={entry.group}>{entry.choices.map((choice) => <option key={keyOf(choice)} value={keyOf(choice)}>{choice.title}</option>)}</optgroup>)}</select></label>
    <button className="focusOpenTarget" type="button" disabled={!selected} onClick={() => selected && onOpen(selected)}>查看 / 编辑当前关联</button>
    <div className="timerActions"><button className="primaryButton" disabled={!c.enabled || !selected} onClick={() => c.session?.startedAt ? c.pause() : c.start()}>{c.session?.startedAt ? "暂停" : c.session ? "继续专注" : "开始专注"}</button><button className="softButton" disabled={!c.enabled || !c.session} onClick={c.finish}>结束并记入</button><button className="softButton" disabled={!c.enabled || !selected} onClick={() => selected && onManual(selected)}>补记</button></div>
    {c.session && <div className="focusReset">{resetConfirm ? <><span>放弃本轮尚未记录的时间？</span><button onClick={() => { c.discard(); setResetConfirm(false); }} disabled={!c.enabled}>确认重置</button><button onClick={() => setResetConfirm(false)}>保留</button></> : <button disabled={!c.enabled} onClick={() => setResetConfirm(true)}>重置本轮</button>}</div>}
    <details className="focusSettings"><summary>时长与声音</summary><label>番茄钟时长（分钟）<input aria-label="番茄钟时长（分钟）" type="number" min="1" max="180" value={c.settings.minutes} disabled={!c.enabled || Boolean(c.session)} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 180) onSettings({ ...c.settings, minutes: n }); }} /></label><label className="focusSoundToggle"><input type="checkbox" checked={c.settings.sound} disabled={!c.enabled} onChange={e => onSettings({ ...c.settings, sound: e.target.checked })} />结束时播放提示音</label><label>提示音音量 · {c.settings.volume}%<input aria-label="提示音音量" type="range" min="0" max="100" value={c.settings.volume} disabled={!c.enabled} onChange={e => onSettings({ ...c.settings, volume: Number(e.target.value) })} /></label><button className="softButton" onClick={() => void c.previewSound()}>试听提示音</button></details>
    {c.message && <p className="focusMessage" role="status">{c.message}</p>}
  </section>;
}
