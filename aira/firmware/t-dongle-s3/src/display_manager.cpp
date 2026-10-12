/**
 * AIRA Firmware - Implementasi Pengelola Layar
 */

#include "display_manager.h"

void DisplayManager::init() {
    // Inisialisasi backlight LCD (GPIO 38 aktif LOW pada T-Dongle S3)
    pinMode(38, OUTPUT);
    digitalWrite(38, LOW);
    
    _tft.init();
    _tft.setRotation(DISPLAY_ROTATION);
    _tft.fillScreen(TFT_BLACK);

    // Pastikan backlight menyala (Active LOW = 0V / GND)
    digitalWrite(38, LOW);

    Serial.println("[Layar] Diinisialisasi");
}

void DisplayManager::showSplash() {
    pinMode(38, OUTPUT);
    digitalWrite(38, LOW);

    _tft.fillScreen(TFT_BLACK);
    _tft.setTextDatum(MC_DATUM);

    // Judul
    _tft.setTextColor(TFT_CYAN, TFT_BLACK);
    _tft.setTextSize(2);
    _tft.drawString("AIRA", _tft.width() / 2, 20);

    // Sub-judul
    _tft.setTextColor(TFT_WHITE, TFT_BLACK);
    _tft.setTextSize(1);
    _tft.drawString("AI Remote Agent", _tft.width() / 2, 42);

    // Versi
    _tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    _tft.drawString("v" AIRA_FW_VERSION, _tft.width() / 2, 58);

    // Proses loading
    _tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    _tft.drawString("Memulai...", _tft.width() / 2, 72);
}

void DisplayManager::showStatus(AiraStatus status,
                                 const String& deviceId,
                                 const String& wifiSSID,
                                 const String& wifiIP,
                                 int wifiRSSI,
                                 bool wsConnected,
                                 const String& agentStatus) {
    // Membatasi intensitas update layar
    unsigned long now = millis();
    if (now - _lastUpdate < DISPLAY_UPDATE_MS) return;
    _lastUpdate = now;

    pinMode(38, OUTPUT);
    digitalWrite(38, LOW);

    _tft.fillScreen(TFT_BLACK);

    // Header layar
    _drawHeader("AIRA", _statusToColor(status));

    // ID Perangkat
    _tft.setTextSize(1);
    _tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    _tft.setTextDatum(TR_DATUM);
    _tft.drawString(deviceId, _tft.width() - 2, 2);

    // Status
    _drawKeyValue(16, "Status", _statusToString(status), _statusToColor(status));

    // WiFi
    if (wifiSSID.length() > 0) {
        String wifiInfo = wifiSSID + " " + String(wifiRSSI) + "dBm";
        _drawKeyValue(28, "WiFi", wifiInfo, TFT_GREEN);
    } else {
        _drawKeyValue(28, "WiFi", "Terputus", TFT_RED);
    }

    // IP
    if (wifiIP.length() > 0) {
        _drawKeyValue(40, "IP", wifiIP, TFT_WHITE);
    }

    // WebSocket (WS)
    _drawKeyValue(52, "WS", wsConnected ? "Terhubung" : "Terputus",
                  wsConnected ? TFT_GREEN : TFT_RED);

    // Agen
    if (agentStatus.length() > 0) {
        _drawKeyValue(64, "Agen", agentStatus, TFT_CYAN);
    }
}

void DisplayManager::showAction(const String& actionType, const String& detail) {
    _tft.fillScreen(TFT_BLACK);
    _drawHeader("EKSEKUSI", TFT_CYAN);

    _tft.setTextSize(1);
    _tft.setTextDatum(TL_DATUM);

    _tft.setTextColor(TFT_WHITE, TFT_BLACK);
    _tft.drawString("Aksi:", 2, 20);

    _tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    _tft.drawString(actionType, 2, 34);

    if (detail.length() > 0) {
        _tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
        // Memotong detail yang terlalu panjang agar muat di layar
        String truncated = detail.substring(0, 26);
        _tft.drawString(truncated, 2, 48);
    }
}

