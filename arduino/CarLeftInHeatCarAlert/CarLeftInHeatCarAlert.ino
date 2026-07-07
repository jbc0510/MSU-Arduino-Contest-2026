/* Neccessary libraries
Seeed Arduino SSCMA 1.0.3
ArduinoJson 7.4.3
DHT sensor library 1.4.7
Adafruit Unified Sensor 1.1.15
WiFiS3 ...
Adafruit_SSD1306 2.5.17
Adafruit GFX Library 1.12.6
Adafruit BusIO 1.17.4
*/

// HEADER FILES
#include <Seeed_Arduino_SSCMA.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <WiFiS3.h>
#include "arduino_secrets.h"

// GLOBAL VARIABLES

//WIFI CREDENTIALS
const char* WIFI_SSID = SECRET_SSID;
const char* WIFI_PASS = SECRET_PASS;

//PINS
const int powerSwitch = 2;
const int pressureDivider = A0;
const int temperatureSensor = 4;
const int disarmButton = 3;
const int buzzer = 7;
const int pinLED = 11;

//TRANSITION VALUES
float transitionTemperature[] = { 0, 0, 82.00, 85.00, 88.00 };
//in milliseconds
long transitionTime[] = { 0, 30000L, 60000L, 90000L, 120000L };


float temperature;
const int pressureThreshold = 900;
unsigned long elapsed = 73;
unsigned long driverLeft = 0;

//BOOLEANS
bool inAlert = false;
bool driverPresent = false;
bool childDetected = false;

//ENUMS
enum State {
  IDLE,
  STAGE1,
  STAGE2,
  STAGE3,
  STAGE4
};
const char* StateNames[] = { "Idle", "Stage 1", "Stage 2", "Stage 3", "Stage 4" };
//Initial State for the State Machine
State currentState;
State nextState;

// WiFi Connection
const int maxConnectionAttempts = 20;

//VARIABLES USED IN INTERRUPTS
volatile bool onStatus = false;
volatile bool queueDisarm = false;
volatile unsigned long lastPress = 0;
volatile unsigned long lastSwitchTime = 0;

//Initialize Classes for Component Libraries
DHT dht(temperatureSensor, DHT22);
SSCMA AI;
WiFiServer server(80);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);

// FUNCTIONS

//STATE MACHINE
void transitionState() {

  //manage time
  if (driverLeft == 0) {  //Potential bug: false alarms with the driver reset entire system
    if (!driverPresent) {//reset driverLeft with changes in driverPresent
      driverLeft = millis();
    }
    else {//redundancy
      //driverLeft = 0;
      queueDisarm = true;
    }
  } else { //driverLeft is a timestamp, driver is gone
    if (driverPresent) { //driver is present but the timer is still going
      //driverLeft = 0;
      queueDisarm = true;
    }
  }

  //manage resets
  if (queueDisarm == true) {
    queueDisarm = false;
    driverLeft = 0;
    elapsed = 0;
    nextState = State::IDLE;
  }

  if (currentState == State::IDLE && nextState != State::IDLE) {  //Entering Alert State
    inAlert = true;
    Serial.println("Enter alert");
  } else if (currentState != State::IDLE && nextState == State::IDLE) {  //Leaving Alert State
    inAlert = false;
    Serial.println("Exit alert");
  }

  //Go from current state to the pre-selected next state
  currentState = nextState;
}

void determineNextState() {
  //decide the next state based on the current state/time/temperature
  switch (currentState) {
    case State::IDLE:
      if (childDetected && elapsed >= transitionTime[1]) {
        nextState = State::STAGE1;
      }
      break;
    case State::STAGE1:
      if (childDetected && elapsed >= transitionTime[2] && temperature >= transitionTemperature[2]) { //childDetected && 
        if (temperature >= transitionTemperature[3]) {
          nextState = State::STAGE3;
        } else {
          nextState = State::STAGE2;
        }
      } else {
        nextState = State::STAGE1;
      }
      break;
    case State::STAGE2:
      if (childDetected && elapsed >= transitionTime[3] && temperature >= transitionTemperature[3]) { //childDetected && 
        nextState = State::STAGE3;
      } else {
        nextState = State::STAGE2;
      }
      break;
    case State::STAGE3:
      if (childDetected && elapsed >= transitionTime[4]) { //childDetected && 
        nextState = State::STAGE4;
      } else {
        nextState = State::STAGE3;
      }
      break;
    case State::STAGE4:
      nextState = State::STAGE4;
      break;
  }
}

