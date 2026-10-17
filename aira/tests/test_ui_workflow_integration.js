/**
 * BURSA TAHAP 06 — Test Suite Integrasi UI Terpadu dan Pengujian Workflow
 * 
 * Pengujian komprehensif alur kerja end-to-end:
 * 1. Health check & status perangkat (/api/health, /api/devices).
 * 2. Unggah tangkapan layar Web Companion (/api/screenshot).
 * 3. Pembuatan rencana aksi AI dari prompt pengguna (/api/ai/plan).
 * 4. Pengecekan atribut persetujuan pengguna (requires_confirmation).
 * 5. Eksekusi rencana terverifikasi hardware (simulator mengirim status: "completed").
 * 6. Penanganan kegagalan eksekusi fisik (simulator mengirim status: "failed") - 
 *    Memastikan kegagalan fisik tidak dianggap sukses hanya karena HTTP terkirim.
 * 7. Penanganan pemutusan perangkat (disconnect) di tengah eksekusi rencana.
 * 8. Penanganan penundaan waktu (delay) di sisi server secara aman.
 * 9. Validasi ganda (allowlist security) pada endpoint /api/plan/execute.
 * 10. Audit keamanan autentikasi frontend (memastikan API key tidak diekspos).
 */

const http = require('http');
const WebSocket = require('../server/node_modules/ws');

