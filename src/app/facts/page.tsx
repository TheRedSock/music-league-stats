import { Suspense } from "react";
import { AnalyticsLoadingShell } from "@/components/analytics/analytics-loading-shell";
import { qualificationRoundFloor } from "@/lib/participation";
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
import { MusicLeagueLink, MusicLeagueScopeLinks } from "@/components/analytics/music-league-link";
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
  type SongSubmissionFact,
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
  rank,
}: {
  rows: T[];
  render: (row: T, index: number) => ReactNode;
  rank?: (row: T) => number;
}) {
  return (
    <ol className="divide-y divide-white/[0.06]">
      {rows.map((row, index) => (
        <li className="grid grid-cols-[2rem_1fr] gap-3 py-3" key={index}>
          <span className="font-mono text-xs text-zinc-600">
            {String(rank ? rank(row) : index + 1).padStart(2, "0")}
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
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}pp`;
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
    return "Playlist order is unavailable for these leagues.";
  }

  if (!hasReliablePlaylistBias(bias)) {
    return `Only ${bias.sampleSize} indexed song${bias.sampleSize === 1 ? "" : "s"} across ${bias.indexedRounds} round${bias.indexedRounds === 1 ? "" : "s"} — need at least 10 songs with playlist_index (and more than one indexed song per round) to compare playlist position.`;
  }

  const correlationPoints = bias.correlationPoints as number;
  const direction =
    correlationPoints < -0.05
      ? "earlier playlist slots tending to score slightly higher"
      : correlationPoints > 0.05
        ? "later playlist slots tending to score slightly higher"
        : "little difference across playlist position";

  return `Across ${bias.sampleSize} songs in ${bias.indexedRounds} indexed rounds, playlist position shows ${correlationLabel(correlationPoints)} with points (${ratio(correlationPoints, 3)}), with ${direction}. This describes a correlation, not an effect caused by playlist order.`;
}

function FactTable({
  headers,
  rows,
}: {
  headers: Array<{ align?: "left" | "right"; label: string; width?: string }>;
  rows: ReactNode[][];
}) {
  return (
    <Table className={headers.length >= 7 ? "min-w-[44rem] table-fixed" : "table-fixed"}>
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
  className,
  leagueMusicLeagueId,
  leagueName,
  leagueSlug,
  roundName,
  roundOrdinal,
  sourceRoundId,
}: {
  className?: string;
  leagueMusicLeagueId: string | null;
  leagueName: string;
  leagueSlug: string;
  roundName: string;
  roundOrdinal: number;
  sourceRoundId: string;
}) {
  return (
    <MusicLeagueScopeLinks
      className={className ?? "text-xs text-zinc-500"}
      leagueHref={musicLeagueUrl(leagueMusicLeagueId)}
      leagueLabel={leagueTableLabel({ name: leagueName, slug: leagueSlug })}
      leagueTitle={leagueName}
      roundHref={musicLeagueUrl(leagueMusicLeagueId, sourceRoundId)}
      roundLabel={`R${roundOrdinal} · ${truncateRoundName(roundName)}`}
      roundTitle={roundName}
    />
  );
}

function SongFactHeading({ artist, spotifyUri, title }: {
  artist: string;
  spotifyUri: string;
  title: string;
}) {
  const href = spotifyTrackUrl(spotifyUri);
  const content = <><span className="block">{title}{href ? <ExternalLink aria-hidden="true" className="ml-1 inline size-3" /> : null}</span><span className="mt-1 block text-xs font-normal text-zinc-400">{artist}</span></>;
  const className = "block min-w-0 text-sm font-medium leading-5 text-zinc-100";
  return href ? (
    <a className={`${className} hover:text-lime-200`} href={href} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : <p className={className}>{content}</p>;
}

function SongFactPreview({ row, metrics, metricsTitle, filterParams }: {
  row: SongSubmissionFact;
  metrics: string;
  metricsTitle?: string;
  filterParams: Record<string, QueryValue>;
}) {
  return (
    <div className="@container min-w-0">
      <SongFactHeading artist={row.artist} spotifyUri={row.spotifyUri} title={row.title} />
      <p className="mt-0.5 truncate text-xs text-zinc-500">
        <RoundScopeLinks {...row} />
      </p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-zinc-500">
        <span className="min-w-0 flex-1 truncate" title={row.submitterName}>
          <PlayerLink filterParams={filterParams} id={row.submitterId} name={row.submitterName} />
        </span>
        <span className="shrink-0 text-zinc-600">·</span>
        <span className="shrink-0 font-mono text-xs" title={metricsTitle ?? metrics}>
          {metrics}
        </span>
      </div>
    </div>
  );
}

async function FactsPageContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const category = typeof params.category === "string" && ["artists", "songs", "rounds", "voting"].includes(params.category) ? params.category : "artists";
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
  const scopeRounds = options.rounds.filter(round =>
    (!filter.leagueIds.length || filter.leagueIds.includes(round.leagueId)) &&
    (!filter.roundIds.length || filter.roundIds.includes(round.id)),
  ).length;
  const participationNote = `Requires ${qualificationRoundFloor(scopeRounds, options.rounds.length)} of ${scopeRounds} scope rounds entered (adaptive participation minimum).`;
  const filterParams = scopeQueryParams(filter);
  const playlistBias = data.playlistPositionBias;
  const hasIndices = hasPlaylistIndices(playlistBias);
  const reliablePlaylistBias = hasReliablePlaylistBias(playlistBias);

  return (
    <Container className="py-6 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Facts
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Submission patterns and voting quirks in the selected scope
          </p>
        </div>
        <div className="min-w-0 sm:max-w-xl">
          <AnalyticsFilterBar filter={filter} options={options} />
        </div>
      </div>

      <section aria-label="Highlights" className="mt-6 grid gap-5 border-y border-white/10 py-5 md:grid-cols-3">
        <div><h2 className="text-xs text-zinc-400">Most submitted artist</h2><p className="mt-2 text-lg font-semibold">{data.mostSubmittedArtists[0]?.artist ?? "No submissions yet"}</p><p className="mt-1 text-sm text-zinc-400">{data.mostSubmittedArtists[0]?.submissions ?? 0} submissions</p></div>
        <div><h2 className="text-xs text-zinc-400">Closest round</h2><p className="mt-2 text-lg font-semibold">{data.closestRaces[0]?.roundName ?? "No scored rounds yet"}</p><p className="mt-1 text-sm text-zinc-400">{data.closestRaces[0] ? `${(data.closestRaces[0].topTwoShareGap * 100).toFixed(1)} percentage-point gap between first and second` : ""}</p></div>
        <div><h2 className="text-xs text-zinc-400">Most repeated song</h2><p className="mt-2 text-lg font-semibold">{data.repeatedSongs[0]?.title ?? "No repeats"}</p><p className="mt-1 text-sm text-zinc-400">{data.repeatedSongs[0] ? `${data.repeatedSongs[0].artist} · ${data.repeatedSongs[0].submissions} submissions` : "Every track was submitted once."}</p></div>
      </section>
      <nav aria-label="Fact categories" className="mt-6 flex flex-wrap gap-2">
        {["artists", "songs", "rounds", "voting"].map(value => <Link key={value} aria-current={category === value ? "page" : undefined} className={category === value ? "rounded-md bg-lime-300 px-4 py-2 text-sm font-medium text-zinc-950" : "rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300"} href={buildAnalyticsHref("/facts", filterParams, {category:value})}>{value[0].toUpperCase()+value.slice(1)}</Link>)}
      </nav>
      {category === "artists" ? <>
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
                  {row.submissions} submissions · {row.submitters} {row.submitters === 1 ? "submitter" : "submitters"}
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
          title="Most repeated artists"
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
                  {row.submitters} {row.submitters === 1 ? "submitter" : "submitters"} · {row.submissions} submissions
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>
      </> : null}
      {category === "songs" ? <>
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
                <SongFactHeading artist={row.artist} spotifyUri={row.spotifyUri} title={row.title} />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.leagues} leagues · {row.rounds} rounds
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.submitters} {row.submitters === 1 ? "submitter" : "submitters"} · {row.submissions}×
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
              <SongFactPreview filterParams={filterParams} row={row} metrics={`${row.length} chars`} />
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
              <SongFactPreview filterParams={filterParams} row={row} metrics={`${row.length} chars`} />
            ),
          })}
        </FactPanel>
      </section>
      </> : null}
      {category === "rounds" ? <>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactPanel
          description="Rounds where the top song barely edged the runner-up on round point share. Select a row for the top three."
          dialog={
            <FactTable
              headers={[
                { label: "League", width: "w-[28%]" },
                { label: "Round", width: "w-[36%]" },
                { align: "right", label: "Gap" },
                { align: "right", label: "Top share" },
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
                percent(row.topTwoShareGap),
                percent(row.maxRoundPointShare),
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
                  className="text-sm text-zinc-300"
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  gap {percent(row.topTwoShareGap)} · top{" "}
                  {percent(row.maxRoundPointShare)}
                </p>
              </RoundOutcomeHover>
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Rounds where 1st place’s point share most outpaces 2nd. Select a row for the top three."
          dialog={
            <FactTable
              headers={[
                { label: "League", width: "w-[28%]" },
                { label: "Round", width: "w-[36%]" },
                { align: "right", label: "Gap" },
                { align: "right", label: "Top share" },
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
                percent(row.topTwoShareGap),
                percent(row.maxRoundPointShare),
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
                  className="text-sm text-zinc-300"
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  gap {percent(row.topTwoShareGap)} · top{" "}
                  {percent(row.maxRoundPointShare)}
                </p>
              </RoundOutcomeHover>
            ),
          })}
        </FactPanel>
      </section>      <FactPanel
        className="mt-4"
        description="Average points and round share by equal-count playlist quartiles (extras from n÷4 go to earlier slots: 19→5-5-5-4, 21→6-5-5-5). Order comes from submissions.csv row order within each round. Correlation still uses continuous position percentile."
        emptyMessage="Playlist position indices are missing for this scope. Re-sync submissions.csv, then refresh analytics."
        itemCount={
          hasIndices
            ? Math.max(playlistBias.buckets.length, 1)
            : 0
        }
        title="Playlist position and points"
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
      </FactPanel>      <section className="mt-4 grid gap-4 lg:grid-cols-2">
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
                  className="text-sm text-zinc-300"
                  leagueMusicLeagueId={row.leagueMusicLeagueId}
                  leagueName={row.leagueName}
                  leagueSlug={row.leagueSlug}
                  roundName={row.roundName}
                  roundOrdinal={row.roundOrdinal}
                  sourceRoundId={row.sourceRoundId}
                />
                <p className="mt-0.5 text-xs text-zinc-500">
                  {`${row.submissions} songs from ${row.submitters} {row.submitters === 1 ? "submitter" : "submitters"}`}
                </p>
              </>
            ),
          })}
        </FactPanel>
      </section>
      </> : null}
      {category === "voting" ? <>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FactPanel
          description={`Average reach ranks higher than average round share among qualified players in this scope. Spread = reach percentile − share percentile, in percentile points (pp); ties use their midpoint. ${participationNote}`}
          dialog={
            <FactTable
              headers={[
                { label: "Player", width: "w-[35%]" },
                { align: "right", label: "Songs" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "R pctl" },
                { align: "right", label: "S pctl" },
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
                ratio(row.reachPercentile, 1),
                ratio(row.sharePercentile, 1),
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
          description={`Average round share ranks higher than average reach among qualified players in this scope. Spread = reach percentile − share percentile, in percentile points (pp); ties use their midpoint. ${participationNote}`}
          dialog={
            <FactTable
              headers={[
                { label: "Player", width: "w-[35%]" },
                { align: "right", label: "Songs" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "R pctl" },
                { align: "right", label: "S pctl" },
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
                ratio(row.reachPercentile, 1),
                ratio(row.sharePercentile, 1),
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
          description="Broad mild appeal: reach ranks higher than round share among qualifying songs in this scope. Spread = reach percentile − share percentile, in percentile points (pp); ties use their midpoint."
          dialog={
            <FactTable
              headers={[
                { label: "Song", width: "w-[40%]" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "R pctl" },
                { align: "right", label: "S pctl" },
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
                ratio(row.reachPercentile, 1),
                ratio(row.sharePercentile, 1),
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
              <SongFactPreview
                filterParams={filterParams}
                row={row}
                metrics={`${percent(row.positiveReach)} reached · ${row.points} pts`}
                metricsTitle={`Reach ${percent(row.positiveReach)} (${ratio(row.reachPercentile, 1)} percentile) · share ${percent(row.roundPointShare)} (${ratio(row.sharePercentile, 1)} percentile) · spread ${signedSpread(row.appealSpread)} · ${row.points} points`}
              />
            ),
          })}
        </FactPanel>

        <FactPanel
          description="Concentrated devotees: round share ranks higher than reach among qualifying songs in this scope. Spread = reach percentile − share percentile, in percentile points (pp); ties use their midpoint."
          dialog={
            <FactTable
              headers={[
                { label: "Song", width: "w-[40%]" },
                { align: "right", label: "Reach" },
                { align: "right", label: "Share" },
                { align: "right", label: "R pctl" },
                { align: "right", label: "S pctl" },
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
                ratio(row.reachPercentile, 1),
                ratio(row.sharePercentile, 1),
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
              <SongFactPreview
                filterParams={filterParams}
                row={row}
                metrics={`${percent(row.positiveReach)} reached · ${row.points} pts`}
                metricsTitle={`Reach ${percent(row.positiveReach)} (${ratio(row.reachPercentile, 1)} percentile) · share ${percent(row.roundPointShare)} (${ratio(row.sharePercentile, 1)} percentile) · spread ${signedSpread(row.appealSpread)} · ${row.points} points`}
              />
            ),
          })}
        </FactPanel>
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        {[
          { title: "Highest average votes per actual voter", rows: data.highestAverageVoteSongs },
          { title: "Lowest average votes per actual voter", rows: data.lowestAverageVoteSongs },
        ].map(({ title, rows }) => (
          <FactPanel
            description={`Total points divided by positive voters; no minimum count. Unvoted songs count as 0. Equal averages share a rank, with ${title.startsWith("Highest") ? "fewer" : "more"} total points first.`}
            dialog={
              <FactTable
                headers={[
                  { align: "right", label: "Rank", width: "w-[10%]" },
                  { label: "Song", width: "w-[45%]" },
                  { align: "right", label: "Avg/voter" },
                  { align: "right", label: "Voters" },
                  { align: "right", label: "Pts" },
                ]}
                rows={rows.map((row) => [
                  row.rank,
                  <div key="s">
                    <p className="truncate font-medium text-zinc-100">
                      <SpotifyTitle spotifyUri={row.spotifyUri} title={row.title} />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {row.artist} · {row.submitterName}
                    </p>
                    <RoundScopeLinks
                      leagueMusicLeagueId={row.leagueMusicLeagueId}
                      leagueName={row.leagueName}
                      leagueSlug={row.leagueSlug}
                      roundName={row.roundName}
                      roundOrdinal={row.roundOrdinal}
                      sourceRoundId={row.sourceRoundId}
                    />
                  </div>,
                  ratio(row.averageVotes),
                  row.actualVoters,
                  row.points,
                ])}
              />
            }
            itemCount={rows.length}
            key={title}
            title={title}
          >
            {rankedFactList({
              rows: previewRows(rows),
              rank: (row) => row.rank,
              render: (row) => (
                <SongFactPreview
                  filterParams={filterParams}
                  row={row}
                  metrics={`${ratio(row.averageVotes)}/v ${row.points}p ${row.actualVoters}v`}
                  metricsTitle={`${ratio(row.averageVotes)} average per actual voter · ${row.points} points · ${row.actualVoters} voters`}
                />
              ),
            })}
          </FactPanel>
        ))}
      </section>
      </> : null}
    </Container>
  );
}

export default function FactsPage(props: { searchParams: Promise<SearchParams>; }) {
  return <Suspense fallback={<AnalyticsLoadingShell />}><FactsPageContent {...props} /></Suspense>;
}
