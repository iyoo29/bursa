/**
 * AIRA Firmware - Implementasi Pengelola ID Perangkat
 */

#include "device_id.h"
#include "config.h"
#include <WiFi.h>

String DeviceID::_deviceId = "";
String DeviceID::_macAddress = "";
bool DeviceID::_initialized = false;

void DeviceID::init() {
    if (_initialized) return;

    // Mendapatkan byte alamat MAC
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    // Memformat string alamat MAC
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    _macAddress = String(macStr);

    // Menghasilkan ID perangkat dari 2 byte terakhir MAC address
    char idStr[16];
    snprintf(idStr, sizeof(idStr), "%s%02X%02X", DEVICE_ID_PREFIX, mac[4], mac[5]);
    _deviceId = String(idStr);

    _initialized = true;

    Serial.printf("[DeviceID] ID: %s\n", _deviceId.c_str());
    Serial.printf("[DeviceID] MAC: %s\n", _macAddress.c_str());
}

String DeviceID::getID() {
    if (!_initialized) init();
    return _deviceId;
}

String DeviceID::getMAC() {
    if (!_initialized) init();
    return _macAddress;
}
