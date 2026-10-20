import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BOOKING_MESSAGE_MAX_LENGTH } from '@nanny-app/shared';

import { ChatComposer, DateDivider, MessageBubble, formatMessageTime, groupMessagesByDay } from '@mobile/components/chat';
import { KeyboardAvoidingView, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBooking } from '@mobile/hooks/useBookings';
import {
  useBookingChatSummary,
  useBookingMessages,
  useMarkBookingChatRead,
  useSendBookingMessage,
} from '@mobile/hooks/useBookingChat';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { bookingDayLabel } from '@mobile/lib/bookingDetail';
import { useMessagingStore } from '@mobile/store/messagingStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/booking-chat-screen.styles';

/**
 * The chat between a booking's mother and its nanny — one screen for both.
 * Open for sending only while the shift runs; before and after, the thread
 * stays readable and the composer gives way to a note saying why.
 */
export default function BookingChatScreen() {
  const router = useRouter();
  const { bookingId: bookingIdParam } = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = Number(bookingIdParam);
  const currentUserId = useUserProfileStore((s) => s.profile?.id);
  const role = useUserProfileStore((s) => s.profile?.role);
  const setActiveBookingChatId = useMessagingStore((s) => s.setActiveBookingChatId);
  const closedPadding = useBottomBarPadding(spacing.md);
  // The nanny's chat is a hidden tab, which stays mounted after she leaves it,
  // so reading and "this chat is open" follow focus, not mount.
  const isFocused = useIsFocused();

  const { data: booking } = useBooking(bookingId || undefined);
  const { data: summary } = useBookingChatSummary(bookingId || undefined);
  const { data: messagesData, isLoading } = useBookingMessages(bookingId || undefined);
  const send = useSendBookingMessage(bookingId);
  const markRead = useMarkBookingChatRead(bookingId);

  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const messages = messagesData?.messages ?? [];
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (!bookingIdParam || !isFocused) return;
    setActiveBookingChatId(bookingIdParam);
    return () => setActiveBookingChatId(null);
  }, [bookingIdParam, isFocused, setActiveBookingChatId]);

  // Opening the chat, and every new message while it is on screen, counts as read.
  useEffect(() => {
    if (bookingId && isFocused) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, lastMessageId, isFocused]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
  };

  const handleSend = () => {
    const content = text.trim();
    if (!content || send.isPending) return;
    // The box stays editable while sending, so clear it only if nothing was
    // typed after pressing send.
    send.mutate(
      { content },
      { onSuccess: () => setText((now) => (now.trim() === content ? '' : now)) },
    );
  };

  const isMother = role === 'MOTHER';
  const otherName = booking
    ? isMother
      ? `${booking.nanny?.firstName ?? ''} ${booking.nanny?.lastName ?? ''}`.trim() || 'Your nanny'
      : `${booking.motherFirstName} ${booking.motherLastName}`.trim()
    : 'Messages';

  const closedNote =
    booking && ['PENDING', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED'].includes(booking.status)
      ? 'You can message once the shift starts.'
      : 'This booking has ended — messages are read-only.';

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title={otherName}
        subtitle={booking ? bookingDayLabel(booking.date) : undefined}
        onBack={handleBack}
      />
      <KeyboardAvoidingView style={styles.body} keyboardVerticalOffset={0}>
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primaryDark} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {summary?.canSend
                    ? 'No messages yet. Say hello, or share an update about the day.'
                    : 'No messages on this booking.'}
                </Text>
              </View>
            ) : (
              groupMessagesByDay(messages).map((group) => (
                <View key={group.date}>
                  <DateDivider date={group.date} />
                  {group.items.map((m) => (
                    <MessageBubble
                      key={m.id}
                      content={m.content}
                      sent={m.sender.id === currentUserId}
                      time={formatMessageTime(m.createdAt)}
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {send.error ? <Text style={styles.sendError}>{send.error.message}</Text> : null}

        {summary?.canSend ? (
          <ChatComposer
            value={text}
            onChangeText={setText}
            onSend={handleSend}
            sending={send.isPending}
            maxLength={BOOKING_MESSAGE_MAX_LENGTH}
          />
        ) : summary ? (
          <View style={[styles.closedNote, { marginBottom: closedPadding }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={styles.closedNoteText}>{closedNote}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
