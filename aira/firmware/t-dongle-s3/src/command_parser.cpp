/**
 * AIRA Firmware - Implementasi Pengurai Perintah
 */

#include "command_parser.h"
#include "device_id.h"

void CommandParser::init(USBHIDManager* usbHID, DisplayManager* display, WebSocketManager* ws) {
    _usbHID = usbHID;
    _display = display;
    _ws = ws;
    Serial.println("[Parser] Diinisialisasi");
}

void CommandParser::parse(const String& payload) {
    if (!_usbHID || !_display || !_ws) return;

    // Buat alokasi memori dokumen JSON (disesuaikan dengan ukuran pesan maks)
    JsonDocument doc;
    
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
        Serial.print("[Parser] Gagal mengurai JSON: ");
        Serial.println(error.c_str());
        return;
    }

    const char* type = doc["type"];
    
    if (type == nullptr) {
        Serial.println("[Parser] Kolom 'type' (tipe) tidak ditemukan di JSON");
        return;
    }

    String msgType = String(type);

    if (msgType == "action") {
        _handleAction(doc);
    } else if (msgType == "ping") {
        _ws->sendMessage("{\"type\":\"pong\",\"device_id\":\"" + DeviceID::getID() + "\"}");
    } else {
        Serial.printf("[Parser] Tipe pesan tidak dikenal: %s\n", msgType.c_str());
    }
}

void CommandParser::_handleAction(JsonDocument& doc) {
    String actionId = doc["action_id"] | "unknown";
    String action = doc["action"] | "";
    JsonObject params = doc["params"];

    if (action.length() == 0) {
        _sendResult(actionId, "failed", "Kolom action (aksi) tidak ada atau kosong");
        return;
    }

    Serial.printf("[Parser] Mengeksekusi aksi: %s (ID: %s)\n", action.c_str(), actionId.c_str());
    
    // Tampilkan aksi di layar LCD
    _display->showAction(action, "ID: " + actionId);

    // Pastikan USB HID sudah siap
    if (!_usbHID->isReady()) {
        _sendResult(actionId, "failed", "USB HID belum siap atau belum dipasang (mounted)");
        return;
    }

    // Melakukan pengecekan jenis aksi dan memanggil fungsi terkait
    if (action == "mouse_move") {
        _handleMouseMove(params);
    } 
    else if (action == "click" || action == "right_click" || action == "middle_click") {
        // Manipulasi sedikit agar _handleMouseClick bisa dipakai berulang
        if (action == "right_click") params["button"] = "right";
        if (action == "middle_click") params["button"] = "middle";
        _handleMouseClick(params, false);
    } 
    else if (action == "double_click") {
        _handleMouseClick(params, true);
    } 
    else if (action == "scroll") {
        _handleMouseScroll(params);
    } 
    else if (action == "key_press") {
        _handleKeyPress(params);
    } 
    else if (action == "key_combination") {
        _handleKeyCombination(params);
    } 
    else if (action == "type_text") {
        _handleTypeText(params);
    } 
    else {
        _sendResult(actionId, "failed", "Aksi tidak dikenal: " + action);
        return;
    }

    // Aksi berhasil dilakukan
    _sendResult(actionId, "completed");
}

void CommandParser::_handleMouseMove(JsonObject params) {
    int x = params["x"] | 0;
    int y = params["y"] | 0;
    
    // Asumsi: Perintah menginstruksikan pegerakan relatif (bukan absolut) pada mode HID biasa.
    // Jika butuh gerakan absolut, logika khusus (seperti memindah ke pojok kiri atas dulu) harus disiapkan
    _usbHID->mouseMove(x, y);
}

void CommandParser::_handleMouseClick(JsonObject params, bool doubleClick) {
    String buttonStr = params["button"] | "left";
    uint8_t button = MOUSE_LEFT;

    if (buttonStr == "right") button = MOUSE_RIGHT;
    else if (buttonStr == "middle") button = MOUSE_MIDDLE;

    if (doubleClick) {
        _usbHID->mouseDoubleClick(button);
    } else {
        _usbHID->mouseClick(button);
    }
}

void CommandParser::_handleMouseScroll(JsonObject params) {
    int amount = params["amount"] | 0;
    _usbHID->mouseScroll(amount);
}

void CommandParser::_handleKeyPress(JsonObject params) {
    String keyStr = params["key"] | "";
    if (keyStr.length() == 0) return;

    uint8_t keycode = USBHIDManager::keyNameToCode(keyStr);
    if (keycode != 0) {
        _usbHID->keyPress(keycode);
    } else {
        Serial.println("[Parser] Key (Tombol) tidak valid: " + keyStr);
    }
}

void CommandParser::_handleKeyCombination(JsonObject params) {
    JsonArray keys = params["keys"];
    if (keys.isNull() || keys.size() == 0) return;

    uint8_t modifier = 0;
    uint8_t keycodes[6] = {0};
    uint8_t keyCount = 0;

    for (JsonVariant v : keys) {
        String keyStr = v.as<String>();
        uint8_t mod = USBHIDManager::keyNameToModifier(keyStr);
        
        if (mod != 0) {
            modifier |= mod;
        } else {
            uint8_t code = USBHIDManager::keyNameToCode(keyStr);
            if (code != 0 && keyCount < 6) {
                keycodes[keyCount++] = code;
            }
        }
    }

    if (keyCount > 0 || modifier != 0) {
        _usbHID->keyMulti(modifier, keycodes, keyCount);
    }
}

void CommandParser::_handleTypeText(JsonObject params) {
    String text = params["text"] | "";
    if (text.length() > 0) {
        _usbHID->typeText(text);
    }
}

void CommandParser::_sendResult(const String& actionId, const String& status, const String& error) {
    JsonDocument doc;
    doc["type"] = "action_result";
    doc["action_id"] = actionId;
    doc["device_id"] = DeviceID::getID();
    doc["status"] = status;
    
    if (error.length() > 0) {
        doc["error"] = error;
    } else {
        doc["error"] = nullptr;
    }

    String resultStr;
    serializeJson(doc, resultStr);
    _ws->sendMessage(resultStr);
}
