import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../utils/theme';
import { useSafeSeat } from '../hooks/useSafeSeat'; // Import hook

function SettingRow({
  label,
  sub,
  right,
}: {
  label: string;
  sub?: string;
  right: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {sub && <Text style={styles.settingSubLabel}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  
  // Consume elevated global state values directly from React Context
  const { arduinoIp, setArduinoIp } = useSafeSeat();

  const [pollInterval, setPollInterval] = useState('2');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [heatGate, setHeatGate] = useState('88');
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Settings</Text>

      {/* Arduino */}
      <Text style={styles.sectionLabel}>Arduino R4 connection</Text>
      <SectionCard>
        <SettingRow
          label="Device IP address"
          sub="Check Serial Monitor after connecting to WiFi"
          right={
            <TextInput
              style={styles.input}
              value={arduinoIp}            // Maps to context value
              onChangeText={setArduinoIp}  // Updates context value on change
              placeholder="192.168.x.x"
              placeholderTextColor={COLORS.muted}
              keyboardType="decimal-pad"
              autoCorrect={false}
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          label="Poll interval (seconds)"
          sub="How often to fetch sensor data"
          right={
            <TextInput
              style={[styles.input, { width: 60 }]}
              value={pollInterval}
              onChangeText={setPollInterval}
              placeholder="2"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
            />
          }
        />
      </SectionCard>

      {/* Notifications */}
      <Text style={styles.sectionLabel}>Notifications</Text>
      <SectionCard>
        <SettingRow
          label="Push notifications"
          sub="Stage 2 & 3 alerts sent to this device"
          right={
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: COLORS.border, true: COLORS.teal }}
              thumbColor="#fff"
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          label="Emergency SMS (Stage 4)"
          sub="Requires Twilio credentials below"
          right={
            <Switch
              value={smsEnabled}
              onValueChange={setSmsEnabled}
              trackColor={{ false: COLORS.border, true: COLORS.teal }}
              thumbColor="#fff"
            />
          }
        />
      </SectionCard>

      {/* Heat gate */}
      <Text style={styles.sectionLabel}>Stage 4 heat gate</Text>
      <SectionCard>
        <SettingRow
          label="Heat index threshold (°F)"
          sub="Stage 4 SMS only fires above this value AND after 2:30"
          right={
            <TextInput
              style={[styles.input, { width: 70 }]}
              value={heatGate}
              onChangeText={setHeatGate}
              placeholder="88"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
            />
          }
        />
        <View style={styles.divider} />
        <View style={styles.callout}>
          <Text style={styles.calloutText}>
            Dual-gate: Stage 4 requires BOTH the 2:30 timer AND heat index ≥ {heatGate}°F.
            A 86°F cabin at 2:31 will not trigger SMS.
          </Text>
        </View>
      </SectionCard>

      {/* Emergency contact */}
      <Text style={styles.sectionLabel}>Emergency contact</Text>
      <SectionCard>
        <SettingRow
          label="Name"
          right={
            <TextInput
              style={styles.input}
              value={emergencyName}
              onChangeText={setEmergencyName}
              placeholder="Jane Smith"
              placeholderTextColor={COLORS.muted}
              autoCorrect={false}
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          label="Phone number"
          sub="Receives Twilio SMS at Stage 4"
          right={
            <TextInput
              style={styles.input}
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              placeholder="+1 555 000 0000"
              placeholderTextColor={COLORS.muted}
              keyboardType="phone-pad"
            />
          }
        />
      </SectionCard>

      {/* Twilio */}
      <Text style={styles.sectionLabel}>Twilio credentials</Text>
      <SectionCard>
        <SettingRow
          label="Account SID"
          right={
            <TextInput
              style={styles.input}
              value={twilioSid}
              onChangeText={setTwilioSid}
              placeholder="ACxxxxxxxxxxxxxxxx"
              placeholderTextColor={COLORS.muted}
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          label="Auth token"
          right={
            <TextInput
              style={styles.input}
              value={twilioToken}
              onChangeText={setTwilioToken}
              placeholder="••••••••••••••••"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              autoCorrect={false}
            />
          }
        />
        <View style={styles.divider} />
        <SettingRow
          label="From phone number"
          sub="Your Twilio number"
          right={
            <TextInput
              style={styles.input}
              value={twilioFrom}
              onChangeText={setTwilioFrom}
              placeholder="+1 555 000 0000"
              placeholderTextColor={COLORS.muted}
              keyboardType="phone-pad"
            />
          }
        />
      </SectionCard>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.saveBtnDone]}
        onPress={save}
        activeOpacity={0.85}
      >
        <Text style={[styles.saveBtnText, saved && styles.saveBtnTextDone]}>
          {saved ? 'Saved ✓' : 'Save settings'}
        </Text>
      </TouchableOpacity>

      {/* About */}
      <View style={styles.about}>
        <Text style={styles.aboutText}>SafeSeat · Arduino Uno R4 WiFi</Text>
        <Text style={styles.aboutText}>Push via local WiFi · SMS via Twilio</Text>
      </View>

      <View style={{ height: insets.bottom + SPACING.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xl },

  sectionLabel: {
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: 12,
  },
  settingLabel: { fontSize: 13.5, color: COLORS.text, fontWeight: '500', marginBottom: 1 },
  settingSubLabel: { fontSize: 11.5, color: COLORS.muted, lineHeight: 15 },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginHorizontal: SPACING.md },

  input: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 140,
    textAlign: 'right',
  },

  callout: {
    margin: SPACING.md,
    backgroundColor: COLORS.amberDim,
    borderRadius: RADIUS.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.amber,
    padding: 10,
  },
  calloutText: { fontSize: 12, color: COLORS.amberText, lineHeight: 17 },

  saveBtn: {
    backgroundColor: COLORS.teal,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  saveBtnDone: { backgroundColor: COLORS.tealDim },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  saveBtnTextDone: { color: COLORS.tealText },

  about: { alignItems: 'center', gap: 4, marginBottom: SPACING.md },
  aboutText: { fontSize: 11.5, color: COLORS.muted },
});