void determineOutputs() {
  //Determine the outputs (LED, OLED, Sound) depending on the current state
  switch (currentState) {
    case State::IDLE:
      //Serial.println("Idle");
      analogWrite(pinLED, 0);
      noTone(buzzer);
      break;
    case State::STAGE1:
      //Serial.println("Stage 1");

      // Slow amber pulse — PWM breathe
      analogWrite(pinLED, (millis() / 8) % 255);
      tone(buzzer, 880, 200);
      break;
    case State::STAGE2:
      //Serial.println("Stage 2");
      analogWrite(pinLED, 180);
      tone(buzzer, 1047, 100);
      break;
    case State::STAGE3:
      //Serial.println("Stage 3");

      // Rapid strobe
      analogWrite(pinLED, (millis() / 80) % 2 == 0 ? 255 : 0);
      tone(buzzer, 1500, 50);
      break;
    case State::STAGE4:
      //Serial.println("Stage 4");
      analogWrite(pinLED, 255);
      tone(buzzer, 2000, 500);
      break;
  }
  updateOled();
}

// ── OLED update ───────────────────────────────────────────────────────────────
void updateOled() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);

  oled.print("SafeSeat ");
  oled.println(StateNames[currentState]);

  oled.print("IP: ");
  if (WiFi.status() == WL_CONNECTED) {
      oled.println(WiFi.localIP());
  }
  else 
  {
    oled.setTextColor(SSD1306_BLACK,SSD1306_WHITE);
    oled.println("DISCONNECTED");
  }

  oled.print("Temp: ");
  oled.print(temperature, 1);
  oled.println(" F");


  //Diagnostic displays
  if (childDetected) {
    oled.println("Child detected");
  }

  if (!driverPresent) {
    oled.println("Driver NOT detected");
  }

  if (currentState != State::IDLE) {
    oled.println();
    oled.println("!! CHILD IN VEHICLE");
  }
  oled.display();
}

// ── Create JSON string for the dashboard website ───────────────────────────────
String buildJson() {
  String j = "{";
  j += String("\"temp\":") + String(temperature, 2) + ",";
  j += String("\"driverPresent\":") + (driverPresent ? "true" : "false") + ",";
  j += String("\"childDetected\":") + (childDetected ? "true" : "false") + ",";
  j += String("\"stage\":") + String(currentState) + ",";
  j += String("\"elapsedSecs\":") + ((currentState != State::IDLE) ? ((elapsed) / 1000) : 0);
  j += "}";
  return j;
}

String readJsonObject(uint32_t timeout_ms) {
  //Read JSON data provided by the AI Camera Module
  String s = "";
  int depth = 0;
  bool started = false;
  uint32_t start = millis();
  while (millis() - start < timeout_ms) {
    while (Serial1.available()) {
      char c = Serial1.read();
      if (c == '{') {
        depth++;
        started = true;
      }
      if (started) s += c;
      if (c == '}' && --depth == 0 && started) return s;
    }
  }
  return "";
}

// ── HTTP request handler ──────────────────────────────────────────────────────
void handleClient(WiFiClient& client) {
  String req = "";
  while (client.connected() && client.available()) {
    char c = client.read();
    req += c;
    if (req.endsWith("\r\n\r\n")) break;
  }

  bool isStatus = req.indexOf("GET /status") >= 0;
  bool isAck = req.indexOf("POST /ack") >= 0;

  if (isAck) {
    queueDisarm = true;
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: text/plain");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println("ok");
    return;
  }

  if (isStatus) {
    String body = buildJson();
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.print("Content-Length: ");
    client.println(body.length());
    client.println("Connection: close");
    client.println();
    client.print(body);
    return;
  }

  client.println("HTTP/1.1 404 Not Found\r\n\r\n");
}

