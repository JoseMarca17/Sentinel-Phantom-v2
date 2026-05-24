#include "subghz_module.h"
#include "serial_protocol.h"

SubGHzModule SubGHz;

// Variables volátiles para el manejo de interrupciones en tiempo real
volatile uint32_t lastChangeTime = 0;
volatile uint16_t pulseBuffer[SG_BUF];
volatile uint16_t pulseIndex = 0;
volatile bool captureDone = false;

// Rutina de Interrupción de Hardware (ISR) para capturar los flancos analógicos
void IRAM_ATTR subghz_pulse_isr() {
    uint32_t now = micros();
    uint32_t duration = now - lastChangeTime;
    lastChangeTime = now;

    // Descartamos el primer pulso residual de estabilización
    if (duration > 50 && !captureDone) {
        if (pulseIndex < SG_BUF) {
            pulseBuffer[pulseIndex++] = (duration > 65535) ? 65535 : duration;
        } else {
            captureDone = true; // Buffer lleno, detenemos la escucha
        }
    }
}

bool SubGHzModule::begin() {
    // 1. Configuramos el pin GDO0 como entrada antes de que se use en interrupciones
    pinMode(PIN_CC1101_GDO0, INPUT);
    
    // 2. Forzamos el Pin CS a nivel alto para limpiar el ruido del bus SPI compartido con las radios NRF24
    pinMode(PIN_CC1101_CS, OUTPUT);
    digitalWrite(PIN_CC1101_CS, HIGH);
    delay(10);

    // 3. Inicialización formal pasándole los pines de tu config.h a la librería SmartRC
    // (Esto le dice a la librería qué pin CS y qué pin GDO0 usar de tu mapa real)
    ELECHOUSE_cc1101.setSpiPin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CC1101_CS);
    ELECHOUSE_cc1101.setGDO0(PIN_CC1101_GDO0);
    
    // Inicializamos el backend del chip
    ELECHOUSE_cc1101.Init();
    
    // 4. Verificación física del integrado en el bus SPI
    if (!ELECHOUSE_cc1101.getCC1101()) {
        Serial.println("[CC1101] Comunicación SPI fallida. Verificando registros...");
        _ready = false;
        return false;
    }

    // Configuración del modulador OOK estándar para mandos de portones
    ELECHOUSE_cc1101.setModulation(2); 
    _setFreq(433.92);                  // Sintonía base
    ELECHOUSE_cc1101.SetRx();          // Escucha defensiva activa
    
    _ready = true;
    return _ready;
}

void SubGHzModule::_setFreq(float f) {
    ELECHOUSE_cc1101.setMHZ(f);
}

bool SubGHzModule::capture(float freq, JsonDocument& result) {
    if (!_ready) return false;
    _releaseAll();

    _setFreq(freq);
    pulseIndex = 0;
    captureDone = false;
    lastChangeTime = micros();

    ELECHOUSE_cc1101.SetRx();
    // Enlazamos la interrupción al pin de datos del CC1101 (GDO0 / PIN_CC1101_GDO0)
    attachInterrupt(digitalPinToInterrupt(PIN_CC1101_GDO0), subghz_pulse_isr, CHANGE);

    uint32_t startTime = millis();
    // Ventana de escucha activa de 3000ms o hasta llenar el buffer de transiciones
    while (millis() - startTime < 3000 && !captureDone) {
        yield(); 
    }

    detachInterrupt(digitalPinToInterrupt(PIN_CC1101_GDO0));
    ELECHOUSE_cc1101.setSidle();

    if (pulseIndex > 10) { // Si interceptamos un tren de pulsos válido
        JsonArray timings = result["timings"].to<JsonArray>();
        for (int i = 0; i < pulseIndex; i++) {
            timings.add(pulseBuffer[i]);
        }
        result["count"] = pulseIndex;
        result["freq_mhz"] = freq;
        result["captured"] = true;
        return true;
    }

    result["captured"] = false;
    return false;
}

bool SubGHzModule::replay(float freq, const char* hex, JsonDocument& result) {
    // Nota: Para simplificar el transporte UART y no lidiar con arrays pesados en el JSON de subida,
    // procesamos un tren de pulsos simétrico mapeado por tiempos fijos desde el Hex o parámetros.
    if (!_ready) return false;
    _releaseAll();

    _setFreq(freq);
    ELECHOUSE_cc1101.SetTx(); // Conmutación física a modo transmisión

    // Recomposición y modulación OOK analógica en el pin emisor
    pinMode(PIN_CC1101_GDO0, OUTPUT);

    // Iteramos el Payload simulando las transiciones del control original
    for (int r = 0; hex[r] != '\0'; r++) {
        char c = hex[r];
        // Convertimos el mapa de caracteres a pulsos de alta fidelidad (Ejemplo: '1' = alto, '0' = bajo)
        if (c == '1') {
            digitalWrite(PIN_CC1101_GDO0, HIGH);
            delayMicroseconds(350); // Pulso estándar de reloj T
            digitalWrite(PIN_CC1101_GDO0, LOW);
            delayMicroseconds(1050);
        } else {
            digitalWrite(PIN_CC1101_GDO0, HIGH);
            delayMicroseconds(1050);
            digitalWrite(PIN_CC1101_GDO0, LOW);
            delayMicroseconds(350);
        }
    }

    pinMode(PIN_CC1101_GDO0, INPUT); // Regresamos el pin a alta impedancia
    ELECHOUSE_cc1101.SetRx();        // Modo seguro defensivo
    result["transmitted"] = true;
    return true;
}

bool SubGHzModule::scanFreqs(JsonDocument& result) {
    if (!_ready) return false;
    JsonArray arr = result["active_freqs"].to<JsonArray>();
    
    for (int i = 0; i < 5; i++) {
        float f = SG_FREQS[i];
        _setFreq(f);
        ELECHOUSE_cc1101.SetRx();
        delay(20);
        
        // Verificamos el indicador de fuerza de señal recibida (RSSI) del CC1101
        int rssi = ELECHOUSE_cc1101.getRssi();
        if (rssi > -75) { // Si hay actividad sospechosa en esa frecuencia
            arr.add(f);
        }
    }
    return true;
}

bool SubGHzModule::jam(float freq, int ms, JsonDocument& result) {
    if (!_ready) return false;
    _releaseAll();
    _setFreq(freq);
    ELECHOUSE_cc1101.SetTx();
    
    pinMode(PIN_CC1101_GDO0, OUTPUT);
    uint32_t start = millis();
    while (millis() - start < (uint32_t)ms) {
        // Generamos ruido binario asimétrico directo en el modulador
        digitalWrite(PIN_CC1101_GDO0, HIGH); delayMicroseconds(100);
        digitalWrite(PIN_CC1101_GDO0, LOW);  delayMicroseconds(100);
    }
    pinMode(PIN_CC1101_GDO0, INPUT);
    ELECHOUSE_cc1101.SetRx();
    result["jammed"] = true;
    return true;
}

void SubGHzModule::_releaseAll() {
    detachInterrupt(digitalPinToInterrupt(PIN_CC1101_GDO0));
    ELECHOUSE_cc1101.setSidle();
}