void DisplayManager::showError(const String& errorMsg) {
    _tft.fillScreen(TFT_BLACK);
    _drawHeader("ERROR", TFT_RED);

    _tft.setTextSize(1);
    _tft.setTextDatum(TL_DATUM);
    _tft.setTextColor(TFT_WHITE, TFT_BLACK);

    // Melipat kata (word-wrap) untuk pesan error
    int y = 20;
    int maxChars = 26;
    for (int i = 0; i < (int)errorMsg.length() && y < 75; i += maxChars) {
        String line = errorMsg.substring(i, min((int)errorMsg.length(), i + maxChars));
        _tft.drawString(line, 2, y);
        y += 12;
    }
}

void DisplayManager::showEmergencyStop() {
    pinMode(38, OUTPUT);
    digitalWrite(38, LOW);

    _tft.fillScreen(TFT_RED);
    _tft.setTextDatum(MC_DATUM);

    _tft.setTextColor(TFT_WHITE, TFT_RED);
    _tft.setTextSize(2);
    _tft.drawString("BERHENTI", _tft.width() / 2, 28);
    _tft.drawString("DARURAT", _tft.width() / 2, 52);
}

void DisplayManager::clear() {
    _tft.fillScreen(TFT_BLACK);
}

void DisplayManager::showDiagnostic(int step, const char* name) {
    pinMode(38, OUTPUT);
    digitalWrite(38, LOW);

    _tft.fillScreen(TFT_BLACK);
    
    // Header
    _tft.setTextDatum(TL_DATUM);
    _tft.setTextColor(TFT_CYAN, TFT_BLACK);
    _tft.setTextSize(1);
    _tft.drawString("AIRA DIAGNOSTIC", 4, 3);
    _tft.drawFastHLine(0, 14, _tft.width(), TFT_DARKGREY);

    // Nomor Step
    _tft.setTextDatum(MC_DATUM);
    _tft.setTextColor(TFT_WHITE, TFT_BLACK);
    _tft.setTextSize(2);
    char stepBuf[16];
    snprintf(stepBuf, sizeof(stepBuf), "STEP %02d", step);
    _tft.drawString(stepBuf, _tft.width() / 2, 36);

    // Nama Operasi Checkpoint
    _tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    _tft.setTextSize(1);
    _tft.drawString(name, _tft.width() / 2, 62);
}

void DisplayManager::_drawHeader(const String& title, uint16_t color) {
    _tft.setTextDatum(TL_DATUM);
    _tft.setTextColor(color, TFT_BLACK);
    _tft.setTextSize(1);
    _tft.drawString(title, 2, 2);

    // Menggambar garis pemisah
    _tft.drawFastHLine(0, 12, _tft.width(), TFT_DARKGREY);
}

void DisplayManager::_drawKeyValue(int y, const String& key, const String& value, uint16_t color) {
    _tft.setTextDatum(TL_DATUM);
    _tft.setTextSize(1);

    _tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    _tft.drawString(key + ":", 2, y);

    _tft.setTextColor(color, TFT_BLACK);
    _tft.drawString(value, 42, y);
}

String DisplayManager::_statusToString(AiraStatus status) {
    switch (status) {
        case STATUS_BOOTING:         return "Booting";
        case STATUS_WIFI_CONNECTING: return "WiFi...";
        case STATUS_WIFI_CONNECTED:  return "WiFi OK";
        case STATUS_WS_CONNECTING:   return "WS...";
        case STATUS_WS_CONNECTED:    return "WS OK";
        case STATUS_READY:           return "Siap";
        case STATUS_EXECUTING:       return "Eksekusi";
        case STATUS_ERROR:           return "Error";
        case STATUS_EMERGENCY_STOP:  return "E-STOP";
        default:                     return "Unknown";
    }
}

uint16_t DisplayManager::_statusToColor(AiraStatus status) {
    switch (status) {
        case STATUS_BOOTING:         return TFT_BLUE;
        case STATUS_WIFI_CONNECTING: return TFT_YELLOW;
        case STATUS_WIFI_CONNECTED:  return TFT_GREEN;
        case STATUS_WS_CONNECTING:   return TFT_YELLOW;
        case STATUS_WS_CONNECTED:    return TFT_GREEN;
        case STATUS_READY:           return TFT_GREEN;
        case STATUS_EXECUTING:       return TFT_CYAN;
        case STATUS_ERROR:           return TFT_RED;
        case STATUS_EMERGENCY_STOP:  return TFT_RED;
        default:                     return TFT_WHITE;
    }
}
