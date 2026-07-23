import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnalyticsFilterBar } from "@/components/analytics/analytics-filter-bar";
import { AnalyticsUnavailable } from "@/components/analytics/analytics-state";
import {
  FACT_PREVIEW_LIMIT,
  FactPanel,
} from "@/components/analytics/fact-panel";
import { MusicLeagueLink } from "@/components/analytics/music-league-link";
import { RoundOutcomeHover } from "@/components/analytics/round-outcome-hover";
import { Container } from "@/components/layout/container";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TruncatedCell,
} from "@/components/ui/table";
import {
  buildAnalyticsHref,
  encodeScopeIds,
  getCachedFilterOptions,
  getCachedSubmissionFactsData,
  leagueTableLabel,
  loadAnalytics,
  parseAnalyticsFilters,
  resolveAnalyticsFilter,
  scopeQueryParams,
  spotifyTrackUrl,
  truncateRoundName,
  type QueryValue,
  type SearchParams,
  type SubmissionFactsData,
} from "@/lib/analytics";
import { musicLeagueUrl } from "@/lib/music-league-urls";

export const metadata: Metadata = {
  title: "Facts",
  description: "Submission patterns and voting quirks for the selected scope.",
};

function rankedFactList<T>({
  rows,
  render,
}: {
  rows: T[];
  render: (row: T, index: number) => ReactNode;
}) {
  return (
    <ol className="divide-y divide-white/[0.06]">
      {rows.map((row, index) => (
        <li className="grid grid-cols-[2rem_1fr] gap-3 py-3" key={index}>
          <span className="font-mono text-xs text-zinc-600">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">{render(row, index)}</div>
        </li>
      ))}
    </ol>
  );
}

