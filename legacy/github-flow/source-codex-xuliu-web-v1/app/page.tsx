import AuthenticatedDashboard from "./AuthenticatedDashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  return <AuthenticatedDashboard />;
}
