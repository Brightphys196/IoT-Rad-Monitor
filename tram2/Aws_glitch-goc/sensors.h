// Hàm ngắt được gọi mỗi khi có xung từ ống Geiger
ICACHE_RAM_ATTR static void geiger_interrupt() {
    geiger_counts++;
}

void readDHT() {
    float newHumi = HT.readHumidity();
    float newTempC = HT.readTemperature();
    if (!isnan(newHumi) && !isnan(newTempC)) {
        humi = newHumi;
        tempC = newTempC;
    } else {
        Serial.println(F("Failed to read from DHT sensor!"));
    }
}

void calculateRadiation() {
    static unsigned long lastCalcMillis = 0;
    static unsigned long last_geiger_counts = 0;

    if (millis() - lastCalcMillis >= 1000) { // Tính toán mỗi giây
        unsigned long duration = millis() - lastCalcMillis;
        unsigned long current_counts = geiger_counts;
        
        cps = (float)(current_counts - last_geiger_counts) * 1000.0f / duration;
        uSv = cps * 60.0f / GEIGER_CONVERSION_FACTOR;

        last_geiger_counts = current_counts;
        lastCalcMillis = millis();
    }
}

void initSensors() {
    HT.begin();
    pinMode(GEIGER_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(GEIGER_PIN), geiger_interrupt, FALLING);
}

void handleSensors() {
    readDHT();
    calculateRadiation();
}