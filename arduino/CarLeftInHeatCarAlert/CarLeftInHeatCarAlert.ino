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

// INTERNAL SETTINGS
#define DEBUG_MODE 1 //0 --> off, 1 --> on

#if DEBUG_MODE
  #define DEBUG_PRINTLN(x) Serial.println(x)
  #define DEBUG_PRINT(x) Serial.print(x)
#else
  #define DEBUG_PRINTLN(x)
  #define DEBUG_PRINT(x)
#endif

// GLOBAL VARIABLES

//WIFI CREDENTIALS
const char* WIFI_SSID = SECRET_SSID;
const char* WIFI_PASS = SECRET_PASS;

//PINS
//const int powerSwitch = 2;
const int pressureDivider = A0;
const int temperatureSensor = 4;
const int disarmButton = 3;
const int buzzer = 7;
const int pinLED = 11;

//TRANSITION VALUES
float transitionHeatIndex[] = { 0, 0, 77.00, 78.00, 79.00 };
//in milliseconds
long transitionTime[] = { 0, 30000L, 60000L, 90000L, 120000L };


float temperature;
float humidity;
float heatIndex;
const int pressureThreshold = 900;

unsigned long elapsed = 0; //Time since driver has left
unsigned long driverLeft = 0; //TimeSTAMP of when the driver left

//polling intervals for sensors
unsigned long cameraInterval = 1000L;//5000L;
unsigned long pressInterval = 1000L;//10000L;
unsigned long tempInterval = 1000L;//15000L;

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
bool wifiInitialized = false;
bool displayOn = false;

// tracking last sensor polling
unsigned long lastCameraCheck = 0;
unsigned long lastTempCheck = 0;
unsigned long lastPressureCheck = 0;

//Polling in Embedded Systems is a technique where the status of 
//a peripheral/IO port is checked at intervals to determine if 
//any action is needed

bool oledUpdateFlag = false;

//VARIABLES USED IN INTERRUPTS
volatile bool onStatus = false;
volatile bool queueDisarm = false;
volatile unsigned long lastPress = 0;
volatile unsigned long lastSwitchTime = 0;
volatile bool switchChanged = false;

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
    DEBUG_PRINTLN("Enter alert");
    cameraInterval = 2000L;
    pressInterval = 1000L;
    tempInterval = 1000L;
  } else if (currentState != State::IDLE && nextState == State::IDLE) {  //Leaving Alert State
    inAlert = false;
    DEBUG_PRINTLN("Exit alert");
    cameraInterval = 5000L;
    pressInterval = 10000L;    
    tempInterval = 15000L;
  }

  if (currentState != nextState) {
    //Go from current state to the pre-selected next state
    currentState = nextState;
    oledUpdateFlag = true; //State Changed
  }
}

