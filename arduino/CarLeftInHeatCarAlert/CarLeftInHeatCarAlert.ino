/* Neccessary libraries
Seeed Arduino SSCMA 1.0.3
ArduinoJson 7.4.3
DHT sensor library 1.4.7
Adafruit Unified Sensor 1.1.15
WiFiS3 ...
Adafruit_SSD1306 ...
*/

// HEADER FILES
#include <Seeed_Arduino_SSCMA.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <WiFiS3.h>


// GLOBAL VARIABLES

//WIFI CREDENTIALS
const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASSWORD";

//PINS
const int powerSwitch = 4;
const int pressureDivider = A0;
const int temperatureSensor = 2;
const int disarmButton = 3;

//TRANSITION VALUES
float STAGE2RANGE[] = {80.00,81.00}; 
float STAGE3TEMP = 81.50;
const int pressureThreshold = 300;
long elapsed;
long alertStart;

//BOOLS
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

//Initial State for the State Machine
State currentState;
State nextState;

float temperature;

//Initialize Libraries/Parts or whatever
DHT dht(temperatureSensor,DHT22);
SSCMA AI;
WiFiServer server(80);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);

// FUNCTIONS

//STATE MACHINE
void transitionState() {
  currentState = nextState;
}

void determineNextState() {
  switch(currentState) {
    case State::IDLE:
      //if detect baby but not detect driver then
      nextState = State::STAGE1;
      break;
    case State::STAGE1:
      //if still detect baby but not detect driver then
      if (temperature >= STAGE2RANGE[0]) {
        if (temperature >= STAGE2RANGE[1]) {
          nextState = State::STAGE3;//QUESTION: range is irrelevant if the temp jumps past it,
        }                           //here i have it just skip stages but is that the functionality
        else {                      //that we want?
          nextState = State::STAGE2;
        }
      }
      else {
        nextState = State::STAGE1;
      }
      break;
    case State::STAGE2:
      //if still detect baby but not detect driver then
      if (temperature >= STAGE3TEMP) {
        nextState = State::STAGE3;
      }
      else {
        nextState = State::STAGE2;
      }
      break;
    case State::STAGE3:
      //if still detect baby but not detect driver then
      nextState = State::STAGE4;
      break;
    case State::STAGE4:
      //if still detect baby but not detect driver then
      nextState = State::IDLE;
      break;
  }
  if (digitalRead(disarmButton) == LOW) {
    nextState = State::IDLE;
  }
}

void determineOutputs() {
  // all the warning stuff would go here
  switch(currentState) {
    case State::IDLE:
      Serial.println("Idle");
      break;
    case State::STAGE1:
      Serial.println("Stage 1");
      break;
    case State::STAGE2:
      Serial.println("Stage 2");
      break;
    case State::STAGE3:
      Serial.println("Stage 3");
      break;
    case State::STAGE4:
      Serial.println("Stage 4");
      break;
  }
  updateOled()
}


// ── OLED update ───────────────────────────────────────────────────────────────
void updateOled() {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.print("SafeSeat  Stage ");
  oled.println(currentState);
  oled.print("Temp: ");
  oled.print(tempC, 1);
  oled.println(" C");
  oled.print("HI:   ");
  oled.print(heatIndex, 1);
  oled.println(" C");
  if (currentState != State::IDLE) {
    oled.println();
    oled.println("!! CHILD IN VEHICLE");
  }
  oled.display();
}

// ── LED + buzzer per stage ────────────────────────────────────────────────────
void updateOutputs() {
  switch (currentState) {
    case State::IDLE:
      analogWrite(PIN_LED, 0);
      noTone(PIN_BUZZER);
      break;
    case State::STAGE1:
      // Slow amber pulse — PWM breathe
      analogWrite(PIN_LED, (millis() / 8) % 255);
      tone(PIN_BUZZER, 880, 200);
      break;
    case State::STAGE2:
      analogWrite(PIN_LED, 180);
      tone(PIN_BUZZER, 1047, 100);
      break;
    case State::STAGE3:
      // Rapid strobe
      analogWrite(PIN_LED, (millis() / 80) % 2 == 0 ? 255 : 0);
      tone(PIN_BUZZER, 1500, 50);
      break;
    case State::STAGE4:
      analogWrite(PIN_LED, 255);
      tone(PIN_BUZZER, 2000, 500);
      break;
  }
}


