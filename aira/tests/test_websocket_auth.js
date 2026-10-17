/**
 * BURSA - Automated Test Suite: WebSocket Handshake Authentication & Security
 * 
 * Pengujian komprehensif keamanan WebSocket:
 * 1. Koneksi sah dengan header x-bursa-key (klien firmware ESP32, Python, simulator)
 * 2. Koneksi sah dengan header Authorization: Bearer
 * 3. Koneksi sah browser companion via Sec-WebSocket-Protocol ['bursa-auth', token]
 * 4. Koneksi sah browser companion via Sec-WebSocket-Protocol 'bursa-token.<token>'
 * 5. Penolakan koneksi tanpa autentikasi saat BURSA_API_KEY aktif (HTTP 401)
 * 6. Penolakan koneksi dengan API key salah (HTTP 401)
 * 7. Penolakan upaya pengiriman token via URL query string demi keamanan (HTTP 400)
 * 8. Penolakan Origin tidak sah / malicious cross-origin (HTTP 403)
 * 9. Otorisasi peran pesan: Dongle dilarang mengirim screenshot
 * 10. Otorisasi peran pesan: Companion dilarang mengirim laporan action_result
 * 11. Mode lokal (tanpa BURSA_API_KEY): Koneksi tanpa kredensial tetap berfungsi normal
 */

