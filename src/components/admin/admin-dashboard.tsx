"use client";

import { LogOut, Plus, RefreshCw, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ImportPanel } from "@/components/admin/import-panel";
import { LeagueForm } from "@/components/admin/league-form";
import { PlayerNameEditor } from "@/components/admin/player-name-editor";
import type {
  AdminImportBatch,
  AdminLeague,
  AdminPlayer,
} from "@/components/admin/types";
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

export function AdminDashboard({
  leagues,
  history,
  players,
}: {
  leagues: AdminLeague[];
  history: AdminImportBatch[];
  players: AdminPlayer[];
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

      <Card>
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

      <section aria-labelledby="existing-leagues-heading">
        <div className="mb-4">
          <h2
            className="text-xl font-semibold text-white"
            id="existing-leagues-heading"
          >
            Existing leagues
          </h2>
        </div>
        {leagues.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {leagues.map((league) => (
              <Card key={league.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{league.name}</CardTitle>
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
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-zinc-400">
            Create a league before importing CSV data.
          </p>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw aria-hidden="true" className="size-4 text-lime-300" />
            CSV sync
          </CardTitle>
          <CardDescription>
            Upload all four exports. Existing rows are updated; missing rows
            are left unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportPanel leagues={leagues} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundCog aria-hidden="true" className="size-4 text-lime-300" />
            Player names
          </CardTitle>
          <CardDescription>
            Set a global display-name override without changing the imported
            source name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlayerNameEditor players={players} />
        </CardContent>
      </Card>

      <section aria-labelledby="import-history-heading">
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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">Created</TableHead>
                  <TableHead className="w-[26%]">League</TableHead>
                  <TableHead className="w-[16%]">Status</TableHead>
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
                        {batch.leagueName}
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
  );
}
