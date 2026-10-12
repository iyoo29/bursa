/**
 * AIRA Firmware - Implementasi Pengelola USB HID
 */

#include "usb_hid.h"

void USBHIDManager::init() {
    _keyboard.begin();
    _mouse.begin();
    USB.begin();
    _ready = true;
    Serial.println("[HID] Diinisialisasi menggunakan built-in USB HID");
}

bool USBHIDManager::isReady() {
    return _ready;
}

// ---- Aksi Mouse ----

void USBHIDManager::mouseMove(int16_t x, int16_t y) {
    if (!isReady()) return;
    while (x != 0 || y != 0) {
        int8_t dx = constrain(x, -127, 127);
        int8_t dy = constrain(y, -127, 127);
        _mouse.move(dx, dy);
        x -= dx;
        y -= dy;
        delay(5);
    }
}

void USBHIDManager::mouseMoveAbsolute(int16_t x, int16_t y, int16_t screenWidth, int16_t screenHeight) {
    mouseMove(-screenWidth, -screenHeight);
    delay(10);
    mouseMove(x, y);
}

void USBHIDManager::mouseClick(uint8_t button) {
    if (!isReady()) return;
    _mouse.click(button);
}

void USBHIDManager::mouseDoubleClick(uint8_t button) {
    if (!isReady()) return;
    _mouse.click(button);
    delay(60);
    _mouse.click(button);
}

void USBHIDManager::mousePress(uint8_t button) {
    if (!isReady()) return;
    _mouse.press(button);
}

void USBHIDManager::mouseRelease(uint8_t button) {
    if (!isReady()) return;
    _mouse.release(button);
}

void USBHIDManager::mouseScroll(int8_t amount) {
    if (!isReady()) return;
    _mouse.move(0, 0, amount);
}

// ---- Aksi Keyboard ----

void USBHIDManager::keyPress(uint8_t keycode) {
    if (!isReady()) return;
    _keyboard.write(keycode);
}

void USBHIDManager::keyCombination(uint8_t modifier, uint8_t keycode) {
    if (!isReady()) return;
    _keyboard.press(modifier);
    _keyboard.press(keycode);
    delay(HID_KEY_DELAY_MS);
    _keyboard.releaseAll();
}

void USBHIDManager::keyMulti(uint8_t modifier, const uint8_t* keycodes, uint8_t count) {
    if (!isReady()) return;
    if (modifier != 0) _keyboard.press(modifier);
    for (int i = 0; i < count; i++) {
        if (keycodes[i] != 0) _keyboard.press(keycodes[i]);
    }
    delay(HID_KEY_DELAY_MS);
    _keyboard.releaseAll();
}

void USBHIDManager::typeText(const String& text) {
    if (!isReady()) return;
    _keyboard.print(text);
}

void USBHIDManager::releaseAll() {
    if (!isReady()) return;
    _keyboard.releaseAll();
    _mouse.release(MOUSE_LEFT);
    _mouse.release(MOUSE_RIGHT);
    _mouse.release(MOUSE_MIDDLE);
}

// ---- Pemetaan Nama Tombol (Key Name Mapping) ----

uint8_t USBHIDManager::keyNameToCode(const String& keyName) {
    String upper = keyName;
    upper.toUpperCase();

    if (upper.length() == 1) {
        char c = upper[0];
        if (c >= 'A' && c <= 'Z') return c + 32; // Convert to lower 'a' - 'z'
        if (c >= '0' && c <= '9') return c;
        return c;
    }

    if (upper == "ENTER" || upper == "RETURN") return KEY_RETURN;
    if (upper == "ESC" || upper == "ESCAPE") return KEY_ESC;
    if (upper == "BACKSPACE") return KEY_BACKSPACE;
    if (upper == "TAB") return KEY_TAB;
    if (upper == "SPACE") return ' ';
    if (upper == "DELETE" || upper == "DEL") return KEY_DELETE;
    if (upper == "INSERT" || upper == "INS") return KEY_INSERT;
    if (upper == "HOME") return KEY_HOME;
    if (upper == "END") return KEY_END;
    if (upper == "PAGEUP" || upper == "PGUP") return KEY_PAGE_UP;
    if (upper == "PAGEDOWN" || upper == "PGDN") return KEY_PAGE_DOWN;
    if (upper == "UP") return KEY_UP_ARROW;
    if (upper == "DOWN") return KEY_DOWN_ARROW;
    if (upper == "LEFT") return KEY_LEFT_ARROW;
    if (upper == "RIGHT") return KEY_RIGHT_ARROW;
    if (upper == "CAPSLOCK") return KEY_CAPS_LOCK;
    if (upper == "PRINTSCREEN") return 0xCE; // Print Screen
    if (upper == "F1") return KEY_F1;
    if (upper == "F2") return KEY_F2;
    if (upper == "F3") return KEY_F3;
    if (upper == "F4") return KEY_F4;
    if (upper == "F5") return KEY_F5;
    if (upper == "F6") return KEY_F6;
    if (upper == "F7") return KEY_F7;
    if (upper == "F8") return KEY_F8;
    if (upper == "F9") return KEY_F9;
    if (upper == "F10") return KEY_F10;
    if (upper == "F11") return KEY_F11;
    if (upper == "F12") return KEY_F12;

    return 0;
}

uint8_t USBHIDManager::keyNameToModifier(const String& keyName) {
    String upper = keyName;
    upper.toUpperCase();

    if (upper == "CTRL" || upper == "CONTROL" || upper == "LCTRL") return KEY_LEFT_CTRL;
    if (upper == "RCTRL") return KEY_RIGHT_CTRL;
    if (upper == "SHIFT" || upper == "LSHIFT") return KEY_LEFT_SHIFT;
    if (upper == "RSHIFT") return KEY_RIGHT_SHIFT;
    if (upper == "ALT" || upper == "LALT") return KEY_LEFT_ALT;
    if (upper == "RALT" || upper == "ALTGR") return KEY_RIGHT_ALT;
    if (upper == "GUI" || upper == "WIN" || upper == "WINDOWS" || upper == "META" || upper == "LGUI") return KEY_LEFT_GUI;
    if (upper == "RGUI") return KEY_RIGHT_GUI;

    return 0;
}
