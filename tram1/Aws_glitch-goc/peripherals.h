void initSerial() {
    Serial.begin(115200);
}

void initEEPROM() {
    EEPROM.begin(512);
}

void initDisplay() {
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("Starting up...");
}

void handleDisplay() {
    static unsigned long lastDisplayMillis = 0;
    if (millis() - lastDisplayMillis > 1000) { // Cập nhật LCD mỗi giây
        lastDisplayMillis = millis();
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("T:" + String(tempC, 1) + "C C:" + String(cps, 2));
        lcd.setCursor(0, 1);
        lcd.print("H:" + String(humi, 1) + "% U:" + String(uSv, 2));
    }
}