import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeSeat } from '../hooks/useSafeSeat';
import { COLORS, RADIUS, SPACING, STAGE_META, AlertStage } from '../utils/theme';

function fmtTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function PulsingDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[styles.connDot, { backgroundColor: color, opacity: anim }]} />;
}

function StatusHero({ stage }: { stage: AlertStage }) {
  const meta = STAGE_META[stage];
  return (
    <View style={[styles.hero, { borderColor: meta.color + '33' }]}>
      <View style={[styles.heroIconWrap, { backgroundColor: meta.dimColor }]}>
        <Text style={[styles.heroIconGlyph, { color: meta.color }]}>
          {stage === 0 ? '🛡' : '⚠'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroLabel}>System Status</Text>
        <Text style={[styles.heroValue, { color: meta.color }]}>{meta.label === 'Idle' ? 'Idle' : meta.label}</Text>
        <Text style={styles.heroSub}>{meta.sublabel}</Text>
      </View>
      <View style={styles.heroDecoration}>
        <Text style={styles.heroDecorationGlyph}>✓</Text>
      </View>
    </View>
  );
}

function MetricCard({
  icon,
  iconBg,
  label,
  value,
  unit,
  sub,
  subColor,
  accentColor,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  subColor: string;
  accentColor: string;
}) {
  return (
    <View style={[styles.metricCard, { borderTopColor: accentColor }]}>
      <View style={[styles.metricIconWrap, { backgroundColor: iconBg }]}>
        <Text style={styles.metricIconGlyph}>{icon}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      <Text style={[styles.metricSub, { color: subColor }]}>{sub}</Text>
    </View>
  );
}

