import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AlertStage, AlertEvent, SensorData } from '../utils/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SafeSeat Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF0000',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] Push notification permission not granted.');
    return false;
  }

  return true;
}

async function sendLocalPush(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: null,
    });
    console.log(`[push dispatched] ${title} — ${body}`);
  } catch (err) {
    console.error('[push error] Failed to schedule notification:', err);
  }
}

async function sendSms(message: string, phone: string, label: string): Promise<void> {
  const baseUrl = process.env.EXPO_PUBLIC_SMS_SERVER_URL || 'http://172.20.95.106:5000';
  const targetUrl = `${baseUrl}/send-alert`;

  console.log(`[SMS Debug][${label}] Attempting POST to:`, targetUrl);
  console.log(`[SMS Debug][${label}] Sending to phone:`, phone);

  if (!phone) {
    console.error(`[SMS][${label}] No phone number set — skipping.`);
    return;
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ phoneNumber: phone, message }),
    });

    const responseText = await res.text();

    if (responseText.trim().startsWith('<')) {
      console.error(`[SMS Error][${label}] Server returned HTML (Status ${res.status}):`, responseText.slice(0, 300));
      return;
    }

    const data = JSON.parse(responseText);
    if (data.success) {
      console.log(`[SMS][${label}] Sent successfully. ID:`, data.messageId);
    } else {
      console.error(`[SMS][${label}] Server returned failure:`, data.error ?? data.message);
    }
  } catch (err) {
    console.error(`[SMS][${label}] Failed to reach SMS server:`, err);
  }
}

let lastArduinoWarnTime = 0;

async function fetchArduinoData(ip: string): Promise<SensorData | null> {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `http://${ip}/status`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ...data,
      temp: data.temp ?? 72,
      heatIndex: data.heatIndex ?? data.temp ?? 0,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const now = Date.now();
    if (now - lastArduinoWarnTime > 30000) {
      lastArduinoWarnTime = now;
      console.warn(`[Arduino] Unreachable at http://${ip}/status — will retry silently.`);
    }
    return null;
  }
}

interface SafeSeatState {
  sensors: SensorData;
  stage: AlertStage;
  elapsedSecs: number;
  events: AlertEvent[];
  arduinoOnline: boolean;
  arduinoIp: string;
  setArduinoIp: (ip: string) => void;
  emergencyPhone: string;
  setEmergencyPhone: (phone: string) => void;
  smsEnabled: boolean;
  setSmsEnabled: (enabled: boolean) => void;
  acknowledge: () => void;
  simulateStage: (stage: AlertStage) => void;
}

const MOCK_SENSORS: SensorData = {
  temp: 72,
  humidity: 0,
  heatIndex: 0,
  elapsedSecs: 0,
  stage: 0,
  pressure: false,
  driverPresent: true,
  childDetected: false,
};

const CTX = createContext<SafeSeatState | null>(null);

