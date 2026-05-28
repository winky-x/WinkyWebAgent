/**
 * "Shadow-Sweep AI" - Autonomous Under-Vehicle Threat Auditor
 * Controller: ESP32-CAM (AI-Thinker)
 * Sensors & Actuators:
 *   - Sonar: HC-SR04 (Top-Facing to detect vehicle chassis)
 *     Trigger Pin -> GPIO 2 (Built-in LED will blink)
 *     Echo Pin    -> GPIO 3 (RX Pin. Note: disconnect this wire to upload!)
 *   - Motors: L298N Driver
 *     IN1, IN2 -> GPIO 14, 15 (Right Motor control)
 *     IN3, IN4 -> GPIO 13, 12 (Left Motor control)
 *   - Camera & Flash: Built-in OV2640 + GPIO 4 (Flash LED)
 *   - Switch: Built-in GPIO 0 (Flash Button / Start Trigger)
 * Note: LCD removed to free up pins for full drive and sensors.
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- PIN ASSIGNMENTS ---
#define SONAR_TRIG_PIN 2
#define SONAR_ECHO_PIN 3  // RX Pin (Disconnect for upload!)

#define MOTOR_IN1 14  // Right Forward (IN1)
#define MOTOR_IN2 15  // Right Backward (IN2)
#define MOTOR_IN3 13  // Left Forward (IN3)
#define MOTOR_IN4 12  // Left Backward (IN4)

#define FLASH_LED_PIN 4
#define START_BUTTON_PIN 1

// --- NETWORK & GATEWAY ---
const char* wifiSSID = "YOUR_WIFI_SSID";
const char* wifiPassword = "YOUR_WIFI_PASSWORD";
const char* geminiGatewayUrl = "http://YOUR_CLOUDGATEWAY_IP_OR_DOMAIN/api/analyze";

// --- OBJECTS ---
// LCD removed

// --- CAM PIN CONFIG FOR AI-THINKER ---
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// --- STATE MANAGEMENT ---
enum OperationalState {
  STATE_BOOT,
  STATE_IDLE,
  STATE_SEARCH,
  STATE_LOCK,
  STATE_ANALYSIS,
  STATE_REPORT
};

OperationalState currentTacticalState = STATE_BOOT;

void logTactical(const char* message) {
  Serial.printf("[TACTICAL LOG] %s\n", message);
}

void transitionState(OperationalState nextState) {
  currentTacticalState = nextState;
  Serial.printf("[STATE TRANSITION] Active State: %d\n", (int)currentTacticalState);
}

// Drive directives helper
void handleMotors(const char* directive, int speed = 255) {
  if (strcmp(directive, "FORWARD") == 0) {
    logTactical("Drive Command: FORWARD");
    analogWrite(MOTOR_IN1, speed);
    analogWrite(MOTOR_IN2, 0);
    analogWrite(MOTOR_IN3, speed);
    analogWrite(MOTOR_IN4, 0);
  } else if (strcmp(directive, "REVERSE") == 0) {
    logTactical("Drive Command: REVERSE");
    analogWrite(MOTOR_IN1, 0);
    analogWrite(MOTOR_IN2, speed);
    analogWrite(MOTOR_IN3, 0);
    analogWrite(MOTOR_IN4, speed);
  } else {
    logTactical("Drive Command: HALT");
    analogWrite(MOTOR_IN1, 0);
    analogWrite(MOTOR_IN2, 0);
    analogWrite(MOTOR_IN3, 0);
    analogWrite(MOTOR_IN4, 0);
  }
}

// Ultrasonic reading
float readSonarDistance() {
  digitalWrite(SONAR_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(SONAR_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(SONAR_TRIG_PIN, LOW);
  
  long pulseTime = pulseIn(SONAR_ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (pulseTime == 0) return 999.0;
  return pulseTime * 0.0343 / 2.0;
}

// Camera init routine
bool initCameraHardware() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // Set Frame Size to UXGA for detailed scans
  config.frame_size = FRAMESIZE_UXGA;
  config.jpeg_quality = 10;
  config.fb_count = 1;
  
  esp_err_t status = esp_camera_init(&config);
  if (status != ESP_OK) {
    Serial.printf("[CAMERA INIT ERROR] Code: 0x%x\n", status);
    return false;
  }
  return true;
}

// Base64 encoding helper for payload delivery
String base64Encode(uint8_t* source, size_t length) {
  static const char lookupTable[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String output = "";
  output.reserve(((length + 2) / 3) * 4);
  
  size_t idx = 0;
  while (idx < length) {
    uint32_t b1 = source[idx++];
    uint32_t b2 = (idx < length) ? source[idx++] : 0;
    uint32_t b3 = (idx < length) ? source[idx++] : 0;
    
    uint32_t merged = (b1 << 16) | (b2 << 8) | b3;
    
    output += lookupTable[(merged >> 18) & 0x3F];
    output += lookupTable[(merged >> 12) & 0x3F];
    output += (idx > length + 1) ? '=' : lookupTable[(merged >> 6) & 0x3F];
    output += (idx > length) ? '=' : lookupTable[merged & 0x3F];
  }
  return output;
}

// LCD helper functions removed

// Capture frame and consult Gemini Vision API via Cloud Gateway
String executeAuditAnalysis() {
  logTactical("Initiating active audit capture...");
  
  // Engage high-brightness flash
  digitalWrite(FLASH_LED_PIN, HIGH);
  delay(120); // Hold for exposure
  
  camera_fb_t* frameBuffer = esp_camera_fb_get();
  digitalWrite(FLASH_LED_PIN, LOW); // Retract flash
  
  if (!frameBuffer) {
    logTactical("Failed to capture chassis image.");
    return "CAPTURE FAULT";
  }
  
  logTactical("JPEG capture acquired. Encoding payload...");
  String encodedImage = base64Encode(frameBuffer->buf, frameBuffer->len);
  esp_camera_fb_return(frameBuffer);
  
  if (WiFi.status() != WL_CONNECTED) {
    logTactical("Unable to send scan: Wi-Fi offline");
    return "WIFI DOWN";
  }
  
  logTactical("Uploading image to Cloud Gateway...");
  
  HTTPClient client;
  client.begin(geminiGatewayUrl);
  client.addHeader("Content-Type", "application/json");
  
  // Frame payload body with prompt
  DynamicJsonDocument doc(JSON_OBJECT_SIZE(3) + encodedImage.length() + 300);
  doc["image"] = encodedImage;
  doc["prompt"] = "You are a military explosives expert. Analyze this vehicle undercarriage for IEDs, wires, or foreign objects. Respond in 20 characters max for an LCD screen.";
  
  String jsonBody;
  serializeJson(doc, jsonBody);
  
  int responseCode = client.POST(jsonBody);
  String resultMsg = "COMM_ERROR";
  
  if (responseCode > 0) {
    String responseBody = client.getString();
    logTactical("Server reply received.");
    Serial.println(responseBody);
    
    DynamicJsonDocument replyDoc(1024);
    DeserializationError error = deserializeJson(replyDoc, responseBody);
    if (!error) {
      resultMsg = replyDoc["analysis"].as<String>();
    } else {
      logTactical("Response decoding failed.");
      resultMsg = "DECODE_ERROR";
    }
  } else {
    Serial.printf("[HTTP FAILED] Code: %d\n", responseCode);
  }
  
  client.end();
  return resultMsg;
}

// --- INITIALIZATION & MAIN EXECUTION ---

void setup() {
  Serial.begin(115200);
  
  // Set Pin Modes
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);
  
  pinMode(SONAR_TRIG_PIN, OUTPUT);
  pinMode(SONAR_ECHO_PIN, INPUT);
  
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);
  
  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(MOTOR_IN3, OUTPUT);
  pinMode(MOTOR_IN4, OUTPUT);
  handleMotors("HALT");
  
  transitionState(STATE_BOOT);
  
  // Initialize Camera
  if (!initCameraHardware()) {
    Serial.println("[ERROR] Cam Hardware Fail!");
    while (true) { delay(1000); }
  }
  
  // Connect to Network
  WiFi.begin(wifiSSID, wifiPassword);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[SYS] Wi-Fi Link Established");
  delay(500);
  
  transitionState(STATE_IDLE);
}

void loop() {
  switch (currentTacticalState) {
    case STATE_IDLE: {
      // Look for GPIO 0 Button press
      if (digitalRead(START_BUTTON_PIN) == LOW) {
        logTactical("Launch execution initiated by button trigger.");
        delay(250); // Debounce
        transitionState(STATE_SEARCH);
      }
      break;
    }
    
    case STATE_SEARCH: {
      handleMotors("FORWARD", 150); // Slow approach speed
      float distance = readSonarDistance();
      Serial.printf("[SCANNING] Chassis distance: %.2f cm\n", distance);
      
      // If object detected directly above at target clearance range
      if (distance < 15.0) {
        logTactical("Proximity threshold reached under vehicle.");
        handleMotors("HALT");
        transitionState(STATE_LOCK);
      }
      delay(80);
      break;
    }
    
    case STATE_LOCK: {
      logTactical("Target locked. Stabilizing scan platform...");
      delay(800); // Wait for vehicle scan platform to stabilize
      transitionState(STATE_ANALYSIS);
      break;
    }
    
    case STATE_ANALYSIS: {
      logTactical("Undercarriage analysis in progress...");
      String threatAssessment = executeAuditAnalysis();
      
      logTactical("Audit Result Obtained:");
      Serial.println(threatAssessment);
      
      transitionState(STATE_REPORT);
      break;
    }
    
    case STATE_REPORT: {
      logTactical("Reporting complete. Disengaging scan zone...");
      
      // Evacuate backwards out from under carriage
      handleMotors("REVERSE", 180);
      delay(3500); // Back out for 3.5 seconds
      handleMotors("HALT");
      
      logTactical("Handoff sequence complete. Re-arming.");
      transitionState(STATE_IDLE);
      break;
    }
    
    default:
      break;
  }
  delay(10);
}