function SensorRow({
  icon,
  iconBg,
  label,
  value,
  active,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <View style={styles.sensorRow}>
      <View style={[styles.sensorIconWrap, { backgroundColor: iconBg }]}>
        <Text style={styles.sensorIconGlyph}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sensorLabel}>{label}</Text>
        <Text style={[styles.sensorValue, { color: active ? COLORS.teal : COLORS.muted }]}>{value}</Text>
      </View>
      <View style={styles.sensorStatus}>
        <View style={[styles.sensorStatusDot, { backgroundColor: active ? COLORS.teal : COLORS.muted }]} />
        <Text style={[styles.sensorStatusText, { color: active ? COLORS.teal : COLORS.muted }]}>
          {active ? 'Active' : 'Idle'}
        </Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { sensors, stage, elapsedSecs, arduinoOnline, acknowledge, simulateStage } = useSafeSeat();
  const [devOpen, setDevOpen] = useState(false);

  const tempStatus =
    sensors.temp >= 38 ? { label: 'Danger', color: COLORS.red } :
    sensors.temp >= 32 ? { label: 'Warm', color: COLORS.amber } :
    { label: 'Comfortable', color: COLORS.teal };

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeGlyph}>🛡</Text>
          </View>
          <View>
            <Text style={styles.wordmark}>SafeSeat</Text>
            <Text style={styles.tagline}>Smart Protection. Peace of Mind.</Text>
          </View>
        </View>
        <View style={[styles.connPill, { backgroundColor: arduinoOnline ? COLORS.tealDim : COLORS.borderLight }]}>
          <PulsingDot color={arduinoOnline ? COLORS.teal : COLORS.muted} />
          <Text style={[styles.connText, { color: arduinoOnline ? COLORS.tealText : COLORS.muted }]}>
            {arduinoOnline ? 'Connected' : 'No device'}
          </Text>
        </View>
      </View>

      {/* Status hero */}
      <StatusHero stage={stage} />

      {/* Metrics */}
      <View style={styles.metricsRow}>
        <MetricCard
          icon="🌡"
          iconBg={COLORS.shieldBlueDim}
          label="Cabin Temperature"
          value={sensors.temp.toFixed(1)}
          unit="°C"
          sub={tempStatus.label}
          subColor={tempStatus.color}
          accentColor={COLORS.shieldBlue}
        />
        <MetricCard
          icon="⏱"
          iconBg={COLORS.purpleDim}
          label="Alert Timer"
          value={stage > 0 ? fmtTimer(elapsedSecs) : '—'}
          sub={`Elapsed ${fmtTimer(elapsedSecs)}`}
          subColor={COLORS.purple}
          accentColor={COLORS.purple}
        />
      </View>

      {/* Sensors */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderGlyph}>📡</Text>
          <Text style={styles.sectionTitle}>Sensors</Text>
        </View>
        <View style={styles.card}>
          <SensorRow
            icon="👶"
            iconBg={COLORS.mint}
            label="Child Detection (Vision AI)"
            value={sensors.childDetected ? 'Child detected' : 'Child not detected'}
            active={true}
          />
          <View style={styles.divider} />
          <SensorRow
            icon="🚶"
            iconBg={COLORS.peach}
            label="Driver Presence"
            value={sensors.driverPresent ? 'Present' : 'Not detected'}
            active={true}
          />
          <View style={styles.divider} />
          <SensorRow
            icon="🌡"
            iconBg={COLORS.pink}
            label="Temperature Sensor"
            value={`${sensors.temp.toFixed(1)}°C`}
            active={true}
          />
        </View>
      </View>

      {/* Acknowledge */}
      {stage > 0 && (
        <TouchableOpacity style={styles.ackBtn} onPress={acknowledge} activeOpacity={0.85}>
          <Text style={styles.ackBtnText}>I have my child — reset to idle</Text>
        </TouchableOpacity>
      )}

      {/* Dev tools — collapsed by default */}
      <TouchableOpacity
        style={styles.devToggle}
        onPress={() => setDevOpen(o => !o)}
        activeOpacity={0.7}
      >
        <Text style={styles.devToggleText}>{devOpen ? '▾' : '▸'}  Developer tools</Text>
      </TouchableOpacity>
      {devOpen && (
        <View style={styles.card}>
          <Text style={styles.devNote}>Simulate alert stages without hardware connected</Text>
          <View style={styles.simRow}>
            {([1, 2, 3, 4] as AlertStage[]).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.simBtn, { borderColor: STAGE_META[s].color }]}
                onPress={() => simulateStage(s)}
                activeOpacity={0.75}
              >
                <Text style={[styles.simBtnText, { color: STAGE_META[s].color }]}>S{s}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.simBtn, { borderColor: COLORS.teal }]}
              onPress={() => simulateStage(0)}
              activeOpacity={0.75}
            >
              <Text style={[styles.simBtnText, { color: COLORS.teal }]}>Ack</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.shieldBlueDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeGlyph: { fontSize: 18 },
  wordmark: { fontSize: 19, fontWeight: '700', color: COLORS.text },
  tagline: { fontSize: 10.5, color: COLORS.muted, marginTop: 1 },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  connDot: { width: 7, height: 7, borderRadius: 3.5 },
  connText: { fontSize: 12, fontWeight: '500' },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroIconGlyph: { fontSize: 26 },
  heroLabel: { fontSize: 12, color: COLORS.blueText, fontWeight: '600', marginBottom: 2 },
  heroValue: { fontSize: 26, fontWeight: '700', marginBottom: 2 },
  heroSub: { fontSize: 12.5, color: COLORS.textSec },
  heroDecoration: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.shieldBlueDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDecorationGlyph: { fontSize: 16, color: COLORS.shieldBlue },

  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: SPACING.lg,
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderTopWidth: 3,
    padding: SPACING.md,
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricIconGlyph: { fontSize: 17 },
  metricLabel: { fontSize: 12, color: COLORS.textSec, fontWeight: '500', marginBottom: 4 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginBottom: 6 },
  metricValue: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  metricUnit: { fontSize: 13, color: COLORS.textSec },
  metricSub: { fontSize: 12, fontWeight: '600' },

  section: { marginBottom: SPACING.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionHeaderGlyph: { fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },

  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    gap: 12,
  },
  sensorIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorIconGlyph: { fontSize: 19 },
  sensorLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  sensorValue: { fontSize: 12.5, fontWeight: '500' },
  sensorStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sensorStatusDot: { width: 7, height: 7, borderRadius: 3.5 },
  sensorStatusText: { fontSize: 12.5, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginLeft: SPACING.lg + 42 + 12 },

  ackBtn: {
    backgroundColor: COLORS.teal,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  ackBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  devToggle: { paddingVertical: 10, alignItems: 'center' },
  devToggleText: { fontSize: 12.5, color: COLORS.muted, fontWeight: '500' },
  devNote: { fontSize: 12, color: COLORS.muted, padding: SPACING.md, paddingBottom: 4 },
  simRow: { flexDirection: 'row', gap: 8, padding: SPACING.md, paddingTop: 8 },
  simBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  simBtnText: { fontSize: 12, fontWeight: '700' },
});
