import {
  getAllLeaguesMaterializationStatus,
  refreshAllLeaguesMaterialization,
} from "@/lib/analytics-materialize";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge" || !process.env.DATABASE_URL) return;

  const status = await getAllLeaguesMaterializationStatus().catch(() => null);
  // Refresh when missing/pending/failed. Skip only a fresh completed job, or a
  // processing job that is likely still owned by another worker.
  if (status?.status === "completed") return;
  if (status?.status === "processing") {
    const startedAt = status.job.startedAt
      ? new Date(status.job.startedAt).getTime()
      : 0;
    if (startedAt && Date.now() - startedAt < 10 * 60 * 1000) return;
  }

  refreshAllLeaguesMaterialization(undefined, { force: true }).catch(
    (error: unknown) => {
      console.error("All-leagues analytics materialization failed.", error);
    },
  );
}
