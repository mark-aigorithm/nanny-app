import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ADMIN_MAX_PAGE_SIZE, type AdminBooking, type AdminNanny, type PromoCode } from '@nanny-app/shared';

import { fetchBookings, fetchNannies, fetchPromoCodes } from '@admin/lib/api';

// Reporting sums client-side; fetch the largest allowed page (matches the old
// server-side cap). There is no dedicated stats API yet.
const STATS_PAGE = { page: 1, limit: ADMIN_MAX_PAGE_SIZE };

export type DashboardStats = {
  totalBookings: number;
  pendingApprovals: number;
  grossRevenue: number;
  activeNannies: number;
  pendingNannies: number;
  activePromoCodes: number;
};

export type StatusSlice = { key: string; label: string; count: number };
export type TimePoint = { label: string; count: number };

export type DashboardData = {
  stats: DashboardStats;
  bookingsByStatus: StatusSlice[];
  bookingsOverTime: TimePoint[];
  nannyBreakdown: StatusSlice[];
};

const BOOKING_STATUS_ORDER: { key: AdminBooking['status']; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'REFUNDED', label: 'Refunded' },
];

const NANNY_STATUS_ORDER: { key: AdminNanny['approvalStatus']; label: string }[] = [
  { key: 'PENDING_REVIEW', label: 'Pending review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

const DAYS_IN_TREND = 14;

function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildBookingTrend(bookings: AdminBooking[]): TimePoint[] {
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    const key = dayKey(new Date(booking.createdAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date();
  const points: TimePoint[] = [];
  for (let offset = DAYS_IN_TREND - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    points.push({ label: shortDay(day), count: counts.get(dayKey(day)) ?? 0 });
  }
  return points;
}

function countBy<T, K extends string>(items: T[], key: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Aggregates dashboard reporting numbers client-side from the existing list
 * endpoints (no dedicated stats API yet). Cheap at current data volumes.
 */
export function useDashboardStats() {
  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'ALL', 'stats'],
    queryFn: () => fetchBookings('ALL', STATS_PAGE),
  });
  const nanniesQuery = useQuery({
    queryKey: ['admin-nannies', 'ALL', 'stats'],
    queryFn: () => fetchNannies('ALL', STATS_PAGE),
  });
  const promoQuery = useQuery({ queryKey: ['promo-codes'], queryFn: fetchPromoCodes });

  const bookings: AdminBooking[] = bookingsQuery.data?.data ?? [];
  const nannies: AdminNanny[] = nanniesQuery.data?.data ?? [];
  const promoCodes: PromoCode[] = promoQuery.data ?? [];

  const data: DashboardData = useMemo(() => {
    const bookingCounts = countBy(bookings, (b) => b.status);
    const nannyCounts = countBy(nannies, (n) => n.approvalStatus);

    const grossRevenue = bookings
      .filter((b) => b.status === 'COMPLETED')
      .reduce((sum, b) => sum + b.totalAmount, 0);

    const pendingBookings = bookingCounts.get('PENDING') ?? 0;
    const pendingNannies = nannyCounts.get('PENDING_REVIEW') ?? 0;

    return {
      stats: {
        totalBookings: bookings.length,
        pendingApprovals: pendingBookings + pendingNannies,
        grossRevenue,
        activeNannies: nannyCounts.get('APPROVED') ?? 0,
        pendingNannies,
        activePromoCodes: promoCodes.filter((p) => p.isActive).length,
      },
      bookingsByStatus: BOOKING_STATUS_ORDER.map(({ key, label }) => ({
        key,
        label,
        count: bookingCounts.get(key) ?? 0,
      })).filter((slice) => slice.count > 0),
      bookingsOverTime: buildBookingTrend(bookings),
      nannyBreakdown: NANNY_STATUS_ORDER.map(({ key, label }) => ({
        key,
        label,
        count: nannyCounts.get(key) ?? 0,
      })).filter((slice) => slice.count > 0),
    };
  }, [bookings, nannies, promoCodes]);

  return {
    data,
    isLoading: bookingsQuery.isLoading || nanniesQuery.isLoading || promoQuery.isLoading,
    isFetching: bookingsQuery.isFetching || nanniesQuery.isFetching || promoQuery.isFetching,
    error: bookingsQuery.error ?? nanniesQuery.error ?? promoQuery.error,
    refetch: () => {
      void bookingsQuery.refetch();
      void nanniesQuery.refetch();
      void promoQuery.refetch();
    },
  };
}
