#include "rfid_module.h"

RFIDModule RFIDMod;

bool RFIDModule::begin() {
    Wire.begin(PIN_SDA, PIN_SCL);
    _nfc.begin();
    uint32_t v = _nfc.getFirmwareVersion();
    if (!v) { _ready = false; return false; }
    _nfc.SAMConfig();
    _ready = true;
    return true;
}

bool RFIDModule::readCard(JsonDocument& result) {
    uint8_t uid[7], len;
    if (!_nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 1000)) {
        result["detected"] = false;
        return false;
    }
    char s[21]; _uid2str(uid, len, s);
    result["detected"]  = true;
    result["uid"]       = s;
    result["uid_len"]   = len;
    result["card_type"] = _cardType(len);
    return true;
}

bool RFIDModule::dumpMifare(JsonDocument& result) {
    uint8_t uid[7], len;
    if (!_nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 1000)
        || len != 4) {
        result["success"] = false;
        result["error"]   = "No Mifare Classic";
        return false;
    }

    char us[13]; _uid2str(uid, len, us);
    result["uid"] = us;

    JsonArray secs = result["sectors"].to<JsonArray>();
    int ok = 0, fail = 0;

    for (uint8_t blk = 0; blk < MIFARE_BLOCKS; blk++) {
        uint8_t data[MIFARE_BSIZE];
        bool    rd  = false;
        String  key = "";

        for (int k = 0; k < MIFARE_NKEYS && !rd; k++) {
            uint8_t kbuf[6];
            memcpy(kbuf, MIFARE_KEYS[k], 6);
            if (_nfc.mifareclassic_AuthenticateBlock(uid, len, blk, 0, kbuf)) {
                if (_nfc.mifareclassic_ReadDataBlock(blk, data)) {
                    rd = true;
                    char ks[13];
                    sprintf(ks, "%02X%02X%02X%02X%02X%02X",
                            kbuf[0],kbuf[1],kbuf[2],kbuf[3],kbuf[4],kbuf[5]);
                    key = ks;
                }
            }
        }

        JsonObject o = secs.add<JsonObject>();
        o["block"]   = blk;
        o["success"] = rd;

        if (rd) {
            String hex = "";
            for (int i = 0; i < MIFARE_BSIZE; i++) {
                char b[3]; sprintf(b, "%02X", data[i]); hex += b;
            }
            o["data"]     = hex;
            o["key_used"] = key;
            ok++;
        } else {
            o["data"] = "";
            fail++;
        }
    }

    result["blocks_read"]   = ok;
    result["blocks_failed"] = fail;
    result["success"]       = (ok > 0);
    return true;
}

bool RFIDModule::writeNDEF(const char* text, JsonDocument& result) {
    uint8_t uid[7], len;
    if (!_nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 2000)) {
        result["success"] = false;
        result["error"]   = "No card";
        return false;
    }

    uint8_t tl       = strlen(text);
    uint8_t msg[48]  = {0};
    uint8_t idx      = 0;

    msg[idx++] = 0x03; msg[idx++] = tl + 7;
    msg[idx++] = 0xD1; msg[idx++] = 0x01;
    msg[idx++] = tl + 3; msg[idx++] = 'T';
    msg[idx++] = 0x02; msg[idx++] = 'e'; msg[idx++] = 's';
    memcpy(msg + idx, text, tl); idx += tl;
    msg[idx++] = 0xFE;

    bool ok = _nfc.ntag2xx_WritePage(4, msg);
    result["success"]       = ok;
    result["bytes_written"] = idx;
    return ok;
}

bool RFIDModule::detectReader(JsonDocument& result) {
    uint8_t uid[7], len;
    bool f = _nfc.readPassiveTargetID(
        PN532_MIFARE_ISO14443A, uid, &len, 200);
    result["field_detected"] = f;
    result["warning"] = f ? "RF reader detected" : "No reader detected";
    return f;
}

void RFIDModule::_uid2str(uint8_t* uid, uint8_t len, char* out) {
    out[0] = '\0';
    for (int i = 0; i < len; i++) {
        char b[3]; sprintf(b, "%02X", uid[i]); strcat(out, b);
    }
}

String RFIDModule::_cardType(uint8_t len) {
    switch (len) {
        case 4:  return "MIFARE_CLASSIC";
        case 7:  return "MIFARE_ULTRALIGHT_OR_NTAG";
        default: return "UNKNOWN";
    }
}
