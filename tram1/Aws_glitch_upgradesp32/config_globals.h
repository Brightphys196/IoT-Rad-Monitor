#pragma once

// --- 1. THƯ VIỆN ---
#include "DHT.h"
#include "secrets.h"
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <NTPClient.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <Update.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <time.h>

#define DHT11Pin 5
#define DHTType DHT11
#define PIN_TICK 27

#define CONVERSION_FACTOR 151.0
#define AWS_IOT_PUBLISH_TOPIC "/tram/pub"
#define AWS_IOT_SUBSCRIBE_TOPIC "/tram/sub"
#define AWS_IOT_CONTROL_TOPIC "station/station_01/control"
#define STATION_ID "station_01"

// Ngưỡng cảnh báo
#define WARNING_THRESHOLD 1.0
#define DANGER_THRESHOLD 5.0

// Phiên bản Firmware (cập nhật mỗi lần build OTA)
#define FIRMWARE_VERSION "1.0.1"

DHT HT(DHT11Pin, DHTType);
TFT_eSPI tft = TFT_eSPI();
TFT_eSprite spr = TFT_eSprite(&tft);
WiFiUDP ntpUDP;
WiFiClientSecure net;
NTPClient timeClient(ntpUDP, "vn.pool.ntp.org");
PubSubClient client(net);
static float humi = 0;
static float tempC = 0;
static long timeTick = 0;
const char *statusStation = "Tram";
int addr = 0;
int lastSignalState = HIGH;
portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;
static volatile unsigned long counts = 0;
static float uSv;
static float cps = 0;
static float backgroundCPS = 0.0;
static unsigned long int timeCount_present;
static unsigned long int count_present;
static unsigned long int timeCount_prev = 0;
static unsigned long int count_prev = 0;
static String address = "227 - Nguyen Van Cu";
static float wr_contl = 0;
static float wr = 0;
uint64_t messageTimestamp;
unsigned long lastMillis = 0;
unsigned long lastPublishMillis = 0;
const int publishInterval = 7000;
const int measureInterval = 1000;
unsigned long previousMillis = 0;
int timeDelay = 7000;
StaticJsonDocument<500> StationDoc;
StaticJsonDocument<500> TempDoc;

time_t now;
time_t nowish = 1510592825;
unsigned long epochTime;

// KHAI BÁO CÁC HÀM
void Init();
void eeprom();
void arduinoOTA();
void connectAWS();
void readData();
void display();
void tube_impulse();
void publishMessage();
void tempEvent();
void publishWifiScanResults();
void handleCommand(const char *payload, unsigned int length);
void performOTAUpdate(const char *firmwareUrl);

void countPulses() {
  int currentSignalState = digitalRead(PIN_TICK);
  if (lastSignalState == HIGH && currentSignalState == LOW) {
    counts++;
  }
  lastSignalState = currentSignalState;
}

// sensors
void IRAM_ATTR tube_impulse(void) {
  portENTER_CRITICAL_ISR(&timerMux);
  counts++;
  portEXIT_CRITICAL_ISR(&timerMux);
}

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
    int val = doc["val"] | 7;
    timeDelay = val * 1000; // Convert to milliseconds
    Serial.print("New interval: ");
    Serial.println(timeDelay);
  } else if (strcmp(command, "UPDATE_FIRMWARE") == 0) {
    const char *firmwareUrl = doc["url"];
    if (firmwareUrl) {
      Serial.print("[OTA] Firmware URL: ");
      Serial.println(firmwareUrl);
      performOTAUpdate(firmwareUrl);
    } else {
      Serial.println("[OTA] Error: Missing firmware URL");
    }
  }
}

