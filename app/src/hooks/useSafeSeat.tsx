import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { AlertStage, AlertEvent, SensorData } from '../utils/theme';

// ─── Push notification helpers ───────────────────────────────────────────────
async function requestPushPermission(): Promise<boolean> {
  console.log('[push] permission requested (stub)');
  return true;
}

async function sendLocalPush(title: string, body: string): Promise<void> {
  console.log(`[push] ${title} — ${body}`);
}

// ─── Arduino polling ──────────────────────────────────────────────────────────
async function fetchArduinoData(ip: string): Promise<SensorData | null> {
  try {
    const url = `http://${ip}/status`;
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
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
  arduinoIp: string;
  setArduinoIp: (ip: string) => void;
  acknowledge: () => void;
  simulateStage: (stage: AlertStage) => void;
}

const MOCK_SENSORS: SensorData = {
  temp: 72, // Default to matching room-temp Fahrenheit 
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

  // Hidden repository backup variable setup
  const defaultIp = process.env.EXPO_PUBLIC_ARDUINO_IP || '127.0.0.1';
  const [arduinoIp, setArduinoIp] = useState(defaultIp);

  const stageRef = useRef<AlertStage>(0);
  const alertStartRef = useRef<number | null>(null);

  useEffect(() => { requestPushPermission(); }, []);

  // Poll Arduino
  useEffect(() => {
    const poll = async () => {
      const data = await fetchArduinoData(arduinoIp);
      if (data) {
        setSensors(data);
        setArduinoOnline(true);

        // Read alert stage directly from the incoming Arduino property
        if (data.stage !== undefined && data.stage !== stageRef.current) {
          const hardwareStage = data.stage as AlertStage;
          setStage(hardwareStage);
          stageRef.current = hardwareStage;
          fireEvent(hardwareStage, data);
        }

        // Read elapsed counter right from the hardware data output clock
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
    // Corrected labels to °F to properly align with dht.readTemperature(true)
    const messages: Record<AlertStage, string> = {
      0: 'System reset to idle.',
      1: `Child detected in vehicle — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      2: `Push sent to driver — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      3: `Full alarm active — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
      4: `Emergency SMS dispatched — cabin ${data.temp?.toFixed(1) ?? 0}°F`,
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

  const acknowledge = useCallback(async () => {
    // 1. Send the network command directly to your physical hardware via WiFi
    try {
      const url = `http://${arduinoIp}/ack`;
      await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(2000) // Don't block the UI if request lags
      });
      console.log('[hardware] Reset command dispatched safely.');
    } catch (error) {
      console.log('[hardware] Failed to dispatch remote reset command:', error);
    }

    // 2. Clear out local state properties immediately so the UI responds without lag
    setSensors(prev => ({ ...prev, driverPresent: true }));
    stageRef.current = 0;
    setStage(0);
    setElapsedSecs(0);
    setEvents(prev => prev.map(e => ({ ...e, acknowledged: true })));
    fireEvent(0, sensors);
  }, [arduinoIp, sensors, fireEvent]);

  const simulateStage = useCallback((s: AlertStage) => {
    if (s === 0) { acknowledge(); return; }

    const mockAlert: SensorData = {
      temp: s >= 3 ? 98.2 : 93.5, // Mocked values adjusted to Fahrenheit standards
      humidity: 0,
      heatIndex: 0,
      elapsedSecs: 0,
      stage: 0,
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