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
const AIPlanner = require('../agent/planner');
const ObservationQueue = require('./observation_queue');

// Inisialisasi Express & Server HTTP
const app = express();
const server = http.createServer(app);
const aiPlanner = new AIPlanner();
const observationQueue = new ObservationQueue();

// Inisialisasi WebSocket Server independen untuk mengontrol tahap handshake upgrade
const wss = new WebSocket.Server({ 
    noServer: true,
    handleProtocols: (protocols, req) => {
        // Mendukung negosiasi subprotocol autentikasi untuk klien browser
        if (protocols.has('bursa-auth')) {
            return 'bursa-auth';
        }
        for (const p of protocols) {
            if (p.startsWith('bursa-token.')) {
                return p;
            }
        }
        // Mendukung subprotocol 'arduino' bawaan WebSocketsClient ESP32
        if (protocols.has('arduino')) {
            return 'arduino';
        }
        // Menyetujui subprotokol pertama yang diminta klien jika ada
        const first = Array.from(protocols)[0];
        return first || false;
    }
});

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';
const BURSA_API_KEY = process.env.BURSA_API_KEY || null;
const BURSA_AUTH_REQUIRED = process.env.BURSA_AUTH_REQUIRED === 'true' || process.env.BURSA_AUTH_REQUIRED === '1';
const BURSA_ALLOWED_ORIGINS = process.env.BURSA_ALLOWED_ORIGINS 
    ? process.env.BURSA_ALLOWED_ORIGINS.split(',').map(s => s.trim().toLowerCase()) 
    : null;

// Daftar perangkat dongle yang terhubung
const connectedDevices = new Map();

// Map untuk melacak perintah yang sedang menunggu hasil (action_id -> { resolve, reject, timer, deviceId })
const pendingActions = new Map();

// Middleware dasar
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Middleware Autentikasi / Otorisasi REST API
function requireAuth(req, res, next) {
    if (BURSA_AUTH_REQUIRED && !BURSA_API_KEY) {
        return res.status(503).json({ 
            error: 'Layanan terproteksi tidak tersedia: Autentikasi diwajibkan tetapi BURSA_API_KEY belum dikonfigurasi.',
            code: 'AUTH_NOT_CONFIGURED'
        });
    }

    if (!BURSA_API_KEY) {
        return next(); // Aman secara default dalam jaringan lokal pengujian
    }
    const clientKey = req.headers['x-bursa-key'] || 
                     (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/, '') : null);
    if (!clientKey || clientKey !== BURSA_API_KEY) {
        return res.status(401).json({ error: 'Tidak diotorisasi: Kunci akses API tidak valid atau tidak disertakan.' });
    }
    next();
}

// ============================================================
// KEAMANAN WEBSOCKET HANDSHAKE & AUTENTIKASI
// ============================================================

/**
 * Memvalidasi apakah Origin permintaan WebSocket diizinkan.
 */
function isAllowedOrigin(req) {
    const originHeader = req.headers['origin'];
    // Klien non-browser, firmware ESP32 (WebSocketsClient mengirim Origin: file://), atau file HTML lokal
    if (!originHeader || originHeader === 'file://' || originHeader === 'null') return true;

    try {
        const originUrl = new URL(originHeader);
        const originHost = originUrl.hostname.toLowerCase();

        // Izinkan loopback / localhost
        if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '::1' || originHost === '[::1]') {
            return true;
        }

        // Izinkan jika host cocok dengan alamat bind server atau subnet lokal privat (RFC1918)
        if ((HOST && originHost === HOST.toLowerCase()) ||
            originHost.startsWith('192.168.') ||
            originHost.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(originHost)) {
            return true;
        }

        // Izinkan jika terdaftar dalam allowlist origin khusus
        if (BURSA_ALLOWED_ORIGINS) {
            const fullOrigin = originUrl.origin.toLowerCase();
            if (BURSA_ALLOWED_ORIGINS.includes(fullOrigin) || BURSA_ALLOWED_ORIGINS.includes(originHost)) {
                return true;
            }
        }

        return false;
    } catch (e) {
        return false;
    }
}

/**
 * Mengekstraksi kredensial API Key dari handshake WebSocket tanpa menggunakan URL query string.
 */
