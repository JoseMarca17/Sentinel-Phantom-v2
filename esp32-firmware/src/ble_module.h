#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>

class BLEModule {

public:

    bool begin();
    bool isReady() const { return _ready; }

    void scan(JsonDocument& result);

    void startFakeBeacon(
        const char* name,
        const char* uuid
    );

    void stopFakeBeacon();

private:

    NimBLEScan* _scanner = nullptr;
    NimBLEAdvertising* _adv = nullptr;

    bool _ready = false;
    bool _adving = false;

    bool _isTracker(NimBLEAdvertisedDevice* d);
    bool _isCamera(NimBLEAdvertisedDevice* d);

    int _dist(int rssi);
};

extern BLEModule BLEMod;
