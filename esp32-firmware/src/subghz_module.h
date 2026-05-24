#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ELECHOUSE_CC1101_SRC_DRV.h>
#include "config.h"

// Redefinimos el tamaño del buffer a 512 transiciones de flancos analógicos (RAW Timings)
#define SG_BUF 512

class SubGHzModule {

public:
    bool begin();
    bool isReady() const { return _ready; }

    bool capture(
        float freq,
        JsonDocument& result
    );

    bool replay(
        float freq,
        const char* hex,
        JsonDocument& result
    );

    bool scanFreqs(JsonDocument& result);

    bool jam(
        float freq,
        int ms,
        JsonDocument& result
    );

private:
    bool _ready = false;

    uint16_t _buf[SG_BUF];
    int _len = 0;

    const float SG_FREQS[5] = {
        315.0,
        433.92,
        868.0,
        915.0,
        304.25
    };

    void _setFreq(float f);
    void _releaseAll(); //
};

extern SubGHzModule SubGHz;