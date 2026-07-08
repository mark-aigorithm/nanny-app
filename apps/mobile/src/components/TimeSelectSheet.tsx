import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
} from '@mobile/theme';

interface Props {
  visible: boolean;
  title: string;
  value: string;
  onSelect: (hhmm: string) => void;
  onClose: () => void;
}

const ITEM_HEIGHT = 44;
const WHEEL_HEIGHT = ITEM_HEIGHT * 5;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ['AM', 'PM'] as const;
type Period = (typeof PERIODS)[number];

function parseHhmm(hhmm: string): { hour12: number; minute: number; period: Period } {
  const parts = hhmm.split(':').map(Number);
  const h24 = parts[0] ?? 8;
  const minute = parts[1] ?? 0;
  const period: Period = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { hour12, minute, period };
}

function toHhmm(hour12: number, minute: number, period: Period): string {
  let h24 = hour12;
  if (period === 'AM' && hour12 === 12) h24 = 0;
  else if (period === 'PM' && hour12 !== 12) h24 = hour12 + 12;
  return `${h24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function formatTimeDisplay(hhmm: string): string {
  const { hour12, minute, period } = parseHhmm(hhmm);
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

function formatMinute(minute: number): string {
  return minute.toString().padStart(2, '0');
}

interface WheelColumnProps<T> {
  items: readonly T[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  formatItem: (item: T) => string;
  scrollKey: string;
}

function WheelColumn<T>({
  items,
  selectedIndex,
  onIndexChange,
  formatItem,
  scrollKey,
}: WheelColumnProps<T>) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex, scrollKey]);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    onIndexChange(clamped);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wheelColumn}
      contentContainerStyle={styles.wheelContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={handleScrollEnd}
      onScrollEndDrag={handleScrollEnd}
    >
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <View key={`${scrollKey}-${index}`} style={styles.wheelItem}>
            <Text style={[styles.wheelItemText, isSelected && styles.wheelItemTextSelected]}>
              {formatItem(item)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function TimeSelectSheet({ visible, title, value, onSelect, onClose }: Props) {
  const parsed = parseHhmm(value);
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<Period>(parsed.period);
  const scrollKey = visible ? value : 'closed';

  useEffect(() => {
    if (!visible) return;
    const next = parseHhmm(value);
    setHour12(next.hour12);
    setMinute(next.minute);
    setPeriod(next.period);
  }, [visible, value]);

  const handleDone = () => {
    onSelect(toHhmm(hour12, minute, period));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={handleDone} hitSlop={12}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.wheelRow}>
            <View style={styles.selectionHighlight} pointerEvents="none" />
            <WheelColumn
              items={HOURS}
              selectedIndex={hour12 - 1}
              onIndexChange={(index) => setHour12(HOURS[index] ?? 1)}
              formatItem={(h) => h.toString()}
              scrollKey={scrollKey}
            />
            <Text style={styles.wheelColon}>:</Text>
            <WheelColumn
              items={MINUTES}
              selectedIndex={minute}
              onIndexChange={(index) => setMinute(MINUTES[index] ?? 0)}
              formatItem={formatMinute}
              scrollKey={scrollKey}
            />
            <WheelColumn
              items={PERIODS}
              selectedIndex={period === 'AM' ? 0 : 1}
              onIndexChange={(index) => setPeriod(PERIODS[index] ?? 'AM')}
              formatItem={(p) => p}
              scrollKey={scrollKey}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
  cancel: {
    ...typeScale.labelMd,
    color: colors.textMuted,
  },
  done: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: WHEEL_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  wheelColon: {
    ...typeScale.headingMd,
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_HEIGHT,
  },
  wheelContent: {
    paddingVertical: ITEM_HEIGHT * 2,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    ...typeScale.bodyLg,
    color: colors.textMuted,
  },
  wheelItemTextSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
  selectionHighlight: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
  },
});
