import AuthenticatedDashboard from "./AuthenticatedDashboard";
import { deploymentVersion } from "@/lib/deployment-version";

export const dynamic = "force-dynamic";

export default function Home() {
  return <AuthenticatedDashboard deploymentVersion={deploymentVersion()} />;
}
