/**
 * AIRA Firmware - Pengurai Perintah (Command Parser)
 * 
 * Mengurai string payload berformat JSON dari WebSocket 
 * lalu mengeksekusi instruksi USB HID yang sesuai.
 */

#ifndef AIRA_COMMAND_PARSER_H
#define AIRA_COMMAND_PARSER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "usb_hid.h"
#include "display_manager.h"
#include "ws_client.h"

class CommandParser {
public:
    /**
     * Menginisialisasi parser dengan dependensi (ketergantungan) yang dibutuhkan.
     * @param usbHID Referensi ke USB HID Manager
     * @param display Referensi ke Display Manager
     * @param ws Referensi ke WebSocket Manager
     */
    void init(USBHIDManager* usbHID, DisplayManager* display, WebSocketManager* ws);

    /**
     * Memproses dan mengurai payload JSON yang masuk.
     * @param payload Pesan berformat JSON dari server
     */
    void parse(const String& payload);

private:
    USBHIDManager* _usbHID = nullptr;
    DisplayManager* _display = nullptr;
    WebSocketManager* _ws = nullptr;

    // Aksi-aksi khusus
    void _handleAction(JsonDocument& doc);
    void _handleMouseMove(JsonObject params);
    void _handleMouseClick(JsonObject params, bool doubleClick = false);
    void _handleMouseScroll(JsonObject params);
    void _handleKeyPress(JsonObject params);
    void _handleKeyCombination(JsonObject params);
    void _handleTypeText(JsonObject params);

    // Mengirim hasil ke server
    void _sendResult(const String& actionId, const String& status, const String& error = "");
};

#endif // AIRA_COMMAND_PARSER_H
