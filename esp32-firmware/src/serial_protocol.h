#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

#define PHANTOM_SERIAL Serial
#define UART_BAUD 115200

struct Command {
    bool valid = false;
    String mod;
    String cmd;
    JsonDocument params; // Cambiado para evitar fugas de memoria en V7
};

class SerialProtocol {
public:
    void begin();
    bool available();
    Command read();
    void sendData(const char* module, JsonDocument& doc);
    void sendError(const char* module, const char* error);
    void sendEvent(const char* module, const char* event, JsonDocument& doc);
};

extern SerialProtocol Protocol;
