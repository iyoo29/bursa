/**
 * AIRA Firmware - Pengelola LED
 * 
 * Mengendalikan LED RGB APA102 pada T-Dongle S3.
 * Menggunakan driver native SPI bit-bang tanpa library FastLED
 * (lebih ringan dan kompatibel di Windows PlatformIO build).
 * APA102: Data=GPIO40, Clock=GPIO39
 */

#ifndef AIRA_LED_MANAGER_H
#define AIRA_LED_MANAGER_H

#include <Arduino.h>
#include "config.h"

// Pin APA102 T-Dongle S3
#define APA102_DATA_PIN  40
#define APA102_CLK_PIN   39

class LEDManager {
public:
    LEDManager();

    /**
     * Menginisialisasi LED APA102.
     */
    void init();

    /**
     * Mengatur LED ke satu warna solid.
     * @param color Warna RGB 24-bit (0xRRGGBB)
     */
    void setColor(uint32_t color);

    /**
     * Mengatur warna LED berdasarkan komponen R, G, B.
     */
    void setColor(uint8_t r, uint8_t g, uint8_t b);

    /**
     * Mematikan LED.
     */
    void off();

    /**
     * Mulai mengedipkan LED.
     * @param color Warna RGB 24-bit
     * @param intervalMs Interval kedipan dalam milidetik
     */
    void startBlink(uint32_t color, uint16_t intervalMs = 500);

    /**
     * Menghentikan kedipan dan mematikan LED.
     */
    void stopBlink();

    /**
     * Mengatur warna LED berdasarkan status dari AiraStatus.
     * @param status Status perangkat saat ini
     */
    void setStatus(AiraStatus status);

    /**
     * Memperbarui state LED (harus dipanggil di loop untuk kedipan).
     */
    void update();

private:
    uint8_t _r = 0, _g = 0, _b = 0;
    bool _blinking = false;
    bool _blinkState = false;
    uint32_t _blinkColor = 0;
    uint16_t _blinkInterval = 500;
    unsigned long _lastBlinkTime = 0;

    // Kirim satu byte via bit-bang SPI
    void _sendByte(uint8_t b);
    // Tampilkan warna ke APA102
    void _show(uint8_t r, uint8_t g, uint8_t b);
};

#endif // AIRA_LED_MANAGER_H