export function SafeSeatProvider({ children }: { children: React.ReactNode }) {
  const [sensors, setSensors] = useState<SensorData>(MOCK_SENSORS);
  const [stage, setStage] = useState<AlertStage>(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [arduinoOnline, setArduinoOnline] = useState(false);

  const defaultIp = process.env.EXPO_PUBLIC_ARDUINO_IP || '';
  const [arduinoIp, setArduinoIp] = useState(defaultIp);

  const defaultPhone = process.env.EXPO_PUBLIC_EMERGENCY_PHONE || '';
  const [emergencyPhone, setEmergencyPhone] = useState(defaultPhone);

  const [smsEnabled, setSmsEnabled] = useState(true);

  const stageRef = useRef<AlertStage>(0);

  // Separate sent locks for stage 3 and stage 4 so each fires exactly once per alert
  const sms3SentRef = useRef(false);
  const sms4SentRef = useRef(false);

  const emergencyPhoneRef = useRef(emergencyPhone);
  useEffect(() => {
    emergencyPhoneRef.current = emergencyPhone;
    console.log('[SMS] emergencyPhoneRef updated to:', emergencyPhone);
  }, [emergencyPhone]);

  const smsEnabledRef = useRef(smsEnabled);
  useEffect(() => {
    smsEnabledRef.current = smsEnabled;
    console.log('[SMS] smsEnabled updated to:', smsEnabled);
  }, [smsEnabled]);

  useEffect(() => { requestPushPermission(); }, []);

  useEffect(() => {
    const poll = async () => {
      if (!arduinoIp) return;
      const data = await fetchArduinoData(arduinoIp);
      if (data) {
        setSensors(data);
        setArduinoOnline(true);

        if (data.stage !== undefined && data.stage !== stageRef.current) {
          const hardwareStage = data.stage as AlertStage;
          setStage(hardwareStage);
          stageRef.current = hardwareStage;
          fireEvent(hardwareStage, data);
        }

        if (data.elapsedSecs !== undefined) {
          setElapsedSecs(data.elapsedSecs);
        }
      } else {
        setArduinoOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [arduinoIp]);

  
  const fireEvent = useCallback(async (s: AlertStage, data: SensorData) => {
    const messages: Record<AlertStage, string> = {
      0: 'System reset to idle.',
      1: `Child detected in vehicle — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      2: `Push sent to driver — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      3: `SafeSeat ALERT: A child has been left alone in a vehicle. Cabin temperature is ${data.temp?.toFixed(1) ?? 0}°F. Immediate attention required.`,
      4: `EMERGENCY — 911 ALERT: Child in danger in unattended vehicle. Cabin temperature ${data.temp?.toFixed(1) ?? 0}°F / heat index ${data.heatIndex?.toFixed(1) ?? 0}°F. Please dispatch immediately. [SafeSeat automated alert]`,
    };

    const pushTitles: Partial<Record<AlertStage, string>> = {
      2: 'Child in vehicle',
      3: 'ALARM — Child in vehicle',
      4: 'Emergency — Child in vehicle',
    };

    if (pushTitles[s]) {
      await sendLocalPush(pushTitles[s]!, messages[s]);
    }

    // Stage 3 — SMS to emergency contact
    if (s === 3 && !sms3SentRef.current) {
      sms3SentRef.current = true;
      if (smsEnabledRef.current) {
        console.log('[SMS] Stage 3 — dispatching SMS to emergency contact...');
        await sendSms(messages[3], emergencyPhoneRef.current, 'emergency-contact');
      } else {
        console.log('[SMS] Stage 3 reached but SMS is disabled in Settings — skipping.');
      }
    }

    // Stage 4 — SMS to law enforcement placeholder (same number for now)
    if (s === 4 && !sms4SentRef.current) {
      sms4SentRef.current = true;
      if (smsEnabledRef.current) {
        console.log('[SMS] Stage 4 — dispatching SMS to law enforcement (placeholder)...');
        // TODO: replace emergencyPhoneRef.current with a dedicated law enforcement number
        // when real 911 SMS integration is available
        await sendSms(messages[4], emergencyPhoneRef.current, 'law-enforcement-placeholder');
      } else {
        console.log('[SMS] Stage 4 reached but SMS is disabled in Settings — skipping.');
      }
    }

    // Reset locks when system returns to idle
    if (s === 0) {
      sms3SentRef.current = false;
      sms4SentRef.current = false;
    }

    const event: AlertEvent = {
      // Append random string to guarantee uniqueness even in identical millisecond executions
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      stage: s,
      timestamp: new Date(),
      message: messages[s],
      temp: data.temp,
      heatIndex: data.heatIndex,
      acknowledged: false,
    };

    setEvents(prev => [event, ...prev]);
  }, []);

  const acknowledge = useCallback(async () => {
    try {
      if (arduinoIp) {
        const url = `http://${arduinoIp}/ack`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch(url, { method: 'POST', signal: controller.signal });
        clearTimeout(timeoutId);
        console.log('[hardware] Reset command dispatched safely.');
      }
    } catch (error) {
      console.log('[hardware] Failed to dispatch remote reset command:', error);
    }

    // Reset sensors state to idle ambient values
    const resetSensors: SensorData = {
      temp: 72.0,
      humidity: 45,
      heatIndex: 72.0,
      elapsedSecs: 0,
      stage: 0,
      pressure: false,
      driverPresent: true,
      childDetected: false,
    };

    setSensors(resetSensors);
    sms3SentRef.current = false;
    sms4SentRef.current = false;
    setSensors(prev => ({ ...prev, driverPresent: true }));
    stageRef.current = 0;
    setStage(0);
    setElapsedSecs(0);
    setEvents(prev => prev.map(e => ({ ...e, acknowledged: true })));
    
    // Fire event with reset sensor data
    fireEvent(0, resetSensors);
  }, [arduinoIp, fireEvent]);

  const simulateStage = useCallback((s: AlertStage) => {
    if (s === 0) { acknowledge(); return; }

    const mockTemp = s >= 3 ? 98.2 : 93.5;
    const mockHeatIndex = s >= 3 ? 106.4 : 95.1;

    const mockAlert: SensorData = {
      temp: mockTemp,
      humidity: 55,
      heatIndex: mockHeatIndex,
      elapsedSecs: 0,
      stage: s,
      pressure: true,
      driverPresent: false,
      childDetected: true,
    };
    setSensors(mockAlert);
    setArduinoOnline(true);

    const elapsedMap: Record<number, number> = { 1: 5, 2: 64, 3: 92, 4: 152 };
    const elapsed = elapsedMap[s] ?? 5;
    setElapsedSecs(elapsed);
    stageRef.current = s;
    setStage(s);
    fireEvent(s, mockAlert);
  }, [acknowledge, fireEvent]);

  return (
    <CTX.Provider value={{
      sensors,
      stage,
      elapsedSecs,
      events,
      arduinoOnline,
      arduinoIp,
      setArduinoIp,
      emergencyPhone,
      setEmergencyPhone,
      smsEnabled,
      setSmsEnabled,
      acknowledge,
      simulateStage,
    }}>
      {children}
    </CTX.Provider>
  );
}

export function useSafeSeat(): SafeSeatState {
  const ctx = useContext(CTX);
  if (!ctx) throw new Error('useSafeSeat must be used within SafeSeatProvider');
  return ctx;
}