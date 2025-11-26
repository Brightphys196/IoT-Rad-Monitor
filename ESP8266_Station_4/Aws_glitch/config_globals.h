#pragma once

// --- 1. THƯ VIỆN ---
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"
#include <time.h>
#include <NTPClient.h>
#include <ArduinoOTA.h>
#include <EEPROM.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include "secrets.h"
#include <math.h>

// =================================================================
//                      2. CẤU HÌNH HỆ THỐNG
// =================================================================
#define DHT11Pin 5
#define DHTType DHT11
#define PIN_TICK 27
#define CONVERSION_FACTOR 367.5
#define AWS_IOT_PUBLISH_TOPIC "/tram/pub"
#define AWS_IOT_SUBSCRIBE_TOPIC "/tram/sub"

// Ngưỡng cảnh báo
#define WARNING_THRESHOLD 1.0
#define DANGER_THRESHOLD  5.0

// =================================================================
//              3. KHỞI TẠO ĐỐI TƯỢNG VÀ BIẾN TOÀN CỤC
// =================================================================
DHT HT(DHT11Pin, DHTType);
TFT_eSPI tft = TFT_eSPI(); 
TFT_eSprite spr = TFT_eSprite(&tft);
WiFiUDP ntpUDP;
WiFiClientSecure net;
NTPClient timeClient(ntpUDP, "vn.pool.ntp.org");
static float humi = 0;
static float tempC = 0;
static long timeTick = 0;
const char *statusStation = "Tram";
int addr = 0;
int lastSignalState = HIGH;
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
unsigned long previousMillis = 0;
int timeDelay = 7000;
StaticJsonDocument<500> StationDoc;
StaticJsonDocument<500> TempDoc;
PubSubClient client(net);
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
void readData();

void countPulses() {
  int currentSignalState = digitalRead(PIN_TICK);
  if (lastSignalState == HIGH && currentSignalState == LOW) {
    counts++;
  }
  lastSignalState = currentSignalState;
}

//sensors
void IRAM_ATTR tube_impulse(void) {
    counts++;
}


//aws-mqtt
unsigned long getTime()
{
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo))
    {
        return (0);
    }
    time(&now);
    return now;
}
void NTPConnect(void)
{
    Serial.print("Setting time using SNTP");
    configTime(7 * 3600, 0 * 3600, "pool.ntp.org", "time.nist.gov");
    now = time(nullptr);
    while (now < nowish)
    {
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
void messageReceived(char *topic, byte *payload, unsigned int length)
{
    Serial.print("Received [");
    Serial.print(topic);
    Serial.print("]: ");
    for (int i = 0; i < length; i++)
    {
        Serial.print((char)payload[i]);
    }
    Serial.println();
}
void connectAWS() {
    delay(3000);
    WiFi.mode(WIFI_STA);
    NTPConnect();

    // ✅ THAY ĐỔI: Sử dụng các hàm cài đặt chứng chỉ của ESP32
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
    Serial.println("AWS IoT Connected!");
}

void publishMessage()
{
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


//ota-wifi
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
    delay(1500);

    HT.begin();
    pinMode(PIN_TICK, INPUT);
    attachInterrupt(digitalPinToInterrupt(PIN_TICK), tube_impulse, FALLING);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    // --- Đo phông nền ---
    spr.fillSprite(TFT_BLACK);
    spr.setTextDatum(MC_DATUM);
    spr.setTextSize(3); // ✅ THAY ĐỔI: Tăng cỡ chữ
    spr.drawString("DANG DO PHONG NEN", tft.width() / 2, tft.height() / 2 - 15);
    spr.setTextSize(2);
    spr.drawString("Vui long de yen trong 15 giay...", tft.width() / 2, tft.height() / 2 + 15);
    spr.pushSprite(0, 0);
    
    unsigned long start_time = millis();
    unsigned long start_counts = counts;
    while(millis() - start_time < 15000) {
      delay(100);
    }
    backgroundCPS = (float)(counts - start_counts) / 15.0;
    Serial.print("Phong nen da do: "); Serial.print(backgroundCPS); Serial.println(" CPS");

    // ✅ THÊM: Hiển thị kết quả đo phông
    spr.fillSprite(TFT_BLACK);
    spr.setTextDatum(MC_DATUM);
    spr.setTextSize(2);
    spr.drawString("Phong nen da do:", tft.width() / 2, tft.height() / 2 - 15);
    spr.setTextSize(4);
    spr.drawFloat(backgroundCPS, 2, tft.width() / 2, tft.height() / 2 + 10);
    spr.pushSprite(0, 0);
    delay(3000); // Hiển thị trong 3 giây
    
    count_prev = counts; 
    lastMillis = millis();
}
void eeprom()
{
    if (char(EEPROM.read(addr)) == 't')
    {
        EEPROM.write(addr, 'f');
        EEPROM.commit();
    }
    else
    {
        if (WiFi.waitForConnectResult() != WL_CONNECTED)
        {
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
void arduinoOTA()
{
    ArduinoOTA.setHostname(statusStation);
    ArduinoOTA.setPasswordHash("123456789");
    ArduinoOTA.onStart([]()
                       {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }
    Serial.println("Start updating " + type); });
    ArduinoOTA.onEnd([]()
                     { Serial.println("\nEnd"); });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total)
                          { Serial.printf("Progress: %u%%\r", (progress / (total / 100))); });
    ArduinoOTA.onError([](ota_error_t error)
                       {
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
    } });
}

//peripherals
void changedname(const char *message, size_t length)
{
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, message);
    address = String(doc["namec"]);
    Serial.println("address");
}
void storagebysec(const char *message, size_t length)
{
    wr = 0;
    Serial.print("storagebysec");
}
void storageby1min(const char *message, size_t length)
{
    wr = 1;
    Serial.print("storageby1min");
}
void storageby5min(const char *message, size_t length)
{
    wr = 5;
    Serial.print("storageby5min");
}
void connectEvent(const char *payload, size_t length)
{
    StationDoc["id"] = "";
    Serial.println("Station ESP connectEvent");
    serializeJson(StationDoc, Serial);
    char msg[256];
    serializeJson(StationDoc, msg);
}
void tempEvent()
{
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
    // --- Trạng thái NGUY HIỂM (Danger) ---
    if (uSv >= DANGER_THRESHOLD) {
        spr.fillSprite(TFT_RED);
        spr.setTextColor(TFT_WHITE);
        spr.setTextDatum(MC_DATUM);
        
        if ((millis() / 500) % 2 == 0) {
            spr.setTextSize(3);
            spr.drawString("DANGER", tft.width() / 2, tft.height() / 2 - 20); // ✅ ĐÃ THAY ĐỔI
        }
        
        spr.setTextSize(2);
        spr.drawFloat(uSv, 3, tft.width() / 2, tft.height() / 2 + 30);

    // --- Trạng thái CẢNH BÁO (Warning) ---
    } else if (uSv >= WARNING_THRESHOLD) {
        spr.fillSprite(TFT_ORANGE);
        spr.setTextColor(TFT_BLACK);
        spr.setTextDatum(MC_DATUM);
        spr.setTextSize(3);
        spr.drawString("WARNING", tft.width() / 2, tft.height() / 2 - 20); // ✅ ĐÃ THAY ĐỔI
        spr.setTextSize(2);
        spr.drawFloat(uSv, 3, tft.width() / 2, tft.height() / 2 + 30);

    // --- Trạng thái BÌNH THƯỜNG (Normal) ---
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

        spr.setTextSize(1);
        spr.setTextColor(TFT_CYAN);
        spr.drawString("Tong dem: " + String(counts), 15, 160);
        
        time_t now_disp = time(nullptr);
        struct tm* ptm = localtime(&now_disp);
        strftime(buffer, sizeof(buffer), "%H:%M:%S", ptm);
        spr.drawString(buffer, 260, 160);
    }

    spr.pushSprite(0, 0);
}


void readData() {
    if (millis() - lastMillis >= 1000) {
        float elapsedSeconds = (float)(millis() - lastMillis) / 1000.0;
        float currentCPS = (float)(counts - count_prev) / elapsedSeconds;
        
        cps = currentCPS - backgroundCPS;
        if (cps < 0) cps = 0;
        uSv = (cps * 60.0) / CONVERSION_FACTOR;
        humi = HT.readHumidity();
        tempC = HT.readTemperature();
        
        count_prev = counts;
        lastMillis = millis();
    }
    
    if (millis() - lastPublishMillis > publishInterval) {
        if (!client.connected()) {
            connectAWS();
        }
        client.loop();
        publishMessage();
        lastPublishMillis = millis();
    }
}