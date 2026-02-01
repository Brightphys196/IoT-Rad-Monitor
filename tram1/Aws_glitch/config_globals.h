#pragma once

// THƯ VIỆN
#include "DHT.h"
#include "secrets.h"
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <ESP8266mDNS.h>
#include <LiquidCrystal_I2C.h>
#include <NTPClient.h>
#include <PubSubClient.h>
#include <SD.h>
#include <SPI.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <math.h>
#include <stdint.h>
#include <time.h>


// ĐỊNH NGHĨA
#define OLED_SCL 12
#define OLED_SDA 14
#define DHT11Pin 13
#define DHTType DHT11
#define PIN_TICK 5
#define AWS_IOT_PUBLISH_TOPIC "/tram4/pub"
#define AWS_IOT_SUBSCRIBE_TOPIC "/tram4/sub"
#define AWS_IOT_CONTROL_TOPIC "station/station_04/control"
#define STATION_ID "station_04"

// KHAI BÁO ĐỐI TƯỢNG VÀ BIẾN TOÀN CỤC
DHT HT(DHT11Pin, DHTType);
LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiUDP ntpUDP;
WiFiClientSecure net;
NTPClient timeClient(ntpUDP, "vn.pool.ntp.org");
static float humi = 0;
static float tempC = 0;
static long timeTick = 0;
const char *statusStation = "Tram";
int addr = 0;
static volatile unsigned long counts = 0;
static float uSv;
static float cps = 0;
static unsigned long int timeCount_present;
static unsigned long int count_present;
static unsigned long int timeCount_prev = 0;
static unsigned long int count_prev = 0;
static String address = "227 - Nguyen Van Cu";
static float wr_contl = 0;
static float wr = 0;
uint64_t messageTimestamp;
unsigned long lastMillis = 0;
unsigned long previousMillis = 0;
int timeDelay = 7000;
StaticJsonDocument<500> StationDoc;
StaticJsonDocument<500> TempDoc;
BearSSL::X509List cert(AWS_CERT_CA);
BearSSL::X509List client_crt(AWS_CERT_CRT);
BearSSL::PrivateKey key(AWS_CERT_PRIVATE);
PubSubClient client(net);
time_t now;
time_t nowish = 1510592825;
unsigned long epochTime;

// KHAI BÁO HÀM
void Init();
void eeprom();
void arduinoOTA();
void connectAWS();
void readData();
void display();
void tube_impulse();
void publishMessage();
void tempEvent();
void readData();
void publishWifiScanResults();
void handleCommand(const char *payload, unsigned int length);

// aws-mqtt
unsigned long getTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return (0);
  }
  time(&now);
  return now;
}
void NTPConnect(void) {
  Serial.print("Setting time using SNTP");
  configTime(7 * 3600, 0 * 3600, "pool.ntp.org", "time.nist.gov");
  now = time(nullptr);
  while (now < nowish) {
    delay(500);
    Serial.print(".NTPConnect.");
    now = time(nullptr);
  }
  Serial.println("done!");
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  Serial.print("Current time: ");
  Serial.print(asctime(&timeinfo));
}
void messageReceived(char *topic, byte *payload, unsigned int length) {
  Serial.print("Received [");
  Serial.print(topic);
  Serial.print("]: ");

  char message[length + 1];
  for (int i = 0; i < length; i++) {
    message[i] = (char)payload[i];
    Serial.print((char)payload[i]);
  }
  message[length] = '\0';
  Serial.println();

  // Xử lý command từ Admin Panel
  if (String(topic) == AWS_IOT_CONTROL_TOPIC) {
    handleCommand(message, length);
  }
}

void handleCommand(const char *payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  const char *command = doc["command"];
  Serial.print("Command: ");
  Serial.println(command);

  if (strcmp(command, "SCAN_WIFI") == 0) {
    publishWifiScanResults();
  } else if (strcmp(command, "RESET") == 0) {
    Serial.println("Restarting...");
    delay(1000);
    ESP.restart();
  } else if (strcmp(command, "INTERVAL") == 0) {
    int val = doc["val"] | 7000;
    timeDelay = val * 1000; // Convert to milliseconds
    Serial.print("New interval: ");
    Serial.println(timeDelay);
  }
}

