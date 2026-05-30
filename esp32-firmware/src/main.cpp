#include <Arduino.h>
#include "config.h" 
#include "serial_protocol.h"
#include "wifi_module.h" 
#include "ble_module.h" 
#include "subghz_module.h" 
#include "rfid_module.h" 
#include "nrf24_module.h" 
#include "ir_module.h"

struct ModuleStatus { 
    bool ready; 
    const char* name; 
};

ModuleStatus SYS = { false, "system" };
ModuleStatus WIFI_SYS   = {false, "wifi"}; 
ModuleStatus BLE_SYS    = {false, "ble"};
ModuleStatus SUB_SYS    = {false, "subghz"}; 
ModuleStatus RFID_SYS   = {false, "rfid"};
ModuleStatus NRF_SYS    = {false, "nrf24"}; 
ModuleStatus IR_SYS     = {false, "ir"};

void safeInit(ModuleStatus& mod, bool (*fn)()) {
    Serial.printf("[INIT] %s...\n", mod.name);
    uint32_t t = millis();
    mod.ready = fn();
    if (mod.ready) {
        Serial.printf("[OK] %s (%lu ms)\n", mod.name, millis() - t);
    } else {
        Serial.printf("[FAIL] %s\n", mod.name);
    }
    delay(100);
}

void heartbeat() {
    static uint32_t last = 0;
    static bool state = false;
    if (millis() - last >= 500) {
        last = millis();
        state = !state;
        digitalWrite(PIN_LED, state);
    }
}

void setup() {
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);
    
    // CORRECCIÓN: Evita el desbordamiento de búfer al recibir respuestas de streams
    Serial.setRxBufferSize(2048);
    
    Serial.begin(115200);
    Protocol.begin(); 
    delay(1000);
    
    Serial.println("\n================================");
    Serial.println("PHANTOM FIRMWARE START");
    Serial.println("================================");
    
    safeInit(WIFI_SYS, []() { return WiFiMod.begin(); });
    safeInit(BLE_SYS, []() { return BLEMod.begin(); });
    safeInit(SUB_SYS, []() { return SubGHz.begin(); });
    safeInit(RFID_SYS, []() { return RFIDMod.begin(); });
    safeInit(NRF_SYS, []() { return NRF24.begin(); });
    safeInit(IR_SYS, []() { return IRMod.begin(); });
    
    SYS.ready = true;
    Serial.println("================================");
    Serial.println("SYSTEM READY");
    Serial.println("================================");
}

void handleSYS(Command &cmd) {
    JsonDocument d; 
    if (cmd.cmd == "PING" || cmd.cmd == "info") {
        d["device"]  = DEVICE_NAME;
        d["version"] = FW_VERSION;
        d["heap"]    = ESP.getFreeHeap();
        JsonArray mods = d["modules"].to<JsonArray>();
        
        struct { const char* n; bool r; } mList[] = {
            {"wifi", WIFI_SYS.ready}, {"ble", BLE_SYS.ready},
            {"subghz", SUB_SYS.ready}, {"rfid", RFID_SYS.ready},
            {"nrf24", NRF_SYS.ready}, {"ir", IR_SYS.ready}
        };
        for(auto& m : mList) {
            JsonObject obj = mods.add<JsonObject>();
            obj["name"] = m.n;
            obj["ready"] = m.r;
        }
        Protocol.sendData("SYS", d);
    } else if (cmd.cmd == "RESET") {
        JsonDocument r;
        r["status"] = "rebooting";
        Protocol.sendData("SYS", r);
        delay(500);
        ESP.restart();
    } else {
        Protocol.sendError("SYS", "unknown command");
    }
}

void handleWIFI(Command &cmd) {
    if (!WIFI_SYS.ready) { Protocol.sendError("WIFI", "module offline"); return; }
    JsonDocument d;
    if (cmd.cmd == "SCAN") {
        WiFiMod.scan(d);
        Protocol.sendData("WIFI", d);
    } else {
        Protocol.sendError("WIFI", "unknown command");
    }
}

// CORRECCIÓN: Integración de rutas analíticas para el módulo BLE
void handleBLE(Command &cmd) {
    if (!BLE_SYS.ready) { Protocol.sendError("BLE", "module offline"); return; }
    JsonDocument d;
    String mode = cmd.cmd;
    mode.toUpperCase();
    
    if (mode == "SNIFFER_START" || mode == "SCAN") {
        String targetMac = cmd.params["target_mac"] | "";
        bool antiTracking = cmd.params["anti_tracking"] | false;
        BLEMod.startSniffer(targetMac, antiTracking, d);
        Protocol.sendData("BLE", d);
    } 
    else if (mode == "SNIFFER_STOP") {
        BLEMod.stopSniffer(d);
        Protocol.sendData("BLE", d);
    }
    else if (mode == "GATT_CONNECT") {
        String targetMac = cmd.params["mac"] | "";
        if (targetMac.length() == 0) {
            d["success"] = false;
            d["error"] = "missing_mac_param";
            Protocol.sendData("BLE", d);
            return;
        }
        bool success = BLEMod.connectGATT(targetMac, d);
        d["success"] = success;
        Protocol.sendData("BLE", d);
    } 
    else {
        Protocol.sendError("BLE", "unknown command");
    }
}

