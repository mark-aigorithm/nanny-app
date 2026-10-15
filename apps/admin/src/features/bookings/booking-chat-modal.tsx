import type { BookingMessageResponse } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { Badge, Button, ErrorState, LoadingState, Modal } from '@admin/components/ui';
import { apiErrorMessage } from '@admin/lib/api-error';
import { fetchBookingMessages } from '@admin/lib/api';
import { formatDateTime } from '@admin/lib/format';

const messagesKey = (bookingId: string) => ['booking', bookingId, 'messages'] as const;

function useBookingMessages(bookingId: string) {
  return useQuery({
    queryKey: messagesKey(bookingId),
    queryFn: () => fetchBookingMessages(bookingId),
    enabled: bookingId !== '',
  });
}

/** "View chat (N)" for the booking header; disabled when there is nothing to read. */
export function BookingChatButton({ bookingId, onOpen }: { bookingId: string; onOpen: () => void }) {
  const { data, isLoading } = useBookingMessages(bookingId);
  if (!data) {
    // Still loading: hold the place. Failed: stay clickable, so the modal can
    // say what went wrong and offer a retry instead of the action vanishing.
    return (
      <Button variant="ghost" size="sm" onClick={onOpen} disabled={isLoading}>
        View chat
      </Button>
    );
  }
  const count = data.messages.length;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      disabled={count === 0}
      title={count === 0 ? 'No messages' : undefined}
    >
      {`View chat (${count}${data.hasMore ? '+' : ''})`}
    </Button>
  );
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Message({ message }: { message: BookingMessageResponse }) {
  const isMother = message.sender.role === 'MOTHER';
  const name = `${message.sender.firstName} ${message.sender.lastName}`.trim();
  return (
    <li className={`chat-msg ${isMother ? 'chat-msg--mother' : 'chat-msg--nanny'}`}>
      <div className="chat-msg-meta">
        <span className="chat-msg-name">{name}</span>
        <Badge tone={isMother ? 'neutral' : 'success'}>{isMother ? 'Mommy' : 'Nanny'}</Badge>
        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
      </div>
      <p className="chat-msg-bubble">{message.content}</p>
    </li>
  );
}

type BookingChatModalProps = {
  bookingId: string;
  motherName: string;
  nannyName: string | null;
  onClose: () => void;
};

/** A booking's mother↔nanny chat, read-only for the console. */
export function BookingChatModal({ bookingId, motherName, nannyName, onClose }: BookingChatModalProps) {
  const { data, isLoading, error, refetch, isFetching } = useBookingMessages(bookingId);

  let previousDay = '';
  return (
    <Modal
      title={`Chat · ${motherName} & ${nannyName ?? 'nanny'}`}
      onClose={onClose}
      footer={<p className="chat-readonly-note">Read-only — admins can't post in booking chats.</p>}
    >
      {isLoading && <LoadingState label="Loading chat…" />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && data.messages.length === 0 && (
        <p className="empty-state">No messages on this booking.</p>
      )}
      {data && data.messages.length > 0 && (
        <ol className="chat-transcript" aria-label="Messages">
          {data.messages.map((message) => {
            const day = dayLabel(message.createdAt);
            const divider = day !== previousDay;
            previousDay = day;
            return (
              <li key={message.id} className="chat-day-group">
                {divider && <div className="chat-day">{day}</div>}
                <ol className="chat-day-list">
                  <Message message={message} />
                </ol>
              </li>
            );
          })}
        </ol>
      )}
      {data?.hasMore && (
        <p className="chat-readonly-note">Showing the first {data.messages.length} messages.</p>
      )}
    </Modal>
  );
}
