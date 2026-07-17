'use client';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { formatCurrency, formatRate } from '@/lib/utils';
import { nextSortState, sortRates, type SortState } from '@/lib/sort';
import type { RateComparison, AnchorRate, AnchorRateError } from '@/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { QuotePill } from '@/components/ui/QuotePill';
import { AnchorLogo } from '@/components/ui/AnchorLogo';
import { SortToggle } from './SortToggle';

interface RateTableProps {
  rates: RateComparison | undefined;
  isLoading: boolean;
  refreshInflight?: boolean;
  error: string | undefined;
  onSelectAnchor: (rate: AnchorRate) => void;
  /** Disables the off-ramp action (e.g. when the wallet is not on mainnet). */
  executeDisabled?: boolean;
  anchorErrors?: AnchorRateError[];
  /** Re-fetches rates for the current corridor; shown as a CTA on the empty state. */
  onRefresh?: () => void;
}

export function RateTable({
  rates,
  anchorErrors = [],
  isLoading,
  refreshInflight,
  error,
  onSelectAnchor,
  executeDisabled,
  onRefresh,
}: RateTableProps) {
  const [expiredAnchorIds, setExpiredAnchorIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState | null>(null);

  const handleExpire = useCallback((anchorId: string) => {
    setExpiredAnchorIds((prev) => {
      const next = new Set(prev);
      next.add(anchorId);
      return next;
    });
  }, []);

  const sortedRates = useMemo(() => sortRates(rates?.rates ?? [], sort), [rates?.rates, sort]);

  const [announcement, setAnnouncement] = useState('');
  const lastAnnouncedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rates || rates.rates.length === 0) return;
    const best = rates.rates.find((r) => r.anchorId === rates.bestRateId);
    if (!best || best.totalReceived == null) return;

    const key = `${best.anchorId}:${best.totalReceived}`;
    if (lastAnnouncedKeyRef.current === key) return;
    lastAnnouncedKeyRef.current = key;

    const currency = best.corridorId.split('-')[1]?.toUpperCase() ?? '';
    setAnnouncement(
      `Rates updated. Best rate: ${formatCurrency(best.totalReceived, currency)} via ${best.anchorName}.`
    );
  }, [rates]);

  if (
    (isLoading || refreshInflight) &&
    (!rates || (rates.rates.length === 0 && !rates.pending?.length))
  ) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <Skeleton rows={5} />
      </div>
    );
  }

  const [sourceCurrency, destCurrency] = (rates?.corridorId ?? '').split('-');
  const anchorCount =
    (rates?.rates.length ?? 0) + anchorErrors.length + (rates?.pending?.length ?? 0);
  const captionText =
    sourceCurrency && destCurrency
      ? `${sourceCurrency.toUpperCase()} to ${destCurrency.toUpperCase()} off-ramp rates — ${anchorCount} anchor${anchorCount === 1 ? '' : 's'}`
      : 'Off-ramp rates';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {announcement}
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">{captionText}</caption>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400"
            >
              Anchor
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400"
            >
              <SortToggle
                label="Fee"
                direction={sort?.key === 'fee' ? sort.direction : null}
                onClick={() => setSort((prev) => nextSortState(prev, 'fee'))}
              />
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400"
            >
              <SortToggle
                label="Rate"
                direction={sort?.key === 'rate' ? sort.direction : null}
                onClick={() => setSort((prev) => nextSortState(prev, 'rate'))}
              />
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400"
            >
              <SortToggle
                label="You Receive"
                direction={sort?.key === 'receive' ? sort.direction : null}
                onClick={() => setSort((prev) => nextSortState(prev, 'receive'))}
              />
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400"
            >
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && error && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center">
                <p className="mb-3 text-sm text-red-500">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-xs font-medium text-blue-600 underline hover:text-blue-700"
                >
                  Retry
                </button>
              </td>
            </tr>
          )}

          {!isLoading &&
            !error &&
            rates &&
            rates.rates.length === 0 &&
            anchorErrors.length === 0 &&
            (!rates.pending || rates.pending.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    No rates available
                    {sourceCurrency && destCurrency
                      ? ` for ${sourceCurrency.toUpperCase()}→${destCurrency.toUpperCase()} right now.`
                      : ' for this corridor right now.'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Anchors may be temporarily unavailable. Rates refresh every 30 seconds.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <a
                      href="#corridor-select"
                      className="text-xs font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
                    >
                      Try another corridor
                    </a>
                    {onRefresh && (
                      <button
                        onClick={onRefresh}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        Refresh now
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

          {!isLoading &&
            !error &&
            sortedRates.map((rate) => {
              const isExpired = expiredAnchorIds.has(rate.anchorId);
              const isUnavailable = rate.source === 'unavailable' || isExpired;
              const isBest = rate.anchorId === rates?.bestRateId && !isUnavailable;
              const currency = rate.corridorId.split('-')[1]?.toUpperCase() ?? '';

              return (
                <tr
                  key={rate.anchorId}
                  className={
                    isBest
                      ? 'border-t border-t-blue-200 border-l-[3px] border-l-green-500 bg-blue-50/50 dark:border-t-blue-900 dark:border-l-green-400 dark:bg-blue-950/20'
                      : 'border-t border-gray-200 dark:border-gray-700'
                  }
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <AnchorLogo anchorId={rate.anchorId} anchorName={rate.anchorName} />
                      <Link
                        href={`/anchors/${rate.anchorId}`}
                        className="font-medium text-gray-900 hover:underline dark:text-white"
                      >
                        {rate.anchorName}
                      </Link>
                      {isBest && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          Best Rate
                        </span>
                      )}
                      <QuotePill
                        source={isUnavailable ? 'unavailable' : rate.source}
                        expiresAt={rate.expiresAt || undefined}
                        onExpire={() => handleExpire(rate.anchorId)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {rate.fee !== null ? formatCurrency(rate.fee, 'USD') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                    {rate.exchangeRate !== null && rate.exchangeRate > 0
                      ? formatRate(rate.exchangeRate, 'USDC', currency)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {rate.totalReceived !== null
                      ? formatCurrency(rate.totalReceived, currency)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onSelectAnchor(rate)}
                      disabled={isUnavailable || executeDisabled}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Off-ramp
                    </button>
                  </td>
                </tr>
              );
            })}

          {!isLoading &&
            !error &&
            anchorErrors.map((anchorError) => (
              <tr
                key={`error-${anchorError.anchorId}`}
                className="border-t border-gray-200 dark:border-gray-700 opacity-50"
                title={anchorError.reason}
                aria-label={`${anchorError.anchorName} unavailable: ${anchorError.reason}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AnchorLogo
                      anchorId={anchorError.anchorId}
                      anchorName={anchorError.anchorName}
                    />
                    <span className="font-medium text-gray-400 dark:text-gray-500">
                      {anchorError.anchorName}
                    </span>
                    <QuotePill source="unavailable" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500">—</td>
                <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500">—</td>
                <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500">—</td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled
                    aria-disabled="true"
                    title={anchorError.reason}
                    className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                  >
                    Unavailable
                  </button>
                </td>
              </tr>
            ))}

          {!isLoading &&
            !error &&
            rates?.pending?.map((pendingAnchor) => (
              <tr
                key={`pending-${pendingAnchor.anchorId}`}
                className="border-t border-gray-200 dark:border-gray-700 opacity-60"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AnchorLogo
                      anchorId={pendingAnchor.anchorId}
                      anchorName={pendingAnchor.anchorName}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {pendingAnchor.anchorName}
                    </span>
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                      Fetching...
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">—</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">—</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                  —
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled
                    className="rounded-lg bg-gray-300 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed dark:bg-gray-700"
                  >
                    Pending
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
