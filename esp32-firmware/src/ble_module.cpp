#include "ble_module.h"
#include "config.h"

BLEModule BLEMod;

static const char* TRACKER_UUIDS[] = {
    "FD6F",
    "FEBE",
    "FEAA",
    "FE9F",
    nullptr
};

static const char* CAMERA_NAMES[] = {
    "IPC",
    "CAM",
    "IPCAM",
    "CAMERA",
    "XIAOMI",
    "WYZE",
    nullptr
};

bool BLEModule::begin() {

    try {

        NimBLEDevice::init(DEVICE_NAME);

        NimBLEDevice::setPower(
            ESP_PWR_LVL_P9
        );

        _scanner = NimBLEDevice::getScan();

        if (!_scanner) {
            _ready = false;
            return false;
        }

        _scanner->setActiveScan(true);
        _scanner->setInterval(100);
        _scanner->setWindow(99);

        _ready = true;
        return true;
    }
    catch (...) {

        _ready = false;
        return false;
    }
}

void BLEModule::scan(JsonDocument& result) {

    if (!_ready) {
        result["error"] = "BLE not ready";
        return;
    }

    NimBLEScanResults res =
        _scanner->start(5, false);

    JsonArray devs =
        result["devices"].to<JsonArray>();

    int trackers = 0;
    int cameras = 0;

    for (int i = 0;
         i < res.getCount() && i < 50;
         i++) {

        NimBLEAdvertisedDevice dev =
            res.getDevice(i);

        JsonObject o =
            devs.add<JsonObject>();

        o["address"] =
            dev.getAddress().toString().c_str();

        o["name"] =
            dev.haveName()
            ? dev.getName().c_str()
            : "";

        o["rssi"] =
            dev.getRSSI();

        o["distance"] =
            _dist(dev.getRSSI());

        bool tr = _isTracker(&dev);
        bool ca = _isCamera(&dev);

        o["is_tracker"] = tr;
        o["is_camera"] = ca;

        if (tr) trackers++;
        if (ca) cameras++;

        if (dev.haveManufacturerData()) {

            std::string mfr =
                dev.getManufacturerData();

            String hex = "";

            for (size_t j = 0;
                 j < mfr.size();
                 j++) {

                char b[3];

                sprintf(
                    b,
                    "%02X",
                    (uint8_t)mfr[j]
                );

                hex += b;
            }

            o["manufacturer_data"] = hex;
        }
    }

    result["count"] = res.getCount();
    result["trackers"] = trackers;
    result["cameras"] = cameras;

    _scanner->clearResults();
}

void BLEModule::startFakeBeacon(
    const char* name,
    const char* uuid
) {

    if (!_ready) return;

    _adv = NimBLEDevice::getAdvertising();

    if (!_adv) return;

    NimBLEAdvertisementData data;

    data.setName(name);

    if (uuid && strlen(uuid) > 0) {
        data.setCompleteServices(
            NimBLEUUID(uuid)
        );
    }

    _adv->setAdvertisementData(data);
    _adv->start();

    _adving = true;
}

void BLEModule::stopFakeBeacon() {

    if (_adv) {
        _adv->stop();
    }

    _adving = false;
}

bool BLEModule::_isTracker(
    NimBLEAdvertisedDevice* d
) {

    for (int i = 0;
         TRACKER_UUIDS[i];
         i++) {

        if (
            d->haveServiceUUID() &&
            d->isAdvertisingService(
                NimBLEUUID(TRACKER_UUIDS[i])
            )
        ) {
            return true;
        }
    }

    return false;
}

bool BLEModule::_isCamera(
    NimBLEAdvertisedDevice* d
) {

    if (!d->haveName()) {
        return false;
    }

    String n =
        d->getName().c_str();

    n.toUpperCase();

    for (int i = 0;
         CAMERA_NAMES[i];
         i++) {

        if (n.indexOf(CAMERA_NAMES[i]) >= 0) {
            return true;
        }
    }

    return false;
}

int BLEModule::_dist(int rssi) {

    if (rssi >= -50) return 1;
    if (rssi >= -65) return 3;
    if (rssi >= -75) return 7;
    if (rssi >= -85) return 15;

    return 30;
}
