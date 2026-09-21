/**
 * Per-voter, per-round playlist coverage: share of eligible songs that
 * received at least 1 point, versus slate size and ballot budget.
 *
 * Eligible songs = scored songs in the round the voter did not submit.
 * Non-voters are excluded (no ballot). Own songs are excluded.
 *
 * Usage: npx tsx scripts/ballot-coverage.ts
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  ssl: "require",
});

const MIN_PLAYER_ROUNDS = 8;

type VoterRound = {
  playerId: string;
  playerName: string;
  leagueName: string;
  roundName: string;
  ordinal: number;
  eligibleSongs: number;
  scoredSongs: number;
  ownSongs: number;
  ballotPoints: number;
  maxSongPoints: number;
  positiveSongs: number;
  explicitRows: number;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - index) + sorted[hi]! * (index - lo);
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
      (values.length - 1),
  );
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pearson(xs: number[], ys: number[]): { r: number; n: number; t: number } {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]! - mx;
    const y = ys[i]! - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const r = dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
  const t =
    Math.abs(r) >= 1
      ? Number.POSITIVE_INFINITY
      : (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
  return { r, n, t };
}

function olsOne(
  y: number[],
  x: number[],
): { intercept: number; slope: number; r2: number } {
  const n = y.length;
  const my = mean(y);
  const mx = mean(x);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i]! - mx;
    sxx += dx * dx;
    sxy += dx * (y[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + slope * x[i]!;
    ssRes += (y[i]! - pred) ** 2;
    ssTot += (y[i]! - my) ** 2;
  }
  return { intercept, slope, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function partialPearson(
  rYX: number,
  rYZ: number,
  rXZ: number,
  n: number,
): { r: number; t: number } {
  const denom = Math.sqrt((1 - rYZ * rYZ) * (1 - rXZ * rXZ));
  const r = denom === 0 ? 0 : (rYX - rYZ * rXZ) / denom;
  const df = n - 3;
  const t =
    Math.abs(r) >= 1 || df <= 0
      ? Number.POSITIVE_INFINITY
      : (r * Math.sqrt(df)) / Math.sqrt(1 - r * r);
  return { r, t };
}

function olsTwo(
  y: number[],
  x1: number[],
  x2: number[],
): { intercept: number; b1: number; b2: number; r2: number } {
  const n = y.length;
  const my = mean(y);
  const m1 = mean(x1);
  const m2 = mean(x2);
  let s11 = 0;
  let s22 = 0;
  let s12 = 0;
  let s1y = 0;
  let s2y = 0;
  for (let i = 0; i < n; i += 1) {
    const d1 = x1[i]! - m1;
    const d2 = x2[i]! - m2;
    const dy = y[i]! - my;
    s11 += d1 * d1;
    s22 += d2 * d2;
    s12 += d1 * d2;
    s1y += d1 * dy;
    s2y += d2 * dy;
  }
  const denom = s11 * s22 - s12 * s12;
  const b1 = denom === 0 ? 0 : (s22 * s1y - s12 * s2y) / denom;
  const b2 = denom === 0 ? 0 : (s11 * s2y - s12 * s1y) / denom;
  const intercept = my - b1 * m1 - b2 * m2;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + b1 * x1[i]! + b2 * x2[i]!;
    ssRes += (y[i]! - pred) ** 2;
    ssTot += (y[i]! - my) ** 2;
  }
  return { intercept, b1, b2, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function icc(groups: number[][]): { icc: number; between: number; within: number; k: number } {
  const k = groups.length;
  const ns = groups.map((g) => g.length);
  const n = ns.reduce((a, b) => a + b, 0);
  const means = groups.map((g) => mean(g));
  const grand = mean(groups.flat());
  const n0 =
    (n - ns.reduce((sum, ni) => sum + ni * ni, 0) / n) / (k - 1);
  let ssb = 0;
  let ssw = 0;
  for (let i = 0; i < k; i += 1) {
    ssb += ns[i]! * (means[i]! - grand) ** 2;
    for (const value of groups[i]!) ssw += (value - means[i]!) ** 2;
  }
  const msb = ssb / (k - 1);
  const msw = ssw / (n - k);
  const between = Math.max(0, (msb - msw) / n0);
  const within = msw;
  return {
    icc: between + within === 0 ? 0 : between / (between + within),
    between,
    within,
    k,
  };
}

function binKey(value: number, edges: number[]): string {
  for (let i = 0; i < edges.length - 1; i += 1) {
    if (value >= edges[i]! && value < edges[i + 1]!) {
      const hi = edges[i + 1]!;
      const label = Number.isFinite(hi) ? String(hi) : "+";
      return `${edges[i]}–${label}`;
    }
  }
  return "other";
}

function summarize(values: number[]) {
  return {
    n: values.length,
    mean: round(mean(values), 4),
    sd: round(stdev(values), 4),
    p10: round(quantile(values, 0.1), 4),
    p25: round(quantile(values, 0.25), 4),
    median: round(quantile(values, 0.5), 4),
    p75: round(quantile(values, 0.75), 4),
    p90: round(quantile(values, 0.9), 4),
  };
}

async function main() {
  const rows = await sql<VoterRound[]>`
    with scored as (
      select
        s.id,
        s.round_id,
        s.submitter_id
      from submissions s
      where s.visible_to_voters
         or exists (
          select 1 from votes v where v.submission_id = s.id
        )
    ),
    slates as (
      select round_id, count(*)::int as scored_songs
      from scored
      group by round_id
    ),
    own as (
      select round_id, submitter_id, count(*)::int as own_songs
      from scored
      group by round_id, submitter_id
    ),
    ballots as (
      select
        v.round_id,
        v.voter_id,
        coalesce(sum(v.points), 0)::int as ballot_points,
        count(*)::int as explicit_rows,
        count(*) filter (where v.points > 0)::int as positive_songs,
        max(v.points)::int as max_song_points
      from votes v
      join scored sc on sc.id = v.submission_id
      where v.voter_id <> sc.submitter_id
      group by v.round_id, v.voter_id
    )
    select
      b.voter_id as "playerId",
      coalesce(c.name_override, c.name) as "playerName",
      l.name as "leagueName",
      r.name as "roundName",
      r.ordinal,
      (sl.scored_songs - coalesce(o.own_songs, 0))::int as "eligibleSongs",
      sl.scored_songs as "scoredSongs",
      coalesce(o.own_songs, 0)::int as "ownSongs",
      b.ballot_points as "ballotPoints",
      b.max_song_points as "maxSongPoints",
      b.positive_songs as "positiveSongs",
      b.explicit_rows as "explicitRows"
    from ballots b
    join rounds r on r.id = b.round_id
    join leagues l on l.id = r.league_id
    join competitors c on c.id = b.voter_id
    join slates sl on sl.round_id = b.round_id
    left join own o
      on o.round_id = b.round_id and o.submitter_id = b.voter_id
    where sl.scored_songs - coalesce(o.own_songs, 0) > 0
      and b.ballot_points > 0
  `;

  const observations = rows.map((row) => {
    const eligible = row.eligibleSongs;
    const budget = row.ballotPoints;
    const minIfForced = Math.ceil(budget / 5);
    const maxPossible = Math.min(eligible, budget);
    return {
      ...row,
      coverage: row.positiveSongs / eligible,
      votesPerSong: budget / eligible,
      minIfForced,
      maxPossible,
      slack:
        maxPossible === minIfForced
          ? 0
          : (row.positiveSongs - minIfForced) / (maxPossible - minIfForced),
    };
  });

  const coverage = observations.map((row) => row.coverage);
  const counts = observations.map((row) => row.positiveSongs);
  const eligible = observations.map((row) => row.eligibleSongs);
  const budgets = observations.map((row) => row.ballotPoints);
  const vps = observations.map((row) => row.votesPerSong);

  const slateEdges = [0, 16, 22, 28, 36, 46, Number.POSITIVE_INFINITY];
  const vpsEdges = [0, 0.7, 0.9, 1.1, 1.4, 2, Number.POSITIVE_INFINITY];
  const budgetGroups = new Map<number, number[]>();
  const slateBins = new Map<string, number[]>();
  const vpsBins = new Map<string, number[]>();
  const countBySlate = new Map<string, number[]>();
  const vpsBySlate = new Map<string, number[]>();
  const cross = new Map<string, number[]>();

  for (const row of observations) {
    const slate = binKey(row.eligibleSongs, slateEdges);
    const vpsKey = binKey(row.votesPerSong, vpsEdges);
    const slateList = slateBins.get(slate) ?? [];
    slateList.push(row.coverage);
    slateBins.set(slate, slateList);
    const countList = countBySlate.get(slate) ?? [];
    countList.push(row.positiveSongs);
    countBySlate.set(slate, countList);
    const slateVps = vpsBySlate.get(slate) ?? [];
    slateVps.push(row.votesPerSong);
    vpsBySlate.set(slate, slateVps);
    const vpsList = vpsBins.get(vpsKey) ?? [];
    vpsList.push(row.coverage);
    vpsBins.set(vpsKey, vpsList);
    const budgetList = budgetGroups.get(row.ballotPoints) ?? [];
    budgetList.push(row.coverage);
    budgetGroups.set(row.ballotPoints, budgetList);
    const crossKey = `${slate}||${vpsKey}`;
    const crossList = cross.get(crossKey) ?? [];
    crossList.push(row.coverage);
    cross.set(crossKey, crossList);
  }

  const byPlayer = new Map<string, typeof observations>();
  for (const row of observations) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }
  const regularPlayers = [...byPlayer.entries()]
    .filter(([, list]) => list.length >= MIN_PLAYER_ROUNDS)
    .map(([id, list]) => {
      const cov = list.map((row) => row.coverage);
      const nSongs = list.map((row) => row.positiveSongs);
      return {
        playerId: id,
        playerName: list[0]!.playerName,
        rounds: list.length,
        meanCoverage: mean(cov),
        sdCoverage: stdev(cov),
        meanCount: mean(nSongs),
        sdCount: stdev(nSongs),
        corrEligible: pearson(
          list.map((row) => row.eligibleSongs),
          cov,
        ).r,
        corrVps: pearson(
          list.map((row) => row.votesPerSong),
          cov,
        ).r,
      };
    })
    .sort((a, b) => b.meanCoverage - a.meanCoverage);

  const playerIcc = icc(
    regularPlayers.map((player) =>
      byPlayer.get(player.playerId)!.map((row) => row.coverage),
    ),
  );
  const countIcc = icc(
    regularPlayers.map((player) =>
      byPlayer.get(player.playerId)!.map((row) => row.positiveSongs),
    ),
  );

  const covVsEligible = pearson(eligible, coverage);
  const covVsBudget = pearson(budgets, coverage);
  const covVsVps = pearson(vps, coverage);
  const eligibleVsVps = pearson(eligible, vps);
  const countVsEligible = pearson(eligible, counts);
  const model = olsTwo(coverage, eligible, vps);
  const vpsOnly = olsOne(coverage, vps);
  const coverageGivenVps = partialPearson(
    covVsEligible.r,
    covVsVps.r,
    eligibleVsVps.r,
    coverage.length,
  );
  const grandCoverage = mean(coverage);
  const residualsAfterVps = observations.map(
    (row) => row.coverage - (vpsOnly.intercept + vpsOnly.slope * row.votesPerSong),
  );
  const residualBySlate = new Map<string, number[]>();
  for (let i = 0; i < observations.length; i += 1) {
    const slate = binKey(observations[i]!.eligibleSongs, slateEdges);
    const list = residualBySlate.get(slate) ?? [];
    list.push(residualsAfterVps[i]!);
    residualBySlate.set(slate, list);
  }
  const sortBin = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true });
  const vpsBinOrder = [...vpsBins.keys()].sort(sortBin);
  const slateBinOrder = [...slateBins.keys()].sort(sortBin);

  const SMALL_SLATE = 28;
  const LARGE_SLATE = 36;
  const MIN_SPLIT_ROUNDS = 4;
  const playerSlateSensitivity = [...byPlayer.entries()]
    .map(([, list]) => {
      const rows = list.map((row) => {
        const predicted =
          vpsOnly.intercept + vpsOnly.slope * row.votesPerSong;
        return {
          ...row,
          adjusted: row.coverage - predicted + grandCoverage,
        };
      });
      const elig = rows.map((row) => row.eligibleSongs);
      const adj = rows.map((row) => row.adjusted);
      const small = rows.filter((row) => row.eligibleSongs < SMALL_SLATE);
      const large = rows.filter((row) => row.eligibleSongs >= LARGE_SLATE);
      const eligRange = Math.max(...elig) - Math.min(...elig);
      const hasSpread = rows.length >= MIN_PLAYER_ROUNDS && eligRange >= 15;
      const splitOk =
        small.length >= MIN_SPLIT_ROUNDS && large.length >= MIN_SPLIT_ROUNDS;
      const corr = hasSpread ? pearson(elig, adj) : null;
      const slope = hasSpread ? olsOne(adj, elig).slope : null;
      return {
        name: rows[0]!.playerName,
        rounds: rows.length,
        eligMin: Math.min(...elig),
        eligMax: Math.max(...elig),
        eligRange,
        meanAdjusted: mean(adj),
        nSmall: small.length,
        nLarge: large.length,
        smallAdjusted: small.length ? mean(small.map((row) => row.adjusted)) : null,
        largeAdjusted: large.length ? mean(large.map((row) => row.adjusted)) : null,
        deltaPp: splitOk
          ? (mean(large.map((row) => row.adjusted)) -
              mean(small.map((row) => row.adjusted))) *
            100
          : null,
        corrAdjustedVsEligible: corr?.r ?? null,
        ppPerTenSongs: slope === null ? null : slope * 1000,
        splitOk,
        hasSpread,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const splitPlayers = playerSlateSensitivity.filter((p) => p.splitOk);
  const spreadPlayers = playerSlateSensitivity.filter((p) => p.hasSpread);
  const deltas = splitPlayers.map((p) => p.deltaPp!);
  const corrs = spreadPlayers.map((p) => p.corrAdjustedVsEligible!);
  const slopes = spreadPlayers.map((p) => p.ppPerTenSongs!);
  const deltaSd = stdev(deltas);
  const deltaMean = deltas.length ? mean(deltas) : 0;
  const outliers = splitPlayers
    .filter((p) => Math.abs(p.deltaPp! - deltaMean) >= Math.max(10, 2 * deltaSd))
    .sort((a, b) => Math.abs(b.deltaPp!) - Math.abs(a.deltaPp!));
  const steepest = [...spreadPlayers]
    .sort(
      (a, b) =>
        Math.abs(b.ppPerTenSongs ?? 0) - Math.abs(a.ppPerTenSongs ?? 0),
    )
    .slice(0, 10);

  const maxPointRows = await sql`
    select points, count(*)::int as n
    from votes
    where points > 0
    group by points
    order by points
  `;

  const summary = {
    observations: observations.length,
    players: byPlayer.size,
    regularPlayers: regularPlayers.length,
    minPlayerRounds: MIN_PLAYER_ROUNDS,
    coverage: summarize(coverage),
    positiveCount: summarize(counts),
    eligible: summarize(eligible),
    ballotPoints: summarize(budgets),
    votesPerSong: summarize(vps),
    correlations: {
      coverageVsEligible: round(covVsEligible.r, 3),
      coverageVsEligibleT: round(covVsEligible.t, 2),
      coverageVsBudget: round(covVsBudget.r, 3),
      coverageVsVotesPerSong: round(covVsVps.r, 3),
      coverageVsVotesPerSongT: round(covVsVps.t, 2),
      eligibleVsVotesPerSong: round(eligibleVsVps.r, 3),
      eligibleVsVotesPerSongT: round(eligibleVsVps.t, 2),
      coverageVsEligibleGivenVps: round(coverageGivenVps.r, 3),
      coverageVsEligibleGivenVpsT: round(coverageGivenVps.t, 2),
      countVsEligible: round(countVsEligible.r, 3),
      countVsEligibleT: round(countVsEligible.t, 2),
    },
    regression: {
      intercept: round(model.intercept, 4),
      eligibleCoef: round(model.b1, 5),
      votesPerSongCoef: round(model.b2, 4),
      r2: round(model.r2, 3),
    },
    vpsOnly: {
      intercept: round(vpsOnly.intercept, 4),
      slope: round(vpsOnly.slope, 4),
      r2: round(vpsOnly.r2, 3),
    },
    iccCoverage: {
      icc: round(playerIcc.icc, 3),
      betweenSd: round(Math.sqrt(playerIcc.between), 4),
      withinSd: round(Math.sqrt(playerIcc.within), 4),
      players: playerIcc.k,
    },
    iccCount: {
      icc: round(countIcc.icc, 3),
      betweenSd: round(Math.sqrt(countIcc.between), 4),
      withinSd: round(Math.sqrt(countIcc.within), 4),
      players: countIcc.k,
    },
    bySlate: slateBinOrder.map((bin) => {
      const values = slateBins.get(bin) ?? [];
      const vpsValues = vpsBySlate.get(bin) ?? [];
      const residuals = residualBySlate.get(bin) ?? [];
      return {
        bin,
        n: values.length,
        meanCoverage: round(mean(values) * 100, 1),
        meanCount: round(mean(countBySlate.get(bin) ?? []), 2),
        meanVps: round(mean(vpsValues), 3),
        vpsAdjustedCoverage: round((grandCoverage + mean(residuals)) * 100, 1),
        residualPp: round(mean(residuals) * 100, 1),
      };
    }),
    coverageBySlateAndVps: slateBinOrder.map((slate) => ({
      slate,
      cells: vpsBinOrder.map((vpsBin) => {
        const values = cross.get(`${slate}||${vpsBin}`) ?? [];
        return {
          vps: vpsBin,
          n: values.length,
          meanCoverage: values.length ? round(mean(values) * 100, 1) : null,
        };
      }),
    })),
    byVotesPerSong: [...vpsBins.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([bin, values]) => ({
        bin,
        coverage: summarize(values),
      })),
    byBudget: [...budgetGroups.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, values]) => values.length >= 20)
      .map(([budget, values]) => ({
        budget,
        coverage: summarize(values),
      })),
    playerSlateSensitivity: {
      smallMaxEligible: SMALL_SLATE - 1,
      largeMinEligible: LARGE_SLATE,
      minSplitRounds: MIN_SPLIT_ROUNDS,
      playersWithBothRegimes: splitPlayers.length,
      playersWithSlateRange: spreadPlayers.length,
      deltaMeanPp: round(deltaMean, 1),
      deltaSdPp: round(deltaSd, 1),
      corrAdjustedVsEligible: corrs.length
        ? {
            mean: round(mean(corrs), 3),
            sd: round(stdev(corrs), 3),
            median: round(quantile(corrs, 0.5), 3),
          }
        : null,
      ppPerTenSongs: slopes.length
        ? {
            mean: round(mean(slopes), 2),
            sd: round(stdev(slopes), 2),
            median: round(quantile(slopes, 0.5), 2),
          }
        : null,
      splitTable: splitPlayers
        .sort((a, b) => Math.abs(b.deltaPp!) - Math.abs(a.deltaPp!))
        .map((p) => ({
          name: p.name,
          rounds: p.rounds,
          nSmall: p.nSmall,
          nLarge: p.nLarge,
          smallPct: round(p.smallAdjusted! * 100, 1),
          largePct: round(p.largeAdjusted! * 100, 1),
          deltaPp: round(p.deltaPp!, 1),
          corr: round(p.corrAdjustedVsEligible ?? 0, 2),
          ppPerTen: round(p.ppPerTenSongs ?? 0, 2),
        })),
      outliers: outliers.map((p) => ({
        name: p.name,
        nSmall: p.nSmall,
        nLarge: p.nLarge,
        smallPct: round(p.smallAdjusted! * 100, 1),
        largePct: round(p.largeAdjusted! * 100, 1),
        deltaPp: round(p.deltaPp!, 1),
        corr: round(p.corrAdjustedVsEligible ?? 0, 2),
      })),
      steepest: steepest.map((p) => ({
        name: p.name,
        rounds: p.rounds,
        eligRange: p.eligRange,
        nSmall: p.nSmall,
        nLarge: p.nLarge,
        corr:
          p.corrAdjustedVsEligible === null
            ? null
            : round(p.corrAdjustedVsEligible, 2),
        ppPerTen:
          p.ppPerTenSongs === null ? null : round(p.ppPerTenSongs, 2),
        deltaPp: p.deltaPp === null ? null : round(p.deltaPp, 1),
      })),
    },
    playerSpread: {
      meanOfMeans: round(mean(regularPlayers.map((p) => p.meanCoverage)), 4),
      sdOfMeans: round(stdev(regularPlayers.map((p) => p.meanCoverage)), 4),
      medianWithinSd: round(
        quantile(
          regularPlayers.map((p) => p.sdCoverage),
          0.5,
        ),
        4,
      ),
      playersWithMeanBelow50: regularPlayers.filter((p) => p.meanCoverage < 0.5)
        .length,
      playersWithMeanAbove80: regularPlayers.filter((p) => p.meanCoverage >= 0.8)
        .length,
    },
    topSpreadPlayers: regularPlayers.slice(0, 8).map((p) => ({
      name: p.playerName,
      rounds: p.rounds,
      meanCoverage: round(p.meanCoverage, 3),
      sdCoverage: round(p.sdCoverage, 3),
      meanCount: round(p.meanCount, 1),
      corrEligible: round(p.corrEligible, 2),
    })),
    bottomSpreadPlayers: [...regularPlayers]
      .sort((a, b) => a.meanCoverage - b.meanCoverage)
      .slice(0, 8)
      .map((p) => ({
        name: p.playerName,
        rounds: p.rounds,
        meanCoverage: round(p.meanCoverage, 3),
        sdCoverage: round(p.sdCoverage, 3),
        meanCount: round(p.meanCount, 1),
        corrEligible: round(p.corrEligible, 2),
      })),
    votePointHistogram: maxPointRows,
    constraint: {
      meanMinIfForced: round(mean(observations.map((r) => r.minIfForced)), 2),
      meanPositive: round(mean(counts), 2),
      shareNearFloor: round(
        observations.filter((r) => r.positiveSongs <= r.minIfForced + 1)
          .length / observations.length,
        3,
      ),
      shareNearCeil: round(
        observations.filter((r) => r.positiveSongs >= r.maxPossible - 1)
          .length / observations.length,
        3,
      ),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
