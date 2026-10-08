import { sql, type SQL } from "drizzle-orm";

/** Shared by materialized and live profiles; tied point values share a cumulative count. */
export function profileVoteCountCtes(source: "analytics_effective_votes" | "effective_votes", playerId: string): SQL {
  const votes = sql.identifier(source);
  return sql`
    profile_ballot_counts as (
      select round_id, points,
        sum(count(*)) over (partition by round_id order by points desc)::int as songs_at_least
      from ${votes} where voter_id = ${playerId}
      group by round_id, points
    ),
    profile_song_counts as (
      select submission_id, points,
        sum(count(*)) over (partition by submission_id order by points desc)::int as voters_at_least,
        sum(sum(points)) over (partition by submission_id)::double precision as song_points,
        sum(count(*)) over (partition by submission_id)::int as song_eligible_voters
      from ${votes}
      group by submission_id, points
    )
  `;
}

export const profileVoteCountColumns = sql`
  bc.songs_at_least as "songsAtLeast",
  sc.song_points as "songPoints",
  sc.song_eligible_voters as "songEligibleVoters",
  sc.voters_at_least as "votersAtLeast"
`;

export const profileVoteCountJoins = sql`
  join profile_ballot_counts bc on bc.round_id = ev.round_id and bc.points = ev.points
  join profile_song_counts sc on sc.submission_id = ev.submission_id and sc.points = ev.points
`;
