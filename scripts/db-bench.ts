import { performance } from "node:perf_hooks";

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Db = ReturnType<typeof postgres>;

type BenchScope = {
  leagueId: string;
  roundIds: string[];
};

type BenchContext = {
  scope: BenchScope;
  playerId: string;
  leagueName: string;
  playerName: string;
};

type ScenarioResult = {
  label: string;
  statements: number;
  min: number;
  median: number;
  mean: number;
  p95: number;
  sanity: Record<string, number | string | null>;
};

function argValue(name: string): string | undefined {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseRuns(): number {
  const value = Number(argValue("--runs") ?? "5");
  return Number.isInteger(value) && value > 0 ? value : 5;
}

function parseRoundIds(): string[] {
  const value = argValue("--roundIds");
  if (!value) return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map(assertUuid);
}

function assertUuid(value: string): string {
  if (!UUID_RE.test(value)) {
    throw new Error(`Expected UUID, received: ${value}`);
  }
  return value;
}

function uuid(value: string): string {
  return `'${assertUuid(value)}'::uuid`;
}

function uuidList(values: readonly string[]): string {
  if (!values.length) return "";
  return values.map(uuid).join(", ");
}

function displayName(alias: string): string {
  return `coalesce(${alias}.name_override, ${alias}.name)`;
}

function scopePredicate(scope: BenchScope, alias = "r"): string {
  const conditions = [`${alias}.league_id = ${uuid(scope.leagueId)}`];
  if (scope.roundIds.length) {
    conditions.push(`${alias}.id in (${uuidList(scope.roundIds)})`);
  }
  return conditions.join(" and ");
}

function selectedRoundsCte(scope: BenchScope): string {
  return `
    selected_rounds as (
      select
        r.id,
        r.league_id,
        r.source_round_id,
        r.ordinal,
        r.name,
        r.source_created_at
      from rounds r
      where ${scopePredicate(scope)}
    )
  `;
}

function selectedLeaguesCte(scope: BenchScope): string {
  const roundFilter = scope.roundIds.length
    ? "and exists (select 1 from selected_rounds scope_round where scope_round.league_id = l.id)"
    : "";
  return `
    selected_leagues as (
      select l.id
      from leagues l
      where l.id = ${uuid(scope.leagueId)}
      ${roundFilter}
    )
  `;
}

function voteOpportunityCtes(scope: BenchScope): string {
  return `
    ${selectedRoundsCte(scope)},
    scope_thresholds as (
      select
        count(*)::int as scope_rounds,
        greatest(1, ceil(count(*)::numeric / 2)::int) as minimum_shared_rounds,
        least(
          20,
          greatest(5, ceil(count(*)::numeric / 2)::int * 5)
        )::int as minimum_comparable_features
      from selected_rounds
    ),
    active_ballots as (
      select
        v.round_id,
        v.league_id,
        v.voter_id,
        max(v.cast_at) as cast_at
      from votes v
      join selected_rounds sr on sr.id = v.round_id
      group by v.round_id, v.league_id, v.voter_id
    ),
    round_scored_submissions as (
      select
        s.id,
        s.league_id,
        s.round_id,
        s.submitter_id
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      where s.visible_to_voters
         or exists (
          select 1
          from votes scoped_vote
          where scoped_vote.submission_id = s.id
        )
    ),
    eligible_vote_opportunities as (
      select
        rss.id as submission_id,
        rss.league_id,
        rss.round_id,
        rss.submitter_id,
        ab.voter_id
      from active_ballots ab
      join round_scored_submissions rss on rss.round_id = ab.round_id
      where rss.submitter_id <> ab.voter_id
    ),
    effective_votes as (
      select
        evo.submission_id,
        evo.league_id,
        evo.round_id,
        evo.submitter_id,
        evo.voter_id,
        coalesce(v.points, 0)::int as points,
        (v.id is not null) as explicit
      from eligible_vote_opportunities evo
      left join votes v
        on v.round_id = evo.round_id
       and v.submission_id = evo.submission_id
       and v.voter_id = evo.voter_id
    ),
    ballot_totals as (
      select
        ev.round_id,
        ev.voter_id,
        sum(ev.points)::double precision as ballot_points,
        count(*)::double precision as eligible_opportunities
      from effective_votes ev
      group by ev.round_id, ev.voter_id
    )
  `;
}

function songStatsCtes(scope: BenchScope): string {
  return `
    ${voteOpportunityCtes(scope)},
    round_submission_totals as (
      select sr.id as round_id, count(s.id) filter (
        where s.visible_to_voters
           or exists (
            select 1
            from votes scoped_vote
            where scoped_vote.submission_id = s.id
          )
      )::int as slate_count
      from selected_rounds sr
      left join submissions s on s.round_id = sr.id
      group by sr.id
    ),
    round_vote_totals as (
      select sr.id as round_id, coalesce(sum(ev.points), 0)::int as round_points
      from selected_rounds sr
      left join effective_votes ev on ev.round_id = sr.id
      group by sr.id
    ),
    submission_vote_stats as (
      select
        s.id as submission_id,
        coalesce(sum(ev.points), 0)::int as points,
        coalesce(sum(
          case
            when bt.eligible_opportunities > 0
              then bt.ballot_points / bt.eligible_opportunities
            else null
          end
        ), 0)::double precision as expected_points,
        count(ev.submission_id)::int as eligible_rows,
        count(ev.submission_id) filter (where ev.points > 0)::int as positive_rows
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      left join effective_votes ev on ev.submission_id = s.id
      left join ballot_totals bt
        on bt.round_id = ev.round_id
       and bt.voter_id = ev.voter_id
      group by s.id
    ),
    song_stats as (
      select
        s.id,
        s.league_id,
        s.round_id,
        s.submitter_id,
        s.spotify_uri,
        s.song_title,
        s.artist_name,
        s.album_name,
        s.submitted_at,
        sr.ordinal as round_ordinal,
        sr.source_round_id,
        sr.name as round_name,
        svs.points,
        svs.expected_points,
        svs.eligible_rows,
        svs.positive_rows,
        rst.slate_count,
        rvt.round_points,
        case when svs.eligible_rows > 0
          then svs.points::double precision / svs.eligible_rows else null end as points_per_eligible_voter,
        case when svs.eligible_rows > 0
          then svs.positive_rows::double precision / svs.eligible_rows else null end as positive_reach,
        case when rvt.round_points > 0
          then svs.points::double precision / rvt.round_points else null end as round_point_share,
        case when svs.expected_points > 0
          then svs.points::double precision / svs.expected_points else null end as support_index
      from selected_rounds sr
      join submissions s on s.round_id = sr.id
      join submission_vote_stats svs on svs.submission_id = s.id
      join round_submission_totals rst on rst.round_id = sr.id
      join round_vote_totals rvt on rvt.round_id = sr.id
    )
  `;
}

function songSelect(): string {
  return `
    select
      ss.id,
      ss.song_title as "title",
      ss.artist_name as "artist",
      ss.album_name as "album",
      ss.spotify_uri as "spotifyUri",
      ss.submitter_id as "submitterId",
      ${displayName("c")} as "submitterName",
      ss.league_id as "leagueId",
      l.name as "leagueName",
      l.music_league_id as "leagueMusicLeagueId",
      ss.round_id as "roundId",
      ss.source_round_id as "sourceRoundId",
      ss.round_name as "roundName",
      ss.round_ordinal as "roundOrdinal",
      ss.submitted_at as "submittedAt",
      ss.points,
      ss.expected_points as "expectedPoints",
      ss.eligible_rows as "eligibleRows",
      ss.positive_rows as "positiveRows",
      ss.points_per_eligible_voter as "pointsPerEligibleVoter",
      ss.positive_reach as "positiveReach",
      ss.round_point_share as "roundPointShare",
      ss.support_index as "supportIndex",
      case
        when ss.support_index is null then null::double precision
        when count(ss.support_index) over (partition by ss.round_id) = 1
          then 100::double precision
        else (
          rank() over (partition by ss.round_id order by ss.support_index asc nulls last) - 1
        )::double precision / (
          count(ss.support_index) over (partition by ss.round_id) - 1
        ) * 100
      end as "performancePercentile"
    from song_stats ss
    join competitors c on c.id = ss.submitter_id
    join leagues l on l.id = ss.league_id
  `;
}

function playerStatsTail(): string {
  return `
    player_round as (
      select
        submitter_id,
        round_id,
        sum(points)::int as points,
        count(*)::int as submissions,
        sum(eligible_rows)::int as eligible_rows,
        sum(expected_points)::double precision as expected_points,
        max(round_points)::double precision as round_points
      from song_stats
      group by submitter_id, round_id
    ),
    player_round_indexed as (
      select
        pr.*,
        case when pr.expected_points > 0
          then pr.points::double precision / pr.expected_points else null end as round_index,
        case
          when count(*) over (partition by pr.round_id) = 1 then 100::double precision
          else percent_rank() over (
            partition by pr.round_id
            order by case
              when pr.expected_points > 0
                then pr.points::double precision / pr.expected_points
              else null
            end asc nulls first
          ) * 100
        end as round_percentile,
        rank() over (partition by pr.round_id order by pr.points desc) as round_rank
      from player_round pr
    ),
    player_aggregates as (
      select
        pri.submitter_id,
        sum(pri.points)::int as total_points,
        sum(pri.submissions)::int as submissions,
        count(*)::int as entered_rounds,
        sum(pri.eligible_rows)::int as eligible_rows,
        avg(pri.round_index) as average_round_index,
        avg(pri.round_percentile) as average_round_percentile,
        count(*) filter (where pri.round_rank = 1)::int as round_wins,
        count(*) filter (where pri.round_percentile >= 75)::int as top_quartile_rounds
      from player_round_indexed pri
      group by pri.submitter_id
    )
  `;
}

function playerStatsCtes(scope: BenchScope): string {
  return `${songStatsCtes(scope)}, ${playerStatsTail()}`;
}

function alignmentTail(playerId?: string): string {
  const pairScopeFilter = playerId
    ? `where lm1.competitor_id = ${uuid(playerId)} or lm2.competitor_id = ${uuid(playerId)}`
    : "";
  return `
    pair_scope as (
      select
        lm1.competitor_id as left_id,
        lm2.competitor_id as right_id,
        count(distinct sr.id)::int as scope_rounds
      from selected_rounds sr
      join league_members lm1 on lm1.league_id = sr.league_id
      join league_members lm2
        on lm2.league_id = sr.league_id
       and lm2.competitor_id > lm1.competitor_id
      ${pairScopeFilter}
      group by lm1.competitor_id, lm2.competitor_id
    ),
    shared_ballot_pairs as (
      select
        left_ballot.round_id,
        left_ballot.voter_id as left_id,
        right_ballot.voter_id as right_id,
        ps.scope_rounds
      from active_ballots left_ballot
      join active_ballots right_ballot
        on right_ballot.round_id = left_ballot.round_id
       and right_ballot.voter_id > left_ballot.voter_id
      join pair_scope ps
        on ps.left_id = left_ballot.voter_id
       and ps.right_id = right_ballot.voter_id
    ),
    third_party_features as (
      select
        sp.left_id,
        sp.right_id,
        sp.round_id,
        sp.scope_rounds,
        ev_left.submission_id::text as feature_key,
        ev_left.points::double precision / nullif(left_total.ballot_points, 0) as left_value,
        ev_right.points::double precision / nullif(right_total.ballot_points, 0) as right_value
      from shared_ballot_pairs sp
      join effective_votes ev_left
        on ev_left.round_id = sp.round_id
       and ev_left.voter_id = sp.left_id
      join effective_votes ev_right
        on ev_right.round_id = sp.round_id
       and ev_right.voter_id = sp.right_id
       and ev_right.submission_id = ev_left.submission_id
      join ballot_totals left_total
        on left_total.round_id = sp.round_id
       and left_total.voter_id = sp.left_id
      join ballot_totals right_total
        on right_total.round_id = sp.round_id
       and right_total.voter_id = sp.right_id
      where ev_left.submitter_id <> sp.left_id
        and ev_left.submitter_id <> sp.right_id
        and left_total.ballot_points > 0
        and right_total.ballot_points > 0
    ),
    mutual_support_points as (
      select
        sp.left_id,
        sp.right_id,
        sp.round_id,
        sp.scope_rounds,
        coalesce(sum(ev.points) filter (
          where ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id
        ), 0)::double precision as left_points,
        coalesce(sum(ev.points) filter (
          where ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id
        ), 0)::double precision as right_points,
        count(ev.submission_id) filter (
          where ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id
        )::int as left_opportunities,
        count(ev.submission_id) filter (
          where ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id
        )::int as right_opportunities
      from shared_ballot_pairs sp
      left join effective_votes ev
        on ev.round_id = sp.round_id
       and (
        (ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id)
        or (ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id)
       )
      group by sp.left_id, sp.right_id, sp.round_id, sp.scope_rounds
      having count(ev.submission_id) filter (
          where ev.voter_id = sp.left_id and ev.submitter_id = sp.right_id
        ) > 0
         and count(ev.submission_id) filter (
          where ev.voter_id = sp.right_id and ev.submitter_id = sp.left_id
        ) > 0
    ),
    mutual_features as (
      select
        msp.left_id,
        msp.right_id,
        msp.round_id,
        msp.scope_rounds,
        ('mutual:' || msp.round_id::text) as feature_key,
        msp.left_points / nullif(left_total.ballot_points, 0) as left_value,
        msp.right_points / nullif(right_total.ballot_points, 0) as right_value
      from mutual_support_points msp
      join ballot_totals left_total
        on left_total.round_id = msp.round_id
       and left_total.voter_id = msp.left_id
      join ballot_totals right_total
        on right_total.round_id = msp.round_id
       and right_total.voter_id = msp.right_id
      where left_total.ballot_points > 0
        and right_total.ballot_points > 0
    ),
    comparison_features as (
      select * from third_party_features
      union all
      select * from mutual_features
    ),
    pair_comparisons as (
      select
        cf.left_id,
        cf.right_id,
        count(*)::int as comparable_features,
        count(distinct cf.round_id)::int as shared_rounds,
        max(cf.scope_rounds)::int as scope_rounds,
        sum(cf.left_value * cf.right_value) as dot,
        sqrt(sum(cf.left_value * cf.left_value) * sum(cf.right_value * cf.right_value)) as magnitude
      from comparison_features cf
      group by cf.left_id, cf.right_id
      having count(*) >= (
          select minimum_comparable_features from scope_thresholds
        )
         and count(distinct cf.round_id) >= (
          select minimum_shared_rounds from scope_thresholds
        )
    )
  `;
}

function currentProfileQueries(scope: BenchScope, playerId: string): string[] {
  const player = uuid(playerId);
  return [
    `
      with ${playerStatsCtes(scope)}
      select
        c.id,
        ${displayName("c")} as name,
        pa.total_points as "totalPoints",
        pa.submissions,
        pa.entered_rounds as "enteredRounds",
        case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end as "pointsPerSubmission",
        case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end as "pointsPerEligibleVoter",
        pa.average_round_index as "averageRoundIndex",
        pa.average_round_percentile as "averageRoundPercentile",
        pa.round_wins as "roundWins",
        case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end as "topQuartileRate",
        null::int as "performanceRank"
      from player_aggregates pa
      join competitors c on c.id = pa.submitter_id
      where c.id = ${player}
      limit 1
    `,
    `
      with ${songStatsCtes(scope)}, ranked_songs as (${songSelect()})
      select * from ranked_songs
      where "submitterId" = ${player}
      order by "supportIndex" desc nulls last, points desc
    `,
    `
      with ${voteOpportunityCtes(scope)}
      select 'received' as direction, ev.points, count(*)::int as count
      from effective_votes ev
      where ev.submitter_id = ${player}
      group by ev.points
      union all
      select 'given' as direction, ev.points, count(*)::int as count
      from effective_votes ev
      where ev.voter_id = ${player}
      group by ev.points
    `,
    `
      with ${voteOpportunityCtes(scope)},
      relationship_rows as (
        select
          'received'::text as direction,
          ev.voter_id as competitor_id,
          sum(ev.points)::int as points,
          count(*)::int as encounters,
          count(distinct ev.round_id)::int as shared_rounds,
          count(*) filter (where ev.points > 0)::int as positives
        from effective_votes ev
        where ev.submitter_id = ${player}
        group by ev.voter_id
        union all
        select
          'given'::text as direction,
          ev.submitter_id as competitor_id,
          sum(ev.points)::int as points,
          count(*)::int as encounters,
          count(distinct ev.round_id)::int as shared_rounds,
          count(*) filter (where ev.points > 0)::int as positives
        from effective_votes ev
        where ev.voter_id = ${player}
        group by ev.submitter_id
      )
      select
        rr.direction,
        rr.competitor_id as "competitorId",
        ${displayName("c")} as "competitorName",
        rr.points,
        rr.encounters,
        rr.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds",
        rr.points::double precision / rr.encounters as "pointsPerEncounter",
        rr.positives::double precision / rr.encounters as "positiveRate"
      from relationship_rows rr
      join competitors c on c.id = rr.competitor_id
      where rr.shared_rounds >= (
        select minimum_shared_rounds from scope_thresholds
      )
      order by rr.direction, "pointsPerEncounter" desc, rr.encounters desc
    `,
    `
      with ${voteOpportunityCtes(scope)},
      mutual_rows as (
        select
          case
            when ev.voter_id = ${player} then ev.submitter_id
            else ev.voter_id
          end as competitor_id,
          sum(ev.points)::int as points,
          count(*)::int as opportunities,
          count(distinct ev.round_id)::int as shared_rounds,
          count(*) filter (where ev.points > 0)::int as positives
        from effective_votes ev
        where ev.voter_id = ${player}
           or ev.submitter_id = ${player}
        group by competitor_id
      ),
      mutual_budget_rounds as (
        select distinct
          case
            when ev.voter_id = ${player} then ev.submitter_id
            else ev.voter_id
          end as competitor_id,
          ev.round_id,
          ev.voter_id,
          bt.ballot_points
        from effective_votes ev
        join ballot_totals bt
          on bt.round_id = ev.round_id
         and bt.voter_id = ev.voter_id
        where ev.voter_id = ${player}
           or ev.submitter_id = ${player}
      ),
      mutual_budgets as (
        select
          competitor_id,
          sum(ballot_points)::double precision as eligible_ballot_points
        from mutual_budget_rounds
        group by competitor_id
      )
      select
        mr.competitor_id as "competitorId",
        ${displayName("c")} as "competitorName",
        mr.points,
        mr.opportunities,
        mr.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds",
        mr.points::double precision / mr.opportunities as "pointsPerOpportunity",
        mr.positives::double precision / mr.opportunities as "positiveRate",
        mr.points::double precision / nullif(mb.eligible_ballot_points, 0) as "ballotPointShare"
      from mutual_rows mr
      join mutual_budgets mb on mb.competitor_id = mr.competitor_id
      join competitors c on c.id = mr.competitor_id
      where mr.opportunities > 0
        and mb.eligible_ballot_points > 0
        and mr.shared_rounds >= (
          select minimum_shared_rounds from scope_thresholds
        )
      order by "pointsPerOpportunity" desc, mr.opportunities desc
    `,
    `
      with ${voteOpportunityCtes(scope)}, ${alignmentTail(playerId)}
      select
        case
          when pc.left_id = ${player} then pc.right_id
          else pc.left_id
        end as "competitorId",
        ${displayName("c")} as "competitorName",
        pc.dot / nullif(pc.magnitude, 0) as alignment,
        pc.comparable_features as "comparableFeatures",
        pc.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds"
      from pair_comparisons pc
      join competitors c
        on c.id = case
          when pc.left_id = ${player} then pc.right_id
          else pc.left_id
        end
      where (pc.left_id = ${player} or pc.right_id = ${player})
        and pc.magnitude > 0
      order by alignment desc, "comparableFeatures" desc
    `,
    `
      with ${voteOpportunityCtes(scope)},
      round_ballot_counts as (
        select round_id, count(*)::int as observed_voters
        from active_ballots
        group by round_id
      ),
      ballot_positions as (
        select
          active_ballots.*,
          rbc.observed_voters,
          rank() over (
            partition by active_ballots.round_id
            order by active_ballots.cast_at
          )::int as ballot_rank,
          count(*) over (
            partition by active_ballots.round_id, active_ballots.cast_at
          )::int as tie_count
        from active_ballots
        join round_ballot_counts rbc on rbc.round_id = active_ballots.round_id
      ),
      ranked_ballots as (
        select
          ballot_positions.*,
          case
            when observed_voters = 1 then 0.5::double precision
            else (
              ballot_rank::double precision - 1 + tie_count::double precision / 2
            ) / observed_voters
          end as relative_order
        from ballot_positions
      ),
      player_submission_rounds as (
        select distinct s.round_id
        from submissions s
        join selected_rounds sr on sr.id = s.round_id
        where s.submitter_id = ${player}
      ),
      player_participation as (
        select
          sr.id as round_id,
          rb.cast_at,
          rb.relative_order,
          rb.ballot_rank,
          rb.tie_count,
          coalesce(rb.observed_voters, rbc.observed_voters, 0)::int as observed_voters,
          case when rb.voter_id is null then 'did_not_vote' else 'voted' end as participation
        from selected_rounds sr
        left join ranked_ballots rb
          on rb.round_id = sr.id
         and rb.voter_id = ${player}
        left join round_ballot_counts rbc on rbc.round_id = sr.id
        where rb.voter_id is not null
           or exists (
            select 1
            from player_submission_rounds psr
            where psr.round_id = sr.id
          )
      )
      select
        pp.round_id as "roundId",
        sr.name as "roundName",
        l.name as "leagueName",
        l.music_league_id as "leagueMusicLeagueId",
        sr.source_round_id as "sourceRoundId",
        sr.ordinal,
        pp.cast_at as "castAt",
        pp.relative_order as "relativeOrder",
        pp.ballot_rank as "ballotRank",
        pp.tie_count as "tieCount",
        pp.observed_voters as "observedVoters",
        pp.participation as "participation"
      from player_participation pp
      join selected_rounds sr on sr.id = pp.round_id
      join leagues l on l.id = sr.league_id
      order by sr.source_created_at desc, pp.cast_at desc nulls last
    `,
  ];
}

function proposedProfileQuery(scope: BenchScope, playerId: string): string {
  const player = uuid(playerId);
  return `
    with ${songStatsCtes(scope)},
    ${playerStatsTail()},
    ${alignmentTail(playerId)},
    ranked_songs as (${songSelect()}),
    overview_rows as (
      select
        c.id,
        ${displayName("c")} as name,
        pa.total_points as "totalPoints",
        pa.submissions,
        pa.entered_rounds as "enteredRounds",
        case when pa.submissions > 0 then pa.total_points::double precision / pa.submissions else null end as "pointsPerSubmission",
        case when pa.eligible_rows > 0 then pa.total_points::double precision / pa.eligible_rows else null end as "pointsPerEligibleVoter",
        pa.average_round_index as "averageRoundIndex",
        pa.average_round_percentile as "averageRoundPercentile",
        pa.round_wins as "roundWins",
        case when pa.entered_rounds > 0 then pa.top_quartile_rounds::double precision / pa.entered_rounds else null end as "topQuartileRate",
        null::int as "performanceRank"
      from player_aggregates pa
      join competitors c on c.id = pa.submitter_id
      where c.id = ${player}
      limit 1
    ),
    submission_rows as (
      select * from ranked_songs
      where "submitterId" = ${player}
      order by "supportIndex" desc nulls last, points desc
    ),
    distribution_rows as (
      select 'received' as direction, ev.points, count(*)::int as count
      from effective_votes ev
      where ev.submitter_id = ${player}
      group by ev.points
      union all
      select 'given' as direction, ev.points, count(*)::int as count
      from effective_votes ev
      where ev.voter_id = ${player}
      group by ev.points
    ),
    relationship_rows as (
      select
        'received'::text as direction,
        ev.voter_id as competitor_id,
        sum(ev.points)::int as points,
        count(*)::int as encounters,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      where ev.submitter_id = ${player}
      group by ev.voter_id
      union all
      select
        'given'::text as direction,
        ev.submitter_id as competitor_id,
        sum(ev.points)::int as points,
        count(*)::int as encounters,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      where ev.voter_id = ${player}
      group by ev.submitter_id
    ),
    directional_relationships as (
      select
        rr.direction,
        rr.competitor_id as "competitorId",
        ${displayName("c")} as "competitorName",
        rr.points,
        rr.encounters,
        rr.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds",
        rr.points::double precision / rr.encounters as "pointsPerEncounter",
        rr.positives::double precision / rr.encounters as "positiveRate"
      from relationship_rows rr
      join competitors c on c.id = rr.competitor_id
      where rr.shared_rounds >= (
        select minimum_shared_rounds from scope_thresholds
      )
      order by rr.direction, "pointsPerEncounter" desc, rr.encounters desc
    ),
    mutual_rows as (
      select
        case
          when ev.voter_id = ${player} then ev.submitter_id
          else ev.voter_id
        end as competitor_id,
        sum(ev.points)::int as points,
        count(*)::int as opportunities,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives
      from effective_votes ev
      where ev.voter_id = ${player}
         or ev.submitter_id = ${player}
      group by competitor_id
    ),
    mutual_budget_rounds as (
      select distinct
        case
          when ev.voter_id = ${player} then ev.submitter_id
          else ev.voter_id
        end as competitor_id,
        ev.round_id,
        ev.voter_id,
        bt.ballot_points
      from effective_votes ev
      join ballot_totals bt
        on bt.round_id = ev.round_id
       and bt.voter_id = ev.voter_id
      where ev.voter_id = ${player}
         or ev.submitter_id = ${player}
    ),
    mutual_budgets as (
      select
        competitor_id,
        sum(ballot_points)::double precision as eligible_ballot_points
      from mutual_budget_rounds
      group by competitor_id
    ),
    mutual_relationships as (
      select
        mr.competitor_id as "competitorId",
        ${displayName("c")} as "competitorName",
        mr.points,
        mr.opportunities,
        mr.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds",
        mr.points::double precision / mr.opportunities as "pointsPerOpportunity",
        mr.positives::double precision / mr.opportunities as "positiveRate",
        mr.points::double precision / nullif(mb.eligible_ballot_points, 0) as "ballotPointShare"
      from mutual_rows mr
      join mutual_budgets mb on mb.competitor_id = mr.competitor_id
      join competitors c on c.id = mr.competitor_id
      where mr.opportunities > 0
        and mb.eligible_ballot_points > 0
        and mr.shared_rounds >= (
          select minimum_shared_rounds from scope_thresholds
        )
      order by "pointsPerOpportunity" desc, mr.opportunities desc
    ),
    alignment_rows as (
      select
        case
          when pc.left_id = ${player} then pc.right_id
          else pc.left_id
        end as "competitorId",
        ${displayName("c")} as "competitorName",
        pc.dot / nullif(pc.magnitude, 0) as alignment,
        pc.comparable_features as "comparableFeatures",
        pc.shared_rounds as "sharedRounds",
        (select scope_rounds from scope_thresholds) as "scopeRounds"
      from pair_comparisons pc
      join competitors c
        on c.id = case
          when pc.left_id = ${player} then pc.right_id
          else pc.left_id
        end
      where (pc.left_id = ${player} or pc.right_id = ${player})
        and pc.magnitude > 0
      order by alignment desc, "comparableFeatures" desc
    ),
    round_ballot_counts as (
      select round_id, count(*)::int as observed_voters
      from active_ballots
      group by round_id
    ),
    ballot_positions as (
      select
        active_ballots.*,
        rbc.observed_voters,
        rank() over (
          partition by active_ballots.round_id
          order by active_ballots.cast_at
        )::int as ballot_rank,
        count(*) over (
          partition by active_ballots.round_id, active_ballots.cast_at
        )::int as tie_count
      from active_ballots
      join round_ballot_counts rbc on rbc.round_id = active_ballots.round_id
    ),
    ranked_ballots as (
      select
        ballot_positions.*,
        case
          when observed_voters = 1 then 0.5::double precision
          else (
            ballot_rank::double precision - 1 + tie_count::double precision / 2
          ) / observed_voters
        end as relative_order
      from ballot_positions
    ),
    player_submission_rounds as (
      select distinct s.round_id
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      where s.submitter_id = ${player}
    ),
    player_participation as (
      select
        sr.id as round_id,
        rb.cast_at,
        rb.relative_order,
        rb.ballot_rank,
        rb.tie_count,
        coalesce(rb.observed_voters, rbc.observed_voters, 0)::int as observed_voters,
        case when rb.voter_id is null then 'did_not_vote' else 'voted' end as participation
      from selected_rounds sr
      left join ranked_ballots rb
        on rb.round_id = sr.id
       and rb.voter_id = ${player}
      left join round_ballot_counts rbc on rbc.round_id = sr.id
      where rb.voter_id is not null
         or exists (
          select 1
          from player_submission_rounds psr
          where psr.round_id = sr.id
        )
    ),
    timing_rows as (
      select
        pp.round_id as "roundId",
        sr.name as "roundName",
        l.name as "leagueName",
        l.music_league_id as "leagueMusicLeagueId",
        sr.source_round_id as "sourceRoundId",
        sr.ordinal,
        pp.cast_at as "castAt",
        pp.relative_order as "relativeOrder",
        pp.ballot_rank as "ballotRank",
        pp.tie_count as "tieCount",
        pp.observed_voters as "observedVoters",
        pp.participation as "participation"
      from player_participation pp
      join selected_rounds sr on sr.id = pp.round_id
      join leagues l on l.id = sr.league_id
      order by sr.source_created_at desc, pp.cast_at desc nulls last
    )
    select
      (select count(*)::int from overview_rows) as overview,
      (select count(*)::int from submission_rows) as submissions,
      (select count(*)::int from distribution_rows) as distributions,
      (select count(*)::int from directional_relationships) as relationships,
      (select count(*)::int from mutual_relationships) as "mutualRelationships",
      (select count(*)::int from alignment_rows) as alignments,
      (select count(*)::int from timing_rows) as timing,
      (select coalesce(json_agg(to_jsonb(overview_rows)), '[]'::json) from overview_rows) as "overviewRows",
      (select coalesce(json_agg(to_jsonb(submission_rows)), '[]'::json) from submission_rows) as "submissionRows",
      (select coalesce(json_agg(to_jsonb(distribution_rows)), '[]'::json) from distribution_rows) as "distributionRows",
      (select coalesce(json_agg(to_jsonb(directional_relationships)), '[]'::json) from directional_relationships) as "relationshipRows",
      (select coalesce(json_agg(to_jsonb(mutual_relationships)), '[]'::json) from mutual_relationships) as "mutualRelationshipRows",
      (select coalesce(json_agg(to_jsonb(alignment_rows)), '[]'::json) from alignment_rows) as "alignmentRows",
      (select coalesce(json_agg(to_jsonb(timing_rows)), '[]'::json) from timing_rows) as "timingRows"
  `;
}

function currentFactsQueries(scope: BenchScope): string[] {
  const scopeCte = selectedRoundsCte(scope);
  return [
    `
      with ${scopeCte}
      select
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        count(distinct s.submitter_id)::int as submitters
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by lower(trim(s.artist_name))
      order by submissions desc, submitters desc, artist asc
      limit 15
    `,
    `
      with ${scopeCte},
      player_artist_counts as (
        select
          s.submitter_id,
          min(s.artist_name) as artist,
          count(*)::int as submissions,
          row_number() over (
            partition by s.submitter_id
            order by count(*) desc, min(s.artist_name) asc
          ) as artist_rank
        from submissions s
        join selected_rounds sr on sr.id = s.round_id
        group by s.submitter_id, lower(trim(s.artist_name))
      )
      select
        pac.submitter_id as "playerId",
        ${displayName("c")} as "playerName",
        pac.artist,
        pac.submissions
      from player_artist_counts pac
      join competitors c on c.id = pac.submitter_id
      where pac.artist_rank = 1 and pac.submissions > 1
      order by pac.submissions desc, "playerName" asc
      limit 15
    `,
    `
      with ${scopeCte}
      select
        s.spotify_uri as "spotifyUri",
        min(s.song_title) as title,
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        count(distinct s.submitter_id)::int as submitters,
        count(distinct s.league_id)::int as leagues,
        count(distinct s.round_id)::int as rounds
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by s.spotify_uri
      having count(*) > 1
      order by submissions desc, submitters desc, title asc
      limit 25
    `,
    `
      with ${scopeCte}
      select
        min(s.artist_name) as artist,
        count(distinct s.submitter_id)::int as submitters,
        count(*)::int as submissions
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by lower(trim(s.artist_name))
      order by submitters desc, submissions desc, artist asc
      limit 15
    `,
    `
      with ${scopeCte}
      select
        s.submitter_id as "playerId",
        ${displayName("c")} as "playerName",
        count(*)::int as submissions,
        count(distinct lower(trim(s.artist_name)))::int as artists
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      group by s.submitter_id, c.name_override, c.name
      order by submissions desc, artists desc, "playerName" asc
      limit 15
    `,
    `
      with ${scopeCte}
      select
        s.submitter_id as "playerId",
        ${displayName("c")} as "playerName",
        s.spotify_uri as "spotifyUri",
        min(s.song_title) as title,
        min(s.artist_name) as artist,
        count(*)::int as submissions
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      group by s.submitter_id, c.name_override, c.name, s.spotify_uri
      having count(*) > 1
      order by submissions desc, "playerName" asc, title asc
      limit 25
    `,
    `
      with ${scopeCte}
      select
        s.song_title as title,
        s.artist_name as artist,
        char_length(s.song_title)::int as length,
        ${displayName("c")} as "submitterName"
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      order by char_length(s.song_title) desc, s.song_title asc
      limit 10
    `,
    `
      with ${scopeCte}
      select
        s.song_title as title,
        s.artist_name as artist,
        char_length(s.song_title)::int as length,
        ${displayName("c")} as "submitterName"
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      order by char_length(s.song_title) asc, s.song_title asc
      limit 10
    `,
    `
      with ${scopeCte}
      select
        l.name as "leagueName",
        sr.name as "roundName",
        sr.ordinal as "roundOrdinal",
        count(s.id)::int as submissions,
        count(distinct s.submitter_id)::int as submitters
      from selected_rounds sr
      join leagues l on l.id = sr.league_id
      left join submissions s on s.round_id = sr.id
      group by l.id, sr.id, sr.name, sr.ordinal
      order by submissions desc, submitters desc, "leagueName" asc, "roundOrdinal" asc
      limit 15
    `,
  ];
}

function proposedFactsQuery(scope: BenchScope): string {
  return `
    with ${selectedRoundsCte(scope)},
    most_submitted_artists as (
      select
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        count(distinct s.submitter_id)::int as submitters
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by lower(trim(s.artist_name))
      order by submissions desc, submitters desc, artist asc
      limit 15
    ),
    player_artist_counts as (
      select
        s.submitter_id,
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        row_number() over (
          partition by s.submitter_id
          order by count(*) desc, min(s.artist_name) asc
        ) as artist_rank
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by s.submitter_id, lower(trim(s.artist_name))
    ),
    artist_loyalists as (
      select
        pac.submitter_id as "playerId",
        ${displayName("c")} as "playerName",
        pac.artist,
        pac.submissions
      from player_artist_counts pac
      join competitors c on c.id = pac.submitter_id
      where pac.artist_rank = 1 and pac.submissions > 1
      order by pac.submissions desc, "playerName" asc
      limit 15
    ),
    repeated_songs as (
      select
        s.spotify_uri as "spotifyUri",
        min(s.song_title) as title,
        min(s.artist_name) as artist,
        count(*)::int as submissions,
        count(distinct s.submitter_id)::int as submitters,
        count(distinct s.league_id)::int as leagues,
        count(distinct s.round_id)::int as rounds
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by s.spotify_uri
      having count(*) > 1
      order by submissions desc, submitters desc, title asc
      limit 25
    ),
    diverse_artists as (
      select
        min(s.artist_name) as artist,
        count(distinct s.submitter_id)::int as submitters,
        count(*)::int as submissions
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      group by lower(trim(s.artist_name))
      order by submitters desc, submissions desc, artist asc
      limit 15
    ),
    prolific_submitters as (
      select
        s.submitter_id as "playerId",
        ${displayName("c")} as "playerName",
        count(*)::int as submissions,
        count(distinct lower(trim(s.artist_name)))::int as artists
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      group by s.submitter_id, c.name_override, c.name
      order by submissions desc, artists desc, "playerName" asc
      limit 15
    ),
    repeat_submitter_songs as (
      select
        s.submitter_id as "playerId",
        ${displayName("c")} as "playerName",
        s.spotify_uri as "spotifyUri",
        min(s.song_title) as title,
        min(s.artist_name) as artist,
        count(*)::int as submissions
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      group by s.submitter_id, c.name_override, c.name, s.spotify_uri
      having count(*) > 1
      order by submissions desc, "playerName" asc, title asc
      limit 25
    ),
    longest_titles as (
      select
        s.song_title as title,
        s.artist_name as artist,
        char_length(s.song_title)::int as length,
        ${displayName("c")} as "submitterName"
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      order by char_length(s.song_title) desc, s.song_title asc
      limit 10
    ),
    shortest_titles as (
      select
        s.song_title as title,
        s.artist_name as artist,
        char_length(s.song_title)::int as length,
        ${displayName("c")} as "submitterName"
      from submissions s
      join selected_rounds sr on sr.id = s.round_id
      join competitors c on c.id = s.submitter_id
      order by char_length(s.song_title) asc, s.song_title asc
      limit 10
    ),
    densest_rounds as (
      select
        l.name as "leagueName",
        sr.name as "roundName",
        sr.ordinal as "roundOrdinal",
        count(s.id)::int as submissions,
        count(distinct s.submitter_id)::int as submitters
      from selected_rounds sr
      join leagues l on l.id = sr.league_id
      left join submissions s on s.round_id = sr.id
      group by l.id, sr.id, sr.name, sr.ordinal
      order by submissions desc, submitters desc, "leagueName" asc, "roundOrdinal" asc
      limit 15
    )
    select
      (select count(*)::int from most_submitted_artists) as "mostSubmittedArtists",
      (select count(*)::int from artist_loyalists) as "artistLoyalists",
      (select count(*)::int from repeated_songs) as "repeatedSongs",
      (select count(*)::int from diverse_artists) as "diverseArtists",
      (select count(*)::int from prolific_submitters) as "prolificSubmitters",
      (select count(*)::int from repeat_submitter_songs) as "repeatSubmitterSongs",
      (select count(*)::int from longest_titles) as "longestTitles",
      (select count(*)::int from shortest_titles) as "shortestTitles",
      (select count(*)::int from densest_rounds) as "densestRounds",
      (select coalesce(json_agg(to_jsonb(most_submitted_artists)), '[]'::json) from most_submitted_artists) as "mostSubmittedArtistRows",
      (select coalesce(json_agg(to_jsonb(artist_loyalists)), '[]'::json) from artist_loyalists) as "artistLoyalistRows",
      (select coalesce(json_agg(to_jsonb(repeated_songs)), '[]'::json) from repeated_songs) as "repeatedSongRows",
      (select coalesce(json_agg(to_jsonb(diverse_artists)), '[]'::json) from diverse_artists) as "diverseArtistRows",
      (select coalesce(json_agg(to_jsonb(prolific_submitters)), '[]'::json) from prolific_submitters) as "prolificSubmitterRows",
      (select coalesce(json_agg(to_jsonb(repeat_submitter_songs)), '[]'::json) from repeat_submitter_songs) as "repeatSubmitterSongRows",
      (select coalesce(json_agg(to_jsonb(longest_titles)), '[]'::json) from longest_titles) as "longestTitleRows",
      (select coalesce(json_agg(to_jsonb(shortest_titles)), '[]'::json) from shortest_titles) as "shortestTitleRows",
      (select coalesce(json_agg(to_jsonb(densest_rounds)), '[]'::json) from densest_rounds) as "densestRoundRows"
  `;
}

function dashboardQuery(scope: BenchScope): string {
  return `
    with ${songStatsCtes(scope)}, ${selectedLeaguesCte(scope)},
    player_round as (
      select
        submitter_id,
        round_id,
        sum(points)::int as points,
        sum(expected_points)::double precision as expected_points
      from song_stats
      group by submitter_id, round_id
    ),
    leaderboard_rows as (
      select
        c.id,
        ${displayName("c")} as name,
        sum(pr.points)::int as "totalPoints",
        avg(case when pr.expected_points > 0
          then pr.points::double precision / pr.expected_points else null end) as "normalizedIndex",
        count(*)::int as "enteredRounds"
      from player_round pr
      join competitors c on c.id = pr.submitter_id
      group by c.id, c.name_override, c.name
      order by "totalPoints" desc, name asc
      limit 100
    ),
    ranked_songs as (${songSelect()}),
    top_song_rows as (
      select * from ranked_songs
      order by "supportIndex" desc nulls last, points desc, title asc
      limit 10
    ),
    distribution_rows as (
      select ev.points, count(*)::int as count
      from effective_votes ev
      group by ev.points
      order by ev.points
    )
    select
      (select count(*)::int from selected_leagues) as "leagueCount",
      (select count(*)::int from selected_rounds) as "roundCount",
      (select count(distinct lm.competitor_id)::int from league_members lm join selected_leagues sl on sl.id = lm.league_id) as "playerCount",
      (select count(s.id)::int from submissions s join selected_rounds sr on sr.id = s.round_id) as "songCount",
      (select coalesce(sum(ev.points), 0)::int from effective_votes ev) as "pointCount",
      (select count(*)::int from leaderboard_rows) as leaderboard,
      (select count(*)::int from top_song_rows) as "topSongs",
      (select count(*)::int from distribution_rows) as distribution
  `;
}

function anyPredicateQuery(scope: BenchScope): string {
  return `
    select count(*)::int as count
    from rounds r
    where r.league_id = any(array[${uuid(scope.leagueId)}])
  `;
}

function orPredicateQuery(scope: BenchScope): string {
  return `
    select count(*)::int as count
    from rounds r
    where r.league_id = ${uuid(scope.leagueId)}
  `;
}

function rowCountSanity(rows: unknown[][]): Record<string, number> {
  return Object.fromEntries(rows.map((row, index) => [`q${index + 1}`, row.length]));
}

function singleRowSanity(row: Record<string, unknown> | undefined): Record<string, number | string | null> {
  if (!row) return { rows: 0 };
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => typeof value === "number" || typeof value === "string" || value === null)
      .map(([key, value]) => [key, value as number | string | null]),
  );
}

