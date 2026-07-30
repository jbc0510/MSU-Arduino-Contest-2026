import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeSeat } from '../hooks/useSafeSeat';
import { COLORS, RADIUS, SPACING, STAGE_META, AlertEvent, AlertStage } from '../utils/theme';

function fmtTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STAGE_ICONS: Record<AlertStage, string> = {
  0: '✓',
  1: '!',
  2: '↑',
  3: '!!',
  4: 'SOS',
};

function EventCard({ event }: { event: AlertEvent }) {
  const meta = STAGE_META[event.stage];
  return (
    <View style={[styles.eventCard, { borderLeftColor: meta.color }]}>
      <View style={styles.eventTop}>
        <View style={[styles.stageBadge, { backgroundColor: meta.dimColor }]}>
          <Text style={[styles.stageBadgeText, { color: meta.color }]}>
            {STAGE_ICONS[event.stage]} {meta.label}
          </Text>
        </View>
        <Text style={styles.eventTime}>
          {fmtDate(event.timestamp)} · {fmtTime(event.timestamp)}
        </Text>
      </View>
      <Text style={styles.eventMsg}>{event.message}</Text>
      <View style={styles.eventMeta}>
        <Text style={styles.eventMetaText}>
          {event.temp.toFixed(1)}°F cabin · heat index {event.heatIndex}°F
        </Text>
        {event.acknowledged && (
          <View style={styles.ackBadge}>
            <Text style={styles.ackBadgeText}>acknowledged</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { events, stage } = useSafeSeat();

  const unread = events.filter(e => !e.acknowledged && e.stage > 0).length;

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        {unread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread} active</Text>
          </View>
        )}
      </View>

      {/* Stage timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Escalation timeline</Text>
        <View style={styles.card}>
          {([1, 2, 3, 4] as AlertStage[]).map((s, i) => {
            const meta = STAGE_META[s];
            const reached = stage >= s;
            return (
              <View key={s} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.timelineDot,
                      { backgroundColor: reached ? meta.color : COLORS.border },
                    ]}
                  />
                  {i < 3 && (
                    <View
                      style={[
                        styles.timelineLine,
                        { backgroundColor: stage > s ? meta.color : COLORS.border },
                      ]}
                    />
                  )}
                </View>
                <View style={styles.timelineBody}>
                  <View style={styles.timelineHeader}>
                    <Text style={[styles.timelineName, { color: reached ? meta.color : COLORS.muted }]}>
                      {meta.label}
                    </Text>
                    <Text style={[styles.timelineTrigger, { color: reached ? meta.color : COLORS.muted }]}>
                      {s === 1 ? '0 s' : s === 2 ? '60 s' : s === 3 ? '90 s' : '2:00'}
                    </Text>
                  </View>
                  <Text style={[styles.timelineSub, { color: reached ? COLORS.textSec : COLORS.muted }]}>
                    {meta.sublabel}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Event log */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Event log · {events.length} events</Text>
        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyTitle}>No alerts</Text>
            <Text style={styles.emptySub}>Events will appear here when the system triggers</Text>
          </View>
        ) : (
          <View style={styles.eventList}>
            {events.map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </View>
        )}
      </View>

      <View style={{ height: insets.bottom + SPACING.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.xl,
  },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  unreadBadge: {
    backgroundColor: COLORS.redDim,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  unreadText: { fontSize: 11, color: COLORS.redText, fontWeight: '600' },

  section: { marginBottom: SPACING.xl },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },

  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    marginTop: 4,
    marginBottom: -4,
  },
  timelineBody: { flex: 1, paddingBottom: 16 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  timelineName: { fontSize: 13, fontWeight: '700' },
  timelineTrigger: { fontSize: 12, fontWeight: '500' },
  timelineSub: { fontSize: 12, lineHeight: 17 },

  eventList: { gap: 8 },
  eventCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.border,
    padding: SPACING.md,
    gap: 6,
  },
  eventTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  stageBadgeText: { fontSize: 11, fontWeight: '700' },
  eventTime: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
  eventMsg: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventMetaText: { fontSize: 11, color: COLORS.muted },
  ackBadge: {
    backgroundColor: COLORS.tealDim,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ackBadgeText: { fontSize: 10, color: COLORS.tealText, fontWeight: '600' },

  emptyState: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 32, color: COLORS.muted },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textSec },
  emptySub: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
});