// src/modules/ble_module.h
#ifndef BLE_MODULE_H
#define BLE_MODULE_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

/**
 * @brief Callbacks de la antena adaptados a tu versión exacta del Framework.
 */
class PhantomBLECallbacks : public BLEAdvertisedDeviceCallbacks {
public:
    // CORRECCIÓN: Pasado por valor exacto como exige tu framework
    void onResult(BLEAdvertisedDevice advertisedDevice) override;
};

class BLEModule {
private:
    BLEScan* pBLEScan;
    bool isScanning;
    String filterMacAddress;
    bool antiTrackingMode;
    uint32_t lastScanTime;

    // CORRECCIÓN: Ajustado a valor para consistencia interna
    void parseManufacturerPayload(BLEAdvertisedDevice device, JsonObject& targetJson);

public:
    BLEModule();
    bool begin();
    
    void startSniffer(String targetMac, bool antiTracking, JsonDocument& response);
    void stopSniffer(JsonDocument& response);
    bool connectGATT(String targetMac, JsonDocument& response);
    
    void loopTick();
    
    // CORRECCIÓN: Ajustado a valor
    void processCapturedDevice(BLEAdvertisedDevice device);
};

extern BLEModule BLEMod;

#endif // BLE_MODULE_H