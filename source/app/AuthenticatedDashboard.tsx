"use client";

import { useEffect, useState, type FormEvent } from "react";
import DashboardClient, { type WorkspaceAccount } from "./DashboardClient";

type SessionInfo = { account: WorkspaceAccount; visibleAccounts: WorkspaceAccount[] };

export default function AuthenticatedDashboard({ deploymentVersion }: { deploymentVersion: string }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((value) => { if (value?.authenticated) setSession(value); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "登录失败");
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      if (!sessionResponse.ok) throw new Error("登录状态未建立，请重试");
      setSession(await sessionResponse.json());
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    setUsername("");
    setPassword("");
  };

  if (loading) return <main className="authPage"><div className="authLoading"><span>序</span><p>正在打开你的空间…</p></div></main>;
  if (session) return <DashboardClient account={session.account} visibleAccounts={session.visibleAccounts} onLogout={logout} deploymentVersion={deploymentVersion} />;

  return <main className="authPage"><section className="loginCard"><div className="loginBrand"><span>序</span><div><strong>序流</strong></div></div><div className="loginIntro"><p>PRIVATE WORKSPACE</p><h1>登录</h1></div><form onSubmit={login}><label><span>用户名</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="输入用户名" /></label><label><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" /></label>{error && <p className="loginError">{error}</p>}<button className="loginButton" disabled={submitting}>{submitting ? "正在验证…" : "进入我的空间"}</button></form></section></main>;
}
