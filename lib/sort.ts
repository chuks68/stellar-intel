import type { AnchorRate } from '@/types';

export type RateSortKey = 'rate' | 'fee' | 'receive';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: RateSortKey;
  direction: SortDirection;
}

const FIELD_ACCESSORS: Record<RateSortKey, (rate: AnchorRate) => number | null> = {
  rate: (r) => r.exchangeRate,
  fee: (r) => r.fee,
  receive: (r) => r.totalReceived,
};

/** Cycles a column's sort state: unsorted -> ascending -> descending -> unsorted. */
export function nextSortState(current: SortState | null, key: RateSortKey): SortState | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

/**
 * Sorts AnchorRate rows by the given column, client-side, over an
 * already-fetched array. Rows with a null value for the sorted field
 * (unavailable anchors) always sort to the bottom regardless of direction.
 */
export function sortRates(rates: AnchorRate[], sort: SortState | null): AnchorRate[] {
  if (!sort) return rates;

  const accessor = FIELD_ACCESSORS[sort.key];
  const sign = sort.direction === 'asc' ? 1 : -1;

  return [...rates].sort((a, b) => {
    const aVal = accessor(a);
    const bVal = accessor(b);
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    return (aVal - bVal) * sign;
  });
}
