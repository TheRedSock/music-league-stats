import { sql } from "drizzle-orm";

/** Requires effective_votes and ballot_totals. One expectation per eligible song,
 * but each giver's ballot budget appears only once per pair and round. */
export function mutualSupportCtes() {
  return sql`
    mutual_rows as (
      select least(ev.voter_id, ev.submitter_id) as left_id,
        greatest(ev.voter_id, ev.submitter_id) as right_id,
        sum(ev.points)::int as points, count(*)::int as opportunities,
        count(distinct ev.round_id)::int as shared_rounds,
        count(*) filter (where ev.points > 0)::int as positives,
        sum(bt.ballot_points / nullif(bt.eligible_opportunities, 0))::double precision as expected_points
      from effective_votes ev
      join ballot_totals bt on bt.round_id = ev.round_id and bt.voter_id = ev.voter_id
      group by least(ev.voter_id, ev.submitter_id), greatest(ev.voter_id, ev.submitter_id)
    ),
    mutual_budget_rows as (
      select distinct least(ev.voter_id, ev.submitter_id) as left_id,
        greatest(ev.voter_id, ev.submitter_id) as right_id,
        ev.round_id, ev.voter_id, bt.ballot_points
      from effective_votes ev
      join ballot_totals bt on bt.round_id = ev.round_id and bt.voter_id = ev.voter_id
    ),
    mutual_budgets as (
      select left_id, right_id, sum(ballot_points)::double precision as eligible_ballot_points
      from mutual_budget_rows group by left_id, right_id
    ),
    mutual_comparisons as (
      select mr.*, mb.eligible_ballot_points,
        mr.points::double precision / mr.expected_points as relative_support,
        mr.points::double precision / mb.eligible_ballot_points as ballot_point_share
      from mutual_rows mr join mutual_budgets mb using (left_id, right_id)
      where mr.expected_points > 0 and mb.eligible_ballot_points > 0
    )
  `;
}
