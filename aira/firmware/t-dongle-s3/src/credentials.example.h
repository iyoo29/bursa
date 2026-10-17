/**
 * AIRA Firmware - Template Kredensial Lokal (credentials.example.h)
 * 
 * Salin file ini menjadi credentials.h dan sesuaikan dengan konfigurasi jaringan Anda.
 * File credentials.h tidak akan dicatat oleh Git demi keamanan.
 */

#ifndef AIRA_CREDENTIALS_H
#define AIRA_CREDENTIALS_H

// Konfigurasi Wi-Fi Default
#define DEFAULT_WIFI_SSID       "NAMA_WIFI_ANDA"
#define DEFAULT_WIFI_PASSWORD   "PASSWORD_WIFI_ANDA"

// Konfigurasi AIRA Server
#define DEFAULT_SERVER_HOST     "192.168.1.100"  // Ganti dengan IP Host komputer/server Anda
#define DEFAULT_SERVER_PORT     8000

// Konfigurasi Kunci Akses WebSocket / REST API (Opsional, kosongkan jika server tanpa BURSA_API_KEY)
#define DEFAULT_SERVER_API_KEY  ""

#endif // AIRA_CREDENTIALS_H