function extractWebSocketCredentials(req) {
    // 1. Header kustom x-bursa-key (firmware ESP32, Node.js simulator, Python helper)
    const xKey = req.headers['x-bursa-key'];
    if (xKey && typeof xKey === 'string' && xKey.trim().length > 0) {
        return xKey.trim();
    }

    // 2. Header Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const bearerToken = authHeader.substring(7).trim();
        if (bearerToken.length > 0) return bearerToken;
    }

    // 3. Header Sec-WebSocket-Protocol (standar W3C untuk klien browser Web Companion)
    const protocolsHeader = req.headers['sec-websocket-protocol'];
    if (protocolsHeader && typeof protocolsHeader === 'string') {
        const protocols = protocolsHeader.split(',').map(p => p.trim());
        // Format A: ['bursa-auth', '<token>']
        const authIdx = protocols.indexOf('bursa-auth');
        if (authIdx !== -1 && protocols.length > authIdx + 1) {
            return protocols[authIdx + 1];
        }
        // Format B: 'bursa-token.<token>'
        for (const p of protocols) {
            if (p.startsWith('bursa-token.')) {
                return decodeURIComponent(p.substring('bursa-token.'.length));
            }
        }
    }

    return null;
}

// Menangani koneksi TCP masuk untuk diagnostik
server.on('connection', (socket) => {
    if (socket.remoteAddress !== '127.0.0.1' && socket.remoteAddress !== '::1' && socket.remoteAddress !== '::ffff:127.0.0.1') {
        console.log(`[TCP] Koneksi jaringan masuk dari: ${socket.remoteAddress}`);
    }
});

// Menangani HTTP Upgrade secara manual untuk memvalidasi handshake WebSocket
server.on('upgrade', (req, socket, head) => {
    console.log(`[WS Upgrade] Permintaan masuk: "${req.url}" dari ${socket.remoteAddress}`);
    let reqUrl;
    try {
        reqUrl = new URL(req.url, 'http://localhost');
    } catch (e) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nURL tidak valid\r\n');
        socket.destroy();
        return;
    }

    // 1. Validasi Path yang diizinkan
    const pathname = reqUrl.pathname;
    if (pathname !== '/' && pathname !== '/ws/device' && pathname !== '/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nPath WebSocket tidak ditemukan.\r\n');
        socket.destroy();
        return;
    }

    // 2. Larang keras pengiriman token via query string demi keamanan (mencegah kebocoran ke web access log)
    if (reqUrl.searchParams.has('key') || reqUrl.searchParams.has('token') || 
        reqUrl.searchParams.has('api_key') || reqUrl.searchParams.has('x-bursa-key')) {
        console.warn(`[Keamanan] Upaya WebSocket handshake ditolak dari ${socket.remoteAddress}: Pengiriman token via query string dilarang.`);
        socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nPengiriman token melalui URL query string dilarang demi keamanan. Gunakan header atau Sec-WebSocket-Protocol.\r\n');
        socket.destroy();
        return;
    }

    // 3. Validasi Origin jika disertakan
    if (!isAllowedOrigin(req)) {
        console.warn(`[Keamanan] Upaya WebSocket handshake ditolak: Origin "${req.headers['origin']}" tidak diizinkan.`);
        socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nOrigin tidak diizinkan.\r\n');
        socket.destroy();
        return;
    }

    // 4. Validasi Fail-Closed jika Autentikasi Diwajibkan tetapi BURSA_API_KEY belum dikonfigurasi
    if (BURSA_AUTH_REQUIRED && !BURSA_API_KEY) {
        console.warn(`[Keamanan] Upaya WebSocket handshake ditolak dari ${socket.remoteAddress}: Autentikasi diwajibkan tetapi BURSA_API_KEY belum dikonfigurasi.`);
        socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nLayanan WebSocket tidak tersedia: Autentikasi diwajibkan tetapi BURSA_API_KEY belum dikonfigurasi.\r\n');
        socket.destroy();
        return;
    }

    // 5. Validasi Autentikasi Handshake jika BURSA_API_KEY diaktifkan
    if (BURSA_API_KEY) {
        const clientKey = extractWebSocketCredentials(req);
        if (!clientKey || clientKey !== BURSA_API_KEY) {
            console.warn(`[Keamanan] Upaya WebSocket handshake ditolak dari ${socket.remoteAddress}: Kredensial tidak valid atau tidak disertakan.`);
            socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nTidak diotorisasi: Kunci akses WebSocket tidak valid atau tidak disertakan.\r\n');
            socket.destroy();
            return;
        }
    }

    // 5. Upgrade koneksi ke WebSocket jika seluruh pemeriksaan lolos
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

