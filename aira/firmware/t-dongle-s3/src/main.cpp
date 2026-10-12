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

// Variabel status global
AiraStatus currentStatus = STATUS_BOOTING;
String agentStatusText = "Menunggu...";

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

// Fungsi checkpoint diagnostik visual (LCD + Serial)
void diagCheckpoint(int step, const char* name) {
    Serial.printf("[DIAG] Step %02d: %s\n", step, name);
    displayManager.showDiagnostic(step, name);
    delay(50); // Jeda minimal 50ms agar tampilan visual stabil
}

void setup() {
    // Inisialisasi LED dan Layar paling awal untuk mencegah stuck di USB CDC
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

    delay(1000); // Pertahankan splash sejenak sebelum checkpoint dimulai

    diagCheckpoint(1, "BOOT_START");

    DeviceID::init();
    
    buttonHandler.init();
    buttonHandler.onShortPress(onButtonShortPress);
    buttonHandler.onLongPress(onButtonLongPress);
    
    diagCheckpoint(2, "HID_INIT_IN");
    usbHID.init();
    diagCheckpoint(3, "HID_INIT_OUT");
    
    diagCheckpoint(4, "WIFI_INIT_IN");
    wifiManager.init();
    diagCheckpoint(7, "WIFI_INIT_OUT");
    
    diagCheckpoint(8, "WIFI_CRED_IN");
    wifiManager.setCredentials("Iyo", "Riobm123");
    diagCheckpoint(11, "WIFI_CRED_OUT");

    diagCheckpoint(12, "WS_INIT_IN");
    wsManager.init();
    diagCheckpoint(13, "WS_INIT_OUT");

    wsManager.onConnectionChange(onWsConnectionChange);
    wsManager.onMessage(onWsMessage);
    
    diagCheckpoint(14, "CMD_PARSER_IN");
    commandParser.init(&usbHID, &displayManager, &wsManager);
    diagCheckpoint(15, "CMD_PARSER_OUT");
    
    diagCheckpoint(16, "DELAY_2S_IN");
    delay(2000);
    diagCheckpoint(17, "DELAY_2S_OUT");
    
    // Persiapan sebelum masuk loop utama
    currentStatus = STATUS_WIFI_CONNECTING;
    diagCheckpoint(18, "LED_STATUS_IN");
    ledManager.setStatus(currentStatus);
    diagCheckpoint(19, "LED_STATUS_OUT");

    diagCheckpoint(20, "DISP_UPDATE_IN");
    updateDisplay();
    diagCheckpoint(21, "DISP_UPDATE_OUT");

    diagCheckpoint(22, "SETUP_DONE");
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
        if (!wsManager.isConnected()) {
            // Coba sambungkan WebSocket
            wsManager.connect("172.20.10.2", 8000);
            wsManager.loop(); // loop akan mencoba mengkoneksikan ulang berdasarkan config wsManager
        } else {
            wsManager.loop();
        }
        
        // Memperbarui status global
        if (currentStatus == STATUS_WIFI_CONNECTING) {
            currentStatus = STATUS_WIFI_CONNECTED;
            ledManager.setStatus(currentStatus);
            updateDisplay();
        }
    } else {
        if (currentStatus != STATUS_WIFI_CONNECTING) {
            currentStatus = STATUS_WIFI_CONNECTING;
            ledManager.setStatus(currentStatus);
            updateDisplay();
        }
    }
}
