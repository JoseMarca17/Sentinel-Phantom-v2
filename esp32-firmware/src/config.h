#pragma once

#include <Arduino.h>

/* =====================================================
    DEVICE
===================================================== */
#define DEVICE_NAME            "SentinelPH"
#define FW_VERSION             "2.0.0"

/* =====================================================
    JSON
===================================================== */
#define JSON_BUF_SIZE          4096

/* =====================================================
    STATUS LED
===================================================== */
#define PIN_LED                2

/* =====================================================
    I2C (El PN532 RFID se queda aquí, intacto y seguro)
===================================================== */
#define PIN_SDA                21 // Pin físico 33 (Etiqueta GIOP21/SDA)
#define PIN_SCL                22 // Pin físico 36 (Etiqueta GIOP22/SCL)

/* =====================================================
    SPI LÍNEAS DE DATOS (Compartidas)
===================================================== */
#define PIN_SCK                18
#define PIN_MISO               19
#define PIN_MOSI               23

/* =====================================================
    IR (Movido temporalmente para liberar los pines 4 y 13)
===================================================== */
#define PIN_IR_TX              32 
#define PIN_IR_RX              26

/* =====================================================
    CC1101 (Se mantiene igual)
===================================================== */
#define PIN_CC1101_CS          5
#define PIN_CC1101_GDO0        27
#define PIN_CC1101_GDO2        25

#define SG_BUF                 512

static constexpr float SG_FREQS[] = {
    300.0,
    315.0,
    433.92,
    868.0,
    915.0
};

/* =====================================================
    NRF24 #1 (Scanner) - PINES NUEVOS SEGUROS
===================================================== */
#define PIN_NRF1_CE            14  // Pin físico 12 (Etiqueta GIOP14)
#define PIN_NRF1_CS            12  // Pin físico 13 (Etiqueta GIOP12)

/* =====================================================
    NRF24 #2 (Jammer) - PINES NUEVOS SEGUROS
===================================================== */
#define PIN_NRF2_CE            4   // Pin físico 15 (Etiqueta GIOP13)
#define PIN_NRF2_CS            15  // Pin físico 23 (Etiqueta GIOP15 derecho)

#define NRF_CHANNELS           126

/* =====================================================
    PN532 RFID (I2C)
===================================================== */
#define PN532_IRQ              -1
#define PN532_RESET            -1

/* =====================================================
    WIFI / BLE
===================================================== */
#define WIFI_SCAN_TIME         10
#define BLE_SCAN_TIME          5

/* =====================================================
    MIFARE
===================================================== */
#define MIFARE_NKEYS           4

static const uint8_t MIFARE_KEYS[MIFARE_NKEYS][6] = {
    {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
    {0xA0,0xA1,0xA2,0xA3,0xA4,0xA5},
    {0xD3,0xF7,0xD3,0xF7,0xD3,0xF7},
    {0x00,0x00,0x00,0x00,0x00,0x00}
};
