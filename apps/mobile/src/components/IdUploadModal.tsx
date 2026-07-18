import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IdDocumentType } from '@shared/nanny';
import { Button } from '@mobile/components/ui';
import IdCaptureFields from '@mobile/components/IdCaptureFields';
import { useIdGateStore } from '@mobile/store/idGateStore';
import { useIdSubmit } from '@mobile/hooks/useIdSubmit';
import { pickImageFromLibrary } from '@mobile/lib/pickImage';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  typeScale,
} from '@mobile/theme';

/**
 * Mother-facing ID capture prompt shown when a mother without a verified ID
 * taps a gated action (Book care). Mounted once in the parent layout; opened
 * via `useIdGateStore` (through `useIdGate`). Dismissable — she can back out
 * and keep browsing, she just can't book until she uploads (upload-then-book).
 */
export default function IdUploadModal() {
  const visible = useIdGateStore((s) => s.visible);
  const reason = useIdGateStore((s) => s.reason);
  const closeIdGate = useIdGateStore((s) => s.closeIdGate);

  const [idType, setIdType] = useState<IdDocumentType | null>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const { submit, isSubmitting, error, setError } = useIdSubmit();

  // Reset the capture state each time the modal opens.
  useEffect(() => {
    if (visible) {
      setIdType(null);
      setFrontUri(null);
      setBackUri(null);
      setError(null);
    }
  }, [visible, setError]);

  if (!visible) return null;

  const pickFront = async () => {
    const uri = await pickImageFromLibrary();
    if (uri) setFrontUri(uri);
  };
  const pickBack = async () => {
    const uri = await pickImageFromLibrary();
    if (uri) setBackUri(uri);
  };

  const handleSubmit = async () => {
    const ok = await submit({ idType, frontUri, backUri });
    if (ok) closeIdGate();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeIdGate}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeIdGate} />

        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.message}>
            {reason
              ? `Your previous ID wasn't approved: ${reason}. Please upload a new one to book.`
              : 'For everyone’s safety, upload a government ID before booking. Only our review team can see it.'}
          </Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <IdCaptureFields
              idType={idType}
              onChangeType={setIdType}
              frontUri={frontUri}
              backUri={backUri}
              onPickFront={pickFront}
              onPickBack={pickBack}
              error={error}
            />
          </ScrollView>

          <View style={styles.actions}>
            <Button
              title={isSubmitting ? 'Submitting…' : 'Submit for review'}
              onPress={handleSubmit}
              variant="primary"
              disabled={isSubmitting}
            />
            <Button title="Maybe later" onPress={closeIdGate} variant="text" disabled={isSubmitting} />
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
    maxWidth: 380,
    maxHeight: '86%',
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
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.xs,
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
  body: {
    width: '100%',
    marginTop: spacing.md,
  },
  bodyContent: {
    paddingBottom: spacing.sm,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