void publishWifiScanResults() {
  Serial.println("Scanning WiFi networks...");
  int n = WiFi.scanNetworks();
  Serial.print("Found ");
  Serial.print(n);
  Serial.println(" networks");

  String payload = "{\"networks\":[";
  for (int i = 0; i < n && i < 10; i++) { // Limit to 10 networks
    if (i > 0)
      payload += ",";
    payload += "{\"ssid\":\"" + WiFi.SSID(i) +
               "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
  }
  payload += "]}";

  String topic = "station/" + String(STATION_ID) + "/wifi-scan-result";
  Serial.print("Publishing to: ");
  Serial.println(topic);
  Serial.println(payload);

  client.publish(topic.c_str(), payload.c_str());
  Serial.println("WiFi scan results published!");
}
void connectAWS() {
  delay(3000);
  WiFi.mode(WIFI_STA);
  NTPConnect();
  net.setTrustAnchors(&cert);
  net.setClientRSACert(&client_crt, &key);
  client.setServer(AWS_IOT_ENDPOINT, 8883);
  client.setCallback(messageReceived);
  Serial.println("Connecting to AWS IOT");
  while (!client.connect(THINGNAME)) {

    if (millis() - lastMillis > timeDelay * 10) {
      lastMillis = millis();
      Serial.print(".connectAWS.");
      delay(1000);
      ESP.restart();
    }
  }
  if (!client.connected()) {
    Serial.println("AWS IoT Timeout!");
    return;
  }
  client.subscribe(AWS_IOT_SUBSCRIBE_TOPIC);
  client.subscribe(AWS_IOT_CONTROL_TOPIC); // Subscribe to control topic
  Serial.println("AWS IoT Connected!");
}
void publishMessage() {
  StaticJsonDocument<200> doc;
  timeClient.update();
  unsigned long epochTime = timeClient.getEpochTime();
  unsigned long localEpochTime = epochTime;

  time_t now = time(nullptr);

  struct tm timeinfo;
  localtime_r(&now, &timeinfo);

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%c", &timeinfo);

  doc["LocalTime"] = buffer;
  doc["timestamp"] = now;
  doc["humidity"] = humi;
  doc["temperature"] = tempC;
  doc["uSv"] = uSv;
  doc["cps"] = cps;
  doc["counts"] = count_present;
  doc["stationName"] = String(statusStation);

  char jsonBuffer[512];
  serializeJson(doc, jsonBuffer);
  client.publish(AWS_IOT_PUBLISH_TOPIC, jsonBuffer);
}

// ota-wifi
void Init() {
  Serial.begin(115200);
  EEPROM.begin(512);
  ArduinoOTA.begin();
  timeClient.begin();
  timeClient.setTimeOffset(7 * 3600);
  HT.begin();
  lcd.init();
  lcd.backlight();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  pinMode(PIN_TICK, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_TICK), tube_impulse, FALLING);
}
void eeprom() {
  if (char(EEPROM.read(addr)) == 't') {
    EEPROM.write(addr, 'f');
    EEPROM.commit();
  } else {
    if (WiFi.waitForConnectResult() != WL_CONNECTED) {
      EEPROM.write(addr, 't');
      EEPROM.commit();
      ESP.restart();
    }
    Serial.println("");
    Serial.println("WiFi connected");
    Serial.println("IP address: ");
    Serial.println(WiFi.localIP());
  }
}
void arduinoOTA() {
  ArduinoOTA.setHostname(statusStation);
  ArduinoOTA.setPasswordHash("123456789");
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }
    Serial.println("Start updating " + type);
  });
  ArduinoOTA.onEnd([]() { Serial.println("\nEnd"); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Auth Failed");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Begin Failed");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Connect Failed");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Receive Failed");
    } else if (error == OTA_END_ERROR) {
      Serial.println("End Failed");
    }
  });
}

