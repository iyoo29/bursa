/**
 * AIRA Firmware - Pengelola USB HID
 * 
 * Menangani emulasi keyboard dan mouse USB HID menggunakan
 * port USB asli ESP32-S3 (menggunakan built-in USBHID).
 */

#ifndef AIRA_USB_HID_H
#define AIRA_USB_HID_H

#include <Arduino.h>
#include "USB.h"
#include "USBHIDKeyboard.h"
#include "USBHIDMouse.h"
#include "config.h"

class USBHIDManager {
public:
    void init();
    bool isReady();

    // ---- Aksi Mouse ----
    void mouseMove(int16_t x, int16_t y);
    void mouseMoveAbsolute(int16_t x, int16_t y, int16_t screenWidth, int16_t screenHeight);
    void mouseClick(uint8_t button = MOUSE_LEFT);
    void mouseDoubleClick(uint8_t button = MOUSE_LEFT);
    void mousePress(uint8_t button = MOUSE_LEFT);
    void mouseRelease(uint8_t button = MOUSE_LEFT);
    void mouseScroll(int8_t amount);

    // ---- Aksi Keyboard ----
    void keyPress(uint8_t keycode);
    void keyCombination(uint8_t modifier, uint8_t keycode);
    void keyMulti(uint8_t modifier, const uint8_t* keycodes, uint8_t count);
    void typeText(const String& text);
    void releaseAll();

    // ---- Alat Bantu (Utility) ----
    static uint8_t keyNameToCode(const String& keyName);
    static uint8_t keyNameToModifier(const String& keyName);

private:
    USBHIDKeyboard _keyboard;
    USBHIDMouse _mouse;
    bool _ready = false;
};

#endif // AIRA_USB_HID_H