void handleSUBGHZ(Command &cmd) {
    if (!SUB_SYS.ready) { Protocol.sendError("SUBGHZ", "module offline"); return; }
    JsonDocument d;
    
    if (cmd.cmd == "SCAN") {
        SubGHz.scanFreqs(d);
        Protocol.sendData("SUBGHZ", d);
    } 
    else if (cmd.cmd == "CAPTURE") {
        float freq = cmd.params["freq_mhz"] | 433.92f;
        SubGHz.capture(freq, d);
        Protocol.sendData("SUBGHZ", d); 
    } 
    else if (cmd.cmd == "REPLAY") {
        float freq = cmd.params["freq_mhz"] | 433.92f;
        const char* hexPayload = cmd.params["hex"] | "";
        
        if (strlen(hexPayload) == 0) {
            d["success"] = false;
            d["error"] = "missing hex data";
            Protocol.sendData("SUBGHZ", d);
            return;
        }
        
        SubGHz.replay(freq, hexPayload, d);
        Protocol.sendData("SUBGHZ", d);
    } 
    else if (cmd.cmd == "JAM") {
        float freq = cmd.params["freq_mhz"] | 433.92f;
        int duration = cmd.params["duration_ms"] | 1000;
        SubGHz.jam(freq, duration, d);
        Protocol.sendData("SUBGHZ", d);
    } 
    else {
        Protocol.sendError("SUBGHZ", "unknown command");
    }
}

void handleRFID(Command &cmd) {
    if (!RFID_SYS.ready) { Protocol.sendError("RFID", "module offline"); return; }
    JsonDocument d;
    
    if (cmd.cmd == "READ" || cmd.cmd == "READ_CARD") {
        RFIDMod.readCard(d);
        Protocol.sendData("RFID", d);
    } else if (cmd.cmd == "DUMP") {
        bool dumpOk = RFIDMod.dumpMifare(d);
        d["success"] = dumpOk;
        Protocol.sendData("RFID", d);
    } else if (cmd.cmd == "CLONE_UID") {
        const char* targetUid = cmd.params["uid"] | "";
        if (strlen(targetUid) == 0) {
            d["success"] = false;
            d["error"] = "missing uid param";
            Protocol.sendData("RFID", d);
            return;
        }
        
        RFIDMod.cloneUID(targetUid, d);
        Protocol.sendData("RFID", d);
    } else {
        Protocol.sendError("RFID", "unknown command");
    }
}

void handleNRF24(Command &cmd) {
    if (!NRF_SYS.ready) { Protocol.sendError("NRF24", "module offline"); return; }
    JsonDocument d;
    if (cmd.cmd == "SPECTRUM_SCAN") {
        NRF24.scanSpectrum(d);
        Protocol.sendData("NRF24", d);
    } else if (cmd.cmd == "HID_SCAN") {
        NRF24.scanHID(d);
        Protocol.sendData("NRF24", d);
    } else if (cmd.cmd == "MONITOR_START") {
        NRF24.startMonitor();
        d["status"] = "started";
        Protocol.sendData("NRF24", d);
    } else if (cmd.cmd == "MONITOR_STOP") {
        NRF24.stopMonitor();
        d["status"] = "stopped";
        Protocol.sendData("NRF24", d);
    } 
    else if (cmd.cmd == "JAM_START") {
        String modeStr = cmd.params["mode"] | "SINGLE";
        uint8_t ch = cmd.params["channel"] | 50;
        
        JamMode m = JAM_SINGLE;
        if (modeStr == "CARPET") m = JAM_CARPET;
        
        NRF24.startJammer(m, ch);
        d["status"] = "jamming_active";
        d["mode"] = modeStr;
        d["channel"] = ch;
        Protocol.sendData("NRF24", d);
    } 
    else if (cmd.cmd == "JAM_STOP") {
        NRF24.stopJammer();
        d["status"] = "jamming_stopped";
        Protocol.sendData("NRF24", d);
    } 
    else if (cmd.cmd == "JAM_STATUS") {
        NRF24.jamStatus(d);
        Protocol.sendData("NRF24", d);
    } else {
        Protocol.sendError("NRF24", "unknown command");
    }
}

void handleIR(Command &cmd) {
    if (!IR_SYS.ready) { Protocol.sendError("IR", "module offline"); return; }
    JsonDocument d;
    if (cmd.cmd == "CAPTURE") {
        IRMod.capture(d);
        Protocol.sendData("IR", d);
    } else if (cmd.cmd == "TV_B_GONE") {
        IRMod.tvBGone(d);
        Protocol.sendData("IR", d);
    } else {
        Protocol.sendError("IR", "unknown command");
    }
}

void loop() {
    heartbeat();
    if (NRF_SYS.ready) {
        NRF24.monitorTick();
        NRF24.jamTick(); 
    }
    
    // CORRECCIÓN: Hilo asíncrono para evitar desbordamiento del caché BLE
    if (BLE_SYS.ready) {
        BLEMod.loopTick();
    }
    
    if (!Protocol.available()) {
        yield();
        return;
    }
    
    Command cmd = Protocol.read();
    if (!cmd.valid) {
        Protocol.sendError("SYS", "invalid json");
        return;
    }
    
    String m = cmd.mod;
    m.toUpperCase();
    
    if (m == "SYS") handleSYS(cmd);
    else if (m == "WIFI") handleWIFI(cmd);
    else if (m == "BLE") handleBLE(cmd);
    else if (m == "SUBGHZ") handleSUBGHZ(cmd);
    else if (m == "RFID") handleRFID(cmd);
    else if (m == "NRF24") handleNRF24(cmd);
    else if (m == "IR") handleIR(cmd);
    else {
        Protocol.sendError("SYS", "unknown module");
    }

    while (PHANTOM_SERIAL.available() > 0) {
        PHANTOM_SERIAL.read(); 
    }
    
    yield();
}