function percent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function ratio(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function signedSpread(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(digits)} pp`;
}

function correlationLabel(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "Not enough data";
  const abs = Math.abs(value);
  if (abs < 0.05) return "essentially no linear relationship";
  if (abs < 0.15) return "a very weak relationship";
  if (abs < 0.3) return "a weak relationship";
  if (abs < 0.5) return "a moderate relationship";
  return "a strong relationship";
}

function previewRows<T>(rows: T[]): T[] {
  return rows.slice(0, FACT_PREVIEW_LIMIT);
}

function hasPlaylistIndices(
  bias: SubmissionFactsData["playlistPositionBias"],
): boolean {
  return bias.indexedRounds > 0 || bias.sampleSize > 0;
}

function hasReliablePlaylistBias(
  bias: SubmissionFactsData["playlistPositionBias"],
): boolean {
  return (
    bias.sampleSize >= 10 &&
    bias.indexedRounds > 0 &&
    bias.correlationPoints != null
  );
}

function playlistBiasCopy(bias: SubmissionFactsData["playlistPositionBias"]) {
  if (!hasPlaylistIndices(bias)) {
    return "Playlist position indices are missing for this scope. Re-sync submissions.csv so slate order can be stored, then refresh analytics.";
  }

  if (!hasReliablePlaylistBias(bias)) {
    return `Only ${bias.sampleSize} indexed song${bias.sampleSize === 1 ? "" : "s"} across ${bias.indexedRounds} round${bias.indexedRounds === 1 ? "" : "s"} — need at least 10 songs with playlist_index (and more than one indexed song per round) to estimate a position effect.`;
  }

  const correlationPoints = bias.correlationPoints as number;
  const direction =
    correlationPoints < -0.05
      ? "earlier playlist slots tending to score slightly higher"
      : correlationPoints > 0.05
        ? "later playlist slots tending to score slightly higher"
        : "little difference across playlist position";

  return `Across ${bias.sampleSize} songs in ${bias.indexedRounds} indexed rounds, playlist position shows ${correlationLabel(correlationPoints)} with points (${ratio(correlationPoints, 3)}), with ${direction}. Position 0 is earliest in the Spotify playlist; the highest index is latest.`;
}

function FactTable({
  headers,
  rows,
}: {
  headers: Array<{ align?: "left" | "right"; label: string; width?: string }>;
  rows: ReactNode[][];
}) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead
              className={
                header.align === "right"
                  ? `text-right ${header.width ?? ""}`
                  : header.width
              }
              key={header.label}
            >
              {header.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((cells, index) => (
          <TableRow key={index}>
            {cells.map((cell, cellIndex) => (
              <TableCell
                className={
                  headers[cellIndex]?.align === "right"
                    ? "text-right font-mono"
                    : "max-w-0"
                }
                key={cellIndex}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PlayerLink({
  filterParams,
  id,
  name,
}: {
  filterParams: Record<string, QueryValue>;
  id: string;
  name: string;
}) {
  return (
    <Link
      className="hover:text-lime-200"
      href={buildAnalyticsHref(`/players/${id}`, filterParams, {})}
    >
      {name}
    </Link>
  );
}

function SpotifyTitle({
  spotifyUri,
  title,
}: {
  spotifyUri: string;
  title: string;
}) {
  const href = spotifyTrackUrl(spotifyUri);
  if (!href) {
    return <TruncatedCell title={title}>{title}</TruncatedCell>;
  }
  return (
    <a
      className="inline-flex max-w-full items-center gap-1.5 hover:text-lime-200"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <span className="truncate">{title}</span>
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}

function RoundScopeLinks({
  leagueMusicLeagueId,
  leagueName,
  leagueSlug,
  roundName,
  roundOrdinal,
  sourceRoundId,
}: {
  leagueMusicLeagueId: string | null;
  leagueName: string;
  leagueSlug: string;
  roundName: string;
  roundOrdinal: number;
  sourceRoundId: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <MusicLeagueLink
        className="text-sm font-medium text-zinc-100"
        href={musicLeagueUrl(leagueMusicLeagueId)}
        showIcon={false}
        title={leagueName}
      >
        {leagueTableLabel({ name: leagueName, slug: leagueSlug })}
      </MusicLeagueLink>
      <MusicLeagueLink
        className="text-xs text-zinc-500"
        href={musicLeagueUrl(leagueMusicLeagueId, sourceRoundId)}
        showIcon={false}
        title={roundName}
      >
        R{roundOrdinal} · {truncateRoundName(roundName)}
      </MusicLeagueLink>
    </div>
  );
}

export default async function FactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters(params), options);
    const data = await getCachedSubmissionFactsData(
      encodeScopeIds(filter.leagueIds),
      encodeScopeIds(filter.roundIds),
    );
    return { data, filter, options };
  });

  if (result.status !== "ready") {
    return (
      <Container className="py-16 sm:py-24">
        <AnalyticsUnavailable
          progressLabel={result.status === "building" ? result.progressLabel : null}
          status={result.status}
        />
      </Container>
    );
  }

  const { data, filter, options } = result.data;
  const filterParams = scopeQueryParams(filter);
  const playlistBias = data.playlistPositionBias;
  const hasIndices = hasPlaylistIndices(playlistBias);
  const reliablePlaylistBias = hasReliablePlaylistBias(playlistBias);

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Facts
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Submission patterns and voting quirks in the selected scope
          </p>
        </div>
        <div className="w-full lg:max-w-3xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Submission patterns
      </h2>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <FactPanel
          description="Artists grouped by exact exported artist text, normalized for case."
          dialog={
            <FactTable
              headers={[
                { label: "Artist", width: "w-[50%]" },
                { align: "right", label: "Submissions" },
                { align: "right", label: "Submitters" },
              ]}
              rows={data.mostSubmittedArtists.map((row) => [
                <span className="font-medium text-zinc-100" key="a">
                  {row.artist}
                </span>,
                row.submissions,
                row.submitters,
              ])}
            />
          }
          itemCount={data.mostSubmittedArtists.length}
          title="Most-submitted artists"
        >
          {rankedFactList({
            rows: previewRows(data.mostSubmittedArtists),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.artist}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} submissions · {row.submitters} submitters
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="The strongest one-player, one-artist repeats."
          dialog={
            <FactTable
              headers={[
                { label: "Player", width: "w-[35%]" },
                { label: "Artist", width: "w-[40%]" },
                { align: "right", label: "Subs" },
              ]}
              rows={data.artistLoyalists.map((row) => [
                <PlayerLink
                  filterParams={filterParams}
                  id={row.playerId}
                  key="p"
                  name={row.playerName}
                />,
                <TruncatedCell key="a" title={row.artist}>
                  {row.artist}
                </TruncatedCell>,
                row.submissions,
              ])}
            />
          }
          itemCount={data.artistLoyalists.length}
          title="Player artist streaks"
        >
          {rankedFactList({
            rows: previewRows(data.artistLoyalists),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <PlayerLink
                    filterParams={filterParams}
                    id={row.playerId}
                    name={row.playerName}
                  />{" "}
                  <span className="text-zinc-500">→ {row.artist}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} submissions
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Artists that reached the most different submitters."
          dialog={
            <FactTable
              headers={[
                { label: "Artist", width: "w-[50%]" },
                { align: "right", label: "Submitters" },
                { align: "right", label: "Submissions" },
              ]}
              rows={data.diverseArtists.map((row) => [
                <span className="font-medium text-zinc-100" key="a">
                  {row.artist}
                </span>,
                row.submitters,
                row.submissions,
              ])}
            />
          }
          itemCount={data.diverseArtists.length}
          title="Broadest artist reach"
        >
          {rankedFactList({
            rows: previewRows(data.diverseArtists),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.artist}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submitters} submitters · {row.submissions} submissions
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactPanel
          description="Players with the most submissions and distinct artists in this scope."
          dialog={
            <FactTable
              headers={[
                { label: "Player", width: "w-[50%]" },
                { align: "right", label: "Submissions" },
                { align: "right", label: "Artists" },
              ]}
              rows={data.prolificSubmitters.map((row) => [
                <PlayerLink
                  filterParams={filterParams}
                  id={row.playerId}
                  key="p"
                  name={row.playerName}
                />,
                row.submissions,
                row.artists,
              ])}
            />
          }
          itemCount={data.prolificSubmitters.length}
          title="Most prolific submitters"
        >
          {rankedFactList({
            rows: previewRows(data.prolificSubmitters),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <PlayerLink
                    filterParams={filterParams}
                    id={row.playerId}
                    name={row.playerName}
                  />
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} submissions · {row.artists} artists
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Rounds with the largest submitted song slates."
          dialog={
            <FactTable
              headers={[
                { label: "League", width: "w-[30%]" },
                { label: "Round", width: "w-[40%]" },
                { align: "right", label: "Songs" },
                { align: "right", label: "Players" },
              ]}
              rows={data.densestRounds.map((row) => [
                <MusicLeagueLink
                  className="text-zinc-100"
                  href={musicLeagueUrl(row.leagueMusicLeagueId)}
                  key="l"
                  showIcon={false}
                  title={row.leagueName}
                >
                  {leagueTableLabel({
                    name: row.leagueName,
                    slug: row.leagueSlug,
                  })}
                </MusicLeagueLink>,
                <MusicLeagueLink
                  className="text-zinc-300"
                  href={musicLeagueUrl(
                    row.leagueMusicLeagueId,
                    row.sourceRoundId,
                  )}
                  key="r"
                  showIcon={false}
                  title={row.roundName}
                >
                  R{row.roundOrdinal} · {truncateRoundName(row.roundName)}
                </MusicLeagueLink>,
                row.submissions,
                row.submitters,
              ])}
            />
          }
          itemCount={data.densestRounds.length}
          title="Densest rounds"
        >
          {rankedFactList({
            rows: previewRows(data.densestRounds),
            render: (row) => (
              <>
                <RoundScopeLinks
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 text-xs text-zinc-500">
                  {row.submissions} songs from {row.submitters} submitters
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <FactPanel
          description="Tracks that were submitted more than once in the selected scope."
          dialog={
            <FactTable
              headers={[
                { label: "Song", width: "w-[40%]" },
                { align: "right", label: "Subs" },
                { align: "right", label: "Players" },
                { align: "right", label: "Leagues" },
                { align: "right", label: "Rounds" },
              ]}
              rows={data.repeatedSongs.map((row) => [
                <div key="s">
                  <p className="truncate font-medium text-zinc-100">
                    <SpotifyTitle
                      spotifyUri={row.spotifyUri}
                      title={row.title}
                    />
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {row.artist}
                  </p>
                </div>,
                row.submissions,
                row.submitters,
                row.leagues,
                row.rounds,
              ])}
            />
          }
          emptyMessage="No repeated tracks in this scope."
          itemCount={data.repeatedSongs.length}
          title="Repeated songs"
        >
          {rankedFactList({
            rows: previewRows(data.repeatedSongs),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <SpotifyTitle spotifyUri={row.spotifyUri} title={row.title} />
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · {row.submissions}x · {row.submitters} submitters
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Longest exported song titles."
          dialog={
            <FactTable
              headers={[
                { label: "Title", width: "w-[45%]" },
                { label: "Artist", width: "w-[30%]" },
                { align: "right", label: "Chars" },
                { label: "By" },
              ]}
              rows={data.longestTitles.map((row) => [
                <TruncatedCell key="t" title={row.title}>
                  {row.title}
                </TruncatedCell>,
                <TruncatedCell key="a" title={row.artist}>
                  {row.artist}
                </TruncatedCell>,
                row.length,
                <TruncatedCell key="s" title={row.submitterName}>
                  {row.submitterName}
                </TruncatedCell>,
              ])}
            />
          }
          itemCount={data.longestTitles.length}
          title="Longest titles"
        >
          {rankedFactList({
            rows: previewRows(data.longestTitles),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · {row.length} chars · {row.submitterName}
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Shortest exported song titles."
          dialog={
            <FactTable
              headers={[
                { label: "Title", width: "w-[45%]" },
                { label: "Artist", width: "w-[30%]" },
                { align: "right", label: "Chars" },
                { label: "By" },
              ]}
              rows={data.shortestTitles.map((row) => [
                <TruncatedCell key="t" title={row.title}>
                  {row.title}
                </TruncatedCell>,
                <TruncatedCell key="a" title={row.artist}>
                  {row.artist}
                </TruncatedCell>,
                row.length,
                <TruncatedCell key="s" title={row.submitterName}>
                  {row.submitterName}
                </TruncatedCell>,
              ])}
            />
          }
          itemCount={data.shortestTitles.length}
          title="Shortest titles"
        >
          {rankedFactList({
            rows: previewRows(data.shortestTitles),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · {row.length} chars · {row.submitterName}
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>

      <h2 className="mt-12 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Voting quirks
      </h2>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactPanel
          description="High positive reach relative to round share (spread = reach − share). Broad mild appeal. Requires ~1/3 of scope rounds entered."
          dialog={
            <FactTable
              headers={[
                { label: "Player", width: "w-[35%]" },
                { align: "right", label: "Songs" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "Spread" },
              ]}
              rows={data.crowdPleaserPlayers.map((row) => [
                <PlayerLink
                  filterParams={filterParams}
                  id={row.playerId}
                  key="p"
                  name={row.playerName}
                />,
                row.songs,
                percent(row.avgPositiveReach),
                percent(row.avgRoundPointShare),
                signedSpread(row.appealSpread),
              ])}
            />
          }
          emptyMessage="Not enough qualified player samples in this scope."
          itemCount={data.crowdPleaserPlayers.length}
          title="Crowd pleasers"
        >
          {rankedFactList({
            rows: previewRows(data.crowdPleaserPlayers),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <PlayerLink
                    filterParams={filterParams}
                    id={row.playerId}
                    name={row.playerName}
                  />
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  reach {percent(row.avgPositiveReach)} · share{" "}
                  {percent(row.avgRoundPointShare)} · spread{" "}
                  {signedSpread(row.appealSpread)}
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="High round share relative to positive reach (negative spread). Concentrated devotees. Requires ~1/3 of scope rounds entered."
          dialog={
            <FactTable
              headers={[
                { label: "Player", width: "w-[35%]" },
                { align: "right", label: "Songs" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "Spread" },
              ]}
              rows={data.nicheDevotionPlayers.map((row) => [
                <PlayerLink
                  filterParams={filterParams}
                  id={row.playerId}
                  key="p"
                  name={row.playerName}
                />,
                row.songs,
                percent(row.avgPositiveReach),
                percent(row.avgRoundPointShare),
                signedSpread(row.appealSpread),
              ])}
            />
          }
          emptyMessage="Not enough qualified player samples in this scope."
          itemCount={data.nicheDevotionPlayers.length}
          title="Niche devotion"
        >
          {rankedFactList({
            rows: previewRows(data.nicheDevotionPlayers),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  <PlayerLink
                    filterParams={filterParams}
                    id={row.playerId}
                    name={row.playerName}
                  />
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  reach {percent(row.avgPositiveReach)} · share{" "}
                  {percent(row.avgRoundPointShare)} · spread{" "}
                  {signedSpread(row.appealSpread)}
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactPanel
          description="Everyone kinda liked it — high reach relative to round share."
          dialog={
            <FactTable
              headers={[
                { label: "Song", width: "w-[40%]" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "Spread" },
                { align: "right", label: "Pts" },
              ]}
              rows={data.thinSpreadSongs.map((row) => [
                <div key="s">
                  <p className="truncate font-medium text-zinc-100">
                    {row.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {row.artist} · {row.submitterName}
                  </p>
                </div>,
                percent(row.positiveReach),
                percent(row.roundPointShare),
                signedSpread(row.appealSpread),
                row.points,
              ])}
            />
          }
          emptyMessage="Not enough song samples in this scope."
          itemCount={data.thinSpreadSongs.length}
          title="Thin-spread songs"
        >
          {rankedFactList({
            rows: previewRows(data.thinSpreadSongs),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.title}
                </p>
                <RoundScopeLinks
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · reach {percent(row.positiveReach)} · share{" "}
                  {percent(row.roundPointShare)}
                </p>
              </>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="A cult classic — concentrated love from a smaller slice of voters."
          dialog={
            <FactTable
              headers={[
                { label: "Song", width: "w-[40%]" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "Spread" },
                { align: "right", label: "Pts" },
              ]}
              rows={data.cultClassicSongs.map((row) => [
                <div key="s">
                  <p className="truncate font-medium text-zinc-100">
                    {row.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {row.artist} · {row.submitterName}
                  </p>
                </div>,
                percent(row.positiveReach),
                percent(row.roundPointShare),
                signedSpread(row.appealSpread),
                row.points,
              ])}
            />
          }
          emptyMessage="Not enough song samples in this scope."
          itemCount={data.cultClassicSongs.length}
          title="Cult classics"
        >
          {rankedFactList({
            rows: previewRows(data.cultClassicSongs),
            render: (row) => (
              <>
                <p className="truncate text-sm font-medium text-zinc-100">
                  {row.title}
                </p>
                <RoundScopeLinks
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.artist} · reach {percent(row.positiveReach)} · share{" "}
                  {percent(row.roundPointShare)}
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactPanel
          description="Rounds where the top song barely edged the runner-up on round point share. Hover a row for the top 3."
          dialog={
            <FactTable
              headers={[
                { label: "League", width: "w-[28%]" },
                { label: "Round", width: "w-[36%]" },
                { align: "right", label: "Top share" },
                { align: "right", label: "Gap" },
              ]}
              rows={data.closestRaces.map((row) => [
                <TruncatedCell
                  key="l"
                  title={leagueTableLabel({
                    name: row.leagueName,
                    slug: row.leagueSlug,
                  })}
                >
                  {leagueTableLabel({
                    name: row.leagueName,
                    slug: row.leagueSlug,
                  })}
                </TruncatedCell>,
                <TruncatedCell
                  key="r"
                  title={`R${row.roundOrdinal} · ${row.roundName}`}
                >
                  R{row.roundOrdinal} · {truncateRoundName(row.roundName)}
                </TruncatedCell>,
                percent(row.maxRoundPointShare),
                percent(row.topTwoShareGap),
              ])}
            />
          }
          emptyMessage="Not enough rounds in this scope."
          itemCount={data.closestRaces.length}
          title="Closest races"
        >
          {rankedFactList({
            rows: previewRows(data.closestRaces),
            render: (row) => (
              <RoundOutcomeHover songs={row.topSongs}>
                <RoundScopeLinks
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  top {percent(row.maxRoundPointShare)} · gap{" "}
                  {percent(row.topTwoShareGap)}
                </p>
              </RoundOutcomeHover>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Rounds dominated by one song’s share of total points. Hover a row for the top 3."
          dialog={
            <FactTable
              headers={[
                { label: "League", width: "w-[28%]" },
                { label: "Round", width: "w-[36%]" },
                { align: "right", label: "Top share" },
                { align: "right", label: "Gap" },
              ]}
              rows={data.biggestLandslides.map((row) => [
                <TruncatedCell
                  key="l"
                  title={leagueTableLabel({
                    name: row.leagueName,
                    slug: row.leagueSlug,
                  })}
                >
                  {leagueTableLabel({
                    name: row.leagueName,
                    slug: row.leagueSlug,
                  })}
                </TruncatedCell>,
                <TruncatedCell
                  key="r"
                  title={`R${row.roundOrdinal} · ${row.roundName}`}
                >
                  R{row.roundOrdinal} · {truncateRoundName(row.roundName)}
                </TruncatedCell>,
                percent(row.maxRoundPointShare),
                percent(row.topTwoShareGap),
              ])}
            />
          }
          emptyMessage="Not enough rounds in this scope."
          itemCount={data.biggestLandslides.length}
          title="Biggest landslides"
        >
          {rankedFactList({
            rows: previewRows(data.biggestLandslides),
            render: (row) => (
              <RoundOutcomeHover songs={row.topSongs}>
                <RoundScopeLinks
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  top {percent(row.maxRoundPointShare)} · gap{" "}
                  {percent(row.topTwoShareGap)}
                </p>
              </RoundOutcomeHover>
            ),
          })}
        </FactPanel>
      </section>

      <FactPanel
        className="mt-4"
        description="Average points and round share by Spotify playlist quartile. Order comes from submissions.csv row order within each round (playlist_index)."
        emptyMessage="Playlist position indices are missing for this scope. Re-sync submissions.csv, then refresh analytics."
        itemCount={
          hasIndices
            ? Math.max(playlistBias.buckets.length, 1)
            : 0
        }
        title="Playlist-position bias"
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                corr vs points
              </p>
              <p className="mt-1 font-mono text-lg text-zinc-100">
                {reliablePlaylistBias
                  ? ratio(playlistBias.correlationPoints, 3)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                corr vs round share
              </p>
              <p className="mt-1 font-mono text-lg text-zinc-100">
                {reliablePlaylistBias
                  ? ratio(playlistBias.correlationShare, 3)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                indexed songs
              </p>
              <p className="mt-1 font-mono text-lg text-zinc-100">
                {playlistBias.sampleSize}
              </p>
            </div>
          </div>
          <p className="text-sm leading-6 text-zinc-400">
            {playlistBiasCopy(playlistBias)}
          </p>
          {reliablePlaylistBias && playlistBias.buckets.length ? (
            <FactTable
              headers={[
                { label: "Playlist quartile", width: "w-[30%]" },
                { align: "right", label: "Songs" },
                { align: "right", label: "Avg pts" },
                { align: "right", label: "Avg share" },
              ]}
              rows={playlistBias.buckets.map((bucket) => [
                <span className="font-medium text-zinc-100" key="b">
                  {bucket.bucket}
                </span>,
                bucket.songs,
                ratio(bucket.avgPoints, 1),
                percent(bucket.avgRoundPointShare),
              ])}
            />
          ) : null}
        </div>
      </FactPanel>
    </Container>
  );
}
