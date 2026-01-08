#include "config_globals.h"

void setup()
{
    Init();
    eeprom();
    arduinoOTA();
    connectAWS();
    // socKetIO();
}

void loop()
{   
    ArduinoOTA.handle();
    readData();
    display();
}