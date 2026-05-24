#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include <Wire.h>
#include <Adafruit_PN532.h>

#include "config.h"

#define MIFARE_BLOCKS 64
#define MIFARE_BSIZE 16
// #define MIFARE_NKEYS 4

class RFIDModule {

public:

    bool begin();
    bool isReady() const { return _ready; }

    bool readCard(JsonDocument& result);

    bool dumpMifare(JsonDocument& result);

    bool writeNDEF(
        const char* text,
        JsonDocument& result
    );

    bool detectReader(JsonDocument& result);

    bool cloneUID(const char* targetUidHex, JsonDocument& result);

private:

    bool _ready = false;

    Adafruit_PN532 _nfc = Adafruit_PN532(-1, -1);

    const uint8_t MIFARE_KEYS[MIFARE_NKEYS][6] = {
        {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
        {0xA0,0xA1,0xA2,0xA3,0xA4,0xA5},
        {0xD3,0xF7,0xD3,0xF7,0xD3,0xF7},
        {0x00,0x00,0x00,0x00,0x00,0x00}
    };

    void _uid2str(
        uint8_t* uid,
        uint8_t len,
        char* out
    );

    String _cardType(uint8_t len);
};

extern RFIDModule RFIDMod;
