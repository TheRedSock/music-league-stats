import fs from "node:fs";
import { parseArgs } from "node:util";
import dotenv from "dotenv";

const API_BASE = "https://console.neon.tech/api/v2";

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        apply: { type: "boolean", default: false },
        "cu-hours": { type: "string", default: "50" },
        help: { type: "boolean", default: false },
      },
    }));
  } catch {
    throw new Error("Use --help to see supported arguments.");
  }
  if (values.help) {
    console.log(`Preview: node scripts/neon-quota.mjs [--cu-hours=50]
Apply:   node scripts/neon-quota.mjs --apply [--cu-hours=50]

Reads NEON_API_KEY, NEON_PROJECT_ID and DATABASE_URL from .env or the process
environment (process values take precedence). Verifies the project owns the
configured database endpoint. Only changes the monthly compute quota; retains
other quotas and never automatically raises an existing, stricter compute quota.
No database connection is opened and no credential values are logged.`);
    return;
  }
  const hours = Number(values["cu-hours"]);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isSafeInteger(hours * 3600)) {
    throw new Error("--cu-hours must be positive and convert to a whole, safe number of CU-seconds.");
  }
  const envFile = fs.existsSync(".env") ? dotenv.parse(fs.readFileSync(".env")) : {};
  const setting = (name) => process.env[name] ?? envFile[name];
  const apiKey = setting("NEON_API_KEY");
  const projectId = setting("NEON_PROJECT_ID");
  if (!apiKey || !projectId) {
    throw new Error("Add NEON_API_KEY and NEON_PROJECT_ID to local .env. PostgreSQL credentials cannot manage Neon quotas.");
  }
  if (!/^[a-z0-9-]{1,60}$/.test(projectId)) {
    throw new Error("NEON_PROJECT_ID has an invalid format.");
  }
  if (/^(br|ep|org)-/.test(projectId)) {
    throw new Error("NEON_PROJECT_ID must be the project ID from Project Settings, not a branch (br-), compute endpoint (ep-), or organization (org-) ID.");
  }
  let endpointId;
  try {
    const databaseUrl = new URL(setting("DATABASE_URL"));
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error();
    endpointId = databaseUrl.hostname.split(".")[0].replace(/-pooler$/, "");
    if (!/^ep-[a-z0-9-]+$/.test(endpointId)) throw new Error();
  } catch {
    throw new Error("DATABASE_URL must identify a Neon PostgreSQL endpoint so the target project can be verified.");
  }

  async function request(path, method = "GET", body) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        redirect: "error",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(`Neon ${method} request did not return a response. If applying, run a preview to check whether it took effect before retrying.`);
    }
    if (!response.ok) {
      // Do not log response bodies: provider diagnostics can contain sensitive data.
      throw new Error(`Neon ${method} returned HTTP ${response.status}. Check the API key's project permissions; no response body was logged.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Neon returned an unreadable response. Run a preview to inspect saved settings before retrying an apply.");
    }
  }

  const projectPath = `/projects/${projectId}`;
  const { project } = await request(projectPath);
  if (project?.id !== projectId) throw new Error("Neon returned an unexpected project; refusing to continue.");
  const { endpoints } = await request(`${projectPath}/endpoints`);
  if (!Array.isArray(endpoints) || !endpoints.some((endpoint) => endpoint.id === endpointId && endpoint.project_id === projectId)) {
    throw new Error("The selected project does not own the DATABASE_URL endpoint; no quota was changed.");
  }
  const currentQuota = project.settings?.quota ?? {};
  const desiredSeconds = hours * 3600;
  const currentSeconds = currentQuota.compute_time_seconds;
  console.log(JSON.stringify({
    projectId,
    projectName: project.name,
    databaseEndpointVerified: true,
    currentQuota,
    proposedComputeCuHours: hours,
    proposedComputeTimeSeconds: desiredSeconds,
  }, null, 2));
  if (currentSeconds > 0 && currentSeconds <= desiredSeconds) {
    console.log("An equal or stricter compute quota is already configured; no changes made.");
    return;
  }
  if (!values.apply) {
    console.log("Preview only. Add --apply to save this compute quota.");
    return;
  }
  await request(projectPath, "PATCH", {
    project: { settings: { quota: { ...currentQuota, compute_time_seconds: desiredSeconds } } },
  });
  const { project: verified } = await request(projectPath);
  const savedQuota = verified?.settings?.quota;
  if (savedQuota?.compute_time_seconds !== desiredSeconds ||
      Object.entries(currentQuota).some(([key, value]) => key !== "compute_time_seconds" && savedQuota?.[key] !== value)) {
    throw new Error("Saved quotas did not match the requested settings. Inspect the project before making further changes.");
  }
  console.log(`Verified: monthly compute quota saved as ${hours} CU-hours (${desiredSeconds} CU-seconds). Other quotas retained.`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Quota operation failed.");
  process.exitCode = 1;
});
