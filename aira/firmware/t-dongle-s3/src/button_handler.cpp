/**
 * AIRA Firmware - Implementasi Pengelola Tombol
 */

#include "button_handler.h"

void ButtonHandler::init() {
    pinMode(BOOT_BTN_PIN, INPUT_PULLUP);
    Serial.println("[Tombol] Diinisialisasi pada pin " + String(BOOT_BTN_PIN));
}

void ButtonHandler::onShortPress(ButtonCallback callback) {
    _shortPressCallback = callback;
}

void ButtonHandler::onLongPress(ButtonCallback callback) {
    _longPressCallback = callback;
}

void ButtonHandler::update() {
    bool reading = digitalRead(BOOT_BTN_PIN);

    // Debounce
    if (reading != _lastState) {
        _lastDebounceTime = millis();
    }

    if (millis() - _lastDebounceTime > BTN_DEBOUNCE_MS) {
        if (reading != _currentState) {
            _currentState = reading;

            if (_currentState == LOW) {
                // Tombol mulai ditekan
                _pressStartTime = millis();
                _longPressTriggered = false;
            } else {
                // Tombol dilepas
                if (!_longPressTriggered) {
                    unsigned long pressDuration = millis() - _pressStartTime;
                    if (pressDuration < BTN_LONG_PRESS_MS) {
                        // Tekanan singkat (Short press)
                        if (_shortPressCallback) {
                            Serial.println("[Tombol] Tekanan singkat");
                            _shortPressCallback();
                        }
                    }
                }
            }
        }

        // Cek apakah tombol ditahan lama (Long press)
        if (_currentState == LOW && !_longPressTriggered) {
            if (millis() - _pressStartTime >= BTN_LONG_PRESS_MS) {
                _longPressTriggered = true;
                if (_longPressCallback) {
                    Serial.println("[Tombol] Tahan lama - BERHENTI DARURAT (EMERGENCY STOP)");
                    _longPressCallback();
                }
            }
        }
    }

    _lastState = reading;
}

bool ButtonHandler::isPressed() {
    return _currentState == LOW;
}