// ============================================================
// KEAMANAN: ALLOWLIST DAN VALIDASI
// ============================================================
const ALLOWED_DONGLE_ACTIONS = new Set([
    'mouse_move', 'click', 'mouse_click', 'double_click', 'right_click',
    'mouse_down', 'mouse_up', 'mouse_wheel', 'scroll',
    'key_press', 'key_down', 'key_up', 'type_text', 'key_combination',
    'delay', 'emergency_stop'
]);

const ALLOWED_HOST_ACTIONS = new Set([
    'open_app', 'verify_process', 'take_screenshot'
]);

const ALLOWED_APPLICATIONS = new Set([
    'notepad.exe', 'calc.exe', 'mspaint.exe'
]);

// Penyimpanan Tangkapan Layar & Riwayat Aksi Terbaru
let latestScreenshot = null;
const SCREENSHOT_TTL_MS = 60000; // Kadaluarsa setelah 60 detik demi privasi
const actionHistory = [];
const MAX_HISTORY = 50;

function validateDongleAction(action, params) {
    if (!action || typeof action !== 'string') {
        return { valid: false, error: 'Nama aksi harus berupa teks.' };
    }
    if (!ALLOWED_DONGLE_ACTIONS.has(action)) {
        return { valid: false, error: `Aksi "${action}" tidak diizinkan dalam allowlist keamanan.` };
    }
    if (params) {
        if (params.x !== undefined && (typeof params.x !== 'number' || params.x < -10000 || params.x > 10000)) {
            return { valid: false, error: 'Parameter koordinat x tidak valid.' };
        }
        if (params.y !== undefined && (typeof params.y !== 'number' || params.y < -10000 || params.y > 10000)) {
            return { valid: false, error: 'Parameter koordinat y tidak valid.' };
        }
        if (params.text !== undefined && (typeof params.text !== 'string' || params.text.length > 1000)) {
            return { valid: false, error: 'Teks pengetikan melebihi batas maksimal 1000 karakter.' };
        }
    }
    return { valid: true };
}

function validateScreenshotPayload(imageBase64) {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
        return { valid: false, error: 'Data gambar wajib disertakan dalam format string.' };
    }
    // Verifikasi format gambar valid (data URL JPEG/PNG atau raw base64)
    const isDataUrl = imageBase64.startsWith('data:image/jpeg') || 
                      imageBase64.startsWith('data:image/png') ||
                      imageBase64.startsWith('data:image/webp');
    const isRawBase64 = /^[A-Za-z0-9+/=]+$/.test(imageBase64.slice(0, 50));
    
    if (!isDataUrl && !isRawBase64) {
        return { valid: false, error: 'Format gambar tidak valid. Harus berupa data URI gambar JPEG/PNG base64.' };
    }
    if (imageBase64.length < 50) {
        return { valid: false, error: 'Ukuran data gambar terlalu kecil atau korup.' };
    }
    return { valid: true };
}

