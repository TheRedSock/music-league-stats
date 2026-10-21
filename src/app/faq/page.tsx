import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { FaqAnchorTarget } from "@/components/analytics/faq-anchor-target";

export const metadata: Metadata = { title: "How the stats work", description: "Rankings, voting similarity and the numbers behind Music League results." };

const topics = [
  {
    id: "song-search",
    title: "How do I search for songs?",
    summary: "On Songs, plain text searches song titles, artists, albums and player names. Use a field prefix to narrow the search. All matching ignores case.",
    detail: <div className="space-y-6 [&_code]:rounded [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-zinc-200">
      <div>
        <h3 className="font-medium text-zinc-200">Search within a field</h3>
        <p className="mt-1">Put the field name and a colon directly before the value. Without quotes, values match part of the field.</p>
        <dl className="mt-3 divide-y divide-white/10">
          {[
            ["Artist", "artist:beatles"],
            ["Song title", "title:yellow"],
            ["Album", "album:abbey"],
            ["Player / submitter", "player:alex"],
            ["League name", "league:summer"],
            ["Round name", "round:summer"],
          ].map(([label, example]) => <div key={label} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]">
            <dt>{label}</dt>
            <dd><code>{example}</code></dd>
          </div>)}
        </dl>
        <p className="mt-2"><code>song:</code> also works for song titles. <code>submitter:</code> also works for player names.</p>
      </div>
      <div>
        <h3 className="font-medium text-zinc-200">Match an exact name</h3>
        <p className="mt-1">Put double quotes around a field value to match the entire name, including spaces.</p>
        <p className="mt-3"><code>artist:&quot;22&quot;</code></p>
        <p className="mt-1">Finds songs whose artist is exactly 22. A song with 22 only in its title will not match.</p>
        <p className="mt-3"><code>artist:&quot;Pink Floyd&quot;</code></p>
        <p className="mt-1">Use the same pattern for any field, such as an exact album or player name.</p>
      </div>
      <div>
        <h3 className="font-medium text-zinc-200">Keep a phrase together</h3>
        <p className="mt-3"><code>&quot;yellow submarine&quot;</code></p>
        <p className="mt-1">Without a field prefix, a quoted phrase can appear anywhere within a title, artist, album or player name. It does not need to fill the whole field.</p>
      </div>
      <div>
        <h3 className="font-medium text-zinc-200">Combine filters or exclude matches</h3>
        <p className="mt-1">Separate terms with spaces. Every term must match. A leading minus sign excludes a term or field value.</p>
        <p className="mt-3"><code>artist:beatles title:yellow</code></p>
        <p className="mt-1">Requires beatles in the artist and yellow in the song title.</p>
        <p className="mt-3"><code>artist:&quot;22&quot; -title:live</code></p>
        <p className="mt-1">Finds the artist 22 while excluding titles containing live.</p>
        <p className="mt-3"><code>artist:beatles -remix</code></p>
        <p className="mt-1">Excludes remix from all four fields searched by plain text.</p>
      </div>
      <p>Searches use your selected leagues. Click a column heading to sort the results; the search stays applied.</p>
    </div>,
  },
  { id: "rankings", title: "Why do the rankings differ?", summary: "Points reward the total earned. Average round index compares performance across rounds of different sizes.", detail: "For each round, the player’s points are divided by the expected points for their submissions, then those round indexes are averaged. 1.0 means expected support. The first column numbers the rows in the current sort order. The minimum rounds required is shown beside the results: roughly half the rounds for a small scope, easing to one third across all leagues. A dash means the player has not reached that threshold. Wins include ties; top quartile counts finishes in the top 25%." },
  { id: "song-measures", title: "What does each song measure tell me?", summary: "Songs starts with total points and adjusted support. Voters reached is available under Columns and shows how many eligible voters gave the song points.", detail: "Points per eligible voter includes zeroes; points per actual voter includes only voters who gave points. Round share is the song’s fraction of all eligible points in its round. Round percentile is its position within that round, with higher values meaning a better finish. Columns contains the additional measures. Choosing a sort also shows the relevant column." },
  { id: "adjusted-support", title: "How does adjusted support work?", summary: "It compares points with the round’s expected support and reduces extremes from small samples. The Home standout songs use it.", detail: "Raw support index = points ÷ expected points from eligible ballot budgets. Adjusted support is the empirical-Bayes estimate: the raw index is shrunk toward 1.0 using corpus-estimated variance, Var(SI) ≈ τ² + φ/E. It is an estimate, not an observed multiplier. When variance cannot be estimated, the raw index is used. Statistical surprise (support z) is (points − expected) ÷ √(φ × expected): a standardized surplus under the expected-support model. Neither measure is a judgment of musical quality." },
  { id: "voting-similarity", title: "Do these players vote alike?", summary: "Voting similarity runs from −100 to +100. Positive means agreement, zero means no linear agreement, and negative means opposing preferences.", detail: "Only songs both players could vote for are compared; both players’ own submissions are excluded. Votes, including inferred zeroes, are divided by the voter’s ballot budget and centered on their shared-song mean in each round. Cosine similarity compares the pooled deviations. Rounds where either shared ballot is flat do not contribute. This is not the percentage of songs both players liked. Shared-round and song-comparison counts describe the available sample. Relative mutual support is separate: points exchanged divided by the expected points for those two players in each round." },
  { id: "support", title: "What do Support and Mutual compare?", summary: "Support shows points from one player to another. Relative mutual support combines both directions and accounts for the available choices in every round. 1× means expected support.", detail: "Expected points from A to B are A’s ballot budget multiplied by B’s eligible songs, divided by all songs A could vote for. We add the actual points in both directions and divide by the sum of these expectations across rounds. 2× means twice the expected allocation; 0.5× means half. Multiple submissions and changing round sizes are included. Missing ballots create no voting opportunities; zero-point choices on active ballots do count. Ballot share is available on request and describes the unadjusted share of the pair’s eligible voting budgets. Support’s points per opportunity remains the average score per eligible song, including zeroes. Minimum round requirements apply. Relative support is an even-allocation comparison, not proof of favouritism; strong submissions can also produce high values. One direction can account for most of a pair’s combined support." },
  { id: "zeroes", title: "Why are there votes worth zero?", summary: "An active voter could have chosen every eligible song they did not submit. Missing choices count as zero.", detail: "A ballot is active when it has at least one exported vote row, including an explicit zero. A scored submission was visible to voters or has exported votes. Self-votes are excluded. A player who submitted but did not vote creates no inferred zeroes and is marked as having missed the ballot. Imports keep the original rows; analytics adds eligible opportunities for calculation." },
  { id: "vote-details", title: "What are ballot blowout and crowd contrast?", summary: "They distinguish a voter’s unusually strong choices from scores that stand out among other voters.", detail: "Highest votes given sorts by points, with ballot blowout as its tiebreaker. Ballot blowout compares the score with an equal share of that voter’s ballot, divided again by the number of songs on the ballot scoring at least as much. Crowd contrast compares with points per eligible voter on that song, divided by the number of voters giving at least that score. The detail table can be searched and sorted independently." },
  { id: "facts", title: "How should I read the Facts page?", summary: "Repeated artists and songs are counts. Reach versus share describes whether support is broad or concentrated.", detail: "Spread is reach percentile minus round-share percentile, in percentage points; ties use midpoint percentiles. Positive means broader reach relative to point share, negative means more concentrated support. Song comparisons require at least five eligible voters; player comparisons require at least three songs and the participation threshold. Most repeated artists counts repeated submissions, not consecutive streaks. Playlist position and points reports correlation, not causation. Playlist quartiles contain nearly equal song counts, with leftover positions assigned to earlier groups." },
  { id: "graphs", title: "Which graph should I use?", summary: "League race follows standings. Player groups compares shared preferences or relative mutual support. Support flow shows who gives points to whom.", detail: "Matrix compares every pair, including negative and zero similarity; an empty cell means no qualifying comparison. Player connections focuses on one person. Graphs describe voting behavior, not friendships or listening history. League race uses only rounds with exported votes; missed rounds add zero, multiple submissions are summed, and early/late averages split the displayed rounds in half (the middle round belongs to the early half). Selected round subsets restart totals at zero." },
  { id: "scope", title: "Which leagues am I looking at?", summary: "Pages open with all leagues. The league selector can choose the latest league, a single league, or a combination.", detail: "Scope is carried in navigation links and shared URLs. Public round filters are retired; graph progression can still show a subset of displayed rounds. A new league combination may need its results prepared before comparisons are available. Imports and refreshes can temporarily show an updating state. Exports do not include listening behavior, private intent or official voting opening/closing times. Voting windows are estimated from activity unless exact times are set in Admin." },
  { id: "timing", title: "How are the timing measures different?", summary: "Voting order compares with other voters. Voting window measures how much of the available time had elapsed. Combined gives both measures equal weight. Lower means earlier.", detail: "Order ranks the latest exported timestamp on each ballot within its round, using midpoint positions for ties. Window is (ballot time − opening) ÷ (closing − opening): 0% is opening, 100% is closing. Where exact times are absent, we estimate opening between the last submission and first vote, and closing between the last vote and first submission of the following round. Midnight in Europe/Oslo is preferred, followed by three-/four-hour schedule boundaries, then other whole hours. Opening uses the earliest preferred boundary; closing uses the latest. For the final scheduled round, or an ended league, we use the end of the league’s last calendar day. The most recent import of an unfinished league is not treated as its final round. DST uses actual elapsed time. Conflicting boundaries, missing evidence, gaps over 31 days, or no whole-hour candidate leave that window unavailable. These are estimates of schedule times and can miss early closure or deadline changes. Admin can override both times. Combined averages Order and Window for each ballot with both available, then averages those combined values; missing windows never fall back to order alone. Coverage shows how many ballots contribute, with estimated windows identified. Values before an explicitly set opening or after closing can be below 0% or above 100%; timing alone does not establish deadline compliance. Missed ballots percentage is missed ballots divided by rounds entered through submitting or voting, not all scheduled league rounds. Missed ballots are excluded from all timing averages." },
];

export default function FaqPage() {
  return <Container className="py-6 sm:py-10">
    <FaqAnchorTarget />
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">How the stats work</h1>
      <nav aria-label="Metric topics" className="my-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-lime-300">
        <Link href="#song-search">Song search</Link><Link href="#rankings">Rankings</Link><Link href="#song-measures">Songs</Link><Link href="#voting-similarity">Voting similarity</Link><Link href="#zeroes">Zeroes</Link><Link href="#graphs">Graphs</Link>
      </nav>
      {topics.map(topic => <section key={topic.id} id={topic.id} className="faq-topic scroll-mt-24 border-t border-white/10 py-6">
        <h2 className="text-lg font-semibold">{topic.title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{topic.summary}</p>
        <details className="mt-3 text-sm text-zinc-400"><summary className="cursor-pointer text-lime-300">Details</summary><div className="mt-3 leading-7">{typeof topic.detail === "string" ? <p>{topic.detail}</p> : topic.detail}</div></details>
      </section>)}
    </div>
  </Container>;
}
