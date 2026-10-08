"use client";

import { LogOut, Plus, RefreshCw, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import { AnalyticsRefreshPanel } from "@/components/admin/analytics-refresh-panel";
import { ImportPanel } from "@/components/admin/import-panel";
import { LeagueForm } from "@/components/admin/league-form";
import { PlayerNameEditor } from "@/components/admin/player-name-editor";
import { SpotifyEnrichPanel } from "@/components/admin/spotify-enrich-panel";
import type {
  AdminImportBatch,
  AdminLeague,
  AdminPlayer,
} from "@/components/admin/types";
import type { AnalyticsRefreshStatusResponse } from "@/lib/analytics-refresh-client";
import type { SpotifyEnrichStatusResponse } from "@/lib/spotify-enrich-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TruncatedCell,
} from "@/components/ui/table";
import { musicLeagueUrl } from "@/lib/music-league-urls";

const ADMIN_SECTIONS = [
  ["csv-sync", "Import CSVs"],
  ["analytics-refresh", "Refresh analytics"],
  ["create-league", "Create league"],
  ["existing-leagues", "Existing leagues"],
  ["spotify-enrichment", "Spotify enrichment"],
  ["player-names", "Player names & slugs"],
  ["import-history", "Import history"],
] as const;

export function AdminDashboard({
  leagues,
  history,
  players,
  materializationStatus,
  spotifyEnrichStatus,
}: {
  leagues: AdminLeague[];
  history: AdminImportBatch[];
  players: AdminPlayer[];
  materializationStatus: AnalyticsRefreshStatusResponse | null;
  spotifyEnrichStatus: SpotifyEnrichStatusResponse | null;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Admin
          </h1>
        </div>
        <Button
          disabled={loggingOut}
          onClick={logout}
          size="sm"
          variant="secondary"
        >
          <LogOut aria-hidden="true" className="size-4" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Admin sections" className="rounded-xl border border-white/10 bg-zinc-950/90 p-4 lg:sticky lg:top-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">On this page</p>
          <ul className="flex flex-wrap gap-2 lg:flex-col">
            {ADMIN_SECTIONS.map(([id, label]) => (
              <li key={id}><a className="block rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-lime-200 focus-visible:outline-lime-300" href={`#${id}`}>{label}</a></li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-8">
          <Card id="csv-sync" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw aria-hidden="true" className="size-4 text-lime-300" />
                Import CSVs
              </CardTitle>
              <CardDescription>
                Choose a league and its four exports. Imports update matching rows, keep missing rows and refresh results automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportPanel leagues={leagues} />
            </CardContent>
          </Card>

          <section id="analytics-refresh" className="scroll-mt-24" aria-label="Refresh analytics"><AnalyticsRefreshPanel initialStatus={materializationStatus} /></section>

          <details id="create-league" className="scroll-mt-24 rounded-lg border border-white/10 p-4"><summary className="cursor-pointer font-medium">Create a league</summary>
          <Card className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus aria-hidden="true" className="size-4 text-lime-300" />
                Create league
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LeagueForm />
            </CardContent>
          </Card>
          </details>

          <section id="existing-leagues" className="scroll-mt-24" aria-labelledby="existing-leagues-heading">
            <div className="mb-4">
              <h2
                className="text-xl font-semibold text-white"
                id="existing-leagues-heading"
              >
                Existing leagues
              </h2>
            </div>
            {leagues.length ? (
              <div className="divide-y divide-white/10 rounded-lg border border-white/10">
                {leagues.map((league) => (
                  <details key={league.id} className="group p-4">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-200">{league.name}<span className="ml-3 text-xs text-zinc-400">Edit</span></summary>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle>
                            <MusicLeagueLink href={musicLeagueUrl(league.musicLeagueId)}>
                              {league.name}
                            </MusicLeagueLink>
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Music League ID: {league.musicLeagueId ?? "Not set"}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={
                            league.status === "active" ? "success" : "muted"
                          }
                        >
                          {league.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <LeagueForm league={league} />
                    </CardContent>
                  </details>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-zinc-400">
                Create a league before importing CSV data.
              </p>
            )}
          </section>



          <details id="spotify-enrichment" className="scroll-mt-24 rounded-lg border border-white/10 p-4"><summary className="cursor-pointer font-medium">Spotify artist data</summary><div className="mt-4"><SpotifyEnrichPanel initialStatus={spotifyEnrichStatus} /></div></details>



          <details id="player-names" className="scroll-mt-24 rounded-lg border border-white/10 p-4"><summary className="cursor-pointer font-medium">Edit player names and profile links</summary>
          <Card className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRoundCog aria-hidden="true" className="size-4 text-lime-300" />
                Player names &amp; slugs
              </CardTitle>
              <CardDescription>
                Override the display name and edit the unique profile slug used in
                /players/… URLs. Imports seed the slug from the Music League name
                and never overwrite admin edits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlayerNameEditor players={players} />
            </CardContent>
          </Card>
          </details>

          <section id="import-history" className="scroll-mt-24" aria-labelledby="import-history-heading">
            <div className="mb-4">
              <h2
                className="text-xl font-semibold text-white"
                id="import-history-heading"
              >
                Import history
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Most recent 25 imports.
              </p>
            </div>
            <Card className="overflow-hidden">
              {history.length ? (
                <Table className="min-w-[48rem] table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[24%]">Created</TableHead>
                      <TableHead className="w-[24%]">League</TableHead>
                      <TableHead className="w-[16%]">Music League ID</TableHead>
                      <TableHead className="w-[14%]">Status</TableHead>
                      <TableHead>Progress / result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(batch.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <TruncatedCell title={batch.leagueName}>
                            <MusicLeagueLink
                              href={musicLeagueUrl(batch.leagueMusicLeagueId)}
                            >
                              {batch.leagueName}
                            </MusicLeagueLink>
                          </TruncatedCell>
                        </TableCell>
                        <TableCell>
                          <TruncatedCell title={batch.leagueMusicLeagueId ?? "Not set"}>
                            {batch.leagueMusicLeagueId ?? "Not set"}
                          </TruncatedCell>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              batch.status === "completed" ? "success" : "muted"
                            }
                          >
                            {batch.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {batch.summary ? (
                            <TruncatedCell
                              title={`${batch.summary.submissions.toLocaleString()} songs, ${batch.summary.votes.toLocaleString()} votes`}
                            >
                              {batch.summary.submissions.toLocaleString()} songs,{" "}
                              {batch.summary.votes.toLocaleString()} votes
                            </TruncatedCell>
                          ) : batch.errorMessage ? (
                            <TruncatedCell className="text-red-300" title={batch.errorMessage}>
                              {batch.errorMessage}
                            </TruncatedCell>
                          ) : (
                            <TruncatedCell
                              title={`${batch.receivedRows.toLocaleString()} rows in ${batch.receivedChunks.toLocaleString()} chunks`}
                            >
                              {batch.receivedRows.toLocaleString()} rows in{" "}
                              {batch.receivedChunks.toLocaleString()} chunks
                            </TruncatedCell>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="p-6 text-sm text-zinc-400">
                  No imports have been started.
                </p>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