// ============================================================
// WEBSOCKET HANDLERS (Untuk T-Dongle S3 & Web/Host Companion)
// ============================================================
wss.on('connection', (ws, req) => {
    console.log('[WebSocket] Klien baru terhubung dari:', req.socket.remoteAddress);
    
    let clientId = "unknown";
    let clientType = "unregistered";

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Validasi pesan dasar
            if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
                console.warn('[WebSocket] Pesan ditolak: Format JSON harus berupa objek dengan atribut "type".');
                return;
            }

            // 1. Registrasi status dari dongle fisik
            if (data.type === 'device_status') {
                clientId = data.device_id || `dongle-${Date.now()}`;
                clientType = "dongle";
                connectedDevices.set(clientId, {
                    ws: ws,
                    status: data.status,
                    firmware_version: data.firmware_version,
                    type: clientType,
                    last_seen: new Date()
                });
                console.log(`[WebSocket] Perangkat terdaftar: ${clientId} (Status: ${data.status})`);
            } 
            // 2. Registrasi dari Web Companion atau Host Helper
            else if (data.type === 'companion_register') {
                clientId = data.companion_id || `companion-${Date.now()}`;
                clientType = data.companion_type || 'web_companion';
                connectedDevices.set(clientId, {
                    ws: ws,
                    status: 'online',
                    type: clientType,
                    last_seen: new Date()
                });
                console.log(`[WebSocket] Companion terdaftar: ${clientId} (Tipe: ${clientType})`);
            }
            // 3. Penerimaan tangkapan layar (screenshot) dari companion (Otorisasi: Hanya companion yang diizinkan)
            else if (data.type === 'screenshot_response' || data.type === 'screenshot_data') {
                if (clientType === 'dongle') {
                    console.warn(`[Keamanan] Dongle ${clientId} tidak diotorisasi untuk mengirim screenshot.`);
                    return;
                }
                const validation = validateScreenshotPayload(data.image_base64);
                if (validation.valid) {
                    latestScreenshot = {
                        image_base64: data.image_base64,
                        width: data.width || 0,
                        height: data.height || 0,
                        source: clientId,
                        timestamp: new Date().toISOString()
                    };
                    console.log(`[WebSocket] Screenshot valid diterima dari ${clientId}`);
                } else {
                    console.warn(`[WebSocket] Screenshot ditolak dari ${clientId}: ${validation.error}`);
                }
            }
            // 4. Laporan hasil aksi dari dongle (Otorisasi: Hanya dongle yang diizinkan)
            else if (data.type === 'action_result') {
                if (clientType !== 'dongle' && clientType !== 'unregistered') {
                    console.warn(`[Keamanan] Klien non-dongle (${clientId}) tidak diotorisasi untuk melaporkan action_result.`);
                    return;
                }
                const isSuccess = data.status === 'succeeded' || data.status === 'success' || data.status === 'completed';
                const finalStatus = isSuccess ? 'succeeded' : 'failed';
                
                console.log(`[WebSocket] Hasil Aksi dari ${data.device_id || clientId}: Aksi ${data.action_id} -> ${finalStatus} (${data.message || 'tanpa pesan'})`);
                
                actionHistory.unshift({
                    action_id: data.action_id,
                    device_id: data.device_id || clientId,
                    status: finalStatus,
                    message: data.message || '',
                    timestamp: new Date().toISOString()
                });
                if (actionHistory.length > MAX_HISTORY) actionHistory.pop();

                // Selesaikan pending action jika ada
                if (pendingActions.has(data.action_id)) {
                    const pending = pendingActions.get(data.action_id);
                    clearTimeout(pending.timer);
                    pendingActions.delete(data.action_id);
                    pending.resolve({
                        success: isSuccess,
                        status: finalStatus,
                        action_id: data.action_id,
                        message: data.message || ''
                    });
                }
            }
            // 5. Heartbeat & Ping
            else if (data.type === 'pong' || data.type === 'heartbeat') {
                if (connectedDevices.has(clientId)) {
                    connectedDevices.get(clientId).last_seen = new Date();
                }
            } else {
                console.warn(`[WebSocket] Tipe pesan tidak dikenal: ${data.type}`);
            }

        } catch (err) {
            console.error('[WebSocket] Gagal mengurai pesan JSON:', err.message);
        }
    });

    ws.on('close', () => {
        console.log(`[WebSocket] Klien terputus (ID: ${clientId})`);
        if (connectedDevices.has(clientId)) {
            connectedDevices.delete(clientId);
        }
        
        // Gagalkan semua aksi yang sedang berjalan untuk perangkat ini
        for (const [actionId, pending] of pendingActions.entries()) {
            if (pending.deviceId === clientId) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`Perangkat ${clientId} terputus sebelum aksi selesai dieksekusi.`));
                pendingActions.delete(actionId);
            }
        }
    });
});

// ============================================================
// REST API ROUTES
// ============================================================

