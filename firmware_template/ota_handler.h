/**
 * OTA Handler Module for ESP32
 * ============================
 * File này chứa toàn bộ logic HTTP OTA.
 * Chỉ cần #include "ota_handler.h" trong config_globals.h
 *
 * Yêu cầu:
 * - Định nghĩa AWS_IOT_CONTROL_TOPIC trước khi include
 * - Đã có TFT_eSPI tft và TFT_eSprite spr
 * - Đã có PubSubClient client
 */

#pragma once

#include <HTTPClient.h>
#include <Update.h>

// Forward declaration
void performOTAUpdate(const char *firmwareUrl);

/**
 * Xử lý command UPDATE_FIRMWARE
 * Gọi hàm này trong handleCommand() khi nhận được command "UPDATE_FIRMWARE"
 */
void handleOTACommand(const char *firmwareUrl) {
  if (firmwareUrl && strlen(firmwareUrl) > 0) {
    Serial.print("[OTA] Firmware URL: ");
    Serial.println(firmwareUrl);
    performOTAUpdate(firmwareUrl);
  } else {
    Serial.println("[OTA] Error: Missing firmware URL");
  }
}

/**
 * Thực hiện HTTP OTA Update
 * Hiển thị tiến trình trên TFT display
 */
void performOTAUpdate(const char *firmwareUrl) {
  Serial.println("[OTA] Starting HTTP OTA Update...");

  // Hiển thị trạng thái trên TFT
  spr.fillSprite(TFT_BLUE);
  spr.setTextColor(TFT_WHITE);
  spr.setTextDatum(MC_DATUM);
  spr.setTextSize(2);
  spr.drawString("OTA Update", tft.width() / 2, tft.height() / 2 - 40);
  spr.drawString("Downloading...", tft.width() / 2, tft.height() / 2);
  spr.pushSprite(0, 0);

  HTTPClient http;
  http.begin(firmwareUrl);
  http.addHeader("User-Agent", "ESP32-OTA");
  http.setTimeout(30000); // 30 seconds timeout

  int httpCode = http.GET();
  Serial.printf("[OTA] HTTP Response: %d\n", httpCode);

  if (httpCode == HTTP_CODE_OK) {
    int contentLength = http.getSize();
    WiFiClient *stream = http.getStreamPtr();

    if (contentLength > 0 && Update.begin(contentLength)) {
      Serial.printf("[OTA] Content-Length: %d bytes\n", contentLength);

      // Cập nhật hiển thị
      spr.fillSprite(TFT_BLUE);
      spr.drawString("OTA Update", tft.width() / 2, tft.height() / 2 - 40);
      spr.drawString("Flashing...", tft.width() / 2, tft.height() / 2);
      spr.pushSprite(0, 0);

      size_t written = Update.writeStream(*stream);

      if (written == contentLength) {
        Serial.println("[OTA] Written successfully");
      } else {
        Serial.printf("[OTA] Written only %d/%d bytes\n", written,
                      contentLength);
      }

      if (Update.end()) {
        if (Update.isFinished()) {
          // Hiển thị thành công
          spr.fillSprite(TFT_GREEN);
          spr.setTextColor(TFT_BLACK);
          spr.drawString("OTA Success!", tft.width() / 2,
                         tft.height() / 2 - 20);
          spr.drawString("Restarting...", tft.width() / 2,
                         tft.height() / 2 + 20);
          spr.pushSprite(0, 0);

          Serial.println("[OTA] Update complete. Restarting...");
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
    Serial.printf("[OTA] HTTP GET failed, code: %d\n", httpCode);

    // Hiển thị lỗi
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
}
