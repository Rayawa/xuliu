"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

type Area = "课内" | "课外" | "工作" | "生活" | "思考";
type Task = {
  id: string;
  title: string;
  area: Area;
  source: string;
  due?: string;
  done: boolean;
  today: boolean;
  estimate: number;
  elapsed: number;
};
type Block = {
  id: string;
  type: "heading" | "checklist" | "image" | "table" | "link";
  text?: string;
  checked?: boolean;
  url?: string;
  rows?: string[][];
};
type PageNode = { id: string; parentId: string | null; title: string; kind: "folder" | "page"; blocks: Block[] };
type Reminder = { id: string; title: string; type: "sleep" | "exercise"; time: string; days: number[]; enabled: boolean; lastFired?: string; snoozedUntil?: number; status?: "done" | "skipped" };
type AppState = {
  tasks: Task[];
  milestones: { id: string; title: string; date: string; area: Area; detail: string }[];
  courses: { id: string; title: string; teacher: string; progress: number; next: string }[];
  resources: { id: string; title: string; type: string; progress: number; url?: string; note: string }[];
  research: { id: string; title: string; status: string; summary: string; next: string; evidence: number }[];
  ideas: { id: string; title: string; note: string; createdAt: string }[];
  tools: { id: string; title: string; status: string; description: string; url?: string }[];
  habits: { id: string; title: string; streak: number; today: boolean; schedule: string }[];
  media: { id: string; title: string; type: "书籍" | "番剧"; progress: string }[];
  recipes: { id: string; title: string; ingredients: string; note: string }[];
  reminders: Reminder[];
  pages: PageNode[];
  daily: Record<string, { note: string; gain: string; problem: string; feeling: string; tomorrow: string }>;
  timeEntries: { id: string; taskId: string; minutes: number; date: string; mode: string }[];
};

const uid = () => Math.random().toString(36).slice(2, 10);
const dateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const today = dateKey();
const dayAfter = (count: number) => {
  const date = new Date();
  date.setDate(date.getDate() + count);
  return dateKey(date);
};