// 1. Cek kesehatan server (Health Check)
app.get('/api/health', (req, res) => {
    // Periksa apakah screenshot sudah kedaluwarsa
    const hasValidScreenshot = latestScreenshot !== null && 
        (Date.now() - new Date(latestScreenshot.timestamp).getTime() < SCREENSHOT_TTL_MS);

    res.json({ 
        status: 'ok', 
        message: 'BURSA Server berjalan normal.',
        bound_host: HOST,
        connected_count: connectedDevices.size,
        has_screenshot: hasValidScreenshot,
        auth_enabled: BURSA_API_KEY !== null || BURSA_AUTH_REQUIRED
    });
});

// 2. Lihat daftar perangkat & companion yang terhubung
app.get('/api/devices', requireAuth, (req, res) => {
    const devices = [];
    for (const [id, info] of connectedDevices.entries()) {
        devices.push({
            id: id,
            status: info.status,
            type: info.type || 'dongle',
            firmware_version: info.firmware_version || 'N/A',
            last_seen: info.last_seen
        });
    }
    res.json({ devices: devices });
});

// 3. Mengirim perintah aksi tunggal ke dongle dengan validasi allowlist
app.post('/api/devices/:id/execute', requireAuth, (req, res) => {
    const targetId = req.params.id;
    const { action_id, action, params } = req.body;

    if (!connectedDevices.has(targetId)) {
        return res.status(404).json({ error: `Perangkat dengan ID ${targetId} tidak ditemukan atau sedang offline.` });
    }

    // Validasi Keamanan Allowlist
    const validation = validateDongleAction(action, params);
    if (!validation.valid) {
        console.warn(`[Keamanan] Tindakan ditolak untuk ${targetId}: ${validation.error}`);
        return res.status(403).json({ error: validation.error, rejected: true });
    }

    const device = connectedDevices.get(targetId);
    const cmdId = action_id || `cmd-${Date.now()}`;
    const commandPayload = {
        type: 'action',
        action_id: cmdId,
        action: action,
        params: params || {}
    };

    device.ws.send(JSON.stringify(commandPayload));
    
    console.log(`[API] Perintah divalidasi dan dikirim ke ${targetId}: ${action}`);
    res.json({ success: true, message: 'Perintah terverifikasi dan berhasil dikirim.', command: commandPayload });
});

// 4. Eksekusi Rencana Tindakan Terstruktur (Structured Action Plan Execution)
app.post('/api/plan/execute', requireAuth, async (req, res) => {
    const { plan_id, device_id, steps } = req.body;

    if (!device_id || !connectedDevices.has(device_id)) {
        return res.status(404).json({ error: `Perangkat dengan ID ${device_id} tidak ditemukan atau sedang offline.` });
    }
    if (!Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({ error: 'Atribut "steps" wajib berupa array tindakan yang tidak kosong.' });
    }

    // Validasi SELURUH langkah terhadap allowlist sebelum eksekusi dimulai
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const validation = validateDongleAction(step.action, step.params);
        if (!validation.valid) {
            console.warn(`[Keamanan] Rencana aksi ${plan_id} dibatalkan pada langkah ke-${i+1}: ${validation.error}`);
            return res.status(403).json({ 
                error: `Langkah ke-${i+1} (${step.action}) ditolak: ${validation.error}`, 
                rejected: true,
                failed_step_index: i
            });
        }
    }

    const device = connectedDevices.get(device_id);
    const planId = plan_id || `plan-${Date.now()}`;
    console.log(`[Plan] Memulai eksekusi rencana aksi ${planId} (${steps.length} langkah) ke ${device_id}...`);

    const executedSteps = [];

    // Jalankan langkah-langkah secara sekuensial dan tunggu hasil verifikasi setiap langkah
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepCmdId = `${planId}-step-${i+1}`;

        // Tangani penundaan (delay) di sisi server secara aman tanpa membebani parser firmware
        if (step.action === 'delay') {
            const delayMs = Math.min(Math.max(step.params?.ms || 500, 50), 5000);
            console.log(`[Plan] Mengeksekusi penundaan (delay) ${delayMs}ms pada langkah ke-${i+1}...`);
            await new Promise(r => setTimeout(r, delayMs));
            executedSteps.push({
                step: i + 1,
                action: 'delay',
                status: 'succeeded',
                message: `Penundaan server ${delayMs}ms selesai`
            });
            continue;
        }

        const commandPayload = {
            type: 'action',
            action_id: stepCmdId,
            action: step.action,
            params: step.params || {}
        };

        try {
            // Bungkus dalam Promise dengan timeout 5 detik per langkah
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pendingActions.delete(stepCmdId);
                    reject(new Error(`Timeout: Perangkat tidak merespons dalam 5 detik pada langkah ke-${i+1}.`));
                }, 5000);

                pendingActions.set(stepCmdId, {
                    resolve,
                    reject,
                    timer,
                    deviceId: device_id
                });

                device.ws.send(JSON.stringify(commandPayload));
            });

            executedSteps.push({
                step: i + 1,
                action: step.action,
                status: result.status,
                message: result.message
            });

            // Jika langkah gagal, batalkan seluruh sisa rencana
            if (!result.success || result.status !== 'succeeded') {
                console.warn(`[Plan] Rencana aksi ${planId} dihentikan karena langkah ke-${i+1} gagal.`);
                return res.status(422).json({
                    success: false,
                    plan_id: planId,
                    status: 'failed',
                    error: `Langkah ke-${i+1} (${step.action}) gagal dieksekusi oleh perangkat.`,
                    executed_steps: executedSteps
                });
            }

        } catch (err) {
            console.error(`[Plan] Error pada langkah ke-${i+1}:`, err.message);
            executedSteps.push({
                step: i + 1,
                action: step.action,
                status: 'failed',
                error: err.message
            });
            return res.status(500).json({
                success: false,
                plan_id: planId,
                status: 'failed',
                error: err.message,
                executed_steps: executedSteps
            });
        }
    }

    console.log(`[Plan] Rencana aksi ${planId} SELESAI SELURUHNYA dengan sukses.`);
    res.json({
        success: true,
        plan_id: planId,
        status: 'succeeded',
        executed_steps: executedSteps
    });
});

