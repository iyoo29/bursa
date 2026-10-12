/**
 * AIRA Firmware - Konfigurasi Utama
 * Target: LILYGO T-Dongle S3 Standard
 * 
 * Header konfigurasi pusat untuk seluruh modul firmware.
 * Definisi pin, nilai default, dan pengaturan compile-time ada di sini.
 */

#ifndef AIRA_CONFIG_H
#define AIRA_CONFIG_H

// ============================================================
// VERSI FIRMWARE
// ============================================================
#define AIRA_FW_VERSION    "1.0.0"
#define AIRA_FW_NAME       "AIRA-TD"

// ============================================================
// DEFINISI PIN — LILYGO T-Dongle S3
// ============================================================

// LCD (ST7735 80x160) — Didefinisikan dalam platformio.ini pada bagian build_flags
// TFT_MOSI=3, TFT_SCLK=5, TFT_CS=4, TFT_DC=2, TFT_RST=1, TFT_BL=38

// LED RGB (WS2812 / NeoPixel)
#ifndef LED_PIN
#define LED_PIN            40
#endif
#define LED_COUNT          1
#define LED_BRIGHTNESS     30   // 0-255, pertahankan nilai rendah karena ditenagai melalui USB

// Tombol BOOT
#ifndef BOOT_BTN_PIN
#define BOOT_BTN_PIN       0
#endif
#define BTN_DEBOUNCE_MS    50
#define BTN_LONG_PRESS_MS  3000  // 3 detik untuk memicu emergency stop

// ============================================================
// KONFIGURASI WI-FI
// ============================================================
#define WIFI_CONNECT_TIMEOUT_MS    15000   // Waktu tunggu koneksi: 15 detik
#define WIFI_RECONNECT_INTERVAL_MS 5000    // Waktu jeda sebelum menyambung ulang: 5 detik
#define WIFI_MAX_RETRIES           0       // 0 = Coba ulang terus-menerus tanpa batas
#define WIFI_HOSTNAME_PREFIX       "AIRA-TD-"

// ============================================================
// KONFIGURASI WEBSOCKET
// ============================================================
#define WS_RECONNECT_INTERVAL_MS   3000    // 3 detik antara percobaan koneksi ulang
#define WS_HEARTBEAT_INTERVAL_MS   10000   // Kirim heartbeat setiap 10 detik
#define WS_PING_INTERVAL_MS        15000   // 15 detik untuk ping WebSocket
#define WS_MESSAGE_MAX_SIZE        8192    // Ukuran maksimal pesan 8 KB

// ============================================================
// KONFIGURASI LAYAR (DISPLAY)
// ============================================================
#define DISPLAY_WIDTH      160
#define DISPLAY_HEIGHT     80
#define DISPLAY_ROTATION   1     // Orientasi Landscape (Mendatar)
#define DISPLAY_UPDATE_MS  1000  // Waktu jeda minimal antara pembaruan tampilan layar (ms)

// ============================================================
// KONFIGURASI USB HID (KEYBOARD & MOUSE)
// ============================================================
#define HID_MOUSE_MOVE_STEP    5    // Jumlah piksel per langkah pergerakan mouse
#define HID_KEY_DELAY_MS       50   // Waktu jeda (delay) antar ketikan tombol
#define HID_ACTION_TIMEOUT_MS  5000 // Waktu maksimal untuk mengeksekusi 1 tindakan

// ============================================================
// IDENTITAS PERANGKAT
// ============================================================
#define DEVICE_ID_PREFIX   "AIRA-TD-"

// ============================================================
// AGENT / PERINTAH (COMMAND)
// ============================================================
#define CMD_QUEUE_SIZE     16    // Maksimal antrean perintah
#define CMD_TIMEOUT_MS     10000 // Waktu habis perintah 10 detik

// ============================================================
// KODE STATUS (STATUS CODES)
// ============================================================
enum AiraStatus {
    STATUS_BOOTING = 0,
    STATUS_WIFI_CONNECTING,
    STATUS_WIFI_CONNECTED,
    STATUS_WS_CONNECTING,
    STATUS_WS_CONNECTED,
    STATUS_READY,
    STATUS_EXECUTING,
    STATUS_ERROR,
    STATUS_EMERGENCY_STOP
};

// ============================================================
// WARNA LED (RGB)
// ============================================================
#define COLOR_BOOTING      0x0000FF  // Biru
#define COLOR_WIFI_SEARCH  0xFFFF00  // Kuning
#define COLOR_CONNECTED    0x00FF00  // Hijau
#define COLOR_EXECUTING    0x00FFFF  // Cyan (Biru Muda)
#define COLOR_ERROR        0xFF0000  // Merah
#define COLOR_EMERGENCY    0xFF0000  // Merah (Nantinya dibuat berkedip)
#define COLOR_IDLE         0x001000  // Hijau redup

#endif // AIRA_CONFIG_H
