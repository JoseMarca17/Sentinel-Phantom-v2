#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>

class WiFiModule {

public:

    bool begin();
    bool isReady() const { return _ready; }

    void scan(JsonDocument& result);

    void deauth(
        const char* bssidStr,
        const char* clientStr,
        int channel,
        int count
    );

    void startFakeAP(
        const char* ssid,
        int channel
    );

    void stopFakeAP();

private:

    bool _ready = false;
    bool _fakeAP = false;

    void _parseMac(
        const char* s,
        uint8_t* mac
    );

    String _encStr(wifi_auth_mode_t m);
};

extern WiFiModule WiFiMod;
