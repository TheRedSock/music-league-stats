import { ArrowLeft, HelpCircle } from "lucide-react";
import type { Metadata } from "next";

import { ScopedLink } from "@/components/analytics/scoped-link";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Plain-language explanations of Music League Tracker metrics.",
};

const sections = [
  {
    title: "What is an eligible opportunity?",
    body: "If you voted in a round, every visible song you did not submit is a song you could have voted for. Each of those possible choices is an eligible opportunity. If the export has no row for one of those songs, the app treats that choice as zero points.",
  },
  {
    title: "What is positive reach?",
    body: "Positive reach asks: out of everyone who could vote for this song, how many gave it more than zero? A song with 40% positive reach got points from 40% of its eligible voters.",
  },
  {
    title: "What is points per voter?",
    body: "This is the average points received per eligible opportunity. It is useful when one song had more people able to vote on it than another.",
  },
  {
    title: "What is support index (raw)?",
    body: "Raw support index is points received divided by expected points from the eligible ballot budgets that could reach the song. 1.0× means expected support, 2.0× means twice expected, and 0.5× means half expected. It is fair within a round, but extreme values are easier in small rooms because a few strong votes move a smaller denominator more.",
  },
  {
    title: "What is support index (EB)?",
    body: "Support index (EB) is an empirical-Bayes version of raw support index. It shrinks the ratio toward 1.0× using sample-size variance estimated from the full corpus (Var(SI) ≈ τ² + φ/E). Songs from small or noisy samples are pulled toward expected support; songs with more eligible ballot mass keep more of their raw signal. The dashboard top-songs list and the default Songs sort use this for cross-round comparison. If variance cannot be estimated, the app falls back to the raw index instead of forcing every song to 1.0×.",
  },
  {
    title: "What is support z?",
    body: "Support z is the standardized surplus under the same variance model: (points − expected) / sqrt(φ × expected). It answers how surprising the result is if the song were only at expected support, not what the best estimate of the true multiplier is. A 2.0× result in a large round scores a higher z than the same 2.0× in a tiny round. On the Songs page it is shown by default next to Support (EB); use Columns to hide it.",
  },
  {
    title: "When should I use raw SI vs EB vs z?",
    body: "Use raw support index to compare songs inside the same round or to see the unadjusted multiplier. Use support index (EB) for cross-round or all-league leaderboards where small-sample blowouts should not dominate. Use support z when you care about statistical surprise under a null of expected support. Round percentile stays a within-round rank and is optional on the Songs table via Columns.",
  },
  {
    title: "What is average round index?",
    body: "For players, each round compares their total points with the expected points for their submitted songs in that round. The profile and leaderboard average those round-local indexes so playing more rounds does not automatically make the score better.",
  },
  {
    title: "What is a percentile?",
    body: "A percentile says where a song or player landed inside the round. Higher is better for performance percentiles. For relative voting order, lower means the ballot was completed earlier than more observed voters; ties use the middle of the tied positions. On Songs, round percentile is hidden by default and can be added from the Columns control.",
  },
  {
    title: "What is top quartile?",
    body: "Top quartile means the player landed in the top 25% of round-local performance for that round. The percentage shown is how often that happened across entered rounds.",
  },
  {
    title: "What is vote-pattern alignment?",
    body: "Alignment compares two voters' ballot shapes after normalizing by each voter's ballot budget. Similar point patterns score higher. It describes voting behavior only, not friendship, taste, causality, or listening habits.",
  },
  {
    title: "What is mutual ballot share?",
    body: "Mutual ballot share looks at points two players gave to each other's songs and divides them by the eligible ballot points involved. It is budget-aware, so a large ballot and a small ballot can be compared more fairly.",
  },
  {
    title: "What is the Compare page?",
    body: "Compare is the full-table version of the player profile relationship panels. Profile section titles link there with the current scope, focused player, and matching sort already selected.",
  },
  {
    title: "What is the Facts page?",
    body: "Facts groups submissions and vote outcomes to surface dataset-level patterns: repeated artists, dense rounds, appeal shape (crowd-pleasers vs niche devotion via standardized reach vs share), round races and landslides, and playlist-position vote distribution (from submissions.csv slate order). Player appeal panels use the same ~1/3-of-scope participation floor as other rankings. It uses the same league scope filter as the analytics pages.",
  },
];

const glossary = [
  ["Active ballot", "A voter with at least one exported vote row in a round."],
  ["Inferred zero", "A missing vote row for a song the active voter could have voted for."],
  ["Did not vote", "A submitter with no exported vote row in that round."],
  ["Support index (raw)", "Points ÷ expected points from eligible ballot budgets."],
  ["Support index (EB)", "Raw support index shrunk toward 1.0× for sample-size noise."],
  ["Support z", "Standardized points surplus vs expected under the EB variance model."],
  ["Scope", "The selected league and/or round filter."],
  ["Comparable features", "The ballot items used when comparing two voters."],
  ["Provisional", "A player with fewer entered rounds than the selected ranking threshold."],
] as const;

export default function FaqPage() {
  return (
    <Container className="py-10 sm:py-14">
      <ScopedLink
        className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}
        href="/"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Dashboard
      </ScopedLink>

      <div className="mt-6 max-w-3xl">
        <Badge variant="success">
          <HelpCircle aria-hidden="true" className="mr-1.5 size-3" />
          Metrics explained
        </Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
          FAQ
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Short explanations for the statistics used across the dashboard,
          songs, players, and player profiles.
        </p>
      </div>

      <section className="mt-9 grid gap-4 lg:grid-cols-2" aria-label="Metric explanations">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-zinc-400">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="mt-6 border-dashed">
        <CardHeader>
          <CardTitle>Glossary</CardTitle>
          <CardDescription>
            Quick translations for labels that appear in tables and charts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {glossary.map(([term, definition]) => (
              <div key={term}>
                <dt className="text-sm font-medium text-zinc-100">{term}</dt>
                <dd className="mt-1 text-sm leading-6 text-zinc-500">
                  {definition}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="mt-6 border-violet-300/15 bg-violet-300/[0.04]">
        <CardHeader>
          <CardTitle>What the app does not know</CardTitle>
          <CardDescription>
            Music League CSV exports do not include listening behavior, private
            intent, or reliable deadline context. The app describes league
            outcomes and voting patterns only.
          </CardDescription>
        </CardHeader>
      </Card>
    </Container>
  );
}