const initialState: AppState = {
  tasks: [
    { id: "t1", title: "整理财务管理第三章笔记", area: "课内", source: "财务管理", due: today, done: false, today: true, estimate: 50, elapsed: 24 },
    { id: "t2", title: "梳理 AI 工具变现方向的三个假设", area: "工作", source: "AI 工具研究", due: today, done: false, today: true, estimate: 45, elapsed: 18 },
    { id: "t3", title: "完成 20 分钟力量训练", area: "生活", source: "运动", due: today, done: false, today: true, estimate: 20, elapsed: 0 },
    { id: "t4", title: "复习中级财务会计错题", area: "课内", source: "中级财务会计", due: today, done: true, today: true, estimate: 35, elapsed: 38 },
    { id: "t5", title: "日语课程第 12 课", area: "课外", source: "日语", due: dayAfter(2), done: false, today: false, estimate: 40, elapsed: 0 },
  ],
  milestones: [
    { id: "m1", title: "中级财务会计阶段测验", date: dayAfter(3), area: "课内", detail: "复习进度 62%" },
    { id: "m2", title: "日语课程第 12 课", date: dayAfter(6), area: "课外", detail: "资源已整理" },
    { id: "m3", title: "AI 工具方向第一轮判断", date: dayAfter(9), area: "工作", detail: "完成可行性结论" },
  ],
  courses: [
    { id: "c1", title: "中级财务会计", teacher: "本学期核心课程", progress: 62, next: "阶段测验 · 3 天后" },
    { id: "c2", title: "财务管理", teacher: "章节与作业", progress: 48, next: "第三章笔记 · 今天" },
    { id: "c3", title: "成本会计", teacher: "课程任务", progress: 35, next: "案例作业 · 8 天后" },
  ],
  resources: [
    { id: "r1", title: "日语入门系统课", type: "B站课程", progress: 44, url: "https://www.bilibili.com", note: "正在学习第 12 课" },
    { id: "r2", title: "摄影构图与用光", type: "书籍", progress: 28, note: "第二部分：光线" },
    { id: "r3", title: "深度学习基础", type: "在线课程", progress: 16, note: "神经网络基础" },
  ],
  research: [
    { id: "w1", title: "面向学生的 AI 学习工具", status: "研究中", summary: "验证高频痛点与最小可用工具形态。", next: "整理 5 个真实使用场景", evidence: 45 },
    { id: "w2", title: "小型自动化工具变现", status: "收集资料", summary: "研究个人开发者可持续的小工具模式。", next: "拆解 3 个已有产品", evidence: 25 },
  ],
  ideas: [
    { id: "i1", title: "把课程节点自动转成复习任务", note: "根据考试日倒推三轮复习。", createdAt: today },
    { id: "i2", title: "工具集可以记录每次迭代原因", note: "不只是展示链接，也保留演进过程。", createdAt: today },
  ],
  tools: [
    { id: "tool1", title: "序流", status: "制作中", description: "个人工作、学习与生活流管理系统" },
    { id: "tool2", title: "课程资料整理器", status: "想法", description: "从链接与文件生成课程资源索引" },
  ],
  habits: [
    { id: "h1", title: "23:00 前准备睡觉", streak: 5, today: false, schedule: "每天" },
    { id: "h2", title: "力量训练 20 分钟", streak: 2, today: false, schedule: "一、三、六" },
    { id: "h3", title: "专注后起身休息", streak: 8, today: true, schedule: "每 20 分钟" },
  ],
  media: [
    { id: "mbook", title: "摄影的艺术", type: "书籍", progress: "读到 38%" },
    { id: "manime", title: "正在追的番", type: "番剧", progress: "第 7 集" },
  ],
  recipes: [
    { id: "recipe1", title: "番茄牛肉意面", ingredients: "牛肉、番茄、意面", note: "下次减少一点盐" },
  ],
  reminders: [
    { id: "sleep", title: "准备结束今天，放下屏幕", type: "sleep", time: "23:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true },
    { id: "exercise", title: "完成今天的运动", type: "exercise", time: "19:30", days: [1, 3, 6], enabled: true },
  ],
  pages: [
    { id: "f1", parentId: null, title: "思考集", kind: "folder", blocks: [] },
    { id: "p1", parentId: "f1", title: "学习系统应该怎样运转", kind: "page", blocks: [
      { id: "b1", type: "heading", text: "从节点到每日行动" },
      { id: "b2", type: "checklist", text: "把考试日期拆成复习阶段", checked: true },
      { id: "b3", type: "checklist", text: "每天只确认当日要做的任务", checked: false },
      { id: "b4", type: "link", text: "课程参考资料", url: "https://www.bilibili.com" },
    ] },
    { id: "f2", parentId: null, title: "自由空间", kind: "folder", blocks: [] },
    { id: "p2", parentId: "f2", title: "随手记录", kind: "page", blocks: [{ id: "b5", type: "heading", text: "这里可以自由建立结构" }] },
  ],
  daily: { [today]: { note: "", gain: "", problem: "", feeling: "", tomorrow: "" } },
  timeEntries: [],
};

const navItems = [
  ["today", "今", "今日"], ["calendar", "历", "日历"], ["review", "复", "每日复盘"],
  ["school", "课", "课内学习"], ["learning", "学", "课外学习"], ["thoughts", "思", "思考集"],
  ["work", "研", "工作研究"], ["ideas", "灵", "灵感"], ["tools", "具", "工具集"],
  ["life", "生", "生活"], ["free", "＋", "自由空间"],
] as const;

const areaClass: Record<Area, string> = { 课内: "study", 课外: "outside", 工作: "work", 生活: "life", 思考: "thought" };
const formatMinutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function DashboardClient() {
  const [active, setActive] = useState("today");
  const [data, setData] = useState<AppState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<"saved" | "saving" | "local">("local");
  const [quickTask, setQuickTask] = useState("");
  const [selectedPage, setSelectedPage] = useState("p1");
  const [mobileNav, setMobileNav] = useState(false);
  const [timer, setTimer] = useState({ mode: "pomodoro" as "pomodoro" | "stopwatch", seconds: 25 * 60, running: false, targetId: "t1" });
  const notifiedRef = useRef<string>("");

  useEffect(() => {
    const local = window.localStorage.getItem("xuliu-state");
    if (local) {
      try { setData(JSON.parse(local) as AppState); } catch { /* keep defaults */ }
    }
    fetch("/api/state").then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { state: AppState | null }) => { if (payload.state) setData(payload.state); setSync("saved"); })
      .catch(() => setSync("local"))
      .finally(() => setLoaded(true));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSync("saving");
    const handle = window.setTimeout(() => {
      window.localStorage.setItem("xuliu-state", JSON.stringify(data));
      fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: data }) })
        .then((response) => { if (!response.ok) throw new Error(); setSync("saved"); })
        .catch(() => setSync("local"));
    }, 650);
    return () => window.clearTimeout(handle);
  }, [data, loaded]);

  const notify = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  };

  useEffect(() => {
    if (!timer.running) return;
    const handle = window.setInterval(() => {
      setTimer((current) => {
        const next = current.mode === "pomodoro" ? current.seconds - 1 : current.seconds + 1;
        const elapsed = current.mode === "pomodoro" ? 25 * 60 - next : next;
        if (elapsed > 0 && elapsed % (20 * 60) === 0 && notifiedRef.current !== `${current.mode}-${elapsed}`) {
          notifiedRef.current = `${current.mode}-${elapsed}`;
          notify("该休息一下了", "起来走动，看看远处。你可以在 5 分钟后继续。 ");
        }
        if (current.mode === "pomodoro" && next <= 0) {
          notify("番茄钟完成", "这一段专注已经完成。先休息一下吧。");
          return { ...current, seconds: 0, running: false };
        }
        return { ...current, seconds: next };
      });
    }, 1000);
    return () => window.clearInterval(handle);
  }, [timer.running]);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      data.reminders.forEach((reminder) => {
        const dueFromSnooze = reminder.snoozedUntil && reminder.snoozedUntil <= Date.now();
        const dueFromSchedule = reminder.enabled && reminder.days.includes(now.getDay()) && reminder.time === currentTime && reminder.lastFired !== today;
        if (dueFromSnooze || dueFromSchedule) {
          notify("序流提醒", reminder.title);
          setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, lastFired: today, snoozedUntil: undefined, status: undefined } : item) }));
        }
      });
    };
    check();
    const handle = window.setInterval(check, 30_000);
    return () => window.clearInterval(handle);
  }, [data.reminders]);

  const todayTasks = data.tasks.filter((task) => task.today);
  const daily = data.daily[today] ?? { note: "", gain: "", problem: "", feeling: "", tomorrow: "" };
  const totalMinutes = data.tasks.reduce((sum, task) => sum + task.elapsed, 0);
  const doneCount = todayTasks.filter((task) => task.done).length;

  const updateDaily = (field: keyof typeof daily, value: string) => setData((current) => ({
    ...current,
    daily: { ...current.daily, [today]: { ...(current.daily[today] ?? daily), [field]: value } },
  }));

  const toggleTask = (id: string) => setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) }));
  const confirmTask = (id: string) => setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, today: true } : task) }));
  const addQuickTask = () => {
    const title = quickTask.trim();
    if (!title) return;
    setData((current) => ({ ...current, tasks: [...current.tasks, { id: uid(), title, area: "思考", source: "临时任务", due: today, done: false, today: true, estimate: 25, elapsed: 0 }] }));
    setQuickTask("");
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") notify("提醒已开启", "睡眠、运动和专注休息提醒会显示在这里。");
  };

  const finishFocus = () => {
    const elapsedSeconds = timer.mode === "pomodoro" ? 25 * 60 - timer.seconds : timer.seconds;
    const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === timer.targetId ? { ...task, elapsed: task.elapsed + minutes } : task),
      timeEntries: [...current.timeEntries, { id: uid(), taskId: timer.targetId, minutes, date: today, mode: timer.mode }],
    }));
    setTimer((current) => ({ ...current, running: false, seconds: current.mode === "pomodoro" ? 25 * 60 : 0 }));
  };

  const addManualTime = () => {
    const raw = prompt("补记多少分钟？", "30");
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === timer.targetId ? { ...task, elapsed: task.elapsed + Math.round(minutes) } : task),
      timeEntries: [...current.timeEntries, { id: uid(), taskId: timer.targetId, minutes: Math.round(minutes), date: today, mode: "manual" }],
    }));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `序流备份-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const switchTimerMode = (mode: "pomodoro" | "stopwatch") => setTimer((current) => ({ ...current, mode, running: false, seconds: mode === "pomodoro" ? 25 * 60 : 0 }));

  return (
    <div className="shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button className="brand" onClick={() => setActive("today")}><span className="brandMark">序</span><span>序流</span></button>
        <div className="navGroup">
          {navItems.slice(0, 3).map(([id, icon, label]) => <NavButton key={id} id={id} icon={icon} label={label} active={active} onClick={setActive} />)}
        </div>
        <div className="navCaption">我的空间</div>
        <div className="navGroup">
          {navItems.slice(3).map(([id, icon, label]) => <NavButton key={id} id={id} icon={icon} label={label} active={active} onClick={setActive} />)}
        </div>
        <button className="exportButton" onClick={exportData}>导出数据备份</button>
        <div className="sidebarFoot"><span className={`syncDot ${sync}`} />{sync === "saved" ? "已同步" : sync === "saving" ? "正在保存" : "已保存到本机"}</div>
      </aside>

      <main className="main">
        <header className="mobileHeader"><button className="iconButton" onClick={() => setMobileNav(!mobileNav)}>☰</button><strong>序流</strong><span className={`syncDot ${sync}`} /></header>
        {active === "today" && <TodayView data={data} tasks={todayTasks} doneCount={doneCount} totalMinutes={totalMinutes} daily={daily} quickTask={quickTask} setQuickTask={setQuickTask} addQuickTask={addQuickTask} toggleTask={toggleTask} confirmTask={confirmTask} updateDaily={updateDaily} timer={timer} setTimer={setTimer} switchMode={switchTimerMode} finishFocus={finishFocus} addManualTime={addManualTime} requestNotifications={requestNotifications} setData={setData} />}
        {active === "calendar" && <CalendarView data={data} />}
        {active === "review" && <ReviewView data={data} daily={daily} updateDaily={updateDaily} totalMinutes={totalMinutes} doneCount={doneCount} />}
        {active === "school" && <SchoolView data={data} setData={setData} />}
        {active === "learning" && <LearningView data={data} setData={setData} />}
        {(active === "thoughts" || active === "free") && <NotesView data={data} setData={setData} selectedPage={selectedPage} setSelectedPage={setSelectedPage} rootTitle={active === "thoughts" ? "思考集" : "自由空间"} />}
        {active === "work" && <WorkView data={data} setData={setData} />}
        {active === "ideas" && <IdeasView data={data} setData={setData} />}
        {active === "tools" && <ToolsView data={data} setData={setData} />}
        {active === "life" && <LifeView data={data} setData={setData} requestNotifications={requestNotifications} />}
      </main>

      <nav className="mobileTabs">
        {navItems.slice(0, 3).map(([id, icon, label]) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><span>{icon}</span>{label}</button>)}
        <button onClick={() => setMobileNav(true)}><span>···</span>空间</button>
      </nav>
      {mobileNav && <button className="navScrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    </div>
  );
}

function NavButton({ id, icon, label, active, onClick }: { id: string; icon: string; label: string; active: string; onClick: (id: string) => void }) {
  return <button className={`navButton ${active === id ? "active" : ""}`} onClick={() => onClick(id)}><span>{icon}</span>{label}</button>;
}

function PageHead({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="pageHead"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function TodayView(props: {
  data: AppState; tasks: Task[]; doneCount: number; totalMinutes: number; daily: AppState["daily"][string]; quickTask: string;
  setQuickTask: (value: string) => void; addQuickTask: () => void; toggleTask: (id: string) => void; confirmTask: (id: string) => void;
  updateDaily: (field: keyof AppState["daily"][string], value: string) => void;
  timer: { mode: "pomodoro" | "stopwatch"; seconds: number; running: boolean; targetId: string };
  setTimer: React.Dispatch<React.SetStateAction<{ mode: "pomodoro" | "stopwatch"; seconds: number; running: boolean; targetId: string }>>;
  switchMode: (mode: "pomodoro" | "stopwatch") => void; finishFocus: () => void; addManualTime: () => void; requestNotifications: () => void;
  setData: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const { data, tasks, doneCount, totalMinutes, daily, timer } = props;
  const dateText = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const suggestions = data.tasks.filter((task) => !task.today && !task.done).slice(0, 3);
  const completedHabits = data.habits.filter((habit) => habit.today).length;
  return <div className="page">
    <PageHead eyebrow={dateText} title="今天，把重要的事接起来。" subtitle={`${tasks.length - doneCount} 项待完成 · 今日已专注 ${formatMinutes(totalMinutes)}`} action={<SyncChip />} />
    <div className="todayGrid">
      <div className="stack">
        <section className="panel taskPanel">
          <div className="panelHead"><div><h2>今日任务</h2><p>从各个计划中确认到今天</p></div><span className="countChip">{doneCount} / {tasks.length}</span></div>
          <div className="taskList">
            {tasks.map((task) => <div className={`taskRow ${task.done ? "done" : ""}`} key={task.id}>
              <button className="checkButton" aria-label={task.done ? "标记未完成" : "标记完成"} onClick={() => props.toggleTask(task.id)}>{task.done ? "✓" : ""}</button>
              <div className="taskBody"><strong>{task.title}</strong><span>{task.source} · {task.due === today ? "今天" : task.due ?? "无日期"} · 已投入 {task.elapsed} 分钟</span></div>
              <span className={`areaTag ${areaClass[task.area]}`}>{task.area}</span>
            </div>)}
          </div>
          <div className="quickAdd"><input value={props.quickTask} onChange={(event) => props.setQuickTask(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.addQuickTask()} placeholder="添加一个临时任务…" /><button onClick={props.addQuickTask}>添加</button></div>
        </section>

        {suggestions.length > 0 && <section className="panel compactPanel">
          <div className="panelHead"><div><h2>待确认</h2><p>这些任务临近截止，要放到今天吗？</p></div></div>
          {suggestions.map((task) => <div className="suggestion" key={task.id}><div><strong>{task.title}</strong><span>{task.source} · {task.due}</span></div><button className="softButton" onClick={() => props.confirmTask(task.id)}>加入今天</button></div>)}
        </section>}

        <section className="panel compactPanel">
          <div className="panelHead"><div><h2>临近节点</h2><p>无需进入日历也能看见</p></div><button className="textButton">查看全部</button></div>
          <div className="milestoneList">{data.milestones.slice(0, 3).map((item) => <div className="milestone" key={item.id}><div className="dateBox"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).getMonth() + 1}月</span></div><div><strong>{item.title}</strong><span>{item.detail}</span></div><span className={`areaTag ${areaClass[item.area]}`}>{item.area}</span></div>)}</div>
        </section>
      </div>

      <div className="stack sideStack">
        <section className="panel focusPanel">
          <div className="modeSwitch"><button className={timer.mode === "pomodoro" ? "active" : ""} onClick={() => props.switchMode("pomodoro")}>番茄钟</button><button className={timer.mode === "stopwatch" ? "active" : ""} onClick={() => props.switchMode("stopwatch")}>正向计时</button></div>
          <div className="timerValue">{formatClock(timer.seconds)}</div>
          <select value={timer.targetId} onChange={(event) => props.setTimer((current) => ({ ...current, targetId: event.target.value }))}>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
          <div className="timerActions"><button className="primaryButton" onClick={() => props.setTimer((current) => ({ ...current, running: !current.running }))}>{timer.running ? "暂停" : "开始专注"}</button><button className="softButton" onClick={props.finishFocus}>完成</button><button className="softButton" onClick={props.addManualTime}>补记</button></div>
          <button className="notificationLink" onClick={props.requestNotifications}>开启系统提醒 · 每 20 分钟休息</button>
        </section>

        <section className="panel notePanel"><div className="panelHead"><div><h2>今日随记</h2><p>收获、问题或突然出现的想法</p></div><span className="saveText">自动保存</span></div><textarea value={daily.note} onChange={(event) => props.updateDaily("note", event.target.value)} placeholder="此刻有什么值得记下来？" /></section>

        <section className="miniStats"><div><strong>{formatMinutes(totalMinutes)}</strong><span>今日专注</span></div><div><strong>{doneCount}</strong><span>完成任务</span></div><div><strong>{Math.round((completedHabits / Math.max(1, data.habits.length)) * 100)}%</strong><span>习惯完成</span></div></section>

        <section className="panel reminderPanel"><div className="panelHead"><div><h2>生活提醒</h2><p>只保留真正需要打断你的事</p></div></div>{data.reminders.map((reminder) => <div className="reminderRow" key={reminder.id}><span className={`reminderIcon ${reminder.type}`}>{reminder.type === "sleep" ? "眠" : "动"}</span><div><strong>{reminder.title}</strong><span>{reminder.time} · {reminder.status === "done" ? "今天已完成" : reminder.status === "skipped" ? "今天已跳过" : "等待提醒"}</span></div><div className="rowActions"><button onClick={() => props.setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, status: "done" } : item) }))}>完成</button><button onClick={() => props.setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, snoozedUntil: Date.now() + 5 * 60 * 1000 } : item) }))}>+5m</button><button onClick={() => props.setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, status: "skipped" } : item) }))}>跳过</button></div></div>)}</section>
      </div>
    </div>
  </div>;
}

function SyncChip() { return <span className="syncChip"><span />本机自动保存 · 支持导出备份</span>; }

function CalendarView({ data }: { data: AppState }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const start = new Date(year, month, 1).getDay();
  const cells = [...Array(start).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const eventsFor = (day: number) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return [
      ...data.tasks.filter((task) => task.due === key).map((task) => ({ title: task.title, area: task.area })),
      ...data.milestones.filter((item) => item.date === key).map((item) => ({ title: item.title, area: item.area })),
    ];
  };
  return <div className="page"><PageHead eyebrow="全局安排" title={`${year}年 ${month + 1}月`} subtitle="在这里看全局，在今日页面确认行动。" />
    <section className="panel calendarPanel"><div className="weekHead">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendarGrid">{cells.map((day, index) => <div className={`calendarCell ${day === now.getDate() ? "today" : ""}`} key={index}>{day && <><strong>{day}</strong><div>{eventsFor(day).slice(0, 3).map((event, eventIndex) => <span className={`calendarEvent ${areaClass[event.area]}`} key={eventIndex}>{event.title}</span>)}</div></>}</div>)}</div></section>
  </div>;
}

function ReviewView({ daily, updateDaily, totalMinutes, doneCount, data }: { daily: AppState["daily"][string]; updateDaily: (field: keyof AppState["daily"][string], value: string) => void; totalMinutes: number; doneCount: number; data: AppState }) {
  const fields: { key: keyof typeof daily; label: string; placeholder: string }[] = [
    { key: "gain", label: "今日收获", placeholder: "今天真正学会、验证或推进了什么？" },
    { key: "problem", label: "遇到的问题", placeholder: "哪里卡住了？原因可能是什么？" },
    { key: "feeling", label: "状态感受", placeholder: "精力、情绪和生活节奏如何？" },
    { key: "tomorrow", label: "明日重点", placeholder: "明天最重要的一件事是什么？" },
  ];
  return <div className="page narrowPage"><PageHead eyebrow="每日页面" title="今天的复盘" subtitle="系统汇总事实，你只记录真正重要的判断。" />
    <section className="reviewSummary"><div><span>完成任务</span><strong>{doneCount}</strong></div><div><span>专注时间</span><strong>{formatMinutes(totalMinutes)}</strong></div><div><span>习惯完成</span><strong>{data.habits.filter((habit) => habit.today).length}/{data.habits.length}</strong></div></section>
    <section className="panel reviewForm">{fields.map((field) => <label key={field.key}><span>{field.label}</span><textarea value={daily[field.key]} onChange={(event) => updateDaily(field.key, event.target.value)} placeholder={field.placeholder} /></label>)}</section>
  </div>;
}

function SchoolView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  return <div className="page"><PageHead eyebrow="本学期" title="课内学习" subtitle="课程、任务、考试和重要节点集中管理。" action={<button className="primaryButton" onClick={() => { const title = prompt("课程名称"); if (title) setData((current) => ({ ...current, courses: [...current.courses, { id: uid(), title, teacher: "新课程", progress: 0, next: "尚未设置节点" }] })); }}>＋ 添加课程</button>} />
    <div className="cardGrid">{data.courses.map((course) => <section className="panel courseCard" key={course.id}><div className="courseTop"><span>课程</span><button>•••</button></div><h2>{course.title}</h2><p>{course.teacher}</p><div className="progressLine"><span style={{ width: `${course.progress}%` }} /></div><div className="courseBottom"><strong>{course.progress}%</strong><span>{course.next}</span></div></section>)}</div>
    <section className="panel tablePanel"><div className="panelHead"><div><h2>课程节点</h2><p>作业、考试与阶段任务</p></div></div>{data.milestones.filter((item) => item.area === "课内").map((item) => <div className="dataRow" key={item.id}><strong>{item.title}</strong><span>{item.date}</span><span>{item.detail}</span><span className="statusPill">进行中</span></div>)}</section>
  </div>;
}

function LearningView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  return <div className="page"><PageHead eyebrow="课外成长" title="课外学习" subtitle="围绕课程、书籍和软件持续积累进度与资源。" action={<button className="primaryButton" onClick={() => { const title = prompt("资源名称"); if (title) setData((current) => ({ ...current, resources: [...current.resources, { id: uid(), title, type: "新资源", progress: 0, note: "尚未开始" }] })); }}>＋ 添加资源</button>} />
    <div className="resourceList">{data.resources.map((resource) => <section className="panel resourceCard" key={resource.id}><div className="resourceMark">{resource.type.slice(0, 1)}</div><div className="resourceMain"><div><span className="mutedLabel">{resource.type}</span><h2>{resource.title}</h2><p>{resource.note}</p></div><div className="resourceProgress"><strong>{resource.progress}%</strong><div><span style={{ width: `${resource.progress}%` }} /></div></div></div></section>)}</div>
  </div>;
}

function WorkView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  return <div className="page"><PageHead eyebrow="探索与判断" title="工作研究" subtitle="把感兴趣或可能赚钱的方向，逐步研究成有证据的判断。" action={<button className="primaryButton" onClick={() => { const title = prompt("研究方向"); if (title) setData((current) => ({ ...current, research: [...current.research, { id: uid(), title, status: "新方向", summary: "等待补充研究问题", next: "写下第一个需要验证的问题", evidence: 0 }] })); }}>＋ 新建方向</button>} />
    <div className="researchGrid">{data.research.map((item) => <section className="panel researchCard" key={item.id}><div className="researchMeta"><span className="statusPill">{item.status}</span><span>证据 {item.evidence}%</span></div><h2>{item.title}</h2><p>{item.summary}</p><div className="evidence"><span style={{ width: `${item.evidence}%` }} /></div><div className="nextStep"><span>下一步</span><strong>{item.next}</strong></div></section>)}</div>
  </div>;
}

function IdeasView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [value, setValue] = useState("");
  const add = () => { if (!value.trim()) return; setData((current) => ({ ...current, ideas: [{ id: uid(), title: value.trim(), note: "等待展开", createdAt: today }, ...current.ideas] })); setValue(""); };
  return <div className="page narrowPage"><PageHead eyebrow="先捕捉，再整理" title="灵感" subtitle="允许想法不成熟，但不要让它消失。" />
    <div className="ideaCapture"><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="现在想到什么？" /><button onClick={add}>收下灵感</button></div>
    <div className="ideaList">{data.ideas.map((idea) => <section className="panel ideaCard" key={idea.id}><span>{idea.createdAt}</span><h2>{idea.title}</h2><textarea value={idea.note} onChange={(event) => setData((current) => ({ ...current, ideas: current.ideas.map((item) => item.id === idea.id ? { ...item, note: event.target.value } : item) }))} /></section>)}</div>
  </div>;
}

function ToolsView({ data, setData }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>> }) {
  return <div className="page"><PageHead eyebrow="我的作品" title="工具集" subtitle="保存用 Codex 制作的网站、软件和下一步想法。" action={<button className="primaryButton" onClick={() => { const title = prompt("工具名称"); if (title) setData((current) => ({ ...current, tools: [...current.tools, { id: uid(), title, status: "想法", description: "等待补充说明" }] })); }}>＋ 添加工具</button>} />
    <div className="cardGrid">{data.tools.map((tool) => <section className="panel toolCard" key={tool.id}><div className="toolMark">{tool.title.slice(0, 1)}</div><span className="statusPill">{tool.status}</span><h2>{tool.title}</h2><p>{tool.description}</p><div className="toolActions"><button className="softButton">查看详情</button>{tool.url && <a href={tool.url} target="_blank" rel="noreferrer">打开工具</a>}</div></section>)}</div>
  </div>;
}

function LifeView({ data, setData, requestNotifications }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; requestNotifications: () => void }) {
  return <div className="page"><PageHead eyebrow="规律与兴趣" title="生活" subtitle="提醒需要坚持的事，也记录正在享受的生活。" action={<button className="softButton" onClick={requestNotifications}>开启系统提醒</button>} />
    <div className="lifeGrid"><section className="panel"><div className="panelHead"><div><h2>习惯与规律</h2><p>今天的完成情况</p></div></div>{data.habits.map((habit) => <div className="habitRow" key={habit.id}><button className={`habitCheck ${habit.today ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? { ...item, today: !item.today, streak: item.today ? Math.max(0, item.streak - 1) : item.streak + 1 } : item) }))}>{habit.today ? "✓" : ""}</button><div><strong>{habit.title}</strong><span>{habit.schedule} · 连续 {habit.streak} 天</span></div></div>)}</section>
      <section className="panel"><div className="panelHead"><div><h2>提醒设置</h2><p>默认延迟 5 分钟</p></div></div>{data.reminders.map((reminder) => <div className="settingRow" key={reminder.id}><div><strong>{reminder.title}</strong><span>{reminder.type === "sleep" ? "睡眠" : "运动"}</span></div><input type="time" value={reminder.time} onChange={(event) => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, time: event.target.value } : item) }))} /><button className={`switch ${reminder.enabled ? "on" : ""}`} onClick={() => setData((current) => ({ ...current, reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item) }))}><span /></button></div>)}</section>
      <section className="panel"><div className="panelHead"><div><h2>正在阅读与观看</h2><p>不做压力，只留轨迹</p></div></div>{data.media.map((item) => <div className="mediaRow" key={item.id}><span>{item.type.slice(0, 1)}</span><div><strong>{item.title}</strong><small>{item.type} · {item.progress}</small></div></div>)}</section>
      <section className="panel"><div className="panelHead"><div><h2>菜谱记录</h2><p>做过的菜和下次调整</p></div><button className="softButton" onClick={() => { const title = prompt("菜名"); if (title) setData((current) => ({ ...current, recipes: [...(current.recipes ?? []), { id: uid(), title, ingredients: "等待补充食材", note: "" }] })); }}>＋ 添加</button></div>{(data.recipes ?? []).map((recipe) => <div className="mediaRow" key={recipe.id}><span>菜</span><div><strong>{recipe.title}</strong><small>{recipe.ingredients} · {recipe.note || "暂无备注"}</small></div></div>)}</section>
    </div>
  </div>;
}

