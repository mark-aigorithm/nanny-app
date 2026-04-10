import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@mobile/theme';
import { MOCK_NANNY_REQUESTS } from '@mobile/mocks';
import type { NannyBookingRequest } from '@mobile/types';
import { styles } from './styles/nanny-requests-screen.styles';

type FilterKey = 'pending' | 'accepted' | 'declined';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
];

export default function NannyRequestsScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending');
  const [requests, setRequests] = useState(MOCK_NANNY_REQUESTS);

  const filteredRequests = requests.filter((r) => r.status === activeFilter);

  const handleAccept = (id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'accepted' as const } : r)),
    );
  };

  const handleDecline = (id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'declined' as const } : r)),
    );
  };

  const renderRequestCard = (request: NannyBookingRequest) => (
    <View key={request.id} style={styles.requestCard}>
      {/* Parent info */}
      <View style={styles.parentRow}>
        <Image source={{ uri: request.parentPhoto }} style={styles.parentAvatar} />
        <View style={styles.parentInfo}>
          <Text style={styles.parentName}>{request.parentName}</Text>
          <Text style={styles.requestedAt}>{request.requestedAt}</Text>
        </View>
        <View style={styles.amountBadge}>
          <Text style={styles.amountText}>${request.totalAmount}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailsGrid}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          <Text style={styles.detailText}>{request.date}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
          <Text style={styles.detailText}>{request.time} ({request.duration}h)</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="people-outline" size={16} color={colors.textMuted} />
          <Text style={styles.detailText}>{request.childrenCount} {request.childrenCount === 1 ? 'child' : 'children'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={colors.textMuted} />
          <Text style={styles.detailText}>{request.location}</Text>
        </View>
      </View>

      {/* Special instructions */}
      {request.specialInstructions && (
        <View style={styles.instructionsBox}>
          <Text style={styles.instructionsLabel}>Special instructions</Text>
          <Text style={styles.instructionsText}>{request.specialInstructions}</Text>
        </View>
      )}

      {/* Actions or Status */}
      {request.status === 'pending' ? (
        <View style={styles.actionsRow}>
          <Pressable style={styles.declineButton} onPress={() => handleDecline(request.id)}>
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
          <Pressable style={styles.acceptButton} onPress={() => handleAccept(request.id)}>
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.statusBadge, request.status === 'accepted' ? styles.statusAccepted : styles.statusDeclined]}>
          <Text style={[styles.statusText, request.status === 'accepted' ? styles.statusAcceptedText : styles.statusDeclinedText]}>
            {request.status}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(filter.key)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Request cards */}
        {filteredRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.taupe} />
            <Text style={styles.emptyStateText}>No {activeFilter} requests</Text>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {filteredRequests.map(renderRequestCard)}
          </View>
        )}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Booking requests</Text>
        </View>
      </View>
    </View>
  );
}
