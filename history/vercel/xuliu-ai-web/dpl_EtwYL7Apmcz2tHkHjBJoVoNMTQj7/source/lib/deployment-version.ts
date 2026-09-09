export function deploymentVersion() {
  return process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local";
}
