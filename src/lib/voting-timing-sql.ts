import { sql } from "drizzle-orm";

export const VOTING_WINDOW_TIME_ZONE = "Europe/Oslo";

/** Includes the following round even when it is outside a requested round subset.
 * Schedules are estimates, never inferred from the first/last votes alone. */
export function timingRoundCtes() {
  return sql`
    window_submission_times as (
      select round_id, min(submitted_at) as first_submission, max(submitted_at) as last_submission
      from submissions where league_id in (select league_id from selected_rounds) group by round_id
    ),
    window_vote_times as (
      select round_id, min(cast_at) as first_vote, max(cast_at) as last_vote
      from votes where league_id in (select league_id from selected_rounds) group by round_id
    ),
    window_rounds as (
      select r.*, l.end_date, l.total_rounds as scheduled_rounds, l.status as league_status,
        st.first_submission, st.last_submission, vt.first_vote, vt.last_vote,
        lead(st.first_submission) over league_rounds as next_submission,
        lead(r.id) over league_rounds as next_round
      from rounds r join leagues l on l.id = r.league_id
      left join window_submission_times st on st.round_id = r.id
      left join window_vote_times vt on vt.round_id = r.id
      where r.league_id in (select league_id from selected_rounds)
      window league_rounds as (partition by r.league_id order by r.ordinal)
    ),
    window_bounds as (
      select *, case when next_round is not null then next_submission
        when ordinal >= scheduled_rounds or league_status = 'ended'
          then (end_date + 1)::timestamp at time zone ${VOTING_WINDOW_TIME_ZONE}
        end as close_upper
      from window_rounds
    ),
    window_candidates as (
      select wr.*, opens.candidate as estimated_open, closes.candidate as estimated_close
      from window_bounds wr
      left join lateral (
        select candidate from generate_series(case when wr.first_vote - wr.last_submission between interval '0 days' and interval '31 days' then date_trunc('hour', wr.last_submission) end, wr.first_vote, interval '1 hour') candidate
        where candidate >= wr.last_submission
          and wr.first_vote >= wr.last_submission
          and wr.first_vote - wr.last_submission <= interval '31 days'
        order by case when extract(hour from candidate at time zone ${VOTING_WINDOW_TIME_ZONE}) = 0 then 0
          when extract(hour from candidate at time zone ${VOTING_WINDOW_TIME_ZONE})::int % 3 = 0
            or extract(hour from candidate at time zone ${VOTING_WINDOW_TIME_ZONE})::int % 4 = 0 then 1 else 2 end,
          candidate asc limit 1
      ) opens on wr.voting_opens_at is null
      left join lateral (
        select candidate from generate_series(case when wr.close_upper - wr.last_vote between interval '0 days' and interval '31 days' then date_trunc('hour', wr.last_vote) end, wr.close_upper, interval '1 hour') candidate
        where candidate >= wr.last_vote and wr.close_upper >= wr.last_vote
          and wr.close_upper - wr.last_vote <= interval '31 days'
        order by case when extract(hour from candidate at time zone ${VOTING_WINDOW_TIME_ZONE}) = 0 then 0
          when extract(hour from candidate at time zone ${VOTING_WINDOW_TIME_ZONE})::int % 3 = 0
            or extract(hour from candidate at time zone ${VOTING_WINDOW_TIME_ZONE})::int % 4 = 0 then 1 else 2 end,
          candidate desc limit 1
      ) closes on wr.voting_closes_at is null and wr.next_round is not null
    ),
    resolved_windows as (
      select id, coalesce(voting_opens_at, estimated_open) as opens_at,
        coalesce(voting_closes_at, case when next_round is null and close_upper >= last_vote and close_upper - last_vote <= interval '31 days' then close_upper else estimated_close end) as closes_at,
        case when voting_opens_at is not null then 'set' else 'estimated' end as source
      from window_candidates
    ),
    round_windows as (
      select id, case when closes_at > opens_at then opens_at end as opens_at,
        case when closes_at > opens_at then closes_at end as closes_at,
        case when closes_at > opens_at then source else 'unavailable' end as source
      from resolved_windows
    ),
    round_ballot_counts as (
      select round_id, count(*)::int as observed_voters from active_ballots group by round_id
    ),
    ballot_positions as (
      select ab.*, rbc.observed_voters,
        rank() over (partition by ab.round_id order by ab.cast_at)::int as ballot_rank,
        count(*) over (partition by ab.round_id, ab.cast_at)::int as tie_count,
        rw.opens_at, rw.closes_at, rw.source as window_source
      from active_ballots ab join round_ballot_counts rbc on rbc.round_id = ab.round_id
      left join round_windows rw on rw.id = ab.round_id
    ),
    ranked_ballots as (
      select *, (ballot_rank::double precision - 1 + tie_count::double precision / 2) / observed_voters as relative_order,
        extract(epoch from (cast_at - opens_at))::double precision
          / nullif(extract(epoch from (closes_at - opens_at)), 0) as window_position
      from ballot_positions
    )
  `;
}
