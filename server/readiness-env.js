export function readinessLinkSecret(env) {
  return env.READINESS_LINK_SECRET || (env.VERCEL_ENV === 'preview' ? env.RD_LINK_SECRET : undefined);
}

export function readinessPortalOrigin(env) {
  return env.READINESS_PORTAL_ORIGIN ||
    (env.VERCEL_ENV === 'preview' && env.VERCEL_URL ? 'https://' + env.VERCEL_URL : undefined);
}
