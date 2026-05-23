// ir_module.h

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

#include "config.h"

class IRModule {

public:

    struct TVCode {
        decode_type_t proto;
        uint64_t code;
        uint16_t bits;
    };

    bool begin();

    bool isReady() const {
        return _ready;
    }

    bool capture(JsonDocument& result);

    bool replay(
        const char* protoStr,
        uint64_t code,
        uint16_t bits,
        JsonDocument& result
    );

    bool tvBGone(JsonDocument& result);

    bool detectCamera(JsonDocument& result);

private:

    bool _ready = false;

    IRrecv* _rx = nullptr;
    IRsend* _tx = nullptr;

    static const TVCode TV_CODES[];
    static const int TV_COUNT;
};

extern IRModule IRMod;
