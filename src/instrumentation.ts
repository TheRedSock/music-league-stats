/**
 * Deploy-time auto-refresh is intentionally disabled.
 *
 * Vercel serverless can kill a long fire-and-forget materialization mid-run,
 * leaving a stuck `processing` job. Refresh is owned by the admin UI button
 * (and the import panel) via short stepped `/api/admin/analytics/refresh`
 * requests instead.
 */
export async function register() {}
