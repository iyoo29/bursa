/**
 * AIRA Server - Titik Masuk Utama (Main Entry Point)
 * 
 * Bertindak sebagai jembatan yang menghubungkan antara Web Dashboard (melalui REST API)
 * dengan T-Dongle S3 Firmware (melalui koneksi WebSockets).
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

// Inisialisasi Express & Server HTTP
const app = express();
const server = http.createServer(app);

// Inisialisasi WebSocket Server yang menumpang pada HTTP Server
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8000;

// Daftar perangkat dongle yang terhubung
const connectedDevices = new Map();

// Middleware dasar
app.use(cors());
app.use(express.json());

// ============================================================
// WEBSOCKET HANDLERS (Untuk T-Dongle S3)
// ============================================================
wss.on('connection', (ws, req) => {
    console.log('[WebSocket] Klien baru terhubung dari:', req.socket.remoteAddress);
    
    // Memberikan ID sementara sebelum perangkat melaporkan ID aslinya
    let deviceId = "unknown";

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // console.log('[WebSocket] Menerima data:', data);

            // Menangani jenis pesan dari dongle
            if (data.type === 'device_status') {
                deviceId = data.device_id;
                // Daftarkan ke peta (map) perangkat aktif
                connectedDevices.set(deviceId, {
                    ws: ws,
                    status: data.status,
                    firmware_version: data.firmware_version,
                    last_seen: new Date()
                });
                console.log(`[WebSocket] Perangkat terdaftar: ${deviceId} (Status: ${data.status})`);
            } 
            else if (data.type === 'action_result') {
                console.log(`[WebSocket] Hasil Aksi dari ${data.device_id}: Aksi ${data.action_id} -> ${data.status}`);
                // Disini kita bisa meneruskan hasil ke Web Dashboard jika menggunakan database/antrean
            }
            else if (data.type === 'pong' || data.type === 'heartbeat') {
                // Heartbeat dari dongle untuk menjaga koneksi tetap hidup
                if (connectedDevices.has(deviceId)) {
                    connectedDevices.get(deviceId).last_seen = new Date();
                }
            }

        } catch (err) {
            console.error('[WebSocket] Gagal mengurai pesan JSON:', err.message);
        }
    });

    ws.on('close', () => {
        console.log(`[WebSocket] Klien terputus (ID: ${deviceId})`);
        if (connectedDevices.has(deviceId)) {
            connectedDevices.delete(deviceId);
        }
    });
});

// ============================================================
// REST API ROUTES (Untuk Web Dashboard)
// ============================================================

// 1. Cek kesehatan server (Health Check)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'AIRA Server berjalan normal.' });
});

// 2. Lihat daftar dongle yang terhubung
app.get('/api/devices', (req, res) => {
    const devices = [];
    for (const [id, info] of connectedDevices.entries()) {
        devices.push({
            id: id,
            status: info.status,
            firmware_version: info.firmware_version,
            last_seen: info.last_seen
        });
    }
    res.json({ devices: devices });
});

// 3. Mengirim perintah aksi ke dongle tertentu
app.post('/api/devices/:id/execute', (req, res) => {
    const targetId = req.params.id;
    const { action_id, action, params } = req.body;

    if (!connectedDevices.has(targetId)) {
        return res.status(404).json({ error: `Perangkat dengan ID ${targetId} tidak ditemukan atau sedang luring (offline).` });
    }

    if (!action) {
        return res.status(400).json({ error: 'Atribut "action" wajib diisi.' });
    }

    const device = connectedDevices.get(targetId);
    
    // Format JSON yang akan dikirim ke firmware
    const commandPayload = {
        type: 'action',
        action_id: action_id || `cmd-${Date.now()}`,
        action: action,
        params: params || {}
    };

    // Kirim instruksi via WebSocket
    device.ws.send(JSON.stringify(commandPayload));
    
    console.log(`[API] Perintah dikirim ke ${targetId}: ${action}`);
    res.json({ success: true, message: 'Perintah berhasil dikirim ke antrean.', command: commandPayload });
});

// ============================================================
// START SERVER
// ============================================================
server.listen(PORT, () => {
    console.log(`\n=============================================`);
    console.log(`  AIRA Server berjalan pada port ${PORT} `);
    console.log(`  REST API : http://localhost:${PORT}/api/`);
    console.log(`  WebSocket: ws://localhost:${PORT}/`);
    console.log(`=============================================\n`);
});
