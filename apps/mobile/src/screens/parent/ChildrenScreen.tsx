import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  childMissingForBooking,
  formatChildAge,
  type Child,
  type ChildInput,
} from '@nanny-app/shared';

import ChildFormSheet from '@mobile/components/ChildFormSheet';
import { Button, ScreenContainer, StackHeader } from '@mobile/components/ui';
import {
  useChildren,
  useCreateChild,
  useDeleteChild,
  useUpdateChild,
} from '@mobile/hooks/useChildren';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { getApiErrorMessage } from '@mobile/lib/api';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/children-screen.styles';

/** What the sheet is open for: adding, or editing one child. */
type SheetState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; child: Child };

/** "Born Mar 2024" for a child with a birth month. */
function bornLine(child: Child): string | null {
  if (!child.birthMonth) return null;
  const [y, m] = child.birthMonth.split('-').map(Number);
  const month = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `Born ${month} ${y}`;
}

/**
 * The mother's children. Each booking picks from this list and keeps its own
 * copy, so editing a child here never changes what a nanny was already told.
 */
export default function ChildrenScreen() {
  const router = useRouter();
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  const { data: children, isLoading, isError, refetch } = useChildren();
  const createChild = useCreateChild();
  const updateChild = useUpdateChild();
  const deleteChild = useDeleteChild();

  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });
  const [sheetError, setSheetError] = useState<string | null>(null);

  const openAdd = () => {
    setSheetError(null);
    setSheet({ mode: 'add' });
  };
  const openEdit = (child: Child) => {
    setSheetError(null);
    setSheet({ mode: 'edit', child });
  };
  const closeSheet = () => setSheet({ mode: 'closed' });

  const handleSubmit = (input: ChildInput) => {
    setSheetError(null);
    const onError = (err: unknown) =>
      setSheetError(getApiErrorMessage(err, 'Could not save. Please try again.'));
    if (sheet.mode === 'edit') {
      updateChild.mutate({ id: sheet.child.id, input }, { onSuccess: closeSheet, onError });
    } else {
      createChild.mutate(input, { onSuccess: closeSheet, onError });
    }
  };

  const confirmDelete = (child: Child) => {
    Alert.alert(
      `Remove ${child.name ?? 'this child'}?`,
      'Bookings you already made are not affected.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteChild.mutate(child.id) },
      ],
    );
  };

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="Children"
        subtitle="Who your nanny looks after"
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View>
            <Text style={styles.errorText}>Could not load your children.</Text>
            <Button title="Try again" variant="outline" onPress={() => void refetch()} />
          </View>
        ) : children && children.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="happy-outline" size={26} color={colors.primaryDark} />
            </View>
            <Text style={styles.emptyTitle}>No children yet</Text>
            <Text style={styles.emptySub}>
              Add them once — their age, allergies and what they love — and pick them when you book.
            </Text>
          </View>
        ) : (
          children?.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              onEdit={openEdit}
              onDelete={confirmDelete}
              deleting={deleteChild.isPending}
            />
          ))
        )}

        {!isLoading && !isError && (
          <Button title="Add a child" icon="add" onPress={openAdd} variant="secondary" />
        )}
      </ScrollView>

      <ChildFormSheet
        visible={sheet.mode !== 'closed'}
        onClose={closeSheet}
        initial={sheet.mode === 'edit' ? sheet.child : undefined}
        onSubmit={handleSubmit}
        submitting={createChild.isPending || updateChild.isPending}
        error={sheetError}
      />
    </ScreenContainer>
  );
}

function ChildCard({
  child,
  onEdit,
  onDelete,
  deleting,
}: {
  child: Child;
  onEdit: (child: Child) => void;
  onDelete: (child: Child) => void;
  deleting: boolean;
}) {
  const missing = childMissingForBooking(child);
  const health = [...child.allergies, ...child.conditions];
  const born = bornLine(child);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.initial}>
          {child.name ? (
            <Text style={styles.initialText}>{child.name.trim().charAt(0).toUpperCase()}</Text>
          ) : (
            <Ionicons name="happy-outline" size={18} color={colors.primaryDark} />
          )}
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{child.name ?? 'Add a name'}</Text>
          <Text style={styles.cardMeta}>
            {formatChildAge(child.ageYears, child.ageMonths)}
            {born ? ` · ${born}` : ''}
          </Text>
        </View>
      </View>

      {missing ? (
        <View style={styles.needsRow}>
          <Ionicons name="information-circle-outline" size={16} color={colors.goldWarm} />
          <Text style={styles.needsText}>
            {missing === 'name' ? 'Add a name' : 'Add the birth month'} to book for this child.
          </Text>
        </View>
      ) : null}

      {health.length > 0 || child.healthNotes ? (
        <View style={styles.healthRow}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.healthText}>
            {[health.join(', '), child.healthNotes].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      {child.diet.length > 0 ? (
        <Text style={styles.cardLine}>Diet: {child.diet.join(', ')}</Text>
      ) : null}
      {child.interests.length > 0 ? (
        <Text style={styles.cardLine}>Loves: {child.interests.join(', ')}</Text>
      ) : null}
      {child.languages.length > 0 ? (
        <Text style={styles.cardLine}>Speaks: {child.languages.join(', ')}</Text>
      ) : null}
      {child.notes ? <Text style={styles.cardNote}>{child.notes}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => onEdit(child)}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${child.name ?? 'child'}`}
        >
          <Text style={styles.action}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(child)}
          disabled={deleting}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${child.name ?? 'child'}`}
        >
          <Text style={styles.actionDestructive}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}