// ── JSON payload ──────────────────────────────────────────────────────────────
String buildJson() {
  String j = "{";
  j += "\"temp\":"          + String(temperature, 2)      + ",";
  j += "\"driverPresent\":" + (driverPresent ? "true" : "false") + ",";
  j += "\"childDetected\":" + (childDetected ? "true" : "false") + ",";
  j += "\"stage\":"         + String(currentState)     + ",";
  j += "\"elapsedSecs\":"   + String((currentState != State::IDLE) ? ((millis() - alertStart) / 1000 : 0));
  j += "}";
  return j;
}

String readJsonObject(uint32_t timeout_ms) {
  String s = ""; int depth = 0; bool started = false;
  uint32_t start = millis();
  while (millis() - start < timeout_ms) {
    while (Serial1.available()) {
      char c = Serial1.read();
      if (c == '{') { depth++; started = true; }
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
  bool isAck    = req.indexOf("POST /ack")   >= 0;

  if (isAck) {
    currentState    = State::IDLE;
    //driverPresent = true; dont really want to force driver present on reset
    client.println("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nok");
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

bool detectBaby() {

}
//MAIN FUNCTIONS
void setup() {
  // put your setup code here, to run once:
  
  //Serial setup
  Serial.begin(115200);
  Serial1.begin(921600);
  Serial.println("Vision AI ready (raw UART)");

  // Pin Setup
  pinMode(temperatureSensor, INPUT);
  pinMode(disarmButton, INPUT_PULLUP);
  Wire.begin(); //Setup for I2C


  //Sensor Setup
  dht.begin();
  AI.begin(&Wire); //Begin the AI Module getting info through the I2C port
  //OLED
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 not found");
  }
  oled.clearDisplay();
  oled.display();

  // WiFi
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());  // <── copy this into the app Settings

  server.begin();
}

void loop() {
  // put your main code here, to run repeatedly:

  while (Serial1.available()) Serial1.read();   // read stale bytes over and over till they dissapear
  Serial1.print("AT+INVOKE=1,0,1\r");           // Command camera to take 1 shot, results only, NO image

  //Camera test
  bool sawResults = false;
  for (int i = 0; i < 3; i++) {                 // module sends type 0 then type 1
    String obj = readJsonObject(300);
    if (obj.length() == 0) break;
    JsonDocument doc;
    if (deserializeJson(doc, obj)) continue;
    if (doc["type"] == 1) {                      // the results message
      sawResults = true;
      JsonArray boxes = doc["data"]["boxes"];
      if (boxes.size() == 0) { Serial.println("(no person in frame)"); }
      for (JsonArray b : boxes) {
        int x=b[0], y=b[1], w=b[2], h=b[3], score=b[4], target=b[5];
        Serial.print("class="); Serial.print(target);
        Serial.print(" score="); Serial.print(score);
        Serial.print(" @("); Serial.print(x); Serial.print(",");
        Serial.print(y); Serial.print(") ");
        Serial.print(w); Serial.print("x"); Serial.println(h);
      }
    }
  }
  if (!sawResults) Serial.println("no response");


  temperature = dht.readTemperature(true); //In fahrenheit
  
  /*
  int fsrRaw  = analogRead(PIN_FSR);
  seatOccupied  = fsrRaw > FSR_THRESHOLD;
  driverPresent = digitalRead(PIN_PIR) == HIGH;
  */

  //State Machine
  determineNextState();
  determineOutputs();
  transitionState();

  int pressureSensorValue = analogRead(pressureDivider);
  driverPresent = (pressureSensorValue > pressureThreshold);
  childDetected = driverPresent; //shortcut until AI Module is up

  // ── HTTP server ─────────────────────────────────────────────────────────────
  WiFiClient client = server.available();
  if (client) {
    handleClient(client);
    client.stop();
  }

  Serial.println(temperature);
  delay(500);
}
