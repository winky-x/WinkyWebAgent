/**
 * Winky AI Robot - ESP32-CAM Professional Firmware v4.0
 * Hardware: ESP32-CAM + HC-SR04 + L298N + 16x2 LCD (I2C)
 * Features: MJPEG Stream, JSON Telemetry, Sequential Kinematics, LCD Display
 */

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// --- CONFIGURATION ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- PIN MAPPING ---
// Motors (L298N)
#define MOTOR_R_IN1 13  // Right Forward (IN1)
#define MOTOR_R_IN2 15  // Right Backward (IN2)
#define MOTOR_L_IN3 2   // Left Forward (IN3)
#define MOTOR_L_IN4 3   // Left Backward (IN4) (RX Pin - Disconnect for Upload!)

// Ultrasonic (HC-SR04)
#define TRIG_PIN 12
#define ECHO_PIN 14     // CRITICAL: Moved from 16 to save the PSRAM

// LCD (I2C)
// SDA on GPIO 4 (Flash LED) | SCL on GPIO 1 (TX Pin)
#define I2C_SDA 4
#define I2C_SCL 1

// PWM Channels
#define CH_RF 0
#define CH_RB 1
#define CH_LF 2
#define CH_LB 3
#define PWM_FREQ 5000
#define PWM_RES 8

// --- OBJECTS ---
LiquidCrystal_I2C lcd(0x27, 16, 2); 
httpd_handle_t camera_httpd = NULL;
httpd_handle_t control_httpd = NULL;

// --- STATE ---
float currentDistance = 0;
String lastSpoken = "Winky Ready";
String currentEmotion = "Neutral";

// --- CAMERA PIN MAPPING (AI-THINKER) ---
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

// --- SENSORS & ACTUATORS ---

void updateLCD() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("[" + currentEmotion + "]");
  lcd.setCursor(0, 1);
  lcd.print(lastSpoken.substring(0, 16));
}

float getDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout (~5m)
  return duration * 0.034 / 2;
}

void driveMotors(int rf, int rb, int lf, int lb) {
  ledcWrite(CH_RF, rf);
  ledcWrite(CH_RB, rb);
  ledcWrite(CH_LF, lf);
  ledcWrite(CH_LB, lb);
}

// --- HTTP HANDLERS ---

esp_err_t status_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  currentDistance = getDistance();
  char json[256]; // Increased for safety
  snprintf(json, sizeof(json), "{\"online\":true, \"distance_cm\":%.1f, \"emotion\":\"%s\", \"last_spoken\":\"%s\"}", 
           currentDistance, currentEmotion.c_str(), lastSpoken.c_str());
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, json, -1);
}

esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  char * part_buf[64];

  httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=123456789000000000000987654321");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) { res = ESP_FAIL; } 
    else {
      size_t hlen = snprintf((char *)part_buf, 64, "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, "\r\n--123456789000000000000987654321\r\n", 35);
      esp_camera_fb_return(fb);
    }
    if (res != ESP_OK) break;
  }
  return res;
}

esp_err_t api_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  char buf[256]; 
  int speed = 180;
  int duration = 500;
  bool updateDisplay = false;
  
  if (httpd_req_get_url_query_str(req, buf, sizeof(buf)) == ESP_OK) {
    char val[64];
    if (httpd_query_key_value(buf, "speed", val, sizeof(val)) == ESP_OK) speed = atoi(val);
    if (httpd_query_key_value(buf, "duration_ms", val, sizeof(val)) == ESP_OK) duration = atoi(val);
    
    // Support updating LCD state via API
    if (httpd_query_key_value(buf, "emotion", val, sizeof(val)) == ESP_OK) {
      currentEmotion = String(val);
      updateDisplay = true;
    }
    if (httpd_query_key_value(buf, "say", val, sizeof(val)) == ESP_OK) {
      lastSpoken = String(val);
      updateDisplay = true;
    }
  }

  if (updateDisplay) updateLCD();

  const char* uri = req->uri;
  if (strstr(uri, "/forward")) driveMotors(speed, 0, speed, 0);
  else if (strstr(uri, "/backward")) driveMotors(0, speed, 0, speed);
  else if (strstr(uri, "/left")) driveMotors(speed, 0, 0, speed); // Pivot Left
  else if (strstr(uri, "/right")) driveMotors(0, speed, speed, 0); // Pivot Right
  else if (strstr(uri, "/stop")) driveMotors(0, 0, 0, 0);
  
  if (duration > 0 && !strstr(uri, "/stop")) {
    delay(duration);
    driveMotors(0, 0, 0, 0);
  }

  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, "{\"status\":\"ok\"}", -1);
}

// --- SETUP & LOOP ---

void setup() {
  // NOTE: Serial uses GPIO 1 (TX). Since LCD SCL is also on GPIO 1, 
  // Serial prints may flicker the LCD or cause I2C errors.
  Serial.begin(115200); 
  
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();
  updateLCD(); // Show initial state

  // Motor PWM Setup
  ledcSetup(CH_RF, PWM_FREQ, PWM_RES); ledcAttachPin(MOTOR_R_IN1, CH_RF);
  ledcSetup(CH_RB, PWM_FREQ, PWM_RES); ledcAttachPin(MOTOR_R_IN2, CH_RB);
  ledcSetup(CH_LF, PWM_FREQ, PWM_RES); ledcAttachPin(MOTOR_L_IN3, CH_LF);
  ledcSetup(CH_LB, PWM_FREQ, PWM_RES); ledcAttachPin(MOTOR_L_IN4, CH_LB);
  driveMotors(0, 0, 0, 0);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Camera Setup
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM; config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM; config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_PSRAM;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    lcd.clear();
    lcd.print("Cam Init Fail");
    return;
  }
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    // Minimal serial usage to avoid LCD interference
    if (Serial) Serial.print("."); 
  }
  
  httpd_config_t server_config = HTTPD_DEFAULT_CONFIG();
  server_config.server_port = 80;

  if (httpd_start(&camera_httpd, &server_config) == ESP_OK) {
    httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
    httpd_register_uri_handler(camera_httpd, &stream_uri);
    httpd_uri_t status_uri = { .uri = "/api/status", .method = HTTP_GET, .handler = status_handler, .user_ctx = NULL };
    httpd_register_uri_handler(camera_httpd, &status_uri);
    httpd_uri_t api_uri = { .uri = "/api/*", .method = HTTP_GET, .handler = api_handler, .user_ctx = NULL };
    httpd_register_uri_handler(camera_httpd, &api_uri);
  }

  lcd.clear();
  lcd.print("Winky Online!");
  lcd.setCursor(0, 1);
  lcd.print(WiFi.localIP());
}

void loop() {
  // Obstacle Avoidance Logic (Safety Override)
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 100) {
    currentDistance = getDistance();
    if (currentDistance > 0 && currentDistance < 15) {
      driveMotors(0, 0, 0, 0); // Hard Stop
    }
    lastCheck = millis();
  }
  delay(1);
}
