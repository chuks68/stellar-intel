import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const RATES = [
  {
    anchorId: 'a',
    anchorName: 'Anchor A',
    exchangeRate: 1600,
    fee: 1,
    totalReceived: 158000,
    source: 'sep38',
  },
  {
    anchorId: 'b',
    anchorName: 'Anchor B',
    exchangeRate: 1580,
    fee: 0.5,
    totalReceived: 157000,
    source: 'sep38',
  },
  {
    anchorId: 'c',
    anchorName: 'Anchor C',
    exchangeRate: 1575,
    fee: 0.3,
    totalReceived: 156500,
    source: 'sep38',
  },
];

vi.mock('@/hooks/useAnchorRates', () => ({
  useAnchorRates: () => ({
    rates: { rates: RATES, bestRateId: 'a' },
    isLoading: false,
    error: undefined,
  }),
}));

import { Leaderboard } from '@/components/offramp/Leaderboard';

const CORRIDOR = {
  id: 'usdc-ngn',
  from: 'USDC',
  to: 'NGN',
  countryCode: 'NG',
  countryName: 'Nigeria',
};

describe('Leaderboard', () => {
  it('renders every rate when no limit is given', () => {
    render(<Leaderboard corridor={CORRIDOR} />);
    expect(screen.getByText('Anchor A')).toBeInTheDocument();
    expect(screen.getByText('Anchor B')).toBeInTheDocument();
    expect(screen.getByText('Anchor C')).toBeInTheDocument();
  });

  it('caps rows to the given limit, preserving rank order', () => {
    render(<Leaderboard corridor={CORRIDOR} limit={2} />);
    expect(screen.getByText('Anchor A')).toBeInTheDocument();
    expect(screen.getByText('Anchor B')).toBeInTheDocument();
    expect(screen.queryByText('Anchor C')).not.toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });
});
