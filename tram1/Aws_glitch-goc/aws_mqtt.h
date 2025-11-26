void publishMessage() {
    StaticJsonDocument<200> doc;
    time_t now = time(nullptr);
    struct tm timeinfo;
    gmtime_r(&now, &timeinfo);
    char buffer[32];
    strftime(buffer, sizeof(buffer), "%c", &timeinfo);

    doc["LocalTime"] = buffer;
    doc["timestamp"] = now;
    doc["humidity"] = humi;
    doc["temperature"] = tempC;
    doc["uSv"] = uSv;
    doc["cps"] = cps;
    doc["counts"] = geiger_counts;
    doc["stationName"] = String(statusStation);
    
    char jsonBuffer[512];
    serializeJson(doc, jsonBuffer);
    client.publish(AWS_IOT_PUBLISH_TOPIC, jsonBuffer);
    Serial.println("Published to AWS: ");
    Serial.println(jsonBuffer);
}

void messageReceived(char* topic, byte* payload, unsigned int length) {
    Serial.print("Received [");
    Serial.print(topic);
    Serial.print("]: ");
    // Xử lý payload nhận được ở đây nếu cần
    for (int i = 0; i < length; i++) {
        Serial.print((char)payload[i]);
    }
    Serial.println();
}

void connectAWS() {
    // Cấu hình thời gian cho việc xác thực chứng chỉ
    configTime(TIMEZONE_OFFSET_SECONDS, 0, "pool.ntp.org", "time.nist.gov");
    time_t now = time(nullptr);
    while (now < 1510592825) { // Chờ đến khi thời gian được đồng bộ
        delay(500);
        Serial.print(".NTP.");
        now = time(nullptr);
    }
    Serial.println(" Time OK!");

    // Cấu hình kết nối an toàn TLS
    net.setTrustAnchors(&cert);
    net.setClientRSACert(&client_crt, &key);
    
    client.setServer(AWS_IOT_ENDPOINT, 8883);
    client.setCallback(messageReceived);

    Serial.println("Connecting to AWS IoT...");
    while (!client.connect(THINGNAME)) {
        Serial.print(".");
        delay(500);
    }
    
    client.subscribe(AWS_IOT_SUBSCRIBE_TOPIC);
    Serial.println("AWS IoT Connected!");
}

void handleAWS() {
    if (!client.connected()) {
        Serial.println("AWS connection lost. Reconnecting...");
        connectAWS();
    }
    client.loop(); // Duy trì kết nối MQTT

    if (millis() - lastPublishMillis > PUBLISH_INTERVAL_MS) {
        lastPublishMillis = millis();
        publishMessage();
    }
}