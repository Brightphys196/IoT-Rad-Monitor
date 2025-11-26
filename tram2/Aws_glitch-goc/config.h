#pragma once // Ngăn việc include file này nhiều lần

// =================================================================
//                      THƯ VIỆN
// =================================================================
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <EEPROM.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "secrets.h"

// =================================================================
//                      CẤU HÌNH HẰNG SỐ
// =================================================================
// Cảm biến
#define DHT11_PIN D3
#define DHT_TYPE DHT11
#define GEIGER_PIN D5
#define GEIGER_CONVERSION_FACTOR 151.0f // Hệ số chuyển đổi CPM sang uSv/h

// Mạng & AWS
#define AWS_IOT_PUBLISH_TOPIC   "/tram/pub"
#define AWS_IOT_SUBSCRIBE_TOPIC "/tram/sub"
#define NTP_SERVER "vn.pool.ntp.org"
#define TIMEZONE_OFFSET_SECONDS (7 * 3600) // UTC+7

// Hiển thị
#define LCD_ADDRESS 0x27
#define LCD_COLS 16
#define LCD_ROWS 2

// Thời gian
#define PUBLISH_INTERVAL_MS 7000 // Gửi dữ liệu mỗi 7 giây

// =================================================================
//                      KHAI BÁO BIẾN & ĐỐI TƯỢNG TOÀN CỤC
// =================================================================
// Mạng & AWS
WiFiUDP ntpUDP;
WiFiClientSecure net;
NTPClient timeClient(ntpUDP, NTP_SERVER, TIMEZONE_OFFSET_SECONDS);
BearSSL::X509List cert(AWS_CERT_CA);
BearSSL::X509List client_crt(AWS_CERT_CRT);
BearSSL::PrivateKey key(AWS_CERT_PRIVATE);
PubSubClient client(net);

// Cảm biến
DHT HT(DHT11_PIN, DHT_TYPE);
volatile unsigned long geiger_counts = 0;
float uSv = 0;
float cps = 0;
float humi = 0;
float tempC = 0;

// Hiển thị
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);

// Trạng thái & Điều khiển
const char* statusStation = "Tram";
String address = "227 - Nguyen Van Cu";
unsigned long lastPublishMillis = 0;

// Các hàm sẽ được định nghĩa ở các file khác
void initSerial();
void initEEPROM();
void initSensors();
void initDisplay();
void connectWiFi();
void initOTA();
void connectAWS();
void handleOTA();
void handleSensors();
void handleDisplay();
void handleAWS();