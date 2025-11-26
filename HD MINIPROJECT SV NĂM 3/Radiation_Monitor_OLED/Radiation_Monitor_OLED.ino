// =================================================================
//      TRẠM QUAN TRẮC - PHIÊN BẢN HIỂN THỊ CPS TỨC THỜI
// =================================================================
// Tích hợp:
// 1. Hiển thị CPS của giây gần nhất để phản ứng nhanh.
// 2. Vẫn giữ cơ chế trừ phông nền tự động.
// =================================================================

// --- 1. CÁC THƯ VIỆN CẦN THIẾT ---
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include "DHT.h"

// =================================================================
//                      2. CẤU HÌNH HỆ THỐNG
// =================================================================
#define OLED_SCL 12
#define OLED_SDA 14
#define DHTPIN 13
#define PIN_TICK 5
#define CONVERSION_FACTOR 367.5
#define DHTTYPE DHT11
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1

// =================================================================
//              3. KHỞI TẠO ĐỐI TƯỢNG VÀ BIẾN TOÀN CỤC
// =================================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
DHT dht(DHTPIN, DHTTYPE);

float humi = 0.0, tempC = 0.0;
volatile unsigned long counts = 0;
float uSv = 0.0, cps = 0.0, backgroundCPS = 0.0;

unsigned long lastCalcMillis = 0;
unsigned long count_prev = 0;
int lastSignalState = HIGH;

// =================================================================
//              4. HÀM CHỨC NĂNG
// =================================================================
void countPulses() {
  int currentSignalState = digitalRead(PIN_TICK);
  if (lastSignalState == HIGH && currentSignalState == LOW) {
    counts++;
  }
  lastSignalState = currentSignalState;
}

// HÀM UPDATE OLED ĐÃ SỬA ĐỂ NHẬN VÀ HIỂN THỊ CPS TỨC THỜI ✅
void updateOLED(float current_cps, float current_uSv) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    
    display.setCursor(0, 0);
    display.print("Nhiet Do: "); display.print(tempC, 1); display.print(" C");
    display.setCursor(0, 12);
    display.print("Do Am   : "); display.print(humi, 1); display.print(" %");
    display.setCursor(0, 28);
    display.print("CPS     : "); display.print(current_cps, 2); // Hiển thị CPS tức thời
    display.setCursor(0, 40);
    display.print("uSv/h   : "); display.print(current_uSv, 3); // Hiển thị uSv/h tức thời
    display.setCursor(0, 52);
    display.print("Tong dem: "); display.print(counts);

    display.display();
}

// HÀM LOOP ĐÃ SỬA ĐỂ CẬP NHẬT GIÁ TRỊ TỨC THỜI MỖI GIÂY ✅
void loop() {
    countPulses(); // Luôn luôn đếm

    // Cập nhật giá trị và màn hình mỗi giây
    if (millis() - lastCalcMillis >= 1000) {
        float elapsedSeconds = (float)(millis() - lastCalcMillis) / 1000.0;
        
        // Tính CPS của giây hiện tại
        float currentCPS = (float)(counts - count_prev) / elapsedSeconds;
        
        // Trừ đi phông nền
        float netCPS = currentCPS - backgroundCPS;
        if (netCPS < 0) netCPS = 0;

        // Tính uSv/h tức thời
        float net_uSv = (netCPS * 60.0) / CONVERSION_FACTOR;

        // Cập nhật màn hình với giá trị mới nhất
        humi = dht.readHumidity(); // Đọc cảm biến DHT ngay trước khi hiển thị
        tempC = dht.readTemperature();
        updateOLED(netCPS, net_uSv);

        // Lưu lại giá trị cho lần tính sau
        count_prev = counts;
        lastCalcMillis = millis();
    }
}

// =================================================================
//                      5. SETUP
// =================================================================
void setup() {
    Serial.begin(115200);
    Wire.begin(OLED_SDA, OLED_SCL);
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        while (1);
    }
    
    dht.begin();
    pinMode(PIN_TICK, INPUT);

    // --- ĐO PHÔNG PHÓNG XẠ KHI KHỞI ĐỘNG ---
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);
    display.setCursor(0, 15);
    display.println("DO PHONG NEN...");
    display.setCursor(0, 35);
    display.println("De yen trong 15 giay");
    display.display();

    unsigned long start_time = millis();
    unsigned long start_counts = counts;
    while(millis() - start_time < 15000) {
      countPulses();
      delay(1);
    }
    backgroundCPS = (float)(counts - start_counts) / 15.0;
    
    Serial.print("Phong nen da do: "); Serial.print(backgroundCPS); Serial.println(" CPS");

    // Khởi tạo các giá trị
    lastCalcMillis = millis();
    count_prev = counts;
}