// Interrupts
void whenTurnedOn() {
  if (millis() - lastSwitchTime > 200) {
    onStatus = !onStatus;
    lastSwitchTime = millis();
  }
}

void onButtonPress() {
  if ((millis() - lastPress) > 50) {  //debounce
    queueDisarm = true;
    lastPress = millis();
  }
}

//MAIN FUNCTIONS
void setup() {
  // put your setup code here, to run once:

  //Serial setup
  Serial.begin(115200);
  Serial1.begin(921600);
  Serial.println("AI Module ready (raw UART)");

  // Pin Setup
  pinMode(temperatureSensor, INPUT);
  pinMode(disarmButton, INPUT_PULLUP);
  pinMode(powerSwitch, INPUT_PULLUP);
  Wire.begin();  //Setup for I2C


  //Sensor Setup
  dht.begin();
  AI.begin(&Wire);  //Begin the AI Module getting info through the I2C port
  //OLED
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 not found");
  }
  oled.clearDisplay();
  oled.display();

  //Interrupts
  attachInterrupt(digitalPinToInterrupt(disarmButton), onButtonPress, FALLING);
  onStatus = (digitalRead(powerSwitch) == LOW);

  // WiFi, not integrated yet
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int connectionAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && connectionAttempts <= maxConnectionAttempts) {
    delay(500);
    Serial.print(".");
    connectionAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());  // <── copy this into the app Settings
  }
  else {
    Serial.println("Wifi not connected, Running in Offline mode");
  }

  server.begin(); 
}

void loop() {
  // put your main code here, to run repeatedly:

  onStatus = (digitalRead(powerSwitch) == LOW);

  if (onStatus == false) {
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint > 2000) {//OFF
      Serial.println("System Sleep Mode (Switch is OFF)");
      lastPrint = millis();

      analogWrite(pinLED, 0);
      noTone(buzzer);
      oled.clearDisplay();
      if (WiFi.status() == WL_CONNECTED) {
        WiFi.end();
      }
      return;
    }
    else { //ON
      Serial.println("Sys on");
    }
  }

  if (driverLeft != 0) {
    elapsed = millis() - driverLeft;
  }
  else {
    elapsed = 0;
  }


  while (Serial1.available()) Serial1.read();  // read stale bytes over and over till they dissapear
  Serial1.print("AT+INVOKE=1,0,1\r");          // Command camera to take 1 shot, results only, NO image

  //Read the json from the module, see if it detected anything, determine if a child was detected
  bool sawResults = false;
  for (int i = 0; i < 3; i++) {  // module sends type 0 then type = 1
    String obj = readJsonObject(300);
    if (obj.length() == 0) break;
    JsonDocument doc;
    if (deserializeJson(doc, obj)) continue;
    if (doc["type"] == 1) {  // the results message
      sawResults = true;
      JsonArray boxes = doc["data"]["boxes"];
      if (boxes.size() == 0) {
        Serial.println("(no person in frame)");
        childDetected = 0;
      } else {
        childDetected = 1;
      }
      for (JsonArray b : boxes) {
        int x = b[0], y = b[1], w = b[2], h = b[3], score = b[4], target = b[5];
        Serial.print("class=");
        Serial.print(target);
        Serial.print(" score=");
        Serial.print(score);
        Serial.print(" @(");
        Serial.print(x);
        Serial.print(",");
        Serial.print(y);
        Serial.print(") ");
        Serial.print(w);
        Serial.print("x");
        Serial.println(h);
      }
    }
  }
  if (!sawResults) {
    childDetected = 0;
    Serial.println("no response");
  }

  //Detect Driver
  int pressureSensorValue = analogRead(pressureDivider);
  driverPresent = (pressureSensorValue < pressureThreshold);

  temperature = dht.readTemperature(true);  //In fahrenheit

  //State Machine
  transitionState();
  determineNextState();
  determineOutputs();

  
  // ── HTTP server ─────────────────────────────────────────────────────────────
  WiFiClient client = server.available();
  if (client) {
    handleClient(client);
    client.stop();
  } 

  //Serial.println(temperature);
  //Serial.println(elapsed);
  delay(500);
}