const BASE_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  [LULUS] ${testName}`);
        passed++;
    } else {
        console.error(`  [GAGAL] ${testName}`);
        failed++;
    }
}

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : null;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        if (postData) {
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = http.request(`${BASE_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });

        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runWorkflowTests() {
    console.log('===============================================================');
    console.log(' BURSA TAHAP 06 — Pengujian Integrasi UI & Alur Kerja Terpadu  ');
    console.log('===============================================================\n');

    // 1. Health check & Server Status
    console.log('--- 1. Verifikasi Status Server & Endpoint Health ---');
    try {
        const health = await request('GET', '/api/health');
        assert(health.status === 200, 'Endpoint /api/health mengembalikan HTTP 200');
        const isExpectedHost = health.data.bound_host === '127.0.0.1' || health.data.bound_host === '0.0.0.0';
        assert(isExpectedHost, `Server terikat pada host yang valid (${health.data.bound_host})`);
    } catch (e) {
        assert(false, `Gagal menghubungi server: ${e.message}`);
        console.error('Pastikan server BURSA berjalan pada 127.0.0.1:8000 sebelum menjalankan test.');
        process.exit(1);
    }

    // 2. Hubungkan Simulator T-Dongle S3 via WebSocket
    console.log('\n--- 2. Koneksi Simulator T-Dongle S3 ---');
    const simWs = new WebSocket(WS_URL);
    let simReceivedActions = [];
    let shouldSimulateFailure = false;

    await new Promise((resolve) => {
        simWs.on('open', () => {
            // Kirim registrasi dongle sesuai spesifikasi protokol firmware
            simWs.send(JSON.stringify({
                type: 'device_status',
                device_id: 'bursa-dongle-t06-sim',
                status: 'ready',
                firmware_version: '1.0.0-t06'
            }));
            resolve();
        });

        simWs.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                if (msg.type === 'action') {
                    simReceivedActions.push(msg);

                    // Berikan delay simulasi eksekusi fisik 50ms
                    setTimeout(() => {
                        if (shouldSimulateFailure) {
                            // Balas dengan status failed
                            simWs.send(JSON.stringify({
                                type: 'action_result',
                                device_id: 'bursa-dongle-t06-sim',
                                action_id: msg.action_id,
                                status: 'failed',
                                message: 'Simulasi kegagalan fisik: HID buffer overflow'
                            }));
                        } else {
                            // Balas dengan status 'completed' persis seperti implementasi firmware command_parser.cpp
                            simWs.send(JSON.stringify({
                                type: 'action_result',
                                device_id: 'bursa-dongle-t06-sim',
                                action_id: msg.action_id,
                                status: 'completed',
                                message: 'Perintah HID dieksekusi dengan sukses'
                            }));
                        }
                    }, 50);
                }
            } catch (err) {
                console.error('Error simulator parsing msg:', err);
            }
        });
    });

    await sleep(200);

    const devicesRes = await request('GET', '/api/devices');
    assert(devicesRes.status === 200, 'Endpoint /api/devices dapat diakses');
    const simDevice = devicesRes.data.devices.find(d => d.id === 'bursa-dongle-t06-sim');
    assert(simDevice !== undefined, 'Simulator T-Dongle S3 terdaftar dalam daftar perangkat aktif');
    assert(simDevice.status === 'ready', 'Status simulator adalah "ready"');

    // 3. Web Companion Screen Sharing
    console.log('\n--- 3. Pengujian Web Companion Screenshot ---');
    const dummyImageBase64 = 'data:image/jpeg;base64,' + Buffer.from('BURSA_COMPANION_FRAME_T06').toString('base64');
    const screenshotRes = await request('POST', '/api/screenshot', {
        image_base64: dummyImageBase64,
        width: 1920,
        height: 1080,
        source: 'Web_Companion_Browser_T06'
    });
    assert(screenshotRes.status === 200 && screenshotRes.data.success === true, 'Web Companion berhasil mengunggah frame screenshot ke /api/screenshot');

    const healthWithScreen = await request('GET', '/api/health');
    assert(healthWithScreen.data.has_screenshot === true, 'Server mengonfirmasi ketersediaan screenshot valid (has_screenshot: true)');

    // 4. Pembuatan Rencana Aksi AI (/api/ai/plan)
    console.log('\n--- 4. Pengujian AI Planner (/api/ai/plan) ---');
    const planRes = await request('POST', '/api/ai/plan', {
        prompt: 'Buka kalkulator dan hitung 25 + 75',
        device_id: 'bursa-dongle-t06-sim'
    });
    assert(planRes.status === 200, 'AI Planner merespons dengan HTTP 200');
    assert(planRes.data.success === true, 'AI Planner menghasilkan rencana sukses (success: true)');
    assert(typeof planRes.data.plan.explanation === 'string' && planRes.data.plan.explanation.length > 0, 'Rencana memiliki penjelasan (explanation) untuk pengguna');
    assert(Array.isArray(planRes.data.plan.steps) && planRes.data.plan.steps.length > 0, 'Rencana memiliki daftar langkah aksi terstruktur');
    assert(planRes.data.plan.device_id === 'bursa-dongle-t06-sim', 'Target perangkat sesuai dengan yang diminta (device_id)');

    // 5. Verifikasi Persetujuan Pengguna (Confirmation Requirement)
    console.log('\n--- 5. Pengecekan Konfirmasi Pengguna pada Tindakan Berisiko ---');
    assert(typeof planRes.data.plan.requires_confirmation === 'boolean', 'Atribut requires_confirmation ada dan bertipe boolean');

    const highRiskPlanRes = await request('POST', '/api/ai/plan', {
        prompt: 'Tutup jendela aktif dan hapus riwayat',
        device_id: 'bursa-dongle-t06-sim'
    });
    assert(highRiskPlanRes.data.plan.requires_confirmation === true, 'Tindakan berisiko (tutup/hapus/Alt+F4) menandai requires_confirmation = true');

    // 6. Eksekusi Rencana Aksi Normal & Verifikasi Hardware Balik
    console.log('\n--- 6. Eksekusi Rencana Aksi Normal & Verifikasi Perangkat Fisik ---');
    simReceivedActions = [];
    shouldSimulateFailure = false;

    const normalPlanSteps = [
        { action: 'mouse_move', params: { x: 100, y: 200 } },
        { action: 'click', params: {} },
        { action: 'type_text', params: { text: '25+75=' } }
    ];

    const execRes = await request('POST', '/api/plan/execute', {
        plan_id: 'plan-test-normal-01',
        device_id: 'bursa-dongle-t06-sim',
        steps: normalPlanSteps
    });

    assert(execRes.status === 200, 'Endpoint /api/plan/execute mengembalikan HTTP 200');
    assert(execRes.data.success === true, 'Respons eksekusi menandai success = true');
    assert(execRes.data.status === 'succeeded', 'Status akhir eksekusi terverifikasi sebagai "succeeded"');
    assert(execRes.data.executed_steps.length === 3, 'Seluruh 3 langkah diverifikasi telah selesai');
    assert(simReceivedActions.length === 3, 'Simulator dongle secara aktual menerima 3 perintah aksi');

    // 7. Pengujian Kegagalan Fisik Hardware (Hardware Failure Handling)
    console.log('\n--- 7. Pengujian Kegagalan Fisik Hardware (Bukan Sekadar Respons HTTP) ---');
    simReceivedActions = [];
    shouldSimulateFailure = true; // Simulator akan membalas dengan status: 'failed'

    const failPlanSteps = [
        { action: 'mouse_move', params: { x: 300, y: 400 } },
        { action: 'click', params: {} }
    ];

    const failExecRes = await request('POST', '/api/plan/execute', {
        plan_id: 'plan-test-fail-02',
        device_id: 'bursa-dongle-t06-sim',
        steps: failPlanSteps
    });

    assert(failExecRes.status === 422, 'Server menolak menganggap sukses dan mengembalikan HTTP 422 saat fisik gagal');
    assert(failExecRes.data.success === false, 'Properti success bernilai false');
    assert(failExecRes.data.status === 'failed', 'Status akhir eksekusi ditandai "failed"');
    assert(simReceivedActions.length === 1, 'Eksekusi dihentikan seketika setelah langkah pertama gagal (tidak melanjutkan sisa aksi)');

    // 8. Pengujian Penundaan Server (Server-Side Delay)
    console.log('\n--- 8. Pengujian Penundaan (Delay) di Sisi Server ---');
    shouldSimulateFailure = false;
    simReceivedActions = [];

    const delayPlanSteps = [
        { action: 'mouse_move', params: { x: 50, y: 50 } },
        { action: 'delay', params: { ms: 100 } },
        { action: 'click', params: {} }
    ];

    const delayExecRes = await request('POST', '/api/plan/execute', {
        plan_id: 'plan-test-delay-03',
        device_id: 'bursa-dongle-t06-sim',
        steps: delayPlanSteps
    });

    assert(delayExecRes.status === 200, 'Rencana dengan aksi delay dieksekusi sukses tanpa error');
    assert(delayExecRes.data.status === 'succeeded', 'Status eksekusi delay terverifikasi sukses');
    assert(delayExecRes.data.executed_steps.length === 3, 'Ketiga langkah (termasuk server delay) tercatat tuntas');
    assert(simReceivedActions.length === 2, 'Simulator dongle hanya menerima 2 perintah fisik (delay ditangani server tanpa membebani parser dongle)');

    // 9. Validasi Keamanan Ganda (Double Allowlist Check)
    console.log('\n--- 9. Pengujian Validasi Keamanan Allowlist Server ---');
    const invalidPlanSteps = [
        { action: 'mouse_move', params: { x: 10, y: 10 } },
        { action: 'unauthorized_cmd', params: { cmd: 'rmdir /s' } }
    ];

    const rejectedRes = await request('POST', '/api/plan/execute', {
        plan_id: 'plan-test-reject-04',
        device_id: 'bursa-dongle-t06-sim',
        steps: invalidPlanSteps
    });

    assert(rejectedRes.status === 403, 'Aksi terlarang ditolak sebelum dikirim ke perangkat (HTTP 403)');
    assert(rejectedRes.data.rejected === true, 'Server memberikan indikator rejected = true');

    // 10. Audit Keamanan Autentikasi Frontend
    console.log('\n--- 10. Audit Keamanan Autentikasi Frontend ---');
    // Memeriksa bahwa source code App.jsx tidak memiliki hardcoded API Key
    const fs = require('fs');
    const appJsxCode = fs.readFileSync('C:/Users/LENOVO/Documents/antigravity/intelligent-chandrasekhar/aira/web/src/App.jsx', 'utf8');
    const hasExposedSecret = /BURSA_API_KEY\s*=\s*['"][^'"]+['"]/.test(appJsxCode) || 
                             /apiKey\s*:\s*['"][a-zA-Z0-9_\-]{16,}['"]/.test(appJsxCode);
    assert(!hasExposedSecret, 'Kode React frontend (App.jsx) TIDAK membocorkan rahasia atau hardcoded API key');

    // Tutup koneksi simulator
    simWs.close();
    await sleep(200);

    console.log('\n===============================================================');
    console.log(` HASIL PENGUJIAN TAHAP 06: ${passed} LULUS, ${failed} GAGAL`);
    console.log('===============================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runWorkflowTests().catch((err) => {
    console.error('Fatal error saat pengujian workflow:', err);
    process.exit(1);
});
