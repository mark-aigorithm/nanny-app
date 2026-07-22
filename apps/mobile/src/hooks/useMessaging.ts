import { useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContactSellerResponse,
  ConversationListQuery,
  ConversationResponse,
  MessageListResponse,
  MessageResponse,
  PaginationMeta,
  SendMessageRequest,
  UnreadCountResponse,
} from '@nanny-app/shared';

import { api, unwrap, unwrapPaginated } from '@mobile/lib/api';

const MESSAGING_KEY = 'messaging';

export function useContactSeller() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: number) =>
      unwrap<ContactSellerResponse>(api.post(`/community/posts/${postId}/contact`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY] });
    },
  });
}

export function useConversations(query: ConversationListQuery = { page: 1, limit: 50 }) {
  const isFocused = useIsFocused();

  return useQuery({
    queryKey: [MESSAGING_KEY, 'conversations', query],
    queryFn: async () => {
      const { items, meta } = await unwrapPaginated<
        ConversationResponse[],
        PaginationMeta
      >(api.get('/conversations', { params: query }));
      return { conversations: items, meta };
    },
    refetchInterval: isFocused ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useConversation(conversationId: number | undefined) {
  return useQuery({
    queryKey: [MESSAGING_KEY, 'conversation', conversationId],
    queryFn: async () =>
      unwrap<ConversationResponse>(api.get(`/conversations/${conversationId}`)),
    enabled: !!conversationId,
  });
}

export function useMessages(conversationId: number | undefined) {
  const isFocused = useIsFocused();

  return useQuery({
    queryKey: [MESSAGING_KEY, 'messages', conversationId],
    queryFn: async () =>
      unwrap<MessageListResponse>(
        api.get(`/conversations/${conversationId}/messages`, { params: { limit: 100 } }),
      ),
    enabled: !!conversationId,
    refetchInterval: isFocused ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useSendMessage(conversationId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: SendMessageRequest) =>
      unwrap<MessageResponse>(api.post(`/conversations/${conversationId}/messages`, body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY, 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY, 'conversations'] });
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY, 'unread-count'] });
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: number) =>
      unwrap(api.post(`/conversations/${conversationId}/read`)),
    onSuccess: (_data, conversationId) => {
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY, 'conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY, 'conversations'] });
      queryClient.invalidateQueries({ queryKey: [MESSAGING_KEY, 'unread-count'] });
    },
  });
}

/** Pass `enabled: false` for guests — the endpoint requires auth. */
export function useUnreadMessageCount(enabled = true) {
  return useQuery({
    queryKey: [MESSAGING_KEY, 'unread-count'],
    queryFn: async () => unwrap<UnreadCountResponse>(api.get('/conversations/unread-count')),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    enabled,
  });
}