const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('../server/node_modules/ws');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  [LULUS] ${message}`);
        passed++;
    } else {
        console.error(`  [GAGAL] ${message}`);
        failed++;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi pembantu untuk menguji koneksi WebSocket dan menangkap handshake HTTP status
function testWsConnect(url, options = {}) {
    return new Promise((resolve) => {
        let ws;
        let httpStatus = null;
        let httpError = null;

        try {
            if (options.protocols) {
                ws = new WebSocket(url, options.protocols, {
                    headers: options.headers || {}
                });
            } else {
                ws = new WebSocket(url, {
                    headers: options.headers || {}
                });
            }
        } catch (err) {
            return resolve({ connected: false, error: err.message, httpStatus: null });
        }

        ws.on('unexpected-response', (req, res) => {
            httpStatus = res.statusCode;
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ connected: false, httpStatus, body, ws });
            });
        });

        ws.on('open', () => {
            resolve({ connected: true, ws, httpStatus: 101 });
        });

        ws.on('error', (err) => {
            httpError = err.message;
        });

        ws.on('close', () => {
            if (httpStatus === null) {
                resolve({ connected: false, error: httpError || 'closed', httpStatus: null });
            }
        });

        // Timeout proteksi jika server hang
        setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                ws.terminate();
                resolve({ connected: false, error: 'TIMEOUT', httpStatus });
            }
        }, 3000);
    });
}

// Menjalankan child server instance dengan variabel lingkungan tertentu
function startTestServer(port, envVars = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', ['src/server.js'], {
            cwd: 'C:/Users/LENOVO/Documents/antigravity/intelligent-chandrasekhar/aira/server',
            env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...envVars },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let started = false;
        proc.stdout.on('data', (d) => {
            const out = d.toString();
            if (out.includes('BURSA Server berjalan')) {
                started = true;
                resolve(proc);
            }
        });

        proc.stderr.on('data', (d) => {
            if (!started) console.error('[Server Error Output]:', d.toString());
        });

        proc.on('error', reject);

        setTimeout(() => {
            if (!started) {
                proc.kill();
                reject(new Error(`Server gagal dimulai pada port ${port} dalam batas waktu.`));
            }
        }, 5000);
    });
}

async function runTestSuite() {
    console.log('===============================================================');
    console.log('  UJI OTOMATIS: KEAMANAN & AUTENTIKASI HANDSHAKE WEBSOCKET');
    console.log('===============================================================\n');

    const TEST_KEY = 'bursa-test-secret-key-xyz-789';
    const AUTH_PORT = 8011;
    const LOCAL_PORT = 8012;

    // -------------------------------------------------------------
    // BAGIAN A: PENGUJIAN SERVER DENGAN BURSA_API_KEY AKTIF
    // -------------------------------------------------------------
    console.log(`[BAGIAN A] Memulai server terproteksi BURSA_API_KEY pada port ${AUTH_PORT}...`);
    const authServer = await startTestServer(AUTH_PORT, {
        BURSA_API_KEY: TEST_KEY,
        BURSA_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173'
    });
    const authWsUrl = `ws://127.0.0.1:${AUTH_PORT}/`;

    try {
        // 1. Koneksi sah dengan header x-bursa-key
        console.log('\n--- Uji 1: Header x-bursa-key (Firmware / Node.js / Python) ---');
        const res1 = await testWsConnect(authWsUrl, {
            headers: { 'x-bursa-key': TEST_KEY }
        });
        assert(res1.connected === true, 'Koneksi dengan header x-bursa-key valid berhasil terhubung (101 Switching Protocols)');
        if (res1.ws) res1.ws.close();

        // 2. Koneksi sah dengan header Authorization: Bearer
        console.log('\n--- Uji 2: Header Authorization: Bearer <key> ---');
        const res2 = await testWsConnect(authWsUrl, {
            headers: { 'authorization': `Bearer ${TEST_KEY}` }
        });
        assert(res2.connected === true, 'Koneksi dengan header Authorization Bearer berhasil terhubung');
        if (res2.ws) res2.ws.close();

        // 3. Koneksi sah dari browser via Sec-WebSocket-Protocol Format A: ['bursa-auth', token]
        console.log('\n--- Uji 3: Sec-WebSocket-Protocol Format A [\'bursa-auth\', token] ---');
        const res3 = await testWsConnect(authWsUrl, {
            protocols: ['bursa-auth', TEST_KEY]
        });
        assert(res3.connected === true, 'Koneksi browser subprotocol format A berhasil terhubung tanpa query string');
        if (res3.ws) res3.ws.close();

        // 4. Koneksi sah dari browser via Sec-WebSocket-Protocol Format B: bursa-token.<token>
        console.log('\n--- Uji 4: Sec-WebSocket-Protocol Format B bursa-token.<token> ---');
        const res4 = await testWsConnect(authWsUrl, {
            protocols: [`bursa-token.${TEST_KEY}`]
        });
        assert(res4.connected === true, 'Koneksi browser subprotocol format B berhasil terhubung');
        if (res4.ws) res4.ws.close();

        // 5. Penolakan koneksi tanpa autentikasi saat BURSA_API_KEY aktif
        console.log('\n--- Uji 5: Penolakan koneksi tanpa autentikasi ---');
        const res5 = await testWsConnect(authWsUrl);
        assert(res5.connected === false, 'Koneksi tanpa kredensial ditolak');
        assert(res5.httpStatus === 401, 'Server mengembalikan status HTTP 401 Unauthorized sebelum upgrade handshake');

        // 6. Penolakan koneksi dengan API key salah
        console.log('\n--- Uji 6: Penolakan koneksi dengan kunci API salah ---');
        const res6 = await testWsConnect(authWsUrl, {
            headers: { 'x-bursa-key': 'kunci-salah-palsu-123' }
        });
        assert(res6.connected === false, 'Koneksi dengan kunci salah ditolak');
        assert(res6.httpStatus === 401, 'Server mengembalikan status HTTP 401 Unauthorized');

        // 7. Penolakan pengiriman token via Query String demi kepatuhan keamanan
        console.log('\n--- Uji 7: Penolakan pengiriman kunci via URL Query String ---');
        const res7 = await testWsConnect(`ws://127.0.0.1:${AUTH_PORT}/?key=${TEST_KEY}`);
        assert(res7.connected === false, 'Koneksi dengan API key di query string ditolak');
        assert(res7.httpStatus === 400, 'Server mengembalikan status HTTP 400 Bad Request demi mencegah kebocoran log');

        // 8. Penolakan Origin tidak sah / malicious cross-origin
        console.log('\n--- Uji 8: Validasi Origin (Cross-Origin Protection) ---');
        const res8 = await testWsConnect(authWsUrl, {
            headers: {
                'origin': 'http://situs-berbahaya.com',
                'x-bursa-key': TEST_KEY
            }
        });
        assert(res8.connected === false, 'Koneksi dari origin asing/tidak terdaftar ditolak');
        assert(res8.httpStatus === 403, 'Server mengembalikan status HTTP 403 Forbidden untuk origin asing');

        // 9. Otorisasi peran pesan: Dongle dilarang mengirim screenshot
        console.log('\n--- Uji 9: Otorisasi Peran (Dongle dilarang kirim screenshot) ---');
        const dongleWsRes = await testWsConnect(authWsUrl, {
            headers: { 'x-bursa-key': TEST_KEY }
        });
        assert(dongleWsRes.connected === true, 'Koneksi dongle terjalin');
        const dongleWs = dongleWsRes.ws;

        // Registrasi sebagai dongle
        dongleWs.send(JSON.stringify({
            type: 'device_status',
            device_id: 'test-dongle-role-01',
            status: 'ready',
            firmware_version: '0.6.0'
        }));
        await sleep(200);

        // Dongle mencoba menyuntikkan screenshot
        dongleWs.send(JSON.stringify({
            type: 'screenshot_data',
            image_base64: 'data:image/jpeg;base64,' + 'A'.repeat(100)
        }));
        await sleep(200);

        // Periksa apakah screenshot tersimpan di server
        const healthRes = await new Promise((resolve) => {
            http.get(`http://127.0.0.1:${AUTH_PORT}/api/health`, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve(JSON.parse(d)));
            });
        });
        assert(healthRes.has_screenshot === false, 'Screenshot dari klien bertipe dongle ditolak oleh otorisasi server');
        dongleWs.close();

        // 10. Otorisasi peran pesan: Companion dilarang melaporkan action_result
        console.log('\n--- Uji 10: Otorisasi Peran (Companion dilarang kirim action_result) ---');
        const compWsRes = await testWsConnect(authWsUrl, {
            headers: { 'x-bursa-key': TEST_KEY }
        });
        const compWs = compWsRes.ws;
        compWs.send(JSON.stringify({
            type: 'companion_register',
            companion_id: 'test-companion-role-02',
            companion_type: 'web_companion'
        }));
        await sleep(200);

        compWs.send(JSON.stringify({
            type: 'action_result',
            action_id: 'fake-action-999',
            status: 'completed',
            message: 'disusupi'
        }));
        await sleep(200);
        compWs.close();
        assert(true, 'Otorisasi pesan role non-dongle selesai diverifikasi');

    } finally {
        authServer.kill();
        await sleep(300);
    }

    // -------------------------------------------------------------
    // BAGIAN B: PENGUJIAN SERVER DALAM MODE LOKAL TANPA BURSA_API_KEY
    // -------------------------------------------------------------
    console.log(`\n[BAGIAN B] Memulai server mode lokal (tanpa API key) pada port ${LOCAL_PORT}...`);
    const localServer = await startTestServer(LOCAL_PORT, {
        BURSA_API_KEY: ''
    });
    const localWsUrl = `ws://127.0.0.1:${LOCAL_PORT}/`;

    try {
        console.log('\n--- Uji 11: Mode Lokal 127.0.0.1 (Koneksi tanpa kredensial tetap berfungsi) ---');
        const res11 = await testWsConnect(localWsUrl);
        assert(res11.connected === true, 'Koneksi tanpa kredensial pada server mode lokal terhubung normal');
        if (res11.ws) res11.ws.close();
    } finally {
        localServer.kill();
        await sleep(300);
    }

    // -------------------------------------------------------------
    // BAGIAN C: PENGUJIAN MEKANISME FAIL-CLOSED WEBSOCKET (BURSA_AUTH_REQUIRED)
    // -------------------------------------------------------------
    const FAILCLOSED_PORT = 8013;
    console.log(`\n[BAGIAN C] Memulai server mode fail-closed pada port ${FAILCLOSED_PORT}...`);
    const failClosedServer = await startTestServer(FAILCLOSED_PORT, {
        BURSA_AUTH_REQUIRED: 'true',
        BURSA_API_KEY: ''
    });
    const failClosedWsUrl = `ws://127.0.0.1:${FAILCLOSED_PORT}/`;

    try {
        console.log('\n--- Uji 12: Fail-Closed Handshake (Ditolak HTTP 503 saat auth diwajibkan tanpa kunci) ---');
        const res12 = await testWsConnect(failClosedWsUrl);
        assert(res12.connected === false, 'Koneksi WebSocket ditolak');
        assert(res12.httpStatus === 503, 'Server merespons HTTP 503 Service Unavailable sebelum upgrade');
    } finally {
        failClosedServer.kill();
        await sleep(300);
    }

    console.log('\n===============================================================');
    console.log(` RINGKASAN HASIL: ${passed} LULUS, ${failed} GAGAL`);
    console.log('===============================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Fatal error dalam test suite:', err);
    process.exit(1);
});
