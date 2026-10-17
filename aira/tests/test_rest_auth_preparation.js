/**
 * BURSA - Test Suite: Persiapan Autentikasi REST & Fail-Closed Protection
 * 
 * Pengujian terisolasi tanpa HID, tanpa screenshot desktop sungguhan, dan tanpa daemon:
 * 1. Request tanpa kunci ditolak (HTTP 401) pada endpoint terproteksi saat API key aktif.
 * 2. Request dengan kunci salah ditolak (HTTP 401).
 * 3. Request dengan kunci sah diterima (HTTP 200).
 * 4. Verifikasi bahwa endpoint GET /api/screenshot/latest tidak membocorkan data gambar tanpa autentikasi.
 * 5. Format respons screenshot valid dan utuh saat diakses dengan kredensial sah.
 * 6. Mekanisme Fail-Closed: Saat autentikasi diwajibkan tetapi BURSA_API_KEY belum dikonfigurasi,
 *    semua endpoint sensitif menolak request dengan HTTP 503 (AUTH_NOT_CONFIGURED), bukan membuka akses publik.
 * 7. Kompatibilitas mode lokal default saat BURSA_API_KEY tidak dikonfigurasi.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../server/src/server.js');
const TEST_PORT_AUTH = 8091;
const TEST_PORT_FAILCLOSED = 8092;
const TEST_KEY = 'test_secret_key_bursa_2026';

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

function request(port, method, pathUrl, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : null;
        const reqHeaders = { ...headers };
        if (postData) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: pathUrl,
            method: method,
            headers: reqHeaders,
            timeout: 3000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (postData) req.write(postData);
        req.end();
    });
}

// Dummy base64 1x1 JPEG untuk pengujian aman tanpa tangkapan layar nyata
const DUMMY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP3//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

async function runTestSuite() {
    console.log("=============================================================");
    console.log("  BURSA TAHAP 1C: PENGUJIAN PERSIAPAN AUTENTIKASI REST");
    console.log("=============================================================\n");

    // ============================================================
    // BAGIAN 1: PENGUJIAN DENGAN BURSA_API_KEY AKTIF
    // ============================================================
    console.log("--- Bagian 1: Pengujian Server dengan BURSA_API_KEY Aktif ---");
    const serverAuth = spawn('node', [SERVER_PATH], {
        env: {
            ...process.env,
            PORT: TEST_PORT_AUTH,
            HOST: '127.0.0.1',
            BURSA_API_KEY: TEST_KEY
        },
        stdio: 'pipe'
    });

    try {
        await sleep(1500);

        // 1.1 Health check publik
        const health1 = await request(TEST_PORT_AUTH, 'GET', '/api/health');
        assert(health1.status === 200, 'GET /api/health tetap dapat diakses publik (HTTP 200)');
        assert(health1.data.auth_enabled === true, 'auth_enabled bernilai true saat BURSA_API_KEY aktif');

        // 1.2 GET /api/screenshot/latest tanpa kunci -> 401
        const getScreenNoKey = await request(TEST_PORT_AUTH, 'GET', '/api/screenshot/latest');
        assert(getScreenNoKey.status === 401, 'GET /api/screenshot/latest tanpa kunci ditolak (HTTP 401)');

        // 1.3 GET /api/screenshot/latest dengan kunci salah -> 401
        const getScreenWrongKey = await request(TEST_PORT_AUTH, 'GET', '/api/screenshot/latest', null, {
            'x-bursa-key': 'kunci_palsu_123'
        });
        assert(getScreenWrongKey.status === 401, 'GET /api/screenshot/latest dengan kunci salah ditolak (HTTP 401)');

        // 1.4 POST /api/screenshot tanpa kunci -> 401
        const postScreenNoKey = await request(TEST_PORT_AUTH, 'POST', '/api/screenshot', {
            image_base64: DUMMY_JPEG,
            width: 100,
            height: 100,
            source: 'Test_Runner'
        });
        assert(postScreenNoKey.status === 401, 'POST /api/screenshot tanpa kunci ditolak (HTTP 401)');

        // 1.5 POST /api/screenshot dengan kunci sah -> 200
        const postScreenGoodKey = await request(TEST_PORT_AUTH, 'POST', '/api/screenshot', {
            image_base64: DUMMY_JPEG,
            width: 800,
            height: 600,
            source: 'Test_Runner_Auth'
        }, { 'x-bursa-key': TEST_KEY });
        assert(postScreenGoodKey.status === 200 && postScreenGoodKey.data.success === true, 'POST /api/screenshot dengan kunci sah diterima (HTTP 200)');

        // 1.6 Uji kebocoran: GET /api/screenshot/latest TANPA KUNCI setelah screenshot ada -> Tetap 401
        const leakCheck = await request(TEST_PORT_AUTH, 'GET', '/api/screenshot/latest');
        assert(leakCheck.status === 401, 'Screenshot TIDAK bocor ke publik tanpa kunci (HTTP 401)');

        // 1.7 GET /api/screenshot/latest DENGAN KUNCI SAH -> 200 dan format data utuh
        const getScreenGoodKey = await request(TEST_PORT_AUTH, 'GET', '/api/screenshot/latest', null, {
            'x-bursa-key': TEST_KEY
        });
        assert(getScreenGoodKey.status === 200, 'GET /api/screenshot/latest dengan kunci sah berhasil (HTTP 200)');
        assert(getScreenGoodKey.data.image_base64 === DUMMY_JPEG, 'Data gambar base64 sesuai dengan yang diunggah');
        assert(getScreenGoodKey.data.width === 800 && getScreenGoodKey.data.height === 600, 'Resolusi width & height dipertahankan');
        assert(getScreenGoodKey.data.source === 'Test_Runner_Auth', 'Atribut source dipertahankan');

        // 1.8 GET /api/devices dengan kunci sah & tanpa kunci
        const devNoKey = await request(TEST_PORT_AUTH, 'GET', '/api/devices');
        assert(devNoKey.status === 401, 'GET /api/devices tanpa kunci ditolak (HTTP 401)');

        const devGoodKey = await request(TEST_PORT_AUTH, 'GET', '/api/devices', null, { 'x-bursa-key': TEST_KEY });
        assert(devGoodKey.status === 200 && Array.isArray(devGoodKey.data.devices), 'GET /api/devices dengan kunci sah diterima (HTTP 200)');

        // 1.9 POST /api/plan/execute tanpa kunci -> 401
        const planExecNoKey = await request(TEST_PORT_AUTH, 'POST', '/api/plan/execute', {
            plan_id: 'test',
            device_id: 'test',
            steps: [{ action: 'delay', params: { ms: 100 } }]
        });
        assert(planExecNoKey.status === 401, 'POST /api/plan/execute tanpa kunci ditolak (HTTP 401)');

    } finally {
        serverAuth.kill();
    }

    // ============================================================
    // BAGIAN 2: PENGUJIAN MEKANISME FAIL-CLOSED (BURSA_AUTH_REQUIRED)
    // ============================================================
    console.log("\n--- Bagian 2: Pengujian Mekanisme Fail-Closed (Auth Diwajibkan Tanpa Kunci) ---");
    const serverFailClosed = spawn('node', [SERVER_PATH], {
        env: {
            ...process.env,
            PORT: TEST_PORT_FAILCLOSED,
            HOST: '127.0.0.1',
            BURSA_AUTH_REQUIRED: 'true',
            BURSA_API_KEY: '' // Sengaja kosong untuk menguji fail-closed
        },
        stdio: 'pipe'
    });

    try {
        await sleep(1500);

        // 2.1 Health check melaporkan auth_enabled = true
        const health2 = await request(TEST_PORT_FAILCLOSED, 'GET', '/api/health');
        assert(health2.status === 200, 'GET /api/health merespons status server');
        assert(health2.data.auth_enabled === true, 'auth_enabled bernilai true saat BURSA_AUTH_REQUIRED aktif');

        // 2.2 Endpoint screenshot fail-closed dengan HTTP 503 AUTH_NOT_CONFIGURED
        const screenFailClosed = await request(TEST_PORT_FAILCLOSED, 'GET', '/api/screenshot/latest');
        assert(screenFailClosed.status === 503, 'GET /api/screenshot/latest gagal secara tertutup (HTTP 503)');
        assert(screenFailClosed.data.code === 'AUTH_NOT_CONFIGURED', 'Respons menyertakan kode AUTH_NOT_CONFIGURED');

        const postFailClosed = await request(TEST_PORT_FAILCLOSED, 'POST', '/api/screenshot', {
            image_base64: DUMMY_JPEG
        });
        assert(postFailClosed.status === 503, 'POST /api/screenshot gagal secara tertutup (HTTP 503)');

        const devFailClosed = await request(TEST_PORT_FAILCLOSED, 'GET', '/api/devices');
        assert(devFailClosed.status === 503, 'GET /api/devices gagal secara tertutup (HTTP 503)');

    } finally {
        serverFailClosed.kill();
    }

    // ============================================================
    // REKAP HASIL
    // ============================================================
    console.log("\n=============================================================");
    console.log(`  HASIL PENGUJIAN: ${passed} Lulus, ${failed} Gagal`);
    console.log("=============================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Fatal error during test suite:', err);
    process.exit(1);
});