async function executeQueries(db: Db, queries: readonly string[]): Promise<unknown[][]> {
  return Promise.all(queries.map((query) => db.unsafe(query)));
}

async function executeQueriesSequentially(
  db: Db,
  queries: readonly string[],
): Promise<unknown[][]> {
  const rows: unknown[][] = [];
  for (const query of queries) {
    rows.push(await db.unsafe(query));
  }
  return rows;
}

async function measure(
  label: string,
  statements: number,
  runs: number,
  fn: () => Promise<Record<string, number | string | null>>,
): Promise<ScenarioResult> {
  await fn();
  const samples: number[] = [];
  let sanity: Record<string, number | string | null> = {};
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    sanity = await fn();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  return {
    label,
    statements,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    mean,
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    sanity,
  };
}

async function discoverContext(db: Db): Promise<BenchContext | null> {
  const leagueId = argValue("--leagueId");
  const roundIds = parseRoundIds();
  const playerId = argValue("--playerId");

  const leagueRows = leagueId
    ? await db.unsafe(`
        select l.id, l.name, count(s.id)::int as submissions
        from leagues l
        left join rounds r on r.league_id = l.id
        left join submissions s on s.round_id = r.id
        where l.id = ${uuid(leagueId)}
        group by l.id, l.name
        limit 1
      `)
    : await db.unsafe(`
        select l.id, l.name, count(s.id)::int as submissions
        from leagues l
        join rounds r on r.league_id = l.id
        join submissions s on s.round_id = r.id
        group by l.id, l.name
        order by submissions desc, l.name asc
        limit 1
      `);
  const league = leagueRows[0] as unknown as
    | { id: string; name: string }
    | undefined;
  if (!league) return null;

  const scope = { leagueId: assertUuid(league.id), roundIds };
  const playerRows = playerId
    ? await db.unsafe(`
        select c.id, ${displayName("c")} as name, count(s.id)::int as submissions
        from competitors c
        left join submissions s on s.submitter_id = c.id and s.league_id = ${uuid(scope.leagueId)}
        where c.id = ${uuid(playerId)}
        group by c.id, c.name_override, c.name
        limit 1
      `)
    : await db.unsafe(`
        select c.id, ${displayName("c")} as name, count(s.id)::int as submissions
        from submissions s
        join competitors c on c.id = s.submitter_id
        where s.league_id = ${uuid(scope.leagueId)}
        group by c.id, c.name_override, c.name
        order by submissions desc, name asc
        limit 1
      `);
  const player = playerRows[0] as unknown as
    | { id: string; name: string }
    | undefined;
  if (!player) return null;

  return {
    scope,
    playerId: assertUuid(player.id),
    leagueName: league.name,
    playerName: player.name,
  };
}

