"use client";

import DashboardClient from "../DashboardClient";

const previewAccount = {
  id: "owner" as const,
  username: "preview",
  displayName: "记账预览",
};

export default function PreviewDashboard() {
  return <DashboardClient account={previewAccount} visibleAccounts={[]} onLogout={() => {}} deploymentVersion="local-preview" preview />;
}