// peripherals
void changedname(const char *message, size_t length) {
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  address = String(doc["namec"]);
  Serial.println("address");
}
void storagebysec(const char *message, size_t length) {
  wr = 0;
  Serial.print("storagebysec");
}
void storageby1min(const char *message, size_t length) {
  wr = 1;
  Serial.print("storageby1min");
}
void storageby5min(const char *message, size_t length) {
  wr = 5;
  Serial.print("storageby5min");
}
void connectEvent(const char *payload, size_t length) {
  StationDoc["id"] = "";
  Serial.println("Station ESP connectEvent");
  serializeJson(StationDoc, Serial);
  char msg[256];
  serializeJson(StationDoc, msg);
}
void tempEvent() {
  TempDoc["address"] = address;
  TempDoc["uSv"] = uSv;
  TempDoc["cps"] = cps;
  TempDoc["humi"] = round(humi);
  TempDoc["tempC"] = round(tempC);
  TempDoc["counts"] = count_present;
  TempDoc["statusStation"] = String(statusStation);
  TempDoc["date"] = timeCount_present;
  TempDoc["realtime"] = timeCount_present;
  TempDoc["wr_contl"] = wr_contl;
  TempDoc["wr"] = wr;
  TempDoc["a"] = 5;
  char msg[256];
  serializeJson(TempDoc, msg);
}
void display() {
  lcd.setCursor(0, 0);
  lcd.print("T:");
  lcd.setCursor(2, 0);
  lcd.print(tempC);
  lcd.setCursor(7, 0);
  lcd.print("C");
  lcd.setCursor(9, 0);
  lcd.print("C:");
  lcd.setCursor(11, 0);
  lcd.print(cps);
  lcd.setCursor(0, 1);
  lcd.print("H:");
  lcd.setCursor(2, 1);
  lcd.print(humi);
  lcd.setCursor(7, 1);
  lcd.print("%");
  lcd.setCursor(9, 1);
  lcd.print("U:");
  lcd.setCursor(11, 1);
  lcd.print(uSv);
}

// sensors
ICACHE_RAM_ATTR void tube_impulse(void) { counts++; }

void readData() {
  timeClient.update();
  unsigned long epochTime = timeClient.getEpochTime();

  humi = HT.readHumidity();
  tempC = HT.readTemperature();
  if (isnan(humi) || isnan(tempC)) {
    Serial.println(F("Failed to read from DHT sensor!"));
    return;
  }

  now = time(nullptr);

  if (!client.connected()) {
    connectAWS();
  } else {
    client.loop();
    if (millis() - lastMillis > timeDelay) {
      lastMillis = millis();
      publishMessage();
    }
  }

  if (WiFi.waitForConnectResult() == WL_CONNECTED) {
    timeCount_present = epochTime;
    count_present = counts;
    if (timeCount_present != timeCount_prev) {
      cps = (float)(count_present - count_prev) /
            (timeCount_present - timeCount_prev);
      uSv = cps * 60 / 151.0;
      count_prev = count_present;
      timeCount_prev = timeCount_present;
      Serial.print(timeCount_prev);
      if (wr == 0) {
        wr_contl = 0;
      } else if (wr == 1) {
        if (timeCount_present % 60 == 0) {
          wr_contl = 0;
          Serial.print("wr_contl = 0");
        } else {
          wr_contl = 1;
          Serial.print("wr_contl = 1");
        }
      } else if (wr == 5) {
        if (timeCount_present % 300 == 0) {
          wr_contl = 0;
        } else {
          wr_contl = 1;
        }
      }
      tempEvent();
    }
  } else {
    timeCount_present = 0;
    count_present = counts;
    if (millis() - timeTick > timeDelay) {
      cps = (float)(count_present - count_prev);
      uSv = cps * 60 / 151.0;
      count_prev = count_present;
      timeTick = millis();
    }
  }
}