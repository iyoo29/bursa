/**
 * AIRA Firmware - Titik Masuk Utama (Main Entry Point)
 * Target: LILYGO T-Dongle S3 Standard
 * 
 * Menggabungkan seluruh modul untuk berinteraksi dengan server AIRA
 * dan mengendalikan host (PC Windows) via USB HID.
 */

#include <Arduino.h>
#include "config.h"
#include "device_id.h"
#include "led_manager.h"
#include "display_manager.h"
#include "button_handler.h"
#include "wifi_manager.h"
#include "usb_hid.h"
#include "ws_client.h"
#include "command_parser.h"

// Inisialisasi seluruh pengelola (manager)
LEDManager ledManager;
DisplayManager displayManager;
ButtonHandler buttonHandler;
WiFiManager wifiManager;
USBHIDManager usbHID;
WebSocketManager wsManager;
CommandParser commandParser;

// Konfigurasi Kredensial & Jaringan Lokal
#if __has_include("credentials.h")
#include "credentials.h"
#endif

#ifndef DEFAULT_WIFI_SSID
#define DEFAULT_WIFI_SSID       ""
#endif
#ifndef DEFAULT_WIFI_PASSWORD
#define DEFAULT_WIFI_PASSWORD   ""
#endif
#ifndef DEFAULT_SERVER_HOST
#define DEFAULT_SERVER_HOST     "127.0.0.1"
#endif
#ifndef DEFAULT_SERVER_PORT
#define DEFAULT_SERVER_PORT     8000
#endif
#ifndef DEFAULT_SERVER_API_KEY
#define DEFAULT_SERVER_API_KEY  ""
#endif

// Variabel status global
AiraStatus currentStatus = STATUS_BOOTING;
String agentStatusText = "Menunggu...";
static bool wsInitiated = false;

// Update tampilan LCD
void updateDisplay() {
    displayManager.showStatus(
        currentStatus,
        DeviceID::getID(),
        wifiManager.getSSID(),
        wifiManager.getIP(),
        wifiManager.getRSSI(),
        wsManager.isConnected(),
        agentStatusText
    );
}

// Callback: Jika status koneksi WebSocket berubah
void onWsConnectionChange(bool connected) {
    if (connected) {
        currentStatus = STATUS_WS_CONNECTED;
        wsManager.sendStatus(DeviceID::getID(), currentStatus);
    } else {
        currentStatus = wifiManager.isConnected() ? STATUS_WIFI_CONNECTED : STATUS_WIFI_CONNECTING;
    }
    ledManager.setStatus(currentStatus);
    updateDisplay();
}

// Callback: Jika ada pesan WebSocket yang diterima
void onWsMessage(const String& payload) {
    commandParser.parse(payload);
    
    // Kembalikan ke tampilan utama setelah menerima pesan (untuk menghapus layar aksi/action)
    updateDisplay();
}

// Callback: Saat tombol ditekan secara singkat
void onButtonShortPress() {
    Serial.println("[Utama] Tombol ditekan singkat - Melakukan update layar");
    updateDisplay();
}

// Callback: Saat tombol ditekan dan ditahan lama (Berhenti Darurat / Emergency Stop)
void onButtonLongPress() {
    Serial.println("[Utama] BERHENTI DARURAT DIPICU!");
    currentStatus = STATUS_EMERGENCY_STOP;
    agentStatusText = "BERHENTI DARURAT!";
    
    // Memberitahu server mengenai status berhenti darurat
    wsManager.sendStatus(DeviceID::getID(), currentStatus);
    
    // Melepaskan semua tombol keyboard / mouse USB
    usbHID.releaseAll();
    
    // Memperbarui indikator
    ledManager.setStatus(currentStatus);
    displayManager.showEmergencyStop();
    
    // Menghentikan koneksi WebSocket demi keamanan
    wsManager.disconnect();
}

void setup() {
    // Inisialisasi LED dan Layar paling awal
    ledManager.init();
    ledManager.setStatus(STATUS_BOOTING);
    
    displayManager.init();
    displayManager.showSplash();

    // Memulai Serial Monitor
    Serial.begin(115200);
    Serial.setTxTimeoutMs(0); // Mencegah freeze saat Serial Monitor tidak terhubung di Native USB CDC
    
    Serial.println("\n\n========================================");
    Serial.println("  AIRA Firmware v" AIRA_FW_VERSION " Memulai...  ");
    Serial.println("========================================\n");

    delay(1500); // Tampilkan splash screen sejenak

    DeviceID::init();
    
    buttonHandler.init();
    buttonHandler.onShortPress(onButtonShortPress);
    buttonHandler.onLongPress(onButtonLongPress);
    
    usbHID.init();
    
    wifiManager.init();
    if (strlen(DEFAULT_WIFI_SSID) > 0) {
        wifiManager.setCredentials(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASSWORD);
    }

    wsManager.init();
    if (strlen(DEFAULT_SERVER_API_KEY) > 0) {
        wsManager.setApiKey(DEFAULT_SERVER_API_KEY);
    }
    wsManager.onConnectionChange(onWsConnectionChange);
    wsManager.onMessage(onWsMessage);
    
    commandParser.init(&usbHID, &displayManager, &wsManager);
    
    // Tampilkan dashboard status awal (menghubungkan WiFi)
    currentStatus = STATUS_WIFI_CONNECTING;
    ledManager.setStatus(currentStatus);
    updateDisplay();

    // Hubungkan ke WiFi
    Serial.println("[Utama] Menghubungkan ke Wi-Fi...");
    if (wifiManager.connect()) {
        currentStatus = STATUS_WIFI_CONNECTED;
        ledManager.setStatus(currentStatus);
        updateDisplay();
    }
}

void loop() {
    // Memperbarui berbagai handle/rutinitas secara non-blocking
    buttonHandler.update();
    ledManager.update();
    wifiManager.update();
    
    // Jika sistem sedang dalam kondisi berhenti darurat, maka hentikan semua fungsi eksekusi normal
    if (currentStatus == STATUS_EMERGENCY_STOP) {
        return; 
    }

    // Mengelola logika status koneksi Wi-Fi dan WebSocket
    if (wifiManager.isConnected()) {
        if (!wsInitiated) {
            Serial.printf("[Utama] Wi-Fi terhubung. Memulai koneksi WebSocket ke %s:%d...\n", DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT);
            wsManager.connect(DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT);
            wsInitiated = true;
        }
        wsManager.loop();
        
        // Memperbarui status global jika sebelumnya connecting
        if (currentStatus == STATUS_WIFI_CONNECTING) {
            currentStatus = STATUS_WIFI_CONNECTED;
            ledManager.setStatus(currentStatus);
            updateDisplay();
        }
    } else {
        if (wsInitiated) {
            Serial.println("[Utama] Wi-Fi terputus. Menutup koneksi WebSocket...");
            wsManager.disconnect();
            wsInitiated = false;
        }
        if (currentStatus != STATUS_WIFI_CONNECTING) {
            currentStatus = STATUS_WIFI_CONNECTING;
            ledManager.setStatus(currentStatus);
            updateDisplay();
        }
    }
}

