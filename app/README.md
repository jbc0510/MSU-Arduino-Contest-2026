# SafeSeat — React Native App

Child-in-vehicle monitoring dashboard with push notifications for the Arduino Uno R4 WiFi system.

## Quick start

```bash
npm install
npx expo start
# Press 'i' for iOS simulator, 'a' for Android
```

## Project structure

```
App.tsx                     → Root: navigation + providers
src/
  hooks/useSafeSeat.ts      → Central state: sensors, alert stage, event log
  screens/DashboardScreen.tsx → Main monitoring view
  screens/AlertsScreen.tsx    → Notification log + escalation timeline
  screens/SettingsScreen.tsx  → Device config, emergency contact, Twilio
  utils/theme.ts             → Colors, spacing, stage metadata
safeseat_arduino.ino         → Arduino R4 firmware
```

## Connecting to the Arduino R4

1. Flash `safeseat_arduino.ino` via Arduino IDE (Board: Arduino Uno R4 WiFi)
2. Set your WiFi SSID + password in the sketch
3. Open Serial Monitor — copy the printed IP address
4. In the app → Settings → enter that IP under "Device IP address"

The Arduino serves `GET /status` as JSON on port 80. The app polls every 2 s.

**JSON shape:**
```json
{
  "temp": 34.2,
  "humidity": 62,
  "heatIndex": 38.1,
  "pressure": true,
  "driverPresent": false,
  "childDetected": true,
  "stage": 2,
  "elapsedSecs": 64
}
```

## Push notifications

Push stubs are in `src/hooks/useSafeSeat.ts` under `requestPushPermission` and `sendLocalPush`. To activate:

**Option A — Expo Notifications (easiest):**
```bash
npx expo install expo-notifications
```
Then replace the stubs with:
```ts
import * as Notifications from 'expo-notifications';
async function requestPushPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}
async function sendLocalPush(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}
```

**Option B — Notifee (more control, native channels):**
```bash
npm install @notifee/react-native
npx pod-install  # iOS
```

## Twilio SMS (Stage 4)

The Arduino sketch calls the Twilio REST API directly over WiFi.
Add your credentials to the sketch (`TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`, `EMERGENCY_TO`)
and uncomment the `sendTwilioSms()` function in the `.ino` file.

Alternatively, have the Arduino POST to a small server and send SMS from there —
this keeps credentials off the microcontroller.

## Arduino library dependencies

Install via Arduino Library Manager:
- Adafruit BME280 Library
- Adafruit SSD1306
- Adafruit GFX Library
- WiFiS3 (comes with Arduino R4 board package)
