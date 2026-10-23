"use client";

import { useEffect, useRef, useState } from "react";
import { advanceEyeRestCycle, createEyeRestCycle, eyeRestPhaseDuration, eyeRestRemainingMs, pauseEyeRestCycle, resumeEyeRestCycle, startEyeRestCycle, type EyeRestPhase } from "@/lib/eye-rest-cycle";
import type { useReminderAlerts } from "./useReminderAlerts";
import "./life-refinement.css";

type EyePopup = { eyebrow: string; title: string; body: string };

function clockText(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function transitionCopy(phase: EyeRestPhase) {
  return phase === "rest"
    ? { eyebrow: "眼睛休息", title: "该休息眼睛了", body: "已专注 30 分钟。接下来休息 5 分钟，看看远处、起身活动一下吧。" }
    : { eyebrow: "休息完成", title: "下一轮已经开始", body: "5 分钟休息结束，新的 30 分钟专注计时已自动开始。" };
}

export default function EyeRestCycle({ owner, readOnly, alerts, onPopup }: { owner: string; readOnly: boolean; alerts: ReturnType<typeof useReminderAlerts>; onPopup: (popup: EyePopup) => void }) {
  const [cycle, setCycle] = useState(createEyeRestCycle);
  const [now, setNow] = useState(() => Date.now());
  const cycleRef = useRef(cycle);
  const notifiedAtRef = useRef<number | null>(null);
  const deliver = alerts.deliver;

  useEffect(() => { cycleRef.current = cycle; }, [cycle]);
  useEffect(() => {
    const idle = createEyeRestCycle();
    cycleRef.current = idle;
    setCycle(idle);
    setNow(Date.now());
    notifiedAtRef.current = null;
  }, [owner, readOnly]);
  useEffect(() => {
    if (cycle.status !== "running") return;
    const check = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      setCycle((current) => advanceEyeRestCycle(current, currentTime));
    };
    check();
    const handle = window.setInterval(check, 1000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [cycle.status]);
  useEffect(() => {
    const transition = cycle.lastTransition;
    if (readOnly || !transition || notifiedAtRef.current === transition.at) return;
    notifiedAtRef.current = transition.at;
    const copy = transitionCopy(transition.phase);
    const background = document.visibilityState === "hidden" || !document.hasFocus();
    onPopup(copy);
    void deliver(`eye-cycle-${transition.at}`, copy.title, copy.body, background,
      () => cycleRef.current.status === "running" && cycleRef.current.lastTransition?.at === transition.at);
  }, [cycle.lastTransition, deliver, onPopup, readOnly]);

  const remaining = eyeRestRemainingMs(cycle, now);
  const duration = eyeRestPhaseDuration(cycle.phase);
  const progress = cycle.status === "idle" ? 0 : Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100));
  const phaseLabel = cycle.phase === "focus" ? "专注用眼" : "休息眼睛";

  const start = () => { const currentTime = Date.now(); const next = startEyeRestCycle(currentTime); cycleRef.current = next; setNow(currentTime); setCycle(next); notifiedAtRef.current = null; };
  const pause = () => { const currentTime = Date.now(); const next = pauseEyeRestCycle(cycle, currentTime); cycleRef.current = next; setNow(currentTime); setCycle(next); };
  const resume = () => { const currentTime = Date.now(); const next = resumeEyeRestCycle(cycle, currentTime); cycleRef.current = next; setNow(currentTime); setCycle(next); };
  const stop = () => { const idle = createEyeRestCycle(); cycleRef.current = idle; setCycle(idle); setNow(Date.now()); notifiedAtRef.current = null; };

  return <section className={`panel eyeRestCycle lifeEyeCycle ${cycle.status === "idle" ? "lifeEyeIdle" : "lifeEyeActive"}`} aria-label="眼睛休息循环">
    <div className="eyeRestHead">
      <div><div><h3>眼睛休息循环</h3>{cycle.status === "idle" && <p>专注 30 分钟 · 休息 5 分钟</p>}</div></div>
      {cycle.status === "idle" ? <button type="button" className="primaryButton" disabled={readOnly} onClick={start}>开始</button>
        : <span className={`eyeRestPhase ${cycle.phase}`}>{cycle.status === "paused" ? `${phaseLabel} · 已暂停` : phaseLabel}</span>}
    </div>
    {cycle.status !== "idle" && <div className="eyeRestBody">
      <div className="lifeEyeTimerRow"><div className="eyeRestClock" aria-label={`${phaseLabel}剩余时间`}>{clockText(remaining)}</div>
        <div className="eyeRestActions">
          {cycle.status === "running" && <button type="button" className="softButton" disabled={readOnly} onClick={pause}>暂停</button>}
          {cycle.status === "paused" && <button type="button" className="primaryButton" disabled={readOnly} onClick={resume}>继续</button>}
          <button type="button" className="textButton" disabled={readOnly} onClick={stop}>结束循环</button>
        </div>
      </div>
      <div className="eyeRestProgress" role="progressbar" aria-label={`${phaseLabel}进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div>
      <details className="lifeEyeDetails"><summary>周期与记录</summary><div className="eyeRestMeta"><span>专注 30 分钟 · 休息 5 分钟</span><span>已完成 {cycle.completedFocusRounds} 轮</span><span>{cycle.phase === "focus" ? "下一次：休息 5 分钟" : "结束后：自动开始 30 分钟"}</span></div></details>
    </div>}
  </section>;
}
