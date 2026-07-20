import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IdDocumentType, idTypeRequiresBack } from '@shared/nanny';
import { Chip } from '@mobile/components/ui';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
} from '@mobile/theme';

interface IdCaptureFieldsProps {
  idType: IdDocumentType | null;
  onChangeType: (type: IdDocumentType) => void;
  frontUri: string | null;
  backUri: string | null;
  onPickFront: () => void;
  onPickBack: () => void;
  error?: string | null;
}

/**
 * Shared identity-document capture UI: an ID-type selector plus the photo
 * upload cards (front always; back only for a national ID). Fully controlled —
 * consumers own the URIs and the pick handlers. Reused by registration, the
 * nanny forced re-upload screen, and the mother booking-gate modal.
 */
export default function IdCaptureFields({
  idType,
  onChangeType,
  frontUri,
  backUri,
  onPickFront,
  onPickBack,
  error,
}: IdCaptureFieldsProps) {
  const needsBack = idType != null && idTypeRequiresBack(idType);
  const frontLabel = idType === IdDocumentType.PASSPORT ? 'Passport photo page' : 'Front of ID';

  return (
    <View style={styles.container}>
      <Text style={styles.fieldLabel}>ID type</Text>
      <View style={styles.typeRow}>
        <Chip
          label="National ID"
          active={idType === IdDocumentType.NATIONAL_ID}
          onPress={() => onChangeType(IdDocumentType.NATIONAL_ID)}
        />
        <Chip
          label="Passport"
          active={idType === IdDocumentType.PASSPORT}
          onPress={() => onChangeType(IdDocumentType.PASSPORT)}
        />
      </View>

      {idType != null && (
        <View style={styles.uploadGroup}>
          <IdUploadCard label={frontLabel} uri={frontUri} onPress={onPickFront} />
          {needsBack && <IdUploadCard label="Back of ID" uri={backUri} onPress={onPickBack} />}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function IdUploadCard({
  label,
  uri,
  onPress,
}: {
  label: string;
  uri: string | null;
  onPress: () => void;
}) {
  if (uri) {
    return (
      <Pressable style={[styles.uploadCard, styles.uploadCardFilled]} onPress={onPress}>
        <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
        <View style={styles.previewBadge}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.previewBadgeText}>{label}</Text>
        </View>
        <View style={styles.previewOverlay}>
          <Ionicons name="camera-outline" size={14} color={colors.white} />
          <Text style={styles.previewOverlayText}>Change</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.uploadCard} onPress={onPress}>
      <View style={styles.uploadIconCircle}>
        <Ionicons name="card-outline" size={24} color={colors.primaryDark} />
      </View>
      <Text style={styles.uploadTitle}>{label}</Text>
      <Text style={styles.uploadHint}>Tap to upload a photo</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  uploadGroup: {
    gap: spacing.md,
  },
  uploadCard: {
    borderWidth: 1.5,
    borderColor: colors.warmBorder,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 160,
  },
  uploadCardFilled: {
    borderStyle: 'solid',
    borderColor: colors.primary,
    padding: 0,
    overflow: 'hidden',
  },
  uploadIconCircle: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    ...typeScale.bodyMd,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
  uploadHint: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  previewOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  previewOverlayText: {
    ...typeScale.labelMd,
    color: colors.white,
    fontFamily: fontFamily.bold,
  },
  previewBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  previewBadgeText: {
    ...typeScale.labelMd,
    color: colors.successText,
    fontFamily: fontFamily.bold,
  },
  errorText: {
    ...typeScale.bodySm,
    color: colors.error,
  },
});
