// src/modules/ble_module.cpp
#include "ble_module.h"
#include "serial_protocol.h"

BLEModule BLEMod;

// CORRECCIÓN: Firma corregida sin el puntero erróneo
void PhantomBLECallbacks::onResult(BLEAdvertisedDevice advertisedDevice) {
    BLEMod.processCapturedDevice(advertisedDevice);
}

BLEModule::BLEModule() {
    pBLEScan = nullptr;
    isScanning = false;
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
        
        return true;
    } catch (...) {
        return false;
    }
}

void BLEModule::startSniffer(String targetMac, bool antiTracking, JsonDocument& response) {
    filterMacAddress = targetMac;
    filterMacAddress.toLowerCase();
    antiTrackingMode = antiTracking;
    isScanning = true;
    lastScanTime = millis();
    
    pBLEScan->start(0, nullptr, false);
    
    response["success"] = true;
    response["status"] = "sniffer_active";
    response["filtered_target"] = (targetMac.length() > 0) ? targetMac : "ALL";
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

// CORRECCIÓN: Operadores cambiados de '->' a '.' al recibir el objeto directamente
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

    switch (companyId) {
        case 0x004C:
            targetJson["vendor"] = "Apple Inc.";
            if (data.length() >= 22 && data[2] == 0x12) {
                targetJson["type"] = "TRACKER_DEVICE";
                targetJson["subtype"] = "Apple AirTag";
                targetJson["is_tracker"] = true;
            } else {
                targetJson["type"] = "PERIPHERAL";
                targetJson["is_tracker"] = false;
            }
            break;

        case 0x0075:
            targetJson["vendor"] = "Samsung Electronics";
            if (data.length() >= 15 && data[2] == 0x01) {
                targetJson["type"] = "TRACKER_DEVICE";
                targetJson["subtype"] = "Samsung SmartTag";
                targetJson["is_tracker"] = true;
            } else {
                targetJson["type"] = "PERIPHERAL";
                targetJson["is_tracker"] = false;
            }
            break;

        case 0x0006:
            targetJson["vendor"] = "Microsoft Corp.";
            targetJson["type"] = "INFRASTRUCTURE";
            targetJson["is_tracker"] = false;
            break;

        case 0x03E0:
            targetJson["vendor"] = "Google LLC";
            targetJson["type"] = "INFRASTRUCTURE";
            targetJson["is_tracker"] = false;
            break;

        default:
            targetJson["vendor"] = "GENERIC_VENDOR";
            targetJson["type"] = "UNKNOWN";
            targetJson["is_tracker"] = false;
            break;
    }
}

// CORRECCIÓN: Acceso por punto '.' para interactuar con el objeto directo
void BLEModule::processCapturedDevice(BLEAdvertisedDevice device) {
    if (!isScanning) return;

    String currentMac = String(device.getAddress().toString().c_str());
    currentMac.toLowerCase();

    if (filterMacAddress.length() > 0 && currentMac != filterMacAddress) {
        return;
    }

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

    if (antiTrackingMode && !obj["is_tracker"]) {
        return;
    }

    Protocol.sendData("BLE_STREAM", outDoc);
}

bool BLEModule::connectGATT(String targetMac, JsonDocument& response) {
    if (isScanning) {
        pBLEScan->stop();
    }

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

    if (isScanning) {
        pBLEScan->start(0, nullptr, false);
    }

    return true;
}

void BLEModule::loopTick() {
    // Con NimBLE, el manejo de memoria interna es automático. 
    // Solo reiniciamos el escaneo de fondo si es estrictamente necesario por tiempo.
    if (isScanning && (millis() - lastScanTime > 10000)) {
        lastScanTime = millis();
        // NimBLE no necesita clearResults(), se gestiona solo.
    }
}