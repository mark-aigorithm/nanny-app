import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchBookings, fetchNannies } from '../lib/api';

// Poll the pending queues so the admin sees new requests without a manual
// refresh. Reuses the same query keys as the Nannies/Bookings pages, so their
// mutations (approve / accept) also keep this badge in sync.
const POLL_MS = 30_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: pendingNannies } = useQuery({
    queryKey: ['admin-nannies', 'PENDING_REVIEW'],
    queryFn: () => fetchNannies('PENDING_REVIEW'),
    refetchInterval: POLL_MS,
  });
  const { data: pendingBookings } = useQuery({
    queryKey: ['bookings', 'PENDING_CONFIRMATION'],
    queryFn: () => fetchBookings('PENDING_CONFIRMATION'),
    refetchInterval: POLL_MS,
  });

  const nannyCount = pendingNannies?.length ?? 0;
  const bookingCount = pendingBookings?.length ?? 0;
  const total = nannyCount + bookingCount;

  // Dismiss the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="notif" ref={containerRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={total > 0 ? `Notifications, ${total} new` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {total > 0 && <span className="notif-badge">{total > 99 ? '99+' : total}</span>}
      </button>

      {open && (
        <div className="notif-menu" role="menu">
          <p className="notif-menu-title">Notifications</p>
          {total === 0 ? (
            <p className="notif-empty">You&rsquo;re all caught up 🎉</p>
          ) : (
            <ul className="notif-list">
              {nannyCount > 0 && (
                <li>
                  <Link
                    className="notif-item"
                    to="/nannies"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className="notif-count">{nannyCount}</span>
                    <span>new nanny {nannyCount === 1 ? 'request' : 'requests'}</span>
                    <span className="notif-arrow" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              )}
              {bookingCount > 0 && (
                <li>
                  <Link
                    className="notif-item"
                    to="/bookings"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className="notif-count">{bookingCount}</span>
                    <span>new booking {bookingCount === 1 ? 'request' : 'requests'}</span>
                    <span className="notif-arrow" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
