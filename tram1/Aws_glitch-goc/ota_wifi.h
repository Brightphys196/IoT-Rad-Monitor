void connectWiFi() {f:\DOAN\TRẠM 1\secrets-goc.h
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
}

void initOTA() {
    ArduinoOTA.setHostname(statusStation);
    // ArduinoOTA.setPassword("your_ota_password"); // Bỏ comment và đặt mật khẩu nếu cần

    ArduinoOTA.onStart([]() { Serial.println("OTA Start"); });
    ArduinoOTA.onEnd([]() { Serial.println("\nOTA End"); });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("OTA Error[%u]: ", error);
    });
    
    ArduinoOTA.begin();
}

void handleOTA() {
    ArduinoOTA.handle();
}