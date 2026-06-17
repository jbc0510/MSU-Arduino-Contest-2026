/* Neccessary libraries
Seeed Arduino SSCMA 1.0.3
ArduinoJson 7.4.3
DHT sensor library 1.4.7
Adafruit Unified Sensor 1.1.15
*/

// HEADER FILES
#include <Seeed_Arduino_SSCMA.h>
#include <DHT.h>
#include <Wire.h>

// GLOBAL VARIABLES

// PINS
const int powerSwitch = 4;
const int pressureDivider = A0;
const int temperatureSensor = 2;

//TRANSITION VALUES
float STAGE2RANGE[] = {80.00,81.00}; 
float STAGE3TEMP = 81.50;

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


// FUNCTIONS

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
}

bool detectBaby() {

}
//MAIN FUNCTIONS
void setup() {
  // put your setup code here, to run once:
  // Pin Setup
  pinMode(temperatureSensor, INPUT);
  Wire.begin(); //Setup for I2C

  //Serial setup
  Serial.begin(9600);

  //Sensor Setup
  dht.begin();
  AI.begin(&Wire); //Begin the AI Module getting info through the I2C port
}

void loop() {
  // put your main code here, to run repeatedly:

  temperature = dht.readTemperature(true); //In fahrenheit
  
  determineNextState();
  determineOutputs();
  transitionState();

  Serial.println(temperature);
  delay(2500);
}
