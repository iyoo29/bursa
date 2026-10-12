/**
 * AIRA Firmware - Implementasi WebSocket Client
 */

#include "ws_client.h"

// Set pointer statis agar bisa digunakan oleh fungsi callback eksternal
WebSocketManager* WebSocketManager::_instance = nullptr;

void WebSocketManager::init() {
    _instance = this;
    Serial.println("[WebSocket] Diinisialisasi");
}

void WebSocketManager::connect(const String& host, uint16_t port, const String& path) {
    Serial.printf("[WebSocket] Menghubungkan ke %s:%d%s\n", host.c_str(), port, path.c_str());
    _ws.begin(host, port, path);
    _ws.onEvent(_staticWebSocketEvent);
    
    // Aktifkan auto-reconnect bawaan WebSocketsClient
    _ws.setReconnectInterval(WS_RECONNECT_INTERVAL_MS);
}

void WebSocketManager::disconnect() {
    _ws.disconnect();
    _connected = false;
    Serial.println("[WebSocket] Terputus secara manual");
}

void WebSocketManager::onMessage(WsMessageCallback callback) {
    _messageCallback = callback;
}

void WebSocketManager::onConnectionChange(WsConnectionCallback callback) {
    _connectionCallback = callback;
}

bool WebSocketManager::isConnected() {
    return _connected;
}

bool WebSocketManager::sendMessage(const String& message) {
    if (!_connected) return false;
    // Gunakan pointer dan length agar kompatibel dengan semua versi library WebSockets
    return _ws.sendTXT((uint8_t*)message.c_str(), message.length());
}

void WebSocketManager::sendStatus(const String& deviceId, AiraStatus status) {
    if (!_connected) return;

    // Membentuk string JSON manual untuk laporan status perangkat
    String statusStr = "unknown";
    switch (status) {
        case STATUS_READY: statusStr = "ready"; break;
        case STATUS_EXECUTING: statusStr = "executing"; break;
        case STATUS_ERROR: statusStr = "error"; break;
        case STATUS_EMERGENCY_STOP: statusStr = "emergency_stop"; break;
        default: statusStr = "connected"; break; // status bawaan ketika terhubung
    }

    String msg = "{\"type\":\"device_status\",\"device_id\":\"" + deviceId + 
                 "\",\"status\":\"" + statusStr + "\",\"firmware_version\":\"" + 
                 AIRA_FW_VERSION + "\"}";
    
    sendMessage(msg);
}

void WebSocketManager::loop() {
    _ws.loop();

    // Kirim heartbeat secara berkala jika terhubung
    if (_connected) {
        unsigned long now = millis();
        if (now - _lastHeartbeat >= WS_HEARTBEAT_INTERVAL_MS) {
            _lastHeartbeat = now;
            // Kirim pesan heartbeat sederhana
            sendMessage("{\"type\":\"heartbeat\"}");
        }
    }
}

void WebSocketManager::_webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.println("[WebSocket] Terputus!");
            _connected = false;
            if (_connectionCallback) _connectionCallback(false);
            break;
            
        case WStype_CONNECTED:
            Serial.printf("[WebSocket] Terhubung ke url: %s\n", payload);
            _connected = true;
            if (_connectionCallback) _connectionCallback(true);
            break;
            
        case WStype_TEXT:
            {
                // Konversi payload byte ke String
                String msg = "";
                for (size_t i = 0; i < length; i++) {
                    msg += (char)payload[i];
                }
                
                Serial.printf("[WebSocket] Menerima pesan: %s\n", msg.c_str());
                if (_messageCallback) _messageCallback(msg);
            }
            break;
            
        case WStype_BIN:
            Serial.println("[WebSocket] Menerima data biner (tidak didukung)");
            break;
            
        case WStype_ERROR:
        case WStype_FRAGMENT_TEXT_START:
        case WStype_FRAGMENT_BIN_START:
        case WStype_FRAGMENT:
        case WStype_FRAGMENT_FIN:
            break;
    }
}

// Fungsi statis yang menjembatani callback eksternal ke method pada instance class
void WebSocketManager::_staticWebSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if (_instance) {
        _instance->_webSocketEvent(type, payload, length);
    }
}
