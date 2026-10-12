/**
 * AIRA Firmware - WebSocket Client
 * 
 * Menangani koneksi WebSocket ke AIRA Server, 
 * menerima perintah, dan mengirim status/heartbeat.
 */

#ifndef AIRA_WS_CLIENT_H
#define AIRA_WS_CLIENT_H

#include <Arduino.h>
#include <WebSocketsClient.h>
#include "config.h"

// Tipe fungsi callback untuk menerima pesan (payload)
typedef void (*WsMessageCallback)(const String& payload);
// Tipe fungsi callback ketika status koneksi berubah
typedef void (*WsConnectionCallback)(bool connected);

class WebSocketManager {
public:
    /**
     * Menginisialisasi WebSocket manager.
     */
    void init();

    /**
     * Menghubungkan ke AIRA Server.
     * @param host IP atau hostname server
     * @param port Port server
     * @param path Path WebSocket (default: "/ws/device")
     */
    void connect(const String& host, uint16_t port, const String& path = "/ws/device");

    /**
     * Memutuskan koneksi WebSocket.
     */
    void disconnect();

    /**
     * Mengatur callback saat menerima pesan baru.
     */
    void onMessage(WsMessageCallback callback);

    /**
     * Mengatur callback saat status koneksi berubah.
     */
    void onConnectionChange(WsConnectionCallback callback);

    /**
     * Memeriksa apakah terhubung ke server.
     */
    bool isConnected();

    /**
     * Mengirim pesan string (JSON) ke server.
     */
    bool sendMessage(const String& message);

    /**
     * Mengirim status perangkat (Device Status) ke server.
     * @param deviceId ID Perangkat saat ini
     * @param status Status AiraStatus
     */
    void sendStatus(const String& deviceId, AiraStatus status);

    /**
     * Menangani komunikasi WebSocket (harus dipanggil terus-menerus di loop).
     */
    void loop();

private:
    WebSocketsClient _ws;
    bool _connected = false;
    unsigned long _lastHeartbeat = 0;
    
    WsMessageCallback _messageCallback = nullptr;
    WsConnectionCallback _connectionCallback = nullptr;

    // Callback event bawaan WebSocketsClient
    void _webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
    
    // Perlu pointer statis agar fungsi callback global dapat mengakses instance ini
    static WebSocketManager* _instance;
    static void _staticWebSocketEvent(WStype_t type, uint8_t * payload, size_t length);
};

#endif // AIRA_WS_CLIENT_H
