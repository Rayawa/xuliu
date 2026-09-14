"use client";

import DashboardClient from "../DashboardClient";
import drafts from "../../scripts/bit-20260914.json";
import type { ImportedCourse } from "@/lib/academic-import";

const previewAccount = {
  id: "owner" as const,
  username: "preview",
  displayName: "本地试运行",
};

export default function PreviewDashboard() {
  return <DashboardClient account={previewAccount} visibleAccounts={[]} onLogout={() => {}} deploymentVersion="local-preview" previewAcademicCourses={drafts as ImportedCourse[]} preview />;
}
