import { asc, desc, eq } from "drizzle-orm";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLogin } from "@/components/admin/admin-login";
import type {
  AdminImportBatch,
  AdminLeague,
} from "@/components/admin/types";
import { Container } from "@/components/layout/container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { importBatches, leagues } from "@/db/schema";
import {
  getAdminConfig,
  isAdminAuthenticated,
} from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const config = getAdminConfig();
  if (!config.configured) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-xl border-amber-300/20">
          <CardHeader>
            <TriangleAlert
              aria-hidden="true"
              className="mb-3 size-6 text-amber-300"
            />
            <CardTitle>Admin setup required</CardTitle>
            <CardDescription>{config.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">
              See <code className="text-zinc-200">.env.example</code> and the
              README for setup instructions. No configured values are shown
              here.
            </p>
          </CardContent>
        </Card>
      </Container>
    );
  }
  if (!(await isAdminAuthenticated())) {
    return (
      <Container className="py-16">
        <AdminLogin />
      </Container>
    );
  }

  const [leagueRows, historyRows] = await Promise.all([
    db.select().from(leagues).orderBy(asc(leagues.name)),
    db
      .select({
        id: importBatches.id,
        leagueId: importBatches.leagueId,
        leagueName: leagues.name,
        status: importBatches.status,
        receivedRows: importBatches.receivedRows,
        receivedChunks: importBatches.receivedChunks,
        summary: importBatches.summary,
        errorMessage: importBatches.errorMessage,
        createdAt: importBatches.createdAt,
        completedAt: importBatches.completedAt,
      })
      .from(importBatches)
      .innerJoin(leagues, eq(importBatches.leagueId, leagues.id))
      .orderBy(desc(importBatches.createdAt))
      .limit(25),
  ]);
  const adminLeagues: AdminLeague[] = leagueRows.map((league) => ({
    id: league.id,
    name: league.name,
    slug: league.slug,
    totalRounds: league.totalRounds,
    maxPlayers: league.maxPlayers,
    songsPerPlayerPerRound: league.songsPerPlayerPerRound,
    status: league.status,
    startDate: league.startDate,
    endDate: league.endDate,
  }));
  const history: AdminImportBatch[] = historyRows.map((batch) => ({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  }));

  return (
    <Container className="py-12">
      <AdminDashboard history={history} leagues={adminLeagues} />
    </Container>
  );
}
