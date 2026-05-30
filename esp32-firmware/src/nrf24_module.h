#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <RF24.h>
#include "config.h"

#define NRF_CHANNELS 126

enum JamMode { JAM_SINGLE, JAM_CARPET, JAM_WIFI, JAM_BLE };
enum NRFMode { NRF_IDLE, NRF_SCANNER, NRF_JAMMER };

class NRF24Module {
public:
    bool begin();
    bool isReady() const { return _ready; }
    bool jammerAvailable() const { return _nrf2Ready; }
    void scanSpectrum(JsonDocument& doc);
    bool scanHID(JsonDocument& doc);
    bool injectHID(const char* addrHex, uint8_t ch, const char* payload, JsonDocument& doc);
    void startMonitor();
    void stopMonitor();
    void monitorTick();
    void startJammer(JamMode mode, uint8_t channel);
    void stopJammer();
    void jamTick();
    void jamStatus(JsonDocument& doc);

private:
    bool _ready = false;
    bool _nrf1Ready = false; // Agregado para el seguimiento de la radio 1
    bool _nrf2Ready = false; // Agregado para el seguimiento de la radio 2
    
    RF24 _nrf1 = RF24(PIN_NRF1_CE, PIN_NRF1_CS);
    RF24 _nrf2 = RF24(PIN_NRF2_CE, PIN_NRF2_CS);
    
    NRFMode _mode = NRF_IDLE;
    JamMode _jamMode = JAM_SINGLE;
    uint8_t _currentCh = 0;
    uint8_t _jamCh = 0;
    uint32_t _packetsSent = 0;
    uint8_t _spectrum[NRF_CHANNELS];
    uint8_t _junk[32];
    
    static const uint8_t BLE_CHS[40];
    static const uint8_t WIFI_CHS[3];
    
    bool _initRadio(RF24& radio, uint8_t otherCS);
    void _releaseAll();
    void _txChannel(uint8_t ch);
    String _guessVendor(uint8_t* addr);
    RF24& _getAvailableRadio(); // Declaración del método de conmutación
};

extern NRF24Module NRF24;