function printResults(results: ScenarioResult[]): void {
  console.log("");
  console.log("| scenario | stmts | min_ms | median_ms | mean_ms | p95_ms |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const result of results) {
    console.log(
      `| ${result.label} | ${result.statements} | ${result.min.toFixed(1)} | ${result.median.toFixed(1)} | ${result.mean.toFixed(1)} | ${result.p95.toFixed(1)} |`,
    );
  }
  console.log("");
  console.log("Sanity checks:");
  for (const result of results) {
    console.log(`- ${result.label}: ${JSON.stringify(result.sanity)}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("DATABASE_URL is not set; skipping DB benchmark.");
    return;
  }

  const runs = parseRuns();
  const db = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const dbMax3 = postgres(databaseUrl, {
    max: 3,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    const context = await discoverContext(db);
    if (!context) {
      console.log("No leagues/players with submissions found; skipping DB benchmark.");
      return;
    }

    console.log(`DB benchmark scope: ${context.leagueName} (${context.scope.leagueId})`);
    console.log(`Player: ${context.playerName} (${context.playerId})`);
    console.log(`Runs per scenario after warm-up: ${runs}`);

    const currentProfile = currentProfileQueries(context.scope, context.playerId);
    const currentFacts = currentFactsQueries(context.scope);

    const results = [
      await measure("profile/current Promise.all max1", currentProfile.length, runs, async () =>
        rowCountSanity(await executeQueries(db, currentProfile)),
      ),
      await measure("profile/current sequential max1", currentProfile.length, runs, async () =>
        rowCountSanity(await executeQueriesSequentially(db, currentProfile)),
      ),
      await measure("profile/current Promise.all max3", currentProfile.length, runs, async () =>
        rowCountSanity(await executeQueries(dbMax3, currentProfile)),
      ),
      await measure("profile/proposed collapsed max1", 1, runs, async () =>
        singleRowSanity((await db.unsafe(proposedProfileQuery(context.scope, context.playerId)))[0]),
      ),
      await measure("facts/current Promise.all max1", currentFacts.length, runs, async () =>
        rowCountSanity(await executeQueries(db, currentFacts)),
      ),
      await measure("facts/proposed collapsed max1", 1, runs, async () =>
        singleRowSanity((await db.unsafe(proposedFactsQuery(context.scope)))[0]),
      ),
      await measure("dashboard/control max1", 1, runs, async () =>
        singleRowSanity((await db.unsafe(dashboardQuery(context.scope)))[0]),
      ),
      await measure("predicate/or", 1, runs, async () =>
        singleRowSanity((await db.unsafe(orPredicateQuery(context.scope)))[0]),
      ),
      await measure("predicate/any", 1, runs, async () =>
        singleRowSanity((await db.unsafe(anyPredicateQuery(context.scope)))[0]),
      ),
    ];

    printResults(results);
  } finally {
    await Promise.all([
      db.end({ timeout: 5 }),
      dbMax3.end({ timeout: 5 }),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
