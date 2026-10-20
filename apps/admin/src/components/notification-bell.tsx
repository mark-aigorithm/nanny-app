import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchBookings, fetchNannies } from '../lib/api';
import { usePermissions } from '../lib/permissions';

// Poll the pending queues so the admin sees new requests without a manual
// refresh. The bell counts what arrived since the admin last marked a queue
// read; the queue itself empties only when its requests are handled.
const POLL_MS = 30_000;
// Newest pending items fetched per queue: enough to count what's new since the
// last read; past it the badge says "50+".
const RECENT = 50;

type Queue = 'nannies' | 'bookings';
type ReadMarks = Partial<Record<Queue, string>>;

/** Per admin and per browser: the newest request each queue was read up to. */
const storageKey = (adminId: number) => `nannynow-admin.notifications-read.${adminId}`;

function loadMarks(adminId: number): ReadMarks {
  try {
    const raw = window.localStorage.getItem(storageKey(adminId));
    return raw ? (JSON.parse(raw) as ReadMarks) : {};
  } catch {
    return {};
  }
}

function saveMarks(adminId: number, marks: ReadMarks): void {
  try {
    window.localStorage.setItem(storageKey(adminId), JSON.stringify(marks));
  } catch {
    // Private mode or blocked storage: the marks last for this session only.
  }
}

type QueueState = { pending: number; unread: number; capped: boolean; newest: string | null };

/** How many of a queue's pending requests arrived after it was last read. */
function queueState(
  page: { data: { createdAt: string }[]; meta: { total: number } } | undefined,
  readAt: string | undefined,
): QueueState {
  const rows = page?.data ?? [];
  const pending = page?.meta.total ?? 0;
  const unreadRows = readAt ? rows.filter((r) => r.createdAt > readAt) : rows;
  const unread = readAt ? unreadRows.length : pending;
  return {
    pending,
    unread,
    capped: unreadRows.length === rows.length && pending > rows.length,
    newest: rows[0]?.createdAt ?? null,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { can, me } = usePermissions();
  const [marks, setMarks] = useState<ReadMarks>(() => loadMarks(me.id));

  // Each queue is only polled by someone who could act on it — an operator
  // without Users would otherwise get a 403 every 30 seconds.
  const canSeeNannies = can('users', 'VIEW');
  const canSeeBookings = can('bookings', 'VIEW');

  // The newest pending requests first, so their times say which are new.
  const { data: pendingNannies } = useQuery({
    queryKey: ['admin-nannies', 'PENDING_REVIEW', 'bell'],
    queryFn: () => fetchNannies('PENDING_REVIEW', { page: 1, limit: RECENT, sortBy: 'registered', sortDir: 'desc' }),
    refetchInterval: POLL_MS,
    enabled: canSeeNannies,
  });
  const { data: pendingBookings } = useQuery({
    queryKey: ['bookings', 'PENDING', 'bell'],
    queryFn: () => fetchBookings('PENDING', { page: 1, limit: RECENT, sortBy: 'waiting', sortDir: 'asc' }),
    refetchInterval: POLL_MS,
    enabled: canSeeBookings,
  });

  const nannies = queueState(pendingNannies, marks.nannies);
  const bookings = queueState(pendingBookings, marks.bookings);
  const unread = nannies.unread + bookings.unread;
  const capped = nannies.capped || bookings.capped;
  const pending = nannies.pending + bookings.pending;

  // Read up to the newest request seen, by the server's clock, not this one's.
  const markRead = (queues: Queue[]) => {
    const next = { ...marks };
    for (const queue of queues) {
      const newest = (queue === 'nannies' ? nannies : bookings).newest;
      if (newest) next[queue] = newest;
    }
    setMarks(next);
    saveMarks(me.id, next);
  };

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

  // Nothing to watch — don't render a bell that can never light up. Placed
  // after every hook so the hook order stays stable across renders.
  if (!canSeeNannies && !canSeeBookings) return null;

  const badge = unread > 99 || capped ? `${Math.min(unread, 99)}+` : String(unread);
  const items: { queue: Queue; to: string; state: QueueState; noun: string }[] = [
    { queue: 'nannies', to: '/nannies', state: nannies, noun: 'nanny request' },
    { queue: 'bookings', to: '/bookings', state: bookings, noun: 'booking request' },
  ];

  return (
    <div className="notif" ref={containerRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={unread > 0 ? `Notifications, ${badge} new` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {unread > 0 && <span className="notif-badge">{badge}</span>}
      </button>

      {open && (
        <div className="notif-menu" role="menu">
          <div className="notif-menu-head">
            <p className="notif-menu-title">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                className="notif-mark-read"
                role="menuitem"
                onClick={() => markRead(['nannies', 'bookings'])}
              >
                Mark all as read
              </button>
            )}
          </div>
          {pending === 0 ? (
            <p className="notif-empty">You&rsquo;re all caught up.</p>
          ) : (
            <ul className="notif-list">
              {items.map(({ queue, to, state, noun }) =>
                state.pending === 0 ? null : (
                  <li key={queue}>
                    <Link
                      className={`notif-item${state.unread > 0 ? ' notif-item--unread' : ''}`}
                      to={to}
                      role="menuitem"
                      onClick={() => {
                        markRead([queue]);
                        setOpen(false);
                      }}
                    >
                      <span className="notif-count">{state.pending}</span>
                      <span className="notif-item-text">
                        pending {state.pending === 1 ? noun : `${noun}s`}
                        {state.unread > 0 && (
                          <span className="notif-new">
                            {state.capped ? `${state.unread}+` : state.unread} new
                          </span>
                        )}
                      </span>
                      <span className="notif-arrow" aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                ),
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
