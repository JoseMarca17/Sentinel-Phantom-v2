#include "subghz_module.h"

SubGHzModule SubGHz;

bool SubGHzModule::begin() {
    ELECHOUSE_cc1101.setSpiPin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CC1101_CS);
    ELECHOUSE_cc1101.Init();
    if (!ELECHOUSE_cc1101.getCC1101()) { _ready = false; return false; }
    ELECHOUSE_cc1101.setMHZ(433.92);
    ELECHOUSE_cc1101.SetRx();
    _ready = true;
    return true;
}

bool SubGHzModule::capture(float freq, JsonDocument& result) {
    _setFreq(freq);
    ELECHOUSE_cc1101.SetRx();

    uint32_t t = millis();
    _len = 0;

    while (millis() - t < 5000) {
        if (digitalRead(PIN_CC1101_GDO0) == HIGH) {
            while (digitalRead(PIN_CC1101_GDO0) == HIGH && _len < SG_BUF) {
                _buf[_len++] = 1;
                delayMicroseconds(100);
            }
            break;
        }
    }

    if (_len == 0) {
        result["success"] = false;
        result["error"]   = "No signal";
        return false;
    }

    char hex[SG_BUF * 2 + 1];
    _toHex(hex, sizeof(hex));
    result["success"]  = true;
    result["freq_mhz"] = freq;
    result["length"]   = _len;
    result["raw_hex"]  = hex;
    return true;
}

bool SubGHzModule::replay(float freq, const char* hex,
                           JsonDocument& result) {
    _setFreq(freq);
    ELECHOUSE_cc1101.SetTx();
    delay(50);

    int     hl = strlen(hex);
    int     nb = hl / 2;
    uint8_t buf[SG_BUF];

    for (int i = 0; i < nb && i < SG_BUF; i++) {
        char b[3] = {hex[i*2], hex[i*2+1], '\0'};
        buf[i] = (uint8_t)strtol(b, nullptr, 16);
    }

    ELECHOUSE_cc1101.SendData(buf, nb);
    delay(100);
    ELECHOUSE_cc1101.SetRx();

    result["success"]    = true;
    result["freq_mhz"]   = freq;
    result["bytes_sent"] = nb;
    return true;
}

bool SubGHzModule::scanFreqs(JsonDocument& result) {
    JsonArray arr = result["frequencies"].to<JsonArray>();

    for (int i = 0; i < 5; i++) {
        float f = SG_FREQS[i];
        _setFreq(f);
        ELECHOUSE_cc1101.SetRx();
        delay(200);

        bool act = false;
        uint32_t t = millis();
        while (millis() - t < 300)
            if (digitalRead(PIN_CC1101_GDO0) == HIGH) { act = true; break; }

        JsonObject o   = arr.add<JsonObject>();
        o["freq_mhz"]  = f;
        o["activity"]  = act;
    }

    result["scanned"] = 5;
    return true;
}

bool SubGHzModule::jam(float freq, int ms, JsonDocument& result) {
    _setFreq(freq);
    ELECHOUSE_cc1101.SetTx();

    uint8_t noise[61];
    for (int i = 0; i < 61; i++) noise[i] = random(0, 255);

    uint32_t t = millis();
    int pkts = 0;

    while (millis() - t < (uint32_t)ms) {
        ELECHOUSE_cc1101.SendData(noise, 61);
        pkts++;
        delay(5);
    }

    ELECHOUSE_cc1101.SetRx();
    result["success"]      = true;
    result["freq_mhz"]     = freq;
    result["duration_ms"]  = ms;
    result["packets_sent"] = pkts;
    return true;
}

void SubGHzModule::_setFreq(float f) { ELECHOUSE_cc1101.setMHZ(f); }

void SubGHzModule::_toHex(char* out, int maxLen) {
    out[0] = '\0';
    int w = 0;
    for (int i = 0; i < _len && w + 2 < maxLen; i++) {
        sprintf(out + w, "%02X", _buf[i]);
        w += 2;
    }
}
