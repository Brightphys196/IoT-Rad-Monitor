#pragma once

// --- 1. THƯ VIỆN ---
#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <SPI.h>
#include <ArduinoJson.h>
#include "DHT.h"
#include <stdint.h>
#include <time.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ESP8266mDNS.h>
#include <ArduinoOTA.h>
#include <SD.h>
#include <EEPROM.h>
#include <Wire.h>
// ✅ THAY ĐỔI: Thêm thư viện cho màn hình OLED
#include <Adafruit_SSD1306.h>
// ❌ THAY ĐỔI: Xóa các thư viện cho màn hình LCD cũ
// #include <hd44780.h>
// #include <hd44780ioClass/hd44780_I2Cexp.h>
// #include <LiquidCrystal_I2C.h>
#include "secrets.h"
#include <math.h>
// =================================================================
//                      2. CẤU HÌNH HỆ THỐNG
// =================================================================
#define OLED_SCL 12
#define OLED_SDA 14
#define DHT11Pin 13
#define DHTType DHT11
#define PIN_TICK 5
#define AWS_IOT_PUBLISH_TOPIC "/tram/pub"
#define AWS_IOT_SUBSCRIBE_TOPIC "/tram/sub"

// KHAI BÁO ĐỐI TƯỢNG VÀ BIẾN TOÀN CỤC
DHT HT(DHT11Pin, DHTType);
Adafruit_SSD1306 display_obj(128, 64, &Wire, -1);
//LiquidCrystal_I2C lcd(0x27, 16, 2);
//TFT_eSPI tft = TFT_eSPI();
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
void connectAWS()
{
    delay(3000);
    WiFi.mode(WIFI_STA);
    NTPConnect();

    // ✅ THAY ĐỔI: Sử dụng các hàm cài đặt chứng chỉ của ESP32
    // Các hàm này nhận trực tiếp chuỗi ký tự từ file secrets.h
    //net.setCACert(AWS_CERT_CA);
    //net.setCertificate(AWS_CERT_CRT);
    //net.setPrivateKey(AWS_CERT_PRIVATE);

    net.setTrustAnchors(&cert);
    net.setClientRSACert(&client_crt, &key);

    client.setServer(AWS_IOT_ENDPOINT, 8883);
    client.setCallback(messageReceived);
    Serial.println("Connecting to AWS IOT");
    while (!client.connect(THINGNAME))
    {

        if (millis() - lastMillis > timeDelay * 10)
        {
            lastMillis = millis();
            Serial.print(".connectAWS.");
            delay(1000);
            ESP.restart();
        }
    }
    if (!client.connected())
    {
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
    ArduinoOTA.begin();
    timeClient.begin();
    timeClient.setTimeOffset(7 * 3600);
    HT.begin();
    
    // ✅ THAY ĐỔI: Khởi tạo màn hình OLED
    Wire.begin(OLED_SDA, OLED_SCL);
    if (!display_obj.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println(F("Loi khoi tao SSD1306"));
        while (1); // Dừng lại nếu lỗi
    }
    display_obj.clearDisplay();
    display_obj.setTextSize(1);
    display_obj.setTextColor(WHITE);
    display_obj.setCursor(0, 25);
    display_obj.println("Dang Khoi Dong...");
    display_obj.display();
    // ❌ THAY ĐỔI: Xóa lệnh khởi tạo LCD cũ
    // lcd.init();
    // lcd.backlight();
    
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    pinMode(PIN_TICK, INPUT);
    attachInterrupt(digitalPinToInterrupt(PIN_TICK), tube_impulse, FALLING);
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
    // ✅ THAY ĐỔI: Viết lại toàn bộ hàm để vẽ lên màn hình OLED
    display_obj.clearDisplay();
    display_obj.setTextSize(1);
    display_obj.setTextColor(SSD1306_WHITE);

    // Dòng 1: Nhiệt độ & Độ ẩm
    display_obj.setCursor(0, 0);
    display_obj.print("T: "); display_obj.print(tempC, 1); display_obj.print("C");
    display_obj.setCursor(64, 0);
    display_obj.print("H: "); display_obj.print(humi, 1); display_obj.print("%");

    // Dòng 2: CPS và uSv/h
    display_obj.setCursor(0, 16);
    display_obj.print("CPS: "); display_obj.print(cps, 2);
    display_obj.setCursor(0, 28);
    display_obj.print("uSv/h: "); display_obj.print(uSv, 3);
    
    // Dòng 3: Tổng đếm và thời gian
    time_t now_disp = time(nullptr); // Tạo biến thời gian cục bộ để tránh xung đột
    struct tm* ptm = localtime(&now_disp);
    char time_str[9];
    strftime(time_str, sizeof(time_str), "%H:%M:%S", ptm);
    
    display_obj.setCursor(0, 48);
    display_obj.print("Cnt: "); display_obj.print(counts); // Hiển thị tổng số đếm
    display_obj.setCursor(64, 48);
    display_obj.print(time_str);

    display_obj.display(); // Gửi tất cả ra màn hình
}

//sensors
ICACHE_RAM_ATTR void tube_impulse(void)
{
    counts++;
}

void readData()
{
    timeClient.update();
    unsigned long epochTime = timeClient.getEpochTime();

    humi = HT.readHumidity();
    tempC = HT.readTemperature();
    if (isnan(humi) || isnan(tempC))
    {
        Serial.println(F("Failed to read from DHT sensor!"));
        return;
    }

    now = time(nullptr);

    if (!client.connected())
    {
        connectAWS();
    }
    else
    {
        client.loop();
        if (millis() - lastMillis > timeDelay)
        {
            lastMillis = millis();
            publishMessage();
        }
    }

    if (WiFi.waitForConnectResult() == WL_CONNECTED)
    {
        timeCount_present = epochTime;
        count_present = counts;
        if (timeCount_present != timeCount_prev)
        {
            cps = (float)(count_present - count_prev) / (timeCount_present - timeCount_prev);
            uSv = cps * 60 / 151.0;
            count_prev = count_present;
            timeCount_prev = timeCount_present;
            Serial.print(timeCount_prev);
            if (wr == 0)
            {
                wr_contl = 0;
            }
            else if (wr == 1)
            {
                if (timeCount_present % 60 == 0)
                {
                    wr_contl = 0;
                    Serial.print("wr_contl = 0");
                }
                else
                {
                    wr_contl = 1;
                    Serial.print("wr_contl = 1");
                }
            }
            else if (wr == 5)
            {
                if (timeCount_present % 300 == 0)
                {
                    wr_contl = 0;
                }
                else
                {
                    wr_contl = 1;
                }
            }
            tempEvent();
        }
    }
    else
    {
        timeCount_present = 0;
        count_present = counts;
        if (millis() - timeTick > timeDelay)
        {
            cps = (float)(count_present - count_prev);
            uSv = cps * 60 / 151.0;
            count_prev = count_present;
            timeTick = millis();
        }
    }
}