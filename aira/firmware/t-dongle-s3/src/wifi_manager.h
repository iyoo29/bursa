/**
 * AIRA Firmware - WiFi Manager
 * 
 * Menangani koneksi WiFi, koneksi ulang (reconnect), dan pelaporan status.
 * Kredensial disimpan di EEPROM/Preferences (NVS), bukan di-hard-code.
 */

#ifndef AIRA_WIFI_MANAGER_H
#define AIRA_WIFI_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include "config.h"

class WiFiManager {
public:
    /**
     * Menginisialisasi manager WiFi dan memuat kredensial yang tersimpan.
     */
    void init();

    /**
     * Mengatur kredensial WiFi (menyimpan ke memori NVS).
     * @param ssid Nama WiFi (SSID)
     * @param password Kata sandi WiFi
     */
    void setCredentials(const String& ssid, const String& password);

    /**
     * Terhubung ke WiFi menggunakan kredensial yang tersimpan.
     * @return true jika proses koneksi dimulai
     */
    bool connect();

    /**
     * Memutuskan koneksi dari WiFi.
     */
    void disconnect();

    /**
     * Memeriksa apakah terhubung ke WiFi.
     */
    bool isConnected();

    /**
     * Mendapatkan alamat IP saat ini.
     */
    String getIP();

    /**
     * Mendapatkan SSID yang terhubung.
     */
    String getSSID();

    /**
     * Mendapatkan kekuatan sinyal WiFi (RSSI).
     */
    int getRSSI();

    /**
     * Memeriksa apakah kredensial sudah dikonfigurasi.
     */
    bool hasCredentials();

    /**
     * Menangani logika koneksi ulang (harus dipanggil di dalam loop).
     */
    void update();

    /**
     * Memindai jaringan WiFi yang tersedia.
     * @return String array JSON yang berisi jaringan yang ditemukan
     */
    String scanNetworks();

private:
    Preferences _prefs;
    String _ssid;
    String _password;
    bool _connecting = false;
    bool _shouldReconnect = true;
    unsigned long _lastReconnectAttempt = 0;
    int _retryCount = 0;

    void _loadCredentials();
    void _saveCredentials();
    static void _wifiEventHandler(WiFiEvent_t event, WiFiEventInfo_t info);
};

#endif // AIRA_WIFI_MANAGER_H