void determineNextState() {
  //decide the next state based on the current state/time/temperature
  
  //skip to stage 4 if its too hot
  if (currentState != State::IDLE && heatIndex >= transitionHeatIndex[4]) {
      nextState = State::STAGE4;
      return;
  }

  switch (currentState) {
    case State::IDLE:
      if (!driverPresent && childDetected && elapsed >= transitionTime[1]) {
        nextState = State::STAGE1;
      }
      break;
    case State::STAGE1:
      if (!childDetected) {
        nextState = State::STAGE1;
      }
      else if (childDetected && elapsed >= transitionTime[2]) {
        if (heatIndex >= transitionHeatIndex[3]) {//excessive temperature, skipping a stage
            nextState = State::STAGE3;
          }
          else if (heatIndex >= transitionHeatIndex[2]) { //transtiton requirements fulfilled
            nextState = State::STAGE2;
          }
          //explicitly hold state
          else {
            nextState = State::STAGE1;
          }
      }
      break;
    case State::STAGE2:
      //de-escalation. bypasses time
      if (heatIndex < transitionHeatIndex[2]) {
        nextState = State::STAGE1;
      }
      //escalation
      else if (childDetected && elapsed >= transitionTime[3] && heatIndex >= transitionHeatIndex[3]) {
        nextState = State::STAGE3;
      }
      //explicitly hold state
      else {
        nextState = State::STAGE2;
      }
      break;
    case State::STAGE3:
      //de-escalation
      if (heatIndex < transitionHeatIndex[2]) {
        nextState = State::STAGE1;
      }
      else if (heatIndex < transitionHeatIndex[3]) {
        nextState = State::STAGE2;
      }
      //escalation
      else if (childDetected && elapsed >= transitionTime[4] && heatIndex >= transitionHeatIndex[4]) {
        nextState = State::STAGE4;
      }
      //explicitly hold state
      else {
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
      //DEBUG_PRINTLN("Idle");
      analogWrite(pinLED, 0);
      noTone(buzzer);
      break;
    case State::STAGE1:
      //DEBUG_PRINTLN("Stage 1");

      // Slow amber pulse — PWM breathe
      analogWrite(pinLED, (millis() / 8) % 255);
      tone(buzzer, 880, 200);
      break;
    case State::STAGE2:
      //DEBUG_PRINTLN("Stage 2");
      analogWrite(pinLED, 180);
      tone(buzzer, 1047, 100);
      break;
    case State::STAGE3:
      //DEBUG_PRINTLN("Stage 3");

      // Rapid strobe
      analogWrite(pinLED, (millis() / 80) % 2 == 0 ? 255 : 0);
      tone(buzzer, 1500, 50);
      break;
    case State::STAGE4:
      //DEBUG_PRINTLN("Stage 4");
      analogWrite(pinLED, 255);
      tone(buzzer, 2000, 500);
      break;
  }

  if (oledUpdateFlag) { 
    updateOled();
    oledUpdateFlag = false;
  }
}

// ── OLED update ───────────────────────────────────────────────────────────────
void updateOled() {
  displayOn = true;
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
  if (childDetected) oled.println("Child detected");
  if (!driverPresent) oled.println("Driver NOT detected");

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
    //IMMEDIATELY BREAK If the system is turned off
    if (!onStatus) return "";
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

void updateHeatIndex() {
  lastTempCheck = millis();
  bool flagHeatIndex = false;
  float newTemp = dht.readTemperature(true); //In fahrenheit
  float newHumidity = dht.readHumidity();

  if (abs(temperature-newTemp) >= 0.2) {
    oledUpdateFlag = true;
    temperature = newTemp;
    flagHeatIndex = true;
  }

  if (abs(humidity-newHumidity) >= 0.2) {
    oledUpdateFlag = true;
    humidity = newHumidity;
    flagHeatIndex = true;
  }

  if (flagHeatIndex) {
    heatIndex = dht.computeHeatIndex(temperature, humidity);
  }
}
// Interrupts
void whenTurnedOn() {
  if (millis() - lastSwitchTime > 150) {
    //onStatus = (digitalRead(powerSwitch) == LOW);
    lastSwitchTime = millis();
    switchChanged = true;
  }
}

void onButtonPress() {
  if ((millis() - lastPress) > 50) {  //debounce
    queueDisarm = true;
    lastPress = millis();
  }
}

void startWiFiConnection() {
  if (wifiInitialized) return;
  // WiFi, not integrated yet
  DEBUG_PRINT("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int connectionAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && connectionAttempts <= maxConnectionAttempts) {
    delay(500);
    DEBUG_PRINT(".");
    connectionAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    DEBUG_PRINTLN();
    DEBUG_PRINT("IP address: ");
    DEBUG_PRINTLN(WiFi.localIP());  // <── copy this into the app Settings
    server.begin();
    wifiInitialized = true;
  }
  else {
    DEBUG_PRINTLN("Wifi not connected, Running in Offline mode");
  } 
}

void onShutDown() { //forcefully turn off all displays etc
  analogWrite(pinLED, 0);
  noTone(buzzer);
  oled.clearDisplay();
  oled.display();
  displayOn = false;
}

//MAIN FUNCTIONS
void setup() {
  // put your setup code here, to run once:

  //Serial setup
  #if DEBUG_MODE
    Serial.begin(115200);
  #endif
  Serial1.begin(921600);
  DEBUG_PRINTLN("AI Module ready (raw UART)");

  // Pin Setup
  pinMode(temperatureSensor, INPUT);
  pinMode(disarmButton, INPUT_PULLUP);
  //pinMode(powerSwitch, INPUT_PULLUP);
  Wire.begin();  //Setup for I2C


  //Sensor Setup
  dht.begin();
  AI.begin(&Wire);  //Begin the AI Module getting info through the I2C port
  
  //OLED
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    DEBUG_PRINTLN("SSD1306 not found");
  }
  oled.clearDisplay();
  oled.display();
  oledUpdateFlag = true;

  //Interrupts
  //attachInterrupt(digitalPinToInterrupt(powerSwitch), whenTurnedOn, CHANGE);
  attachInterrupt(digitalPinToInterrupt(disarmButton), onButtonPress, FALLING);
  //onStatus = (digitalRead(powerSwitch) == LOW);

  //Initial sensor values
  temperature = dht.readTemperature(true);
  humidity = dht.readHumidity();
  heatIndex = dht.computeHeatIndex(temperature,humidity);
  onStatus = true;//(digitalRead(powerSwitch) == LOW);
  if (onStatus) {
    startWiFiConnection();
  }
}


void loop() {
  // put your main code here, to run repeatedly:

  if (switchChanged) {
    switchChanged = false; //Flag for unprocessed
    if (!onStatus) {//If the system was just switched off
      onShutDown();
    }
  }

  if (onStatus == false) {
    if (WiFi.status() == WL_CONNECTED || wifiInitialized) {
      WiFi.end();
      wifiInitialized = false;
    }

    static unsigned long lastPrint = 0; //static means the variable remembers its value over different function calls (every loop is a function call)
    if (millis() - lastPrint > 2000) {//Print to indicate that the system is off
      DEBUG_PRINTLN("System Sleep Mode (Switch is OFF)");
      lastPrint = millis();
    }

    return; //skip the rest of the loop
  }

  //assume power on because loop hasn't ended
  if (!displayOn) {//If the display is not on turn it on, the system is on now
    oled.ssd1306_command(SSD1306_DISPLAYON);
    oledUpdateFlag = true;
  }
  if (!wifiInitialized) startWiFiConnection();//if wifi is not connected, connect it

  //manage alert timing 
  if (driverLeft != 0) {
    elapsed = millis() - driverLeft;
  }
  else {
    elapsed = 0;
  }

  if (millis() - lastCameraCheck >= cameraInterval) {//If the camera has not been checked in awhile check it
    lastCameraCheck = millis();
    bool previousChildState = childDetected;

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
          DEBUG_PRINTLN(millis()/1000.0);
          DEBUG_PRINTLN("(no person in frame)");
          childDetected = false;
        } else {
          childDetected = true;
        }
        #if DEBUG_MODE
          for (JsonArray b : boxes) {
            int x = b[0], y = b[1], w = b[2], h = b[3], score = b[4], target = b[5];
            Serial.print("class="); Serial.print(target);
            Serial.print(" score="); Serial.print(score);
            Serial.print(" @("); Serial.print(x); Serial.print(","); Serial.print(y); Serial.print(") ");
            Serial.print(w); Serial.print("x"); Serial.println(h);
          }
        #endif
      }
      //Check for shutdown again cause this for loop takes a whole second (900ms)
    if (!onStatus) {
      onShutDown();
      return;
    }
    }
    if (!sawResults) {
      childDetected = false;
      DEBUG_PRINTLN("no response");
    }
    #if DEBUG_MODE 
      childDetected = true;
    #endif
    if (childDetected != previousChildState) oledUpdateFlag = true;
  }
  static int pressureSensorValue = 900;
  if (millis() - lastPressureCheck >= pressInterval) {//If the pressure sensor has not been checked in awhile check it
    //Detect Driver
    lastPressureCheck = millis();
    bool previousDriverState = driverPresent;

    pressureSensorValue = analogRead(pressureDivider);
    driverPresent = (pressureSensorValue < pressureThreshold);
    if (driverPresent != previousDriverState) oledUpdateFlag = true;
  }

  if (millis() - lastTempCheck >= tempInterval) {//If the temperature has not been checked in awhile check it
    updateHeatIndex();
  }

  //State Machine
  transitionState();
  determineNextState();
  determineOutputs();

  
  //Send data across the HTTP server
  if (wifiInitialized && WiFi.status() == WL_CONNECTED) {
    WiFiClient client = server.available();
    if (client) {
      handleClient(client);
      client.stop();
    }
  } 
  DEBUG_PRINT("pressureSensor Analog Value: ");
  DEBUG_PRINTLN(pressureSensorValue);
  DEBUG_PRINT("Heat Index: ");
  DEBUG_PRINTLN(heatIndex);
  DEBUG_PRINTLN("Time elapsed in since driver left: ");
  DEBUG_PRINTLN(elapsed);
  delay(500);
}
