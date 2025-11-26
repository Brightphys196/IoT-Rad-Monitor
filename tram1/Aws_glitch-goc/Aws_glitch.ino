// Bao gồm tất cả các file chức năng
#include "config.h"
#include "ota_wifi.h"
#include "aws_mqtt.h"
#include "sensors.h"
#include "peripherals.h"

void setup() {
  // Khởi tạo các thành phần cơ bản
  initSerial();
  initEEPROM();
  
  // Khởi tạo các cảm biến và ngoại vi
  initSensors();
  initDisplay();
  
  // Kết nối mạng và các dịch vụ
  connectWiFi();
  initOTA();
  connectAWS();
}

void loop() {
  // Các hàm xử lý chạy liên tục
  handleOTA();
  handleSensors();
  handleDisplay();
  handleAWS();
}