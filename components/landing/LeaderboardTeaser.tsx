import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CORRIDORS } from '@/constants';
import { Leaderboard } from '@/components/offramp/Leaderboard';

const TEASER_ROW_LIMIT = 3;

/**
 * Landing-page teaser for the live anchor leaderboard: reuses the same
 * `Leaderboard` component the /anchors page renders (real SEP-38 quotes via
 * `useAnchorRates`), capped to the top rows for a default corridor, with a
 * link through to the full leaderboard.
 */
export function LeaderboardTeaser() {
  const corridor = CORRIDORS[0];
  if (!corridor) return null;

  return (
    <section aria-labelledby="leaderboard-teaser-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="leaderboard-teaser-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Anchor leaderboard
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Live payout ranking for {corridor.from} → {corridor.to}, updated every 30s.
          </p>
        </div>
        <Link
          href="/anchors"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          See full leaderboard
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <Leaderboard corridor={corridor} limit={TEASER_ROW_LIMIT} />
    </section>
  );
}