// 5. API Unggah Tangkapan Layar (Dari Web Companion / Host Helper)
app.post('/api/screenshot', requireAuth, (req, res) => {
    const { image_base64, width, height, source } = req.body;
    
    const validation = validateScreenshotPayload(image_base64);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    latestScreenshot = {
        image_base64: image_base64,
        width: width || 0,
        height: height || 0,
        source: source || 'REST_API',
        timestamp: new Date().toISOString()
    };

    console.log(`[API] Tangkapan layar diperbarui dari ${latestScreenshot.source}`);
    res.json({ success: true, timestamp: latestScreenshot.timestamp });
});

// 6. API Ambil Tangkapan Layar Terbaru (Dengan pemeriksaan TTL / Kadaluarsa)
app.get('/api/screenshot/latest', requireAuth, (req, res) => {
    if (!latestScreenshot) {
        return res.status(404).json({ error: 'Belum ada tangkapan layar yang tersedia.' });
    }
    const ageMs = Date.now() - new Date(latestScreenshot.timestamp).getTime();
    if (ageMs > SCREENSHOT_TTL_MS) {
        latestScreenshot = null; // Bersihkan dari memori setelah kadaluarsa demi privasi
        return res.status(404).json({ error: 'Tangkapan layar telah kadaluarsa demi keamanan privasi.' });
    }
    res.json(latestScreenshot);
});

// ============================================================
// OBSERVATION QUEUE REST API (Antrean Observasi Host Helper)
// ============================================================

// A. Buat permintaan observasi baru
app.post('/api/observation/request', requireAuth, (req, res) => {
    const { requested_by, timeout_ms } = req.body || {};
    const result = observationQueue.requestTask({ requested_by, timeout_ms });
    if (!result.success) {
        return res.status(result.code).json({ error: result.error, message: result.message });
    }
    res.status(201).json({
        success: true,
        task_id: result.task.task_id,
        status: result.task.status,
        queue_position: result.queue_position,
        created_at: result.task.created_at
    });
});

// B. Ambil status satu tugas observasi
app.get('/api/observation/tasks/:id', requireAuth, (req, res) => {
    const task = observationQueue.getTask(req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'TASK_NOT_FOUND', message: 'Tugas observasi tidak ditemukan.' });
    }
    res.json(task);
});

