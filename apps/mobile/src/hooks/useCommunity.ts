import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CommentResponse,
  CommunityFeedQuery,
  CommunityPostResponse,
  CommunityPostType,
  CreateCommentRequest,
  CreateCommunityPostRequest,
  PaginationMeta,
  ToggleLikeResponse,
  ToggleRsvpResponse,
} from '@nanny-app/shared';

import { api, unwrap, unwrapPaginated } from '@mobile/lib/api';
import type { CommentsPage, CommunityFeedFilter, PostsPage } from '@mobile/lib/communityUtils';

const COMMUNITY_KEY = 'community';

export function useCommunityPosts(filter?: CommunityFeedFilter) {
  return useInfiniteQuery<PostsPage>({
    queryKey: [COMMUNITY_KEY, 'posts', filter],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params: CommunityFeedQuery = {
        page: pageParam as number,
        limit: 20,
        ...(filter ? { type: filter } : {}),
      };
      const { items, meta } = await unwrapPaginated<CommunityPostResponse[], PaginationMeta>(
        api.get('/community/posts', { params }),
      );
      return { posts: items, meta };
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
}

export function useTrendingPosts(limit = 3) {
  return useQuery<CommunityPostResponse[]>({
    queryKey: [COMMUNITY_KEY, 'trending', limit],
    queryFn: async () => {
      const { items } = await unwrapPaginated<CommunityPostResponse[], PaginationMeta>(
        api.get('/community/posts', { params: { page: 1, limit } }),
      );
      return items;
    },
  });
}

export function useCommunityPostsByType(type: CommunityPostType, limit = 3) {
  return useQuery<CommunityPostResponse[]>({
    queryKey: [COMMUNITY_KEY, 'posts', type, limit],
    queryFn: async () => {
      const { items } = await unwrapPaginated<CommunityPostResponse[], PaginationMeta>(
        api.get('/community/posts', { params: { page: 1, limit, type } }),
      );
      return items;
    },
  });
}

export function useCommunityPost(id: number | undefined) {
  return useQuery<CommunityPostResponse>({
    queryKey: [COMMUNITY_KEY, 'post', id],
    queryFn: () => unwrap(api.get(`/community/posts/${id}`)),
    enabled: !!id,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation<CommunityPostResponse, Error, CreateCommunityPostRequest>({
    mutationFn: (body) => unwrap(api.post('/community/posts', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY] });
    },
  });
}

export function useTogglePostLike() {
  const qc = useQueryClient();
  return useMutation<ToggleLikeResponse, Error, number>({
    mutationFn: (postId) => unwrap(api.post(`/community/posts/${postId}/like`)),
    onSuccess: (_data, postId) => {
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'post', postId] });
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'posts'] });
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'trending'] });
    },
  });
}

export function useComments(postId: number | undefined) {
  return useInfiniteQuery<CommentsPage>({
    queryKey: [COMMUNITY_KEY, 'comments', postId],
    initialPageParam: 1,
    enabled: !!postId,
    queryFn: async ({ pageParam }) => {
      const { items, meta } = await unwrapPaginated<CommentResponse[], PaginationMeta>(
        api.get(`/community/posts/${postId}/comments`, {
          params: { page: pageParam, limit: 20 },
        }),
      );
      return { comments: items, meta };
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation<
    CommentResponse,
    Error,
    { postId: number; body: CreateCommentRequest }
  >({
    mutationFn: ({ postId, body }) =>
      unwrap(api.post(`/community/posts/${postId}/comments`, body)),
    onSuccess: (_data, { postId }) => {
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'comments', postId] });
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'post', postId] });
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'posts'] });
    },
  });
}

export function useToggleCommentLike() {
  const qc = useQueryClient();
  return useMutation<ToggleLikeResponse, Error, { commentId: number; postId: number }>({
    mutationFn: ({ commentId }) => unwrap(api.post(`/community/comments/${commentId}/like`)),
    onSuccess: (_data, { postId }) => {
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'comments', postId] });
    },
  });
}

export function useToggleEventRsvp() {
  const qc = useQueryClient();
  return useMutation<ToggleRsvpResponse, Error, number>({
    mutationFn: (postId) => unwrap(api.post(`/community/posts/${postId}/rsvp`)),
    onSuccess: (_data, postId) => {
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'post', postId] });
      qc.invalidateQueries({ queryKey: [COMMUNITY_KEY, 'posts'] });
    },
  });
}
