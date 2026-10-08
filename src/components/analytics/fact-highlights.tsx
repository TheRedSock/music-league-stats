import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { buildAnalyticsHref, spotifyTrackUrl, type QueryValue, type SubmissionFactsData } from "@/lib/analytics";
import { musicLeagueUrl } from "@/lib/music-league-urls";

type Highlight = { label: string; title: string; detail: string; href?: string | null };

export function FactHighlights({ category, data, filterParams }: {
  category: string; data: SubmissionFactsData; filterParams: Record<string, QueryValue>;
}) {
  const playerHref = (id: string) => buildAnalyticsHref(`/players/${data.playerSlugs[id] ?? id}`, filterParams, {});
  const artistHref = (artist: string) => `https://open.spotify.com/search/${encodeURIComponent(artist)}`;
  const roundHref = (row: { leagueMusicLeagueId: string | null; sourceRoundId: string }) => musicLeagueUrl(row.leagueMusicLeagueId, row.sourceRoundId);
  const highlights: Highlight[] = [];
  if (category === "voting") {
    const biggest = data.highestAverageVoteSongs[0];
    const broad = data.crowdPleaserPlayers[0];
    const cult = data.cultClassicSongs.find(song => song.songId !== biggest?.songId);
    if (biggest) highlights.push({ label: "Biggest votes per supporter", title: biggest.title, detail: `${biggest.averageVotes.toFixed(1)} points on average from ${biggest.actualVoters} ${biggest.actualVoters === 1 ? "voter" : "voters"}`, href: spotifyTrackUrl(biggest.spotifyUri) });
    if (broad) highlights.push({ label: "Broadest reach relative to point share", title: broad.playerName, detail: `${(broad.avgPositiveReach * 100).toFixed(0)}% of voters gave points, averaged across ${broad.songs} songs`, href: playerHref(broad.playerId) });
    if (cult) highlights.push({ label: "Strong backing from a small crowd", title: cult.title, detail: `${cult.points} points from ${(cult.positiveReach * 100).toFixed(0)}% of voters`, href: spotifyTrackUrl(cult.spotifyUri) });
  } else if (category === "artists") {
    const popular = data.mostSubmittedArtists[0];
    const loyal = data.artistLoyalists[0];
    const varied = [...data.prolificSubmitters].sort((a,b) => b.artists - a.artists)[0];
    if (popular) highlights.push({ label: "Most submitted artist", title: popular.artist, detail: `${popular.submissions} submissions`, href: artistHref(popular.artist) });
    if (loyal) highlights.push({ label: "Most loyal to one artist", title: loyal.playerName, detail: `${loyal.submissions} submissions of ${loyal.artist}`, href: playerHref(loyal.playerId) });
    if (varied) highlights.push({ label: "A wide-ranging collection", title: varied.playerName, detail: `${varied.artists} different artists across ${varied.submissions} submissions`, href: playerHref(varied.playerId) });
  } else if (category === "rounds") {
    const close = data.closestRaces[0];
    const landslide = data.biggestLandslides[0];
    const dense = data.densestRounds[0];
    if (close) highlights.push({ label: "Closest finish", title: close.roundName, detail: `${(close.topTwoShareGap * 100).toFixed(1)} percentage points between the top two songs`, href: roundHref(close) });
    if (landslide) highlights.push({ label: "Biggest winning margin", title: landslide.roundName, detail: `${(landslide.topTwoShareGap * 100).toFixed(1)} percentage points between the top two songs`, href: roundHref(landslide) });
    if (dense) highlights.push({ label: "The longest playlist", title: dense.roundName, detail: `${dense.submissions} songs from ${dense.submitters} ${dense.submitters === 1 ? "submitter" : "submitters"}`, href: roundHref(dense) });
  } else {
    const repeat = data.repeatedSongs[0];
    const longest = data.longestTitles[0];
    const shortest = data.shortestTitles[0];
    if (repeat) highlights.push({ label: "The song that keeps coming back", title: repeat.title, detail: `${repeat.submissions} submissions by ${repeat.submitters} players · ${repeat.artist}`, href: spotifyTrackUrl(repeat.spotifyUri) });
    if (longest) highlights.push({ label: "Longest title", title: longest.title, detail: `${longest.length} characters · ${longest.artist}`, href: spotifyTrackUrl(longest.spotifyUri) });
    if (shortest) highlights.push({ label: "Shortest title", title: shortest.title, detail: `${shortest.length} ${shortest.length === 1 ? "character" : "characters"} · ${shortest.artist}`, href: spotifyTrackUrl(shortest.spotifyUri) });
  }
  if (!highlights.length) return null;
  return <section aria-label="Highlights" className="mt-5 grid gap-5 border-y border-white/10 py-5 md:grid-cols-3">
    {highlights.map(item => <div key={item.label} className="min-w-0">
      <h2 className="text-xs text-zinc-400">{item.label}</h2>
      <p className="mt-2 line-clamp-2 text-lg font-semibold" title={item.title}>
        {item.href ? <Link className="hover:text-lime-200" href={item.href} {...(item.href.startsWith("https:") ? { target: "_blank", rel: "noreferrer" } : {})}>{item.title}{item.href.startsWith("https:") ? <ExternalLink aria-hidden="true" className="ml-1 inline size-3 text-zinc-500" /> : <ArrowRight aria-hidden="true" className="ml-1 inline size-3 text-zinc-500" />}</Link> : item.title}
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-zinc-400" title={item.detail}>{item.detail}</p>
    </div>)}
  </section>;
}