// C. Batalkan tugas observasi
app.post('/api/observation/tasks/:id/cancel', requireAuth, (req, res) => {
    const result = observationQueue.cancelTask(req.params.id);
    if (!result.success) {
        return res.status(result.code).json({ error: result.error, message: result.message, status: result.status });
    }
    res.json({
        success: true,
        task_id: result.task.task_id,
        status: result.task.status,
        message: result.message
    });
});

// D. Host Helper mengambil satu tugas berikutnya (FIFO, max 1 running, at-most-once)
app.get('/api/observation/next', requireAuth, (req, res) => {
    const nextTask = observationQueue.getNextTask();
    if (!nextTask) {
        return res.status(204).end();
    }
    res.json({ task: nextTask });
});

// E. Host Helper menyerahkan hasil screenshot untuk tugas tertentu
app.post('/api/observation/tasks/:id/submit', requireAuth, (req, res) => {
    const taskId = req.params.id;
    const { image_base64, width, height, source } = req.body || {};

    // 1. Validasi format payload gambar menggunakan validator yang ada
    const validation = validateScreenshotPayload(image_base64);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    // 2. Submit ke queue manager
    const result = observationQueue.submitResult(taskId, {
        width,
        height,
        source: source || 'Host_Helper'
    });

    if (!result.success) {
        return res.status(result.code).json({ error: result.error, message: result.message, status: result.status });
    }

    // 3. Hanya perbarui latestScreenshot jika tugas aktif berhasil menyelesaikan observasi
    latestScreenshot = {
        image_base64: image_base64,
        width: width || 0,
        height: height || 0,
        source: source || 'Host_Helper',
        timestamp: result.task.result_metadata.timestamp,
        task_id: taskId
    };

    console.log(`[API] Tangkapan layar diperbarui dari tugas observasi ${taskId} (${latestScreenshot.source})`);
    res.json({
        success: true,
        task_id: taskId,
        status: 'completed',
        timestamp: latestScreenshot.timestamp
    });
});

// 7. API Riwayat Aksi
app.get('/api/actions/history', requireAuth, (req, res) => {
    res.json({ history: actionHistory });
});

// 8. Cek Konfigurasi AI Provider (Aman tanpa ekspos rahasia)
app.get('/api/ai/config', (req, res) => {
    res.json({
        provider: aiPlanner.provider.name,
        timeout_ms: 10000,
        max_steps: 10
    });
});

// 9. Pembuatan Rencana Aksi Terstruktur AI (Terpisah dari Eksekusi)
app.post('/api/ai/plan', requireAuth, async (req, res) => {
    const { prompt, device_id, options } = req.body;

    if (!device_id) {
        return res.status(400).json({ error: 'Atribut device_id wajib ditentukan.' });
    }
    if (!connectedDevices.has(device_id)) {
        return res.status(404).json({ error: `Perangkat ${device_id} tidak ditemukan atau sedang offline.` });
    }

    const result = await aiPlanner.planAction({
        prompt,
        deviceId: device_id,
        latestScreenshot,
        options: options || {}
    });

    if (!result.success) {
        const statusCode = result.error_code === 'SCREENSHOT_REQUIRED' || result.error_code === 'SCREENSHOT_EXPIRED' ? 400 :
                           result.error_code === 'DISALLOWED_ACTION' || result.error_code === 'EXCESSIVE_STEPS' ? 403 :
                           result.error_code === 'PROVIDER_ERROR' ? 502 : 400;
        return res.status(statusCode).json(result);
    }

    res.json(result);
});

// ============================================================
// START SERVER
// ============================================================
server.listen(PORT, HOST, () => {
    console.log(`\n=============================================`);
    console.log(`  BURSA Server berjalan pada ${HOST}:${PORT} `);
    console.log(`  REST API : http://${HOST}:${PORT}/api/`);
    console.log(`  WebSocket: ws://${HOST}:${PORT}/`);
    console.log(`  Auth Mode: ${BURSA_API_KEY ? 'Wajib Token (x-bursa-key)' : 'Lokal 127.0.0.1 (Tanpa Token)'}`);
    console.log(`=============================================\n`);
});

module.exports = { app, server, observationQueue, validateScreenshotPayload };

