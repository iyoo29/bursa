/**
 * AIRA Firmware - Pengelola Layar (Display Manager)
 * 
 * Mengontrol LCD ST7735 (80x160) bawaan untuk menampilkan status.
 */

#ifndef AIRA_DISPLAY_MANAGER_H
#define AIRA_DISPLAY_MANAGER_H

#include <Arduino.h>
#include <TFT_eSPI.h>
#include "config.h"

class DisplayManager {
public:
    /**
     * Menginisialisasi layar LCD.
     */
    void init();

    /**
     * Menampilkan layar splash (logo awal) saat proses booting.
     */
    void showSplash();

    /**
     * Memperbarui layar status utama.
     * @param status Status perangkat saat ini
     * @param deviceId String ID perangkat
     * @param wifiSSID SSID WiFi yang terhubung (atau kosong)
     * @param wifiIP Alamat IP (atau kosong)
     * @param wifiRSSI Kekuatan sinyal WiFi
     * @param wsConnected Status koneksi WebSocket
     * @param agentStatus Teks status Agen AI
     */
    void showStatus(AiraStatus status,
                    const String& deviceId,
                    const String& wifiSSID,
                    const String& wifiIP,
                    int wifiRSSI,
                    bool wsConnected,
                    const String& agentStatus);

    /**
     * Menampilkan tindakan (action) yang sedang dieksekusi.
     * @param actionType Tipe aksi (contoh: "click", "type")
     * @param detail String detail aksi
     */
    void showAction(const String& actionType, const String& detail);

    /**
     * Menampilkan pesan error.
     * @param errorMsg Pesan error yang ditampilkan
     */
    void showError(const String& errorMsg);

    /**
     * Menampilkan layar berhenti darurat (emergency stop).
     */
    void showEmergencyStop();

    /**
     * Membersihkan (menghapus) isi layar.
     */
    void clear();

    /**
     * Menampilkan checkpoint diagnostik boot pada LCD.
     */
    void showDiagnostic(int step, const char* name);

    /**
     * Mendapatkan instance TFT untuk akses langsung jika diperlukan.
     */
    TFT_eSPI& getTFT() { return _tft; }

private:
    TFT_eSPI _tft;
    unsigned long _lastUpdate = 0;

    void _drawHeader(const String& title, uint16_t color);
    void _drawKeyValue(int y, const String& key, const String& value, uint16_t color = TFT_WHITE);
    String _statusToString(AiraStatus status);
    uint16_t _statusToColor(AiraStatus status);
};

#endif // AIRA_DISPLAY_MANAGER_H
