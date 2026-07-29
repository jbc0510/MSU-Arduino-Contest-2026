# SafeSeat — React Native App

Child-in-vehicle heatstroke prevention and alert dashboard built for the **MSU Arduino Contest 2026**.

SafeSeat monitors vehicle cabin conditions, driver presence, and child occupancy via an Arduino Uno R4 WiFi and Edge AI vision sensor. It manages multi-stage alert escalations with real-time local push notifications and emergency SMS dispatches powered by **Vonage**.

---

## System Architecture & Hardware Stack

* **Microcontroller:** Arduino Uno R4 WiFi (serves HTTP status endpoint & handles hardware sensors)
* **Edge AI Module:** Grove Vision AI Module V2 + OV5647 Camera Sensor (runs local object detection model for occupant sensing via UART/SSCMA)
* **Mobile App:** Expo / React Native (TypeScript)
* **Backend Relay Server:** Node.js / Express (relays emergency SMS dispatches via **Vonage SMS API**)

---

## Quick Start

### 1. Prerequisites & Node Environment

If you are using `nodeenv` to manage your local Node.js environment:

```bash
# Install nodeenv via pip
pip install nodeenv

# Create and activate environment
nodeenv venv
./venv/Scripts/activate  # Windows (Bash/CMD) or source venv/bin/activate on Unix

# Navigate to the app directory
cd app

```

### 2. Environment Variables Configuration

#### Mobile App Environment (`/app/.env`)

Create a `.env` file inside the `/app` folder:

```env
EXPO_PUBLIC_ARDUINO_IP={the IP expected from the Arduino} //serves as a default, can be overwritten by user input in the app
EXPO_PUBLIC_SMS_SERVER_URL={Your devices IPV4 address}:5000
EXPO_PUBLIC_EMERGENCY_PHONE={The phone number to text} //FORMAT: +1{ten digit number with no spaces}

```

#### Backend Server Environment (`/server/.env`)

Create a `.env` file inside the `/server` folder (run `ipconfig` on Windows or `ifconfig` on Unix to find your local IPv4 address):

```env
VONAGE_API_KEY=your_vonage_api_key
VONAGE_API_SECRET=your_vonage_api_secret
VONAGE_PHONE_NUMBER=+1{number_provided_by_vonage}
EXPO_PUBLIC_EMERGENCY_PHONE=+1{someones_number}
PORT=5000

```

### 3. Start the Vonage SMS Express Server

The app routes Stage 4 emergency alerts through a local Express relay server to keep API credentials secure off the client and dispatch texts via Vonage.

```bash
# Open a separate terminal
cd server
npm install
node server.js

```

### 4. Run the Expo App

```bash
cd app
npm install
npx expo start -c --tunnel

```

---

## Project Structure

```text
app/
  App.tsx                       → Application root (providers & layout)
  src/
    hooks/useSafeSeat.tsx       → Core state manager: polling, alert stage engine, push & SMS triggers
    screens/DashboardScreen.tsx → Real-time telemetry, temp gauge, & occupant status
    screens/AlertsScreen.tsx    → Historical event log & multi-stage escalation timeline
    screens/SettingsScreen.tsx  → Device IP configuration, emergency contacts, & diagnostic tests
    utils/theme.ts              → UI themes, typography, and alert stage metadata definitions
server/
  server.js                     → Express relay server for Vonage SMS dispatches
arduino/
  CarLeftInHeatCarAlert.ino     → Arduino Uno R4 firmware & HTTP server (`/status`, `/ack`)
  arduino_secrets.h             → WiFi SSID & Password definitions (Git ignored)
README.md                       → Project README

```


---

## Connecting to the Hardware

### 1. Arduino Secrets & Libraries Setup

Create a file named `arduino_secrets.h` inside the `arduino/` directory alongside `CarLeftInHeatCarAlert.ino`:

```cpp
#ifndef ARDUINO_SECRETS_H
#define ARDUINO_SECRETS_H

#define SECRET_SSID "YOUR_WIFI_NAME_HERE"
#define SECRET_PASS "YOUR_WIFI_PASSWORD_HERE"

#endif

```

**IMPORTANT: ** The Arduino, the device hosting the expo app & express server, and the mobile device running the app must all be on the same network

#### Arduino Library Dependencies

Install the exact versions of the following libraries via the Arduino Library Manager:

* **Seeed Arduino SSCMA** (v1.0.3)
* **ArduinoJson** (v7.4.3)
* **DHT sensor library** (v1.4.7)
* **Adafruit Unified Sensor** (v1.1.15)
* **WiFiS3** (Included with Arduino R4 board package)
* **Adafruit SSD1306** (v2.5.17)
* **Adafruit GFX Library** (v1.12.6)
* **Adafruit BusIO** (v1.17.4)

### 2. Flashing the Arduino

1. Flash `CarLeftInHeatCarAlert.ino` onto the **Arduino Uno R4 WiFi** using the Arduino IDE.
2. Connect the **Grove Vision AI Module V2** (OV5647 sensor) to `Serial1` on the Arduino for SSCMA UART person detection (`AT+INVOKE=1,0,1`).
3. Open the Serial Monitor after flashing to obtain the assigned IP address (or read it from the onboard OLED display).
4. In the SafeSeat App: Go to **Settings** → enter the IP address under **Device IP address** (or pre-set `EXPO_PUBLIC_ARDUINO_IP` in `/app/.env`).

### API Endpoints (Arduino)

* `GET /status`: Polled every 2 seconds by the React Native app.
* `POST /ack`: Disarms the state machine back to IDLE and silences alerts.

**JSON Payload (`GET /status`):**

```json
{
  "temp": 93.50,
  "heatIndex": 95.10,
  "driverPresent": false,
  "childDetected": true,
  "stage": 2,
  "elapsedSecs": 64
}

```

---

## Alert Escalation & Push Notifications

Foreground push notifications are configured via `expo-notifications`.

* **Stage 0 (Idle):** Normal state.
* **Stage 1 (Detection):** Occupant detected; monitoring cabin environment.
* **Stage 2 (Warning):** Local push notification dispatched to driver (`⚠️ Child in vehicle`).
* **Stage 3 (Full Alarm):** High priority push notification dispatched (`🚨 ALARM — Child in vehicle`).
* **Stage 4 (Emergency):** High priority push notification + **Emergency SMS** dispatched via Node.js server using **Vonage**.

---

## Emergency SMS Relay Server (Stage 4)

Stage 4 triggers a `POST` request to the local Express server defined in `EXPO_PUBLIC_SMS_SERVER_URL`. The server dispatches the emergency SMS to the configured emergency phone number using Vonage.

**Relay Payload (`POST /send-alert`):**

```json
{
  "phoneNumber": "+1XXXXXXXXXX",
  "message": " SafeSeat EMERGENCY: Child left alone in vehicle. Cabin temp 98.2°F. Immediate action required."
}

```