function NotesView({ data, setData, selectedPage, setSelectedPage, rootTitle }: { data: AppState; setData: React.Dispatch<React.SetStateAction<AppState>>; selectedPage: string; setSelectedPage: (id: string) => void; rootTitle: string }) {
  const root = data.pages.find((node) => node.kind === "folder" && node.title === rootTitle) ?? data.pages.find((node) => node.kind === "folder");
  const visible = data.pages.filter((node) => node.id === root?.id || node.parentId === root?.id);
  const selected = data.pages.find((node) => node.id === selectedPage && node.kind === "page") ?? visible.find((node) => node.kind === "page");
  const addNode = (kind: "folder" | "page") => {
    const title = prompt(kind === "folder" ? "文件夹名称" : "页面名称");
    if (!title) return;
    const id = uid();
    setData((current) => ({ ...current, pages: [...current.pages, { id, parentId: root?.id ?? null, title, kind, blocks: kind === "page" ? [{ id: uid(), type: "heading", text: title }] : [] }] }));
    if (kind === "page") setSelectedPage(id);
  };
  const updateBlock = (blockId: string, patch: Partial<Block>) => setData((current) => ({ ...current, pages: current.pages.map((page) => page.id === selected?.id ? { ...page, blocks: page.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block) } : page) }));
  const addBlock = (type: Block["type"]) => {
    if (!selected) return;
    const block: Block = type === "table" ? { id: uid(), type, rows: [["列 1", "列 2"], ["内容", "内容"]] } : { id: uid(), type, text: "", checked: false, url: "" };
    setData((current) => ({ ...current, pages: current.pages.map((page) => page.id === selected.id ? { ...page, blocks: [...page.blocks, block] } : page) }));
  };
  const uploadImage = async (blockId: string, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateBlock(blockId, { url: String(reader.result) });
    reader.readAsDataURL(file);
  };
  return <div className="page notesPage"><PageHead eyebrow="自由组织" title={rootTitle} subtitle="文件夹保持结构，页面承载思考。" />
    <div className="notesShell"><aside className="treePanel"><div className="treeActions"><button onClick={() => addNode("page")}>＋ 页面</button><button onClick={() => addNode("folder")}>＋ 文件夹</button></div>{visible.filter((node) => node.id !== root?.id).map((node) => <button className={`treeNode ${selected?.id === node.id ? "active" : ""}`} key={node.id} onClick={() => node.kind === "page" && setSelectedPage(node.id)}><span>{node.kind === "folder" ? "▸" : "·"}</span>{node.title}</button>)}</aside>
      <section className="panel editor">{selected ? <><input className="pageTitleInput" value={selected.title} onChange={(event) => setData((current) => ({ ...current, pages: current.pages.map((page) => page.id === selected.id ? { ...page, title: event.target.value } : page) }))} />
        <div className="blockToolbar"><span>插入</span>{(["heading", "checklist", "image", "table", "link"] as Block["type"][]).map((type) => <button key={type} onClick={() => addBlock(type)}>{{ heading: "标题", checklist: "清单", image: "图片", table: "表格", link: "链接" }[type]}</button>)}</div>
        <div className="blocks">{selected.blocks.map((block) => <div className={`editorBlock ${block.type}`} key={block.id}>{block.type === "heading" && <input value={block.text ?? ""} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="输入标题" />}{block.type === "checklist" && <><button className={`checkButton ${block.checked ? "checked" : ""}`} onClick={() => updateBlock(block.id, { checked: !block.checked })}>{block.checked ? "✓" : ""}</button><input value={block.text ?? ""} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="清单内容" /></>}{block.type === "link" && <><input value={block.text ?? ""} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="链接名称" /><input value={block.url ?? ""} onChange={(event) => updateBlock(block.id, { url: event.target.value })} placeholder="https://" /></>}{block.type === "image" && <div className="imageBlock">{block.url ? <img src={block.url} alt={block.text || "页面图片"} /> : <label>选择图片<input type="file" accept="image/*" onChange={(event) => uploadImage(block.id, event.target.files?.[0])} /></label>}<input value={block.text ?? ""} onChange={(event) => updateBlock(block.id, { text: event.target.value })} placeholder="图片说明" /></div>}{block.type === "table" && <div className="simpleTable">{(block.rows ?? []).map((row, rowIndex) => <div key={rowIndex}>{row.map((cell, cellIndex) => <input key={cellIndex} value={cell} onChange={(event) => { const rows = (block.rows ?? []).map((currentRow) => [...currentRow]); rows[rowIndex][cellIndex] = event.target.value; updateBlock(block.id, { rows }); }} />)}</div>)}</div>}</div>)}</div>
      </> : <div className="emptyEditor"><strong>选择或新建一个页面</strong><span>从一个标题开始，把内容慢慢串起来。</span></div>}</section>
    </div>
  </div>;
}
