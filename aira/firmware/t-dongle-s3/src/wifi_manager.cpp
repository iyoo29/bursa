/**
 * AIRA Firmware - Implementasi WiFi Manager
 */

#include "wifi_manager.h"
#include <esp_wifi.h>

void WiFiManager::init() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);  // Aktifkan auto-reconnect bawaan stack WiFi ESP32
    WiFi.onEvent(_wifiEventHandler);

    _loadCredentials();

    Serial.println("[WiFi] Diinisialisasi");
    if (_ssid.length() > 0) {
        Serial.printf("[WiFi] SSID Tersimpan: %s\n", _ssid.c_str());
    } else {
        Serial.println("[WiFi] Tidak ada kredensial yang tersimpan");
    }
}

void WiFiManager::setCredentials(const String& ssid, const String& password) {
    _ssid = ssid;
    _password = password;
    _saveCredentials();
    Serial.printf("[WiFi] Kredensial disimpan untuk: %s\n", ssid.c_str());
}

bool WiFiManager::connect() {
    if (_ssid.length() == 0) {
        Serial.println("[WiFi] Kredensial belum dikonfigurasi");
        return false;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] Sudah terhubung");
        return true;
    }

    Serial.printf("[WiFi] Menghubungkan ke: %s\n", _ssid.c_str());
    _connecting = true;
    _retryCount = 0;

    WiFi.begin(_ssid.c_str(), _password.c_str());

    // Tunggu koneksi dengan batas waktu (timeout)
    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && 
           millis() - startTime < WIFI_CONNECT_TIMEOUT_MS) {
        delay(100);
    }

    _connecting = false;

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WiFi] Terhubung! IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
        return true;
    } else {
        Serial.println("[WiFi] Koneksi gagal");
        return false;
    }
}

void WiFiManager::disconnect() {
    _shouldReconnect = false;
    WiFi.disconnect();
    Serial.println("[WiFi] Terputus");
}

bool WiFiManager::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

String WiFiManager::getIP() {
    if (!isConnected()) return "";
    return WiFi.localIP().toString();
}

String WiFiManager::getSSID() {
    return _ssid;
}

int WiFiManager::getRSSI() {
    if (!isConnected()) return 0;
    return WiFi.RSSI();
}

bool WiFiManager::hasCredentials() {
    return _ssid.length() > 0;
}

void WiFiManager::update() {
    if (!_shouldReconnect || _connecting) return;
    if (_ssid.length() == 0) return;
    if (isConnected()) return;

    // Periksa apakah sudah waktunya untuk mencoba ulang
    unsigned long now = millis();
    if (now - _lastReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) return;

    _lastReconnectAttempt = now;
    _retryCount++;

    if (WIFI_MAX_RETRIES > 0 && _retryCount > WIFI_MAX_RETRIES) {
        Serial.println("[WiFi] Batas percobaan ulang (max retries) tercapai");
        return;
    }

    Serial.printf("[WiFi] Menghubungkan ulang (percobaan ke-%d)...\n", _retryCount);
    WiFi.begin(_ssid.c_str(), _password.c_str());
}

String WiFiManager::scanNetworks() {
    Serial.println("[WiFi] Memindai jaringan...");
    int count = WiFi.scanNetworks();

    String result = "[";
    for (int i = 0; i < count; i++) {
        if (i > 0) result += ",";
        result += "{\"ssid\":\"" + WiFi.SSID(i) + "\","
                  "\"rssi\":" + String(WiFi.RSSI(i)) + ","
                  "\"encrypted\":" + String(WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false") + "}";
    }
    result += "]";

    WiFi.scanDelete();
    Serial.printf("[WiFi] Ditemukan %d jaringan\n", count);
    return result;
}

void WiFiManager::_loadCredentials() {
    _prefs.begin("aira-wifi", true);  // read-only (hanya baca)
    _ssid = _prefs.getString("ssid", "");
    _password = _prefs.getString("pass", "");
    _prefs.end();
}

void WiFiManager::_saveCredentials() {
    _prefs.begin("aira-wifi", false);  // read-write (baca-tulis)
    _prefs.putString("ssid", _ssid);
    _prefs.putString("pass", _password);
    _prefs.end();
}

void WiFiManager::_wifiEventHandler(WiFiEvent_t event, WiFiEventInfo_t info) {
    unsigned long timestamp = millis();
    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            Serial.printf("[%lu ms] [WiFi] Event: Mendapat IP - %s\n", timestamp, WiFi.localIP().toString().c_str());
            break;
        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            Serial.printf("[%lu ms] [WiFi] Event: Terhubung ke AP (Access Point)\n", timestamp);
            break;
        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
            uint8_t reason = info.wifi_sta_disconnected.reason;
            const char* reasonStr = "Tidak Diketahui";
            switch (reason) {
                case WIFI_REASON_NO_AP_FOUND: 
                    reasonStr = "AP/SSID Tidak Ditemukan"; 
                    break;
                case WIFI_REASON_AUTH_FAIL:
                case WIFI_REASON_AUTH_EXPIRE: 
                    reasonStr = "Autentikasi Gagal / Kata Sandi Tidak Cocok"; 
                    break;
                case WIFI_REASON_HANDSHAKE_TIMEOUT:
                case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT: 
                    reasonStr = "Handshake Timeout"; 
                    break;
                case WIFI_REASON_ASSOC_FAIL:
                case WIFI_REASON_ASSOC_EXPIRE: 
                    reasonStr = "Asosiasi ke AP Gagal"; 
                    break;
                case WIFI_REASON_BEACON_TIMEOUT: 
                    reasonStr = "Kehilangan Beacon / Sinyal Hilang"; 
                    break;
                case WIFI_REASON_CONNECTION_FAIL: 
                    reasonStr = "Koneksi Gagal Terbentuk"; 
                    break;
                case WIFI_REASON_CIPHER_SUITE_REJECTED: 
                    reasonStr = "Cipher Suite Ditolak oleh AP"; 
                    break;
                default: 
                    break;
            }
            Serial.printf("[%lu ms] [WiFi] Event: Terputus dari jaringan | Alasan: %s (Kode: %d)\n", 
                          timestamp, reasonStr, reason);
            break;
        }
        default:
            break;
    }
}
