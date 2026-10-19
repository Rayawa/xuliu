"use client";

import { useEffect, useState } from "react";
import { yiyanDirectImageTimeout, yiyanImageProxyPath, yiyanProxyImageTimeout, type YiyanImageStatus } from "@/lib/yiyan-image";

type Stage = "original" | "proxy" | "failed";

export default function YiyanBackdrop({ source, onStatus }: { source: string; onStatus: (status: YiyanImageStatus) => void }) {
  const [load, setLoad] = useState<{ stage: Stage; ready: boolean }>({ stage: "proxy", ready: false });
  const fail = (stage: Stage) => setLoad(previous => previous.stage !== stage || previous.ready ? previous : { stage: stage === "proxy" ? "original" : "failed", ready: false });
  useEffect(() => {
    onStatus(load.stage === "failed" ? "error" : load.ready ? "ready" : "loading");
    if (load.ready || load.stage === "failed") return;
    const timer = window.setTimeout(() => fail(load.stage), load.stage === "original" ? yiyanDirectImageTimeout : yiyanProxyImageTimeout);
    return () => window.clearTimeout(timer);
  }, [source, load.stage, load.ready, onStatus]);
  if (load.stage === "failed") return null;
  const stage = load.stage;
  return <img key={stage} className="sidebarQuoteBackdrop" src={stage === "proxy" ? yiyanImageProxyPath(source) : source} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer"
    onLoad={() => setLoad(previous => previous.stage === stage ? { ...previous, ready: true } : previous)} onError={() => fail(stage)} />;
}
