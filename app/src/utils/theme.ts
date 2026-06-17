export const COLORS = {
  bg: '#eef2f9',
  surface: '#ffffff',
  card: '#ffffff',
  border: '#e7ebf3',
  borderLight: '#eef1f7',

  text: '#1c2333',
  textSec: '#6b7280',
  muted: '#9aa3b2',

  teal: '#1ca97e',
  tealDim: '#e6f6ee',
  tealText: '#1ca97e',

  amber: '#e0a32a',
  amberDim: '#fdf3e0',
  amberText: '#9a6b0e',

  coral: '#e0703a',
  coralDim: '#fdece3',
  coralText: '#b14d20',

  red: '#e15555',
  redDim: '#fdebeb',
  redText: '#c23a3a',

  blue: '#4f86e8',
  blueDim: '#eaf1fd',
  blueText: '#3868c4',

  // brand accents from the reference design
  shieldBlue: '#4f86e8',
  shieldBlueDim: '#e8f0fd',
  purple: '#7c6fe0',
  purpleDim: '#f1eefb',
  mint: '#dff5ec',
  peach: '#fdeed9',
  pink: '#fde6e6',
};

export const FONT = {
  mono: 'Courier New',
  sans: 'System',
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export type AlertStage = 0 | 1 | 2 | 3 | 4;

export interface SensorData {
  temp: number;       // °C
  humidity: number;   // %
  heatIndex: number;  // °C feels-like
  pressure: boolean;  // seat occupied
  driverPresent: boolean;
  childDetected: boolean;
}

export interface AlertEvent {
  id: string;
  stage: AlertStage;
  timestamp: Date;
  message: string;
  temp: number;
  heatIndex: number;
  acknowledged: boolean;
}

export const STAGE_META: Record<AlertStage, {
  label: string;
  sublabel: string;
  color: string;
  dimColor: string;
  textColor: string;
  triggerSecs: number | null;
}> = {
  0: {
    label: 'Idle',
    sublabel: 'All clear',
    color: COLORS.teal,
    dimColor: COLORS.tealDim,
    textColor: COLORS.tealText,
    triggerSecs: null,
  },
  1: {
    label: 'Stage 1',
    sublabel: 'Local alert — OLED + LEDs + chime',
    color: COLORS.amber,
    dimColor: COLORS.amberDim,
    textColor: COLORS.amberText,
    triggerSecs: 0,
  },
  2: {
    label: 'Stage 2',
    sublabel: 'Push notification sent to driver',
    color: COLORS.blue,
    dimColor: COLORS.blueDim,
    textColor: COLORS.blueText,
    triggerSecs: 60,
  },
  3: {
    label: 'Stage 3',
    sublabel: 'Full alarm — siren + strobe LEDs',
    color: COLORS.coral,
    dimColor: COLORS.coralDim,
    textColor: COLORS.coralText,
    triggerSecs: 90,
  },
  4: {
    label: 'Stage 4',
    sublabel: 'Emergency SMS dispatched via Twilio',
    color: COLORS.red,
    dimColor: COLORS.redDim,
    textColor: COLORS.redText,
    triggerSecs: 150,
  },
};
