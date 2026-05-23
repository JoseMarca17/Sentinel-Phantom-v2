#include "serial_protocol.h"

SerialProtocol Protocol;

void SerialProtocol::begin() {
    PHANTOM_SERIAL.begin(UART_BAUD);
}

bool SerialProtocol::available() {
    return PHANTOM_SERIAL.available();
}

Command SerialProtocol::read() {
    Command cmd;
    if (!PHANTOM_SERIAL.available()) {
        return cmd;
    }
    
    String line = PHANTOM_SERIAL.readStringUntil('\n');
    line.trim();
    if (line.isEmpty()) {
        return cmd;
    }
    
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) {
        cmd.valid = false;
        return cmd;
    }
    
    cmd.valid = true;
    cmd.mod = doc["mod"] | ""; 
    cmd.cmd = doc["cmd"] | ""; 
    
    // SOLUCIÓN DEFINITIVA PARA V7:
    // Usamos .set() en lugar de .as<>() para clonar la estructura interna de forma segura
    if (doc["params"].is<JsonObject>()) {
        cmd.params.set(doc["params"]);
    }
    return cmd;
}

void SerialProtocol::sendData(const char* module, JsonDocument& doc) {
    JsonDocument out;
    out["status"] = "OK";
    out["mod"] = module;
    out["data"] = doc;
    serializeJson(out, PHANTOM_SERIAL);
    PHANTOM_SERIAL.println();
}

void SerialProtocol::sendError(const char* module, const char* error) {
    JsonDocument out;
    out["status"] = "ERROR";
    out["mod"] = module;
    out["message"] = error;
    serializeJson(out, PHANTOM_SERIAL);
    PHANTOM_SERIAL.println();
}

void SerialProtocol::sendEvent(const char* module, const char* event, JsonDocument& doc) {
    JsonDocument out;
    out["status"] = "EVENT";
    out["mod"] = module;
    out["event"] = event;
    out["data"] = doc;
    serializeJson(out, PHANTOM_SERIAL);
    PHANTOM_SERIAL.println();
}
