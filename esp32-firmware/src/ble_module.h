// src/modules/ble_module.h
#ifndef BLE_MODULE_H
#define BLE_MODULE_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

class PhantomBLECallbacks : public BLEAdvertisedDeviceCallbacks {
public:
    void onResult(BLEAdvertisedDevice advertisedDevice) override;
};

class BLEModule {
private:
    BLEScan* pBLEScan;
    BLEAdvertising* pAdvertising;
    bool isScanning;
    bool isAdvertising;
    String filterMacAddress;
    bool antiTrackingMode;
    uint32_t lastScanTime;

    void parseManufacturerPayload(BLEAdvertisedDevice device, JsonObject& targetJson);

public:
    BLEModule();
    bool begin();
    
    // Operaciones Pasivas (1, 2, 3)
    void startSniffer(String targetMac, bool antiTracking, JsonDocument& response);
    void stopSniffer(JsonDocument& response);
    
    // Operaciones Activas / Inyección (4, 5)
    void startFlooding(String ecosystem, uint16_t intervalMs, JsonDocument& response);
    void cloneBeacon(const char* hexPayload, JsonDocument& response);
    void stopAdvertising(JsonDocument& response);
    
    // Auditoría IoT (7)
    bool connectGATT(String targetMac, JsonDocument& response);
    void runBruteForceStep(String targetMac, const char* serviceUuid, const char* charUuid, uint32_t code, JsonDocument& response);
    
    void loopTick();
    void processCapturedDevice(BLEAdvertisedDevice device);
};

extern BLEModule BLEMod;

#endif // BLE_MODULE_H