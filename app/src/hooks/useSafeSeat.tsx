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

// Configure foreground notification behavior globally
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestPushPermission(): Promise<boolean> {
  // Android requires explicit notification channel setup
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
      content: {
        title,
        body,
        sound: 'default',
      },
      trigger: null, // Fires immediately
    });
    console.log(`[push dispatched] ${title} — ${body}`);
  } catch (err) {
    console.error('[push error] Failed to schedule notification:', err);
  }
}

const SMS_SERVER_URL = process.env.EXPO_PUBLIC_SMS_SERVER_URL;
const EMERGENCY_PHONE = process.env.EXPO_PUBLIC_EMERGENCY_PHONE;

async function sendEmergencySms(message: string): Promise<void> {
  const baseUrl = process.env.EXPO_PUBLIC_SMS_SERVER_URL || 'http://172.20.95.106:5000';
  const targetUrl = `${baseUrl}/send-alert`;

  console.log('[SMS Debug] Attempting POST to:', targetUrl);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json' 
      },
      body: JSON.stringify({
        phoneNumber: EMERGENCY_PHONE,
        message,
      }),
    });

    const responseText = await res.text();

    if (responseText.trim().startsWith('<')) {
      console.error(`[SMS Error] Server returned HTML instead of JSON (Status ${res.status}):`);
      console.error(responseText.slice(0, 300));
      return;
    }

    const data = JSON.parse(responseText);
    if (data.success) {
      console.log('[SMS] Emergency SMS sent successfully. ID:', data.messageId);
    } else {
      console.error('[SMS] Server returned failure:', data.error ?? data.message);
    }
  } catch (err) {
    console.error('[SMS] Failed to reach SMS server:', err);
  }
}

async function fetchArduinoData(ip: string): Promise<SensorData | null> {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') {
    return null;
  }

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
    if (err.name === 'AbortError') {
      console.warn(`[Arduino Fetch] Request to http://${ip}/status timed out (5s).`);
    } else {
      console.warn(`[Arduino Fetch] Network error hitting http://${ip}/status:`, err.message);
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

  const stageRef = useRef<AlertStage>(0);
  const smsSentRef = useRef(false);

  useEffect(() => {
    requestPushPermission();
  }, []);

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
      2: `Safeseat Push: Child in vehicle — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      3: `Safeseat Push: Full alarm active — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      4: `🆘 SafeSeat EMERGENCY: Child left alone in vehicle. Cabin temp ${data.temp?.toFixed(1) ?? 0}°F. Immediate action required.`,
    };

    const pushTitles: Partial<Record<AlertStage, string>> = {
      2: '⚠️ Child in vehicle',
      3: '🚨 ALARM — Child in vehicle',
      4: '🆘 Emergency — Child in vehicle',
    };

    if (pushTitles[s]) {
      await sendLocalPush(pushTitles[s]!, messages[s]);
    }

    if (s === 4 && !smsSentRef.current) {
      smsSentRef.current = true;
      console.log('[SMS] Stage 4 reached — dispatching emergency SMS...');
      await sendEmergencySms(messages[4]);
    }

    if (s === 0) {
      smsSentRef.current = false;
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

        await fetch(url, {
          method: 'POST',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        console.log('[hardware] Reset command dispatched safely.');
      }
    } catch (error) {
      console.log('[hardware] Failed to dispatch remote reset command:', error);
    }

    smsSentRef.current = false;

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
    <CTX.Provider value={{ sensors, stage, elapsedSecs, events, arduinoOnline, arduinoIp, setArduinoIp, acknowledge, simulateStage }}>
      {children}
    </CTX.Provider>
  );
}

export function useSafeSeat(): SafeSeatState {
  const ctx = useContext(CTX);
  if (!ctx) throw new Error('useSafeSeat must be used within SafeSeatProvider');
  return ctx;
}