import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, PinInput } from '@mobile/components/ui';
import { fmtBookingDate, fmtBookingTime, useCheckIn } from '@mobile/hooks/useBookings';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  typeScale,
} from '@mobile/theme';
import {
  showEnterPinPrompt,
  useNannyShiftPromptStore,
  type ShiftPromptState,
} from '@mobile/store/nannyShiftPromptStore';

const PIN_LENGTH = 4;

function PromptIcon({ prompt }: { prompt: ShiftPromptState }) {
  if (prompt.kind === 'confirm_end') {
    return (
      <View style={[styles.iconCircle, { backgroundColor: colors.errorLight }]}>
        <Ionicons name="stop-circle-outline" size={28} color={colors.error} />
      </View>
    );
  }

  if (prompt.kind === 'error') {
    return (
      <View style={[styles.iconCircle, { backgroundColor: colors.errorLight }]}>
        <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
      </View>
    );
  }

  if (prompt.kind === 'enter_pin') {
    return (
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons name="keypad-outline" size={28} color={colors.primary} />
      </View>
    );
  }

  const isOverdue = prompt.variant === 'overdue';
  return (
    <View
      style={[
        styles.iconCircle,
        { backgroundColor: isOverdue ? colors.warmLight : colors.primaryMuted },
      ]}
    >
      <Ionicons
        name={isOverdue ? 'alarm' : 'time-outline'}
        size={28}
        color={isOverdue ? colors.tintAmber : colors.primary}
      />
    </View>
  );
}

export default function NannyShiftPromptModal() {
  const prompt = useNannyShiftPromptStore((s) => s.prompt);
  const dismissPrompt = useNannyShiftPromptStore((s) => s.dismissPrompt);
  const checkIn = useCheckIn();

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Reset the PIN entry whenever a new prompt opens (or it closes).
  const promptKey = prompt ? `${prompt.kind}:${prompt.booking?.id ?? ''}` : null;
  useEffect(() => {
    setPin('');
    setPinError(null);
  }, [promptKey]);

  if (!prompt) return null;

  const isPinPrompt = prompt.kind === 'enter_pin';

  const bookingMeta =
    prompt.booking != null
      ? `${fmtBookingDate(prompt.booking.date)} · ${fmtBookingTime(prompt.booking.startTime, prompt.booking.endTime)}`
      : null;

  const submitPin = (code: string) => {
    if (!prompt.booking || code.length !== PIN_LENGTH || checkIn.isPending) return;
    setPinError(null);
    checkIn.mutate(
      { id: prompt.booking.id, pin: code },
      {
        onSuccess: () => dismissPrompt(),
        onError: (err) => {
          // Keep the modal open so the nanny can retry the code.
          setPin('');
          setPinError(err.message);
        },
      },
    );
  };

  const handleConfirm = () => {
    // The parent must reveal the PIN before the nanny can start — the auto shift
    // prompt now hands off to the PIN entry instead of checking in directly.
    if (prompt.kind === 'shift_window' && prompt.booking) {
      showEnterPinPrompt(prompt.booking);
      return;
    }

    if (prompt.kind === 'enter_pin') {
      submitPin(pin);
      return;
    }

    if (prompt.kind === 'confirm_start' || prompt.kind === 'confirm_end') {
      dismissPrompt();
      prompt.onConfirm?.();
      return;
    }

    dismissPrompt();
  };

  const handleDismiss = () => {
    dismissPrompt();
  };

  const showSecondary = prompt.kind !== 'error';
  const confirmVariant =
    prompt.kind === 'confirm_end' ? 'destructive' : 'primary';
  const isLoading = isPinPrompt && checkIn.isPending;
  const confirmDisabled = isPinPrompt && (pin.length !== PIN_LENGTH || checkIn.isPending);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleDismiss} />

        <View style={styles.card}>
          <PromptIcon prompt={prompt} />

          {prompt.variant === 'overdue' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>OVERDUE</Text>
            </View>
          ) : prompt.kind === 'shift_window' ? (
            <View style={[styles.badge, styles.badgeReady]}>
              <Text style={[styles.badgeText, styles.badgeReadyText]}>START NOW</Text>
            </View>
          ) : null}

          <Text style={styles.title}>{prompt.title}</Text>
          <Text style={styles.message}>{prompt.message}</Text>

          {bookingMeta ? <Text style={styles.meta}>{bookingMeta}</Text> : null}

          {isPinPrompt ? (
            <View style={styles.pinWrap}>
              <PinInput
                value={pin}
                onChangeText={(v) => {
                  setPin(v);
                  if (pinError) setPinError(null);
                }}
                length={PIN_LENGTH}
                error={pinError != null}
                onComplete={submitPin}
              />
              {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              title={prompt.confirmLabel ?? 'Confirm'}
              onPress={handleConfirm}
              variant={confirmVariant}
              loading={isLoading}
              disabled={isLoading || confirmDisabled}
            />

            {showSecondary ? (
              <Button
                title="Not now"
                onPress={handleDismiss}
                variant="outline"
                style={styles.secondaryBtn}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.warmLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  badgeReady: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  badgeText: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.tintAmber,
  },
  badgeReadyText: {
    color: colors.primaryDark,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  meta: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  pinWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  pinError: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryBtn: {
    marginTop: 0,
  },
});
