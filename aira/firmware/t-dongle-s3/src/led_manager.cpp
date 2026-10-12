/**
 * AIRA Firmware - Implementasi Pengelola LED
 * 
 * Driver APA102 native (bit-bang SPI) untuk T-Dongle S3.
 * APA102 menggunakan protokol: START_FRAME + [BRIGHTNESS + B + G + R] + END_FRAME
 */

#include "led_manager.h"

LEDManager::LEDManager() {
    _blinking    = false;
    _blinkState  = false;
    _blinkColor  = 0;
    _blinkInterval = 500;
    _lastBlinkTime = 0;
}

// Kirim 1 byte via bit-bang SPI (MSB first)
void LEDManager::_sendByte(uint8_t b) {
    for (int i = 7; i >= 0; i--) {
        digitalWrite(APA102_DATA_PIN, (b >> i) & 0x01);
        digitalWrite(APA102_CLK_PIN, HIGH);
        digitalWrite(APA102_CLK_PIN, LOW);
    }
}

// Tampilkan warna ke satu LED APA102
void LEDManager::_show(uint8_t r, uint8_t g, uint8_t b) {
    // Start frame: 32 bit 0x00
    _sendByte(0x00);
    _sendByte(0x00);
    _sendByte(0x00);
    _sendByte(0x00);

    // LED frame: 0xFF (full brightness) + B + G + R (APA102 urutan warna: BGR)
    _sendByte(0xFF);
    _sendByte(b);
    _sendByte(g);
    _sendByte(r);

    // End frame: minimal 1 byte 0xFF (untuk 1 LED)
    _sendByte(0xFF);
}

void LEDManager::init() {
    pinMode(APA102_DATA_PIN, OUTPUT);
    pinMode(APA102_CLK_PIN, OUTPUT);
    digitalWrite(APA102_DATA_PIN, LOW);
    digitalWrite(APA102_CLK_PIN, LOW);

    // Matikan LED saat booting
    _show(0, 0, 0);
    Serial.println("[LED] Diinisialisasi (APA102 native)");
}

void LEDManager::setColor(uint32_t color) {
    _blinking = false;
    _r = (color >> 16) & 0xFF;
    _g = (color >>  8) & 0xFF;
    _b = (color      ) & 0xFF;
    _show(_r, _g, _b);
}

void LEDManager::setColor(uint8_t r, uint8_t g, uint8_t b) {
    _blinking = false;
    _r = r; _g = g; _b = b;
    _show(r, g, b);
}

void LEDManager::off() {
    _blinking = false;
    _r = _g = _b = 0;
    _show(0, 0, 0);
}

void LEDManager::startBlink(uint32_t color, uint16_t intervalMs) {
    _blinking      = true;
    _blinkColor    = color;
    _blinkInterval = intervalMs;
    _lastBlinkTime = millis();
    _blinkState    = true;
    _r = (color >> 16) & 0xFF;
    _g = (color >>  8) & 0xFF;
    _b = (color      ) & 0xFF;
    _show(_r, _g, _b);
}

void LEDManager::stopBlink() {
    _blinking = false;
    _show(0, 0, 0);
}

void LEDManager::setStatus(AiraStatus status) {
    switch (status) {
        case STATUS_BOOTING:
            setColor(COLOR_BOOTING);
            break;
        case STATUS_WIFI_CONNECTING:
            startBlink(COLOR_WIFI_SEARCH, 300);
            break;
        case STATUS_WIFI_CONNECTED:
            setColor(COLOR_CONNECTED);
            break;
        case STATUS_WS_CONNECTING:
            startBlink(COLOR_WIFI_SEARCH, 500);
            break;
        case STATUS_WS_CONNECTED:
            setColor(COLOR_CONNECTED);
            break;
        case STATUS_READY:
            setColor(COLOR_IDLE);
            break;
        case STATUS_EXECUTING:
            startBlink(COLOR_EXECUTING, 200);
            break;
        case STATUS_ERROR:
            setColor(COLOR_ERROR);
            break;
        case STATUS_EMERGENCY_STOP:
            startBlink(COLOR_EMERGENCY, 100);
            break;
        default:
            setColor(COLOR_BOOTING);
            break;
    }
}

void LEDManager::update() {
    if (!_blinking) return;

    unsigned long now = millis();
    if (now - _lastBlinkTime >= _blinkInterval) {
        _lastBlinkTime = now;
        _blinkState = !_blinkState;
        if (_blinkState) {
            uint8_t r = (_blinkColor >> 16) & 0xFF;
            uint8_t g = (_blinkColor >>  8) & 0xFF;
            uint8_t b = (_blinkColor      ) & 0xFF;
            _show(r, g, b);
        } else {
            _show(0, 0, 0);
        }
    }
}