void performOTAUpdate(const char *firmwareUrl) {
  Serial.println("[OTA] Starting HTTP OTA Update...");
  Serial.print("[OTA] URL: ");
  Serial.println(firmwareUrl);

  // *** QUAN TRỌNG: Ngắt kết nối AWS IoT để giải phóng RAM cho SSL ***
  Serial.println("[OTA] Disconnecting AWS IoT to free memory...");
  client.disconnect();
  net.stop();
  delay(500); // Đợi giải phóng bộ nhớ

  Serial.print("[OTA] Free Heap after disconnect: ");
  Serial.println(ESP.getFreeHeap());

  // Parse URL để debug connection và lấy Host
  String urlStr = String(firmwareUrl);
  String host = "";
  int httpsIndex = urlStr.indexOf("https://");
  if (httpsIndex >= 0) {
    int nextSlash = urlStr.indexOf("/", httpsIndex + 8);
    if (nextSlash > 0) {
      host = urlStr.substring(httpsIndex + 8, nextSlash);
    } else {
      host = urlStr.substring(httpsIndex + 8);
    }
  }

  // Debug WiFi status
  Serial.print("[OTA] WiFi Status: ");
  Serial.println(WiFi.status());
  Serial.print("[OTA] WiFi IP: ");
  Serial.println(WiFi.localIP());
  if (host != "") {
    Serial.print("[OTA] Host: ");
    Serial.println(host);
  }

  // Hiển thị trạng thái trên TFT
  spr.fillSprite(TFT_BLUE);
  spr.setTextColor(TFT_WHITE);
  spr.setTextDatum(MC_DATUM);
  spr.setTextSize(2);
  spr.drawString("OTA Update", tft.width() / 2, tft.height() / 2 - 40);
  spr.drawString("Connecting...", tft.width() / 2, tft.height() / 2);
  spr.pushSprite(0, 0);

  // 1. Dùng HEAP thay vì Stack cho WiFiClientSecure
  WiFiClientSecure *client = new WiFiClientSecure;
  if (!client) {
    Serial.println("[OTA] Failed to create WiFiClientSecure (Out of Memory?)");
    return;
  }

  // Cấu hình SSL
  client->setInsecure(); // Bỏ qua verify cert
  client->setHandshakeTimeout(30);

  // 4. Test Connect Socket trước để debug lỗi SSL Handshake
  if (host != "") {
    Serial.print("[OTA] Testing connection to ");
    Serial.println(host);
    // Connect thử port 443
    if (!client->connect(host.c_str(), 443)) {
      Serial.println("[OTA] Connect failed!");
      char errBuf[128];
      client->lastError(errBuf, 128);
      Serial.print("[OTA] SSL Error: ");
      Serial.println(errBuf);

      spr.fillSprite(TFT_RED);
      spr.drawString("Connect Failed", tft.width() / 2, tft.height() / 2);
      spr.pushSprite(0, 0);
      delete client;
      delay(3000);
      return;
    }
    Serial.println("[OTA] Handshake OK!");
    client->stop(); // Ngắt kết nối để HTTPClient tự connect lại
  }

  HTTPClient http;

  // Reuse client đã cấu hình
  if (!http.begin(*client, firmwareUrl)) {
    Serial.println("[OTA] http.begin() failed!");
    delete client;
    return;
  }

  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setConnectTimeout(30000);
  http.setTimeout(120000); // 2 phút cho download
  http.addHeader("User-Agent", "ESP32-OTA");

  Serial.println("[OTA] Downloading...");
  spr.fillSprite(TFT_BLUE);
  spr.drawString("OTA Update", tft.width() / 2, tft.height() / 2 - 40);
  spr.drawString("Downloading...", tft.width() / 2, tft.height() / 2);
  spr.pushSprite(0, 0);

  int httpCode = http.GET();
  Serial.printf("[OTA] HTTP Response: %d\n", httpCode);

  if (httpCode < 0) {
    Serial.print("[OTA] HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
  }

  if (httpCode == HTTP_CODE_OK) {
    int contentLength = http.getSize();
    if (contentLength > 0 && Update.begin(contentLength)) {
      Serial.printf("[OTA] Size: %d bytes\n", contentLength);

      spr.fillSprite(TFT_BLUE);
      spr.drawString("OTA Update", tft.width() / 2, tft.height() / 2 - 40);
      spr.drawString("Flashing...", tft.width() / 2, tft.height() / 2);
      spr.pushSprite(0, 0);

      // Stream data
      WiFiClient *stream = http.getStreamPtr();
      size_t written = Update.writeStream(*stream);

      if (written == contentLength) {
        Serial.println("[OTA] Written successfully");
      } else {
        Serial.printf("[OTA] Written only %d/%d bytes\n", written,
                      contentLength);
      }

      if (Update.end()) {
        if (Update.isFinished()) {
          spr.fillSprite(TFT_GREEN);
          spr.setTextColor(TFT_BLACK);
          spr.drawString("OTA Success!", tft.width() / 2,
                         tft.height() / 2 - 20);
          spr.drawString("Restarting...", tft.width() / 2,
                         tft.height() / 2 + 20);
          spr.pushSprite(0, 0);

          Serial.println("[OTA] Rebooting...");
          delay(2000);
          ESP.restart();
        } else {
          Serial.println("[OTA] Update not finished");
        }
      } else {
        Serial.printf("[OTA] Error #: %d\n", Update.getError());
      }
    } else {
      Serial.println("[OTA] Not enough space or failed to begin");
    }
  } else {
    Serial.printf("[OTA] GET failed: %d\n", httpCode);
    spr.fillSprite(TFT_RED);
    spr.setTextColor(TFT_WHITE);
    spr.drawString("OTA Failed!", tft.width() / 2, tft.height() / 2 - 20);
    char errMsg[32];
    sprintf(errMsg, "HTTP: %d", httpCode);
    spr.drawString(errMsg, tft.width() / 2, tft.height() / 2 + 20);
    spr.pushSprite(0, 0);
    delay(3000);
  }

  http.end();
  delete client;
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

  net.setCACert(AWS_CERT_CA);
  net.setCertificate(AWS_CERT_CRT);
  net.setPrivateKey(AWS_CERT_PRIVATE);

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

  tft.init();
#ifdef TFT_BL
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);
#endif
  tft.setRotation(1);
  spr.createSprite(tft.width(), tft.height());

  spr.fillSprite(TFT_BLACK);
  spr.setTextColor(TFT_GREEN, TFT_BLACK);
  spr.setTextDatum(MC_DATUM);
  spr.drawString("Khoi Dong...", tft.width() / 2, tft.height() / 2);
  spr.pushSprite(0, 0);

  HT.begin();
  pinMode(PIN_TICK, INPUT);
  // Gắn ngắt an toàn
  attachInterrupt(digitalPinToInterrupt(PIN_TICK), tube_impulse, FALLING);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");
  Serial.print("[INFO] Firmware Version: ");
  Serial.println(FIRMWARE_VERSION);

  lastMillis = millis();
}

