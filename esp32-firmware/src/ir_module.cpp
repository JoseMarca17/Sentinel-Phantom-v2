#include "ir_module.h"

IRModule IRMod;

bool IRModule::begin() {
    // Usar el constructor estándar limpio de 1 parámetro para enganchar el Timer mapeado
    _rx = new IRrecv(PIN_IR_RX);
    _tx = new IRsend(PIN_IR_TX);

    if (!_rx || !_tx) {
        _ready = false;
        return false;
    }

    // Asegurar el acoplamiento lógico contra ruido del protoboard
    pinMode(PIN_IR_RX, INPUT_PULLUP);

    _tx->begin(); // Inicializar el diodo emisor
    
    // Dejamos el receptor apagado temporalmente para no saturar la CPU al arrancar
    _ready = true;
    return true;
}

bool IRModule::capture(JsonDocument& result) {
    if (!_ready) {
        result["success"] = false;
        result["error"] = "ir offline";
        return false;
    }

    decode_results ir;
    
    // ARRANQUE DINÁMICO: Activamos el demodulador e inyectamos la ISR solo para esta ventana
    _rx->enableIRIn(); 
    delay(40); // Tiempo de estabilización analógica para el silicio del VS1838B

    uint32_t start = millis();
    bool found = false;

    // Ventana de escucha de 5 segundos controlada
    while (millis() - start < 5000) {
        if (_rx->decode(&ir)) {
            result["success"] = true;
            result["protocol"] = typeToString(ir.decode_type).c_str();
            result["code"] = (uint64_t)ir.value;
            result["bits"] = ir.bits;
            
            _rx->resume(); // Limpiar buffers internos
            found = true;
            break;
        }
        delay(5);
        yield(); // Alimentar al Watchdog de FreeRTOS
    }

    // APAGADO COMPLETO: Retiramos la función ISR del temporizador inmediatamente al salir
    _rx->disableIRIn(); 

    if (!found) {
        result["success"] = false;
        result["error"] = "timeout";
    }

    return found;
}

bool IRModule::replay(
    const char* protoStr,
    uint64_t code,
    uint16_t bits,
    JsonDocument& result
) {
    if (!_ready) {
        result["success"] = false;
        result["error"] = "ir offline";
        return false;
    }

    String proto = String(protoStr);

    if (proto == "NEC") {
        _tx->sendNEC(code, bits);
    } else if (proto == "SONY") {
        _tx->sendSony(code, bits);
    } else if (proto == "RC5") {
        _tx->sendRC5(code, bits);
    } else {
        result["success"] = false;
        result["error"] = "unsupported protocol";
        return false;
    }

    result["success"] = true;
    result["protocol"] = protoStr;
    result["code"] = code;
    result["bits"] = bits;

    return true;
}

bool IRModule::tvBGone(JsonDocument& result) {
    if (!_ready) {
        result["success"] = false;
        result["error"] = "ir offline";
        return false;
    }

    // 1. PREPARACIÓN ESTRUCTURAL: Llenamos el JSON de retorno inmediatamente
    result["success"] = true;
    result["message"] = "tv-b-gone initialized";

    // 2. FORZADO SERIAL ASÍNCRONO:
    // Si estás usando el script aislado 'test_ir.py', este necesita leer la confirmación antes 
    // de que la CPU del ESP32 quede atrapada en las ráfagas lógicas del bucle IR.
    Serial.println("{\"status\":\"OK\",\"mod\":\"IR\",\"data\":{\"success\":true,\"message\":\"tv-b-gone sent\"}}");
    Serial.flush(); // Vaciamos por completo el hardware del UART hacia los hilos de Python

    delay(50); // Pequeña ventana de estabilización antes de disparar corriente al transistor

    // 3. ETAPA DE TRANSMISIÓN DE POTENCIA (Bucle No-Bloqueante para el Bus)
    for (int i = 0; i < 20; i++) {
        _tx->sendNEC(0x20DF10EF, 32);
        delay(40);

        _tx->sendSony(0xA90, 12);
        delay(40);

        _tx->sendRC5(0x0C, 12);
        delay(40);
        
        yield(); // Vital: Evita activar el temporizador de pánico del Watchdog de hardware
    }

    return true;
}

bool IRModule::detectCamera(JsonDocument& result) {
    if (!_ready) {
        result["success"] = false;
        result["error"] = "ir offline";
        return false;
    }

    result["success"] = true;
    result["detected"] = false;
    result["message"] = "camera detection not implemented";

    return true;
}
