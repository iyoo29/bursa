/**
 * AIRA Firmware - Pengelola Tombol (Button Handler)
 * 
 * Menangani masukan tombol BOOT dengan debounce (menghilangkan noise)
 * dan deteksi tahan lama (long-press).
 * Tekanan singkat (Short press): mengganti info layar / konfirmasi
 * Tahan lama (Long press 3s): berhenti darurat (emergency stop)
 */

#ifndef AIRA_BUTTON_HANDLER_H
#define AIRA_BUTTON_HANDLER_H

#include <Arduino.h>
#include "config.h"

// Tipe fungsi callback
typedef void (*ButtonCallback)();

class ButtonHandler {
public:
    /**
     * Menginisialisasi tombol.
     */
    void init();

    /**
     * Mengatur callback untuk tekanan singkat.
     */
    void onShortPress(ButtonCallback callback);

    /**
     * Mengatur callback untuk tahan lama (berhenti darurat).
     */
    void onLongPress(ButtonCallback callback);

    /**
     * Memperbarui status tombol (harus dipanggil di loop).
     */
    void update();

    /**
     * Memeriksa apakah tombol sedang ditekan saat ini.
     */
    bool isPressed();

private:
    bool _lastState = HIGH;
    bool _currentState = HIGH;
    unsigned long _pressStartTime = 0;
    unsigned long _lastDebounceTime = 0;
    bool _longPressTriggered = false;

    ButtonCallback _shortPressCallback = nullptr;
    ButtonCallback _longPressCallback = nullptr;
};

#endif // AIRA_BUTTON_HANDLER_H
