import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import { AlertStage, AlertEvent, SensorData } from '../utils/theme';

// ─── Push notification helpers ───────────────────────────────────────────────
// Replace these stubs with expo-notifications or @notifee/react-native once
// you've added the package. The rest of the app does not change.

async function requestPushPermission(): Promise<boolean> {
  // TODO: await Notifications.requestPermissionsAsync()
  console.log('[push] permission requested (stub)');
  return true;
}

async function sendLocalPush(title: string, body: string): Promise<void> {
  // TODO: await Notifications.scheduleNotificationAsync({ ... })
  console.log(`[push] ${title} — ${body}`);
}

// ─── Arduino polling ──────────────────────────────────────────────────────────
// Point ARDUINO_URL at your Arduino R4's IP. The board should serve a JSON
// payload at GET /status (see arduino_sketch.ino for the payload shape).
const ARDUINO_URL = 'http://192.168.1.100/status';
const POLL_INTERVAL_MS = 2000;

async function fetchArduinoData(): Promise<SensorData | null> {
  try {
    const res = await fetch(ARDUINO_URL, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface SafeSeatState {
  sensors: SensorData;
  stage: AlertStage;
  elapsedSecs: number;
  events: AlertEvent[];
  arduinoOnline: boolean;
  acknowledge: () => void;
  simulateStage: (stage: AlertStage) => void;
}

const MOCK_SENSORS: SensorData = {
  temp: 22,
  humidity: 48,
  heatIndex: 23,
  pressure: false,
  driverPresent: true,
  childDetected: false,
  micDb: 32,
  battery: 82,
  wifiRssi: -61,
};

const CTX = createContext<SafeSeatState | null>(null);

export function SafeSeatProvider({ children }: { children: React.ReactNode }) {
  const [sensors, setSensors] = useState<SensorData>(MOCK_SENSORS);
  const [stage, setStage] = useState<AlertStage>(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [arduinoOnline, setArduinoOnline] = useState(false);

  const stageRef = useRef<AlertStage>(0);
  const elapsedRef = useRef(0);
  const alertStartRef = useRef<number | null>(null);

  // Request push permission on mount
  useEffect(() => { requestPushPermission(); }, []);

  // Poll Arduino
  useEffect(() => {
    const poll = async () => {
      const data = await fetchArduinoData();
      if (data) {
        setSensors(data);
        setArduinoOnline(true);
      } else {
        setArduinoOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Alert state machine — runs every second
  useEffect(() => {
    const tick = setInterval(() => {
      const { pressure, driverPresent, childDetected, temp, heatIndex } = sensors;
      const alertCondition = pressure && !driverPresent && childDetected;

      if (!alertCondition) {
        if (stageRef.current !== 0) {
          stageRef.current = 0;
          setStage(0);
          alertStartRef.current = null;
          elapsedRef.current = 0;
          setElapsedSecs(0);
        }
        return;
      }

      // Start timer
      if (alertStartRef.current === null) {
        alertStartRef.current = Date.now();
      }

      const elapsed = Math.floor((Date.now() - alertStartRef.current) / 1000);
      elapsedRef.current = elapsed;
      setElapsedSecs(elapsed);

      // Determine target stage
      let target: AlertStage = 1;
      if (elapsed >= 150 && heatIndex >= 38) target = 4;
      else if (elapsed >= 90) target = 3;
      else if (elapsed >= 60) target = 2;
      else target = 1;

      if (target !== stageRef.current) {
        stageRef.current = target;
        setStage(target);
        fireEvent(target, sensors);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [sensors]);

  const fireEvent = useCallback(async (s: AlertStage, data: SensorData) => {
    const messages: Record<AlertStage, string> = {
      0: 'System reset to idle.',
      1: `Child detected in vehicle — cabin ${data.temp.toFixed(1)}°C`,
      2: `Push sent to driver — cabin ${data.temp.toFixed(1)}°C, heat index ${data.heatIndex}°C`,
      3: `Full alarm active — cabin ${data.temp.toFixed(1)}°C`,
      4: `Emergency SMS dispatched — cabin ${data.temp.toFixed(1)}°C / heat index ${data.heatIndex}°C`,
    };

    const pushTitles: Partial<Record<AlertStage, string>> = {
      2: '⚠️ Child in vehicle',
      3: '🚨 ALARM — Child in vehicle',
      4: '🆘 Emergency — Child in vehicle',
    };

    if (pushTitles[s]) {
      await sendLocalPush(pushTitles[s]!, messages[s]);
    }

    const event: AlertEvent = {
      id: `${Date.now()}`,
      stage: s,
      timestamp: new Date(),
      message: messages[s],
      temp: data.temp,
      heatIndex: data.heatIndex,
      acknowledged: false,
    };

    setEvents(prev => [event, ...prev]);
  }, []);

  const acknowledge = useCallback(() => {
    setSensors(prev => ({ ...prev, driverPresent: true }));
    stageRef.current = 0;
    setStage(0);
    alertStartRef.current = null;
    elapsedRef.current = 0;
    setElapsedSecs(0);
    setEvents(prev => prev.map(e => ({ ...e, acknowledged: true })));
    fireEvent(0, sensors);
  }, [sensors, fireEvent]);

  const simulateStage = useCallback((s: AlertStage) => {
    if (s === 0) { acknowledge(); return; }

    const mockAlert: SensorData = {
      temp: s >= 3 ? 36.8 : 34.2,
      humidity: 62,
      heatIndex: s >= 4 ? 42 : s >= 3 ? 39 : 37,
      pressure: true,
      driverPresent: false,
      childDetected: true,
      micDb: s >= 3 ? 58 : 38,
      battery: 78,
      wifiRssi: -65,
    };
    setSensors(mockAlert);
    setArduinoOnline(true);

    const elapsedMap: Record<number, number> = { 1: 5, 2: 64, 3: 92, 4: 152 };
    const elapsed = elapsedMap[s] ?? 5;
    alertStartRef.current = Date.now() - elapsed * 1000;
    elapsedRef.current = elapsed;
    setElapsedSecs(elapsed);
    stageRef.current = s;
    setStage(s);
    fireEvent(s, mockAlert);
  }, [acknowledge, fireEvent]);

  return (
    <CTX.Provider value={{ sensors, stage, elapsedSecs, events, arduinoOnline, acknowledge, simulateStage }}>
      {children}
    </CTX.Provider>
  );
}

export function useSafeSeat(): SafeSeatState {
  const ctx = useContext(CTX);
  if (!ctx) throw new Error('useSafeSeat must be used within SafeSeatProvider');
  return ctx;
}
