import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VLCPlayer } from 'react-native-vlc-media-player';

import { Button } from '@mobile/components/ui';
import { useBookingCamera, useNotifyNannyCamera } from '@mobile/hooks/useBookingCamera';
import { getApiErrorMessage } from '@mobile/lib/api';
import { colors } from '@mobile/theme';

import { styles } from './styles/live-video-monitor-screen.styles';

/** Matches the backend cooldown; only used to drive the countdown label. */
const NOTIFY_COOLDOWN_SECONDS = 300;

/**
 * Parent's live view of the camera assigned to their booking's nanny.
 *
 * The stream is RTSP, which neither AVPlayer nor any browser can play — hence
 * the libVLC-backed player. This screen requires a native build; it will not
 * work in Expo Go.
 */
export default function LiveVideoMonitorScreen() {
  const router = useRouter();
  const { bookingId: rawBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = rawBookingId ? Number(rawBookingId) : undefined;

  const { data: camera, isLoading, error, refetch } = useBookingCamera(bookingId);
  const notify = useNotifyNannyCamera(bookingId);

  const [streamFailed, setStreamFailed] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Reset the failure state when we get a different stream to try.
  useEffect(() => {
    setStreamFailed(false);
  }, [camera?.streamUrl]);

  // Local countdown so the button explains itself rather than just being dead.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setTimeout(() => setCooldownLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownLeft]);

  const handleNotify = (): void => {
    notify.mutate(undefined, {
      onSuccess: () => setCooldownLeft(NOTIFY_COOLDOWN_SECONDS),
      // A 429 means someone already asked recently — treat it like a success
      // for the purposes of the countdown so the button stops inviting taps.
      onError: () => setCooldownLeft(NOTIFY_COOLDOWN_SECONDS),
    });
  };

  const isOnline = camera?.online === true;
  const canPlay = Boolean(camera?.streamUrl) && !streamFailed;

  const notifyLabel =
    cooldownLeft > 0
      ? `Nanny notified · ${Math.floor(cooldownLeft / 60)}:${String(cooldownLeft % 60).padStart(2, '0')}`
      : 'Ask nanny to turn on the camera';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.videoContainer}>
          {isLoading ? (
            <View style={styles.videoPlaceholder}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam-off-outline" size={32} color={colors.textMuted} />
              <Text style={styles.placeholderText}>{getApiErrorMessage(error)}</Text>
            </View>
          ) : canPlay && camera ? (
            <>
              <VLCPlayer
                style={styles.videoFeed}
                source={{ uri: camera.streamUrl, initType: 2, initOptions: [
                  // Keep latency low; the default 1s+ buffer feels laggy for
                  // a monitoring feed where recency matters more than smoothness.
                  '--network-caching=300',
                  '--rtsp-tcp',
                ] }}
                autoplay
                onError={() => setStreamFailed(true)}
              />

              {isOnline && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}

              <View style={styles.cameraSelector}>
                <Ionicons name="home-outline" size={14} color={colors.textPrimary} />
                <Text style={styles.cameraSelectorText}>{camera.name}</Text>
              </View>

              <View style={styles.statusBar}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnline ? colors.liveGreen : colors.textMuted },
                  ]}
                />
                <Text style={styles.statusText}>
                  {camera.online === null
                    ? 'Status unavailable'
                    : isOnline
                      ? 'Camera online'
                      : 'Camera offline'}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam-off-outline" size={32} color={colors.textMuted} />
              <Text style={styles.placeholderText}>
                {streamFailed
                  ? "Couldn't connect to the camera."
                  : 'No camera available for this booking.'}
              </Text>
              {streamFailed && (
                <Pressable
                  onPress={() => {
                    setStreamFailed(false);
                    void refetch();
                  }}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* An offline camera is the case the nudge exists for, so lead with why. */}
        {camera && !isOnline && (
          <View style={styles.awarenessBanner}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.awarenessText}>
              The camera isn&apos;t reachable right now. You can ask the nanny to switch it on.
            </Text>
          </View>
        )}

        {camera && (
          <Button
            title={notifyLabel}
            onPress={handleNotify}
            variant={isOnline ? 'outline' : 'primary'}
            icon="notifications-outline"
            loading={notify.isPending}
            disabled={cooldownLeft > 0 || notify.isPending}
          />
        )}
      </ScrollView>

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Live monitor</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