void eeprom() {
  if (char(EEPROM.read(addr)) == 't') {
    EEPROM.write(addr, 'f');
    EEPROM.commit();
  } else {
    if (WiFi.status() != WL_CONNECTED) {
      EEPROM.write(addr, 't');
      EEPROM.commit();
      ESP.restart();
    }
    Serial.println("WiFi connected (EEPROM check)");
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
  if (uSv >= DANGER_THRESHOLD) {
    spr.fillSprite(TFT_RED);
    spr.setTextColor(TFT_WHITE);
    spr.setTextDatum(MC_DATUM);
    if ((millis() / 500) % 2 == 0) {
      spr.setTextSize(3);
      spr.drawString("DANGER", tft.width() / 2, tft.height() / 2 - 20);
    }
    spr.setTextSize(2);
    spr.drawFloat(uSv, 3, tft.width() / 2, tft.height() / 2 + 30);
  } else if (uSv >= WARNING_THRESHOLD) {
    spr.fillSprite(TFT_ORANGE);
    spr.setTextColor(TFT_BLACK);
    spr.setTextDatum(MC_DATUM);
    spr.setTextSize(3);
    spr.drawString("WARNING", tft.width() / 2, tft.height() / 2 - 20);
    spr.setTextSize(2);
    spr.drawFloat(uSv, 3, tft.width() / 2, tft.height() / 2 + 30);
  } else {
    spr.fillSprite(TFT_BLACK);
    spr.setTextDatum(TL_DATUM);
    spr.setTextSize(2);
    spr.setTextColor(TFT_WHITE);

    char buffer[32];
    sprintf(buffer, "T: %.1f C", tempC);
    spr.drawString(buffer, 15, 10);
    sprintf(buffer, "H: %.1f %%", humi);
    spr.drawString(buffer, 180, 10);

    spr.drawFastHLine(0, 40, tft.width(), TFT_DARKGREY);

    spr.setTextColor(TFT_ORANGE);
    spr.setTextDatum(TR_DATUM);
    spr.drawFloat(uSv, 3, 305, 65, 4);
    spr.setTextDatum(TL_DATUM);
    spr.setTextSize(2);
    spr.drawString("uSv/h", 15, 60);

    spr.setTextColor(TFT_YELLOW);
    spr.setTextDatum(TR_DATUM);
    spr.drawFloat(cps, 2, 305, 115, 4);
    spr.setTextDatum(TL_DATUM);
    spr.setTextSize(2);
    spr.drawString("CPS", 15, 110);

    spr.drawFastHLine(0, 155, tft.width(), TFT_DARKGREY);

    portENTER_CRITICAL(&timerMux);
    unsigned long dispCounts = counts;
    portEXIT_CRITICAL(&timerMux);

    spr.setTextSize(1);
    spr.setTextColor(TFT_CYAN);
    spr.drawString("Tong dem: " + String(dispCounts), 15, 160);

    time_t now_disp = time(nullptr);
    struct tm *ptm = localtime(&now_disp);
    strftime(buffer, sizeof(buffer), "%H:%M:%S", ptm);
    spr.drawString(buffer, 260, 160);
  }
  spr.pushSprite(0, 0);
}

void readData() {
  unsigned long currentMillis = millis();

  // Tính toán mỗi 1 giây
  if (currentMillis - lastMillis >= measureInterval) {
    float elapsedSeconds = (currentMillis - lastMillis) / 1000.0;

    portENTER_CRITICAL(&timerMux);
    unsigned long currentCounts = counts;
    portEXIT_CRITICAL(&timerMux);

    float deltaCounts = (float)(currentCounts - count_prev);
    cps = deltaCounts / elapsedSeconds;
    uSv = (cps * 60.0) / CONVERSION_FACTOR;

    float newHumi = HT.readHumidity();
    float newTemp = HT.readTemperature();
    if (!isnan(newHumi))
      humi = newHumi;
    if (!isnan(newTemp))
      tempC = newTemp;

    // Logic điều khiển lưu trữ (Trạm 1)
    timeClient.update();
    unsigned long epoch = timeClient.getEpochTime();
    if (wr == 0)
      wr_contl = 0;
    else if (wr == 1)
      wr_contl = (epoch % 60 == 0) ? 0 : 1;
    else if (wr == 5)
      wr_contl = (epoch % 300 == 0) ? 0 : 1;

    tempEvent();
    display();

    count_prev = currentCounts;
    lastMillis = currentMillis;
  }

  // Gửi AWS (Mỗi 7 giây)
  if (currentMillis - lastPublishMillis > publishInterval) {
    if (!client.connected()) {
      connectAWS();
    }
    client.loop();
    publishMessage();
    lastPublishMillis = currentMillis;
  }
}