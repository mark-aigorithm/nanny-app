import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import type {
  NotificationListQuery,
  NotificationResponse,
  PaginationMeta,
  UnreadNotificationCountResponse,
} from '@nanny-app/shared';

import { api, unwrap, unwrapPaginated } from '@mobile/lib/api';
import type { NotificationFilter } from '@mobile/lib/notificationUtils';
import { useAuthStore } from '@mobile/store/authStore';

const NOTIFICATIONS_KEY = 'notifications';

type NotificationsPage = {
  notifications: NotificationResponse[];
  meta: PaginationMeta;
};

function buildListParams(
  filter: NotificationFilter,
  page: number,
  limit: number,
): NotificationListQuery {
  return {
    page,
    limit,
    ...(filter === 'unread' ? { unreadOnly: true } : {}),
  };
}

export function useNotifications(filter: NotificationFilter = 'all', limit = 20) {
  const isFocused = useIsFocused();

  return useInfiniteQuery<NotificationsPage>({
    queryKey: [NOTIFICATIONS_KEY, 'list', filter, limit],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = buildListParams(filter, pageParam as number, limit);
      const { items, meta } = await unwrapPaginated<NotificationResponse[], PaginationMeta>(
        api.get('/notifications', { params }),
      );
      return { notifications: items, meta };
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    refetchInterval: isFocused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useUnreadNotificationCount() {
  // The bell renders for guests too — never poll an account-bound endpoint
  // without a signed-in Firebase user.
  const firebaseUser = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, 'unread-count'],
    enabled: !!firebaseUser,
    queryFn: async () =>
      unwrap<UnreadNotificationCountResponse>(api.get('/notifications/unread-count')),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) =>
      unwrap<NotificationResponse>(api.patch(`/notifications/${notificationId}/read`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => unwrap(api.patch('/notifications/read-all')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });
}
