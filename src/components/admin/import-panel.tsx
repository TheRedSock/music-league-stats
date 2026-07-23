"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import type { AdminLeague } from "@/components/admin/types";
import { Button } from "@/components/ui/button";
import {
  importKinds,
  requiredCsvHeaders,
  type ImportKind,
  type ImportManifest,
} from "@/lib/import-data";
import { runSteppedAnalyticsRefresh } from "@/lib/analytics-refresh-client";
import {
  parseImportFile,
  sha256Json,
  type ParsedImportFile,
} from "@/lib/import-client";

type Files = Record<ImportKind, File | null>;
type ImportSummary = {
  competitors: number;
  memberships: number;
  rounds: number;
  submissions: number;
  votes: number;
};

const emptyFiles: Files = {
  competitors: null,
  rounds: null,
  submissions: null,
  votes: null,
};

const importKindLabels: Record<ImportKind, string> = {
  competitors: "Competitors CSV",
  rounds: "Rounds CSV",
  submissions: "Submissions CSV",
  votes: "Votes CSV",
};

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-lime-300/60";

async function responseJson<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "The import request failed.");
  }
  return result;
}

export function ImportPanel({ leagues }: { leagues: AdminLeague[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<Files>(emptyFiles);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [rowCounts, setRowCounts] = useState<
    Partial<Record<ImportKind, number>>
  >({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function updateFile(
    kind: ImportKind,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    setFiles((current) => ({
      ...current,
      [kind]: event.target.files?.[0] ?? null,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const leagueId = String(form.get("leagueId") ?? "");
    if (!leagueId || importKinds.some((kind) => !files[kind])) {
      setError("Select a league and all four CSV files.");
      return;
    }

    setPending(true);
    setError("");
    setSummary(null);
    setRowCounts({});
    try {
      const parsed = {} as Record<ImportKind, ParsedImportFile>;
      for (const kind of importKinds) {
        setStatus(`Parsing ${kind}.csv…`);
        parsed[kind] = await parseImportFile(kind, files[kind]!);
        setRowCounts((current) => ({
          ...current,
          [kind]: parsed[kind].rows.length,
        }));
      }
      const manifest: ImportManifest = {
        competitors: {
          fileName: parsed.competitors.fileName,
          rowCount: parsed.competitors.rows.length,
          chunkCount: parsed.competitors.chunks.length,
          checksum: parsed.competitors.checksum,
        },
        rounds: {
          fileName: parsed.rounds.fileName,
          rowCount: parsed.rounds.rows.length,
          chunkCount: parsed.rounds.chunks.length,
          checksum: parsed.rounds.checksum,
        },
        submissions: {
          fileName: parsed.submissions.fileName,
          rowCount: parsed.submissions.rows.length,
          chunkCount: parsed.submissions.chunks.length,
          checksum: parsed.submissions.checksum,
        },
        votes: {
          fileName: parsed.votes.fileName,
          rowCount: parsed.votes.rows.length,
          chunkCount: parsed.votes.chunks.length,
          checksum: parsed.votes.checksum,
        },
      };
      const checksum = await sha256Json(manifest);
      setStatus("Creating resumable import batch…");
      const batch = await responseJson<{
        batchId: string;
        status: "pending" | "processing" | "completed" | "failed";
        summary: ImportSummary | null;
      }>(
        await fetch("/api/admin/imports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leagueId, checksum, manifest }),
        }),
      );
      if (batch.status === "completed" && batch.summary) {
        setSummary(batch.summary);
        await runSteppedAnalyticsRefresh((message) => setStatus(message));
        setStatus("This exact import was already completed; analytics are fresh.");
        router.refresh();
        return;
      }

      const chunks = importKinds.flatMap((kind) => parsed[kind].chunks);
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        setStatus(
          `Uploading chunk ${index + 1} of ${chunks.length} (${chunk.kind})…`,
        );
        await responseJson(
          await fetch(`/api/admin/imports/${batch.batchId}/chunks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(chunk),
          }),
        );
      }

      setStatus("Validating and atomically merging rows…");
      const completed = await responseJson<{
        status: "completed";
        summary: ImportSummary;
      }>(
        await fetch(`/api/admin/imports/${batch.batchId}/commit`, {
          method: "POST",
        }),
      );
      setSummary(completed.summary);
      await runSteppedAnalyticsRefresh((message) => setStatus(message));
      setStatus("Import completed successfully.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
      setStatus("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label
          className="mb-1.5 block text-sm font-medium text-zinc-200"
          htmlFor="import-league"
        >
          Target league
        </label>
        <select
          className={selectClass}
          disabled={pending}
          id="import-league"
          name="leagueId"
          required
        >
          <option value="">Select a league</option>
          {leagues.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {importKinds.map((kind) => (
          <div key={kind}>
            <p
              className="mb-1.5 text-sm font-medium text-zinc-200"
              id={`file-${kind}-label`}
            >
              {importKindLabels[kind]}
            </p>
            <input
              accept=".csv,text/csv"
              aria-labelledby={`file-${kind}-label`}
              className="peer sr-only"
              disabled={pending}
              id={`file-${kind}`}
              onChange={(event) => updateFile(kind, event)}
              required
              type="file"
            />
            <label
              className={`flex h-10 items-center overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-sm peer-focus-visible:border-lime-300/60 peer-focus-visible:ring-2 peer-focus-visible:ring-lime-300/15 ${
                pending
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:border-white/20"
              }`}
              htmlFor={`file-${kind}`}
            >
              <span className="flex h-full shrink-0 items-center border-r border-white/10 bg-white/[0.04] px-3 font-medium text-zinc-300">
                Choose file
              </span>
              <span className="min-w-0 truncate px-3 text-zinc-500">
                {files[kind]?.name ?? "No file chosen"}
              </span>
            </label>
            <p className="mt-1.5 truncate text-xs text-zinc-500">
              {requiredCsvHeaders[kind].join(", ")}
            </p>
            {rowCounts[kind] !== undefined ? (
              <p className="mt-1 text-xs text-lime-300">
                {rowCounts[kind]?.toLocaleString()} rows parsed
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending || leagues.length === 0} type="submit">
          <FileUp aria-hidden="true" className="size-4" />
          {pending ? "Importing…" : "Import CSV files"}
        </Button>
        {status ? (
          <p aria-live="polite" className="text-sm text-zinc-300">
            {status}
          </p>
        ) : null}
      </div>
      {error ? (
        <p
          className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {summary ? (
        <div
          className="grid gap-2 rounded-xl border border-lime-300/20 bg-lime-300/[0.07] p-4 sm:grid-cols-5"
          role="status"
        >
          {(["competitors", "memberships", "rounds", "submissions", "votes"] as const).map(
            (key) => (
              <div key={key}>
                <p className="font-mono text-lg text-lime-200">
                  {summary[key].toLocaleString()}
                </p>
                <p className="text-xs capitalize text-zinc-400">{key}</p>
              </div>
            ),
          )}
        </div>
      ) : null}
    </form>
  );
}
