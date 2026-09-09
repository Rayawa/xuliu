import { notFound } from "next/navigation";
import PreviewDashboard from "./PreviewDashboard";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PreviewDashboard />;
}
