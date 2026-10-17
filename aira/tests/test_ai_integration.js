/**
 * BURSA TAHAP 05: AI Cloud Integration Test Suite
 * 
 * Menguji integrasi modul AI:
 * 1. Pengecekan konfigurasi AI Provider aktif (default: Mock).
 * 2. Penolakan perencanaan jika screenshot tidak tersedia (SCREENSHOT_REQUIRED).
 * 3. Penolakan perencanaan jika screenshot telah kedaluwarsa (SCREENSHOT_EXPIRED).
 * 4. Pembuatan rencana aksi normal dari prompt pengguna & screenshot (Happy Path).
 * 5. Pemisahan pembuatan rencana dari eksekusi (Plan generation vs Plan execution).
 * 6. Deteksi tindakan berisiko (requires_confirmation = true).
 * 7. Penanganan keluaran JSON rusak dari model (MALFORMED_JSON).
 * 8. Penolakan tindakan di luar allowlist oleh validator (DISALLOWED_ACTION).
 * 9. Penolakan parameter koordinat di luar batas (OUT_OF_BOUNDS).
 * 10. Penolakan rencana dengan jumlah langkah berlebihan > 10 (EXCESSIVE_STEPS).
 * 11. Penanganan kegagalan server upstream provider AI (PROVIDER_ERROR).
 * 12. Validasi ganda (Double Validation) pada server saat eksekusi.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

const AI_TEST_PORT = 8095;
const BASE_URL = `http://127.0.0.1:${AI_TEST_PORT}`;
const WS_URL = `ws://127.0.0.1:${AI_TEST_PORT}`;
const SERVER_PATH = path.join(__dirname, '../server/src/server.js');

let passed = 0;
let failed = 0;

function assert(cond, name) {
    if (cond) {
        console.log(`  [LULUS] ${name}`);
        passed++;
    } else {
        console.error(`  [GAGAL] ${name}`);
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
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function runAITests() {
    console.log("==========================================================");
    console.log("  BURSA TAHAP 05: PENGUJIAN INTEGRASI AI CLOUD & VALIDASI");
    console.log("==========================================================");

    // Jalankan instance server pengujian terisolasi dengan memori RAM bersih
    const serverProc = spawn('node', [SERVER_PATH], {
        env: {
            ...process.env,
            PORT: String(AI_TEST_PORT),
            HOST: '127.0.0.1'
        },
        stdio: 'pipe'
    });

    try {
        await new Promise(r => setTimeout(r, 1500));

        // TEST 1: Cek Konfigurasi AI Provider Aktif
    console.log("\n[UJI 1] Memeriksa Konfigurasi AI Provider...");
    const aiConfig = await request('GET', '/api/ai/config');
    assert(aiConfig.status === 200, 'Endpoint /api/ai/config aktif');
    assert(aiConfig.data.provider === 'mock', 'AI Provider default adalah "mock" (zero cost, aman lokal)');
    assert(aiConfig.data.max_steps === 10, 'Batas langkah maksimal terkonfigurasi 10 langkah');

    // TEST 2: Hubungkan Simulator Dongle
    console.log("\n[UJI 2] Menghubungkan Simulator Dongle via WebSocket...");
    const dongle = new WebSocket(WS_URL);
    await new Promise((resolve) => {
        dongle.on('open', () => {
            dongle.send(JSON.stringify({
                type: 'device_status',
                device_id: 'BURSA-AI-TEST-DONGLE',
                status: 'ready',
                firmware_version: '1.0.0'
            }));
            setTimeout(resolve, 300);
        });
    });

    dongle.on('message', (msg) => {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.type === 'action') {
                setTimeout(() => {
                    dongle.send(JSON.stringify({
                        type: 'action_result',
                        device_id: 'BURSA-AI-TEST-DONGLE',
                        action_id: parsed.action_id,
                        status: 'succeeded',
                        message: `Simulator sukses menjalankan ${parsed.action}`
                    }));
                }, 80);
            }
        } catch(e) {}
    });

    // TEST 3: Penolakan AI Plan jika Belum Ada Screenshot (Context Missing)
    console.log("\n[UJI 3] Uji Keharusan Konteks Tangkapan Layar (Observe Gate)...");
    const noScreenPlan = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Buka Notepad dan ketik halo'
    });
    assert(noScreenPlan.status === 400, 'Permintaan ditolak HTTP 400 saat screenshot belum tersedia');
    assert(noScreenPlan.data.error_code === 'SCREENSHOT_REQUIRED', 'Error code eksplisit SCREENSHOT_REQUIRED');

    // TEST 4: Unggah Tangkapan Layar Segar (Valid)
    console.log("\n[UJI 4] Mengunggah Tangkapan Layar Segar dari Web Companion...");
    const sampleJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP3//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const uploadResp = await request('POST', '/api/screenshot', {
        image_base64: sampleJpeg,
        width: 1920, height: 1080,
        source: 'Web_Companion_Tester'
    });
    assert(uploadResp.status === 200 && uploadResp.data.success === true, 'Screenshot segar berhasil diunggah');

    // TEST 5: Pembuatan Rencana Aksi Normal (Happy Path)
    console.log("\n[UJI 5] Pembuatan Rencana Aksi Normal via AI Planner...");
    const normalPlanResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Buka Notepad dan ketik dokumen penting'
    });
    assert(normalPlanResp.status === 200, 'Endpoint /api/ai/plan merespons status HTTP 200');
    assert(normalPlanResp.data.success === true, 'Rencana aksi berhasil dibuat');
    
    const plan = normalPlanResp.data.plan;
    assert(plan && plan.device_id === 'BURSA-AI-TEST-DONGLE', 'Rencana ditargetkan tepat ke BURSA-AI-TEST-DONGLE');
    assert(plan.steps.length > 0 && plan.steps.length <= 10, 'Jumlah langkah berada dalam batas aman (1-10)');
    assert(typeof plan.explanation === 'string' && plan.explanation.length > 0, 'Model menyertakan penjelasan tindakan');

    // TEST 6: Eksekusi Terpisah Rencana Aksi Hasil AI (Separation of Concern)
    console.log("\n[UJI 6] Mengeksekusi Rencana Aksi yang Dibuat AI ke /api/plan/execute...");
    const execResp = await request('POST', '/api/plan/execute', {
        plan_id: plan.plan_id,
        device_id: plan.device_id,
        steps: plan.steps
    });
    assert(execResp.status === 200, 'Eksekusi rencana aksi hasil AI merespons HTTP 200');
    assert(execResp.data.status === 'succeeded', 'Seluruh langkah yang direncanakan AI sukses dijalankan di simulator');

    // TEST 7: Deteksi Tindakan Berisiko (Memerlukan Konfirmasi)
    console.log("\n[UJI 7] Uji Deteksi Tindakan Berisiko (requires_confirmation)...");
    const riskyPlanResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Tutup jendela aplikasi aktif sekarang'
    });
    assert(riskyPlanResp.status === 200, 'Rencana tindakan berisiko berhasil dibuat');
    assert(riskyPlanResp.data.plan.requires_confirmation === true, 'requires_confirmation = true secara otomatis untuk aksi penutupan/penghapusan');

    // TEST 8: Simulasi Respons JSON Rusak dari Model
    console.log("\n[UJI 8] Uji Penolakan Format JSON Rusak (Malformed JSON)...");
    const malformedResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Perintah uji',
        options: { sim_mode: 'malformed_json' }
    });
    assert(malformedResp.status === 400, 'Respons JSON rusak ditolak dengan status HTTP 400');
    assert(malformedResp.data.error_code === 'MALFORMED_JSON', 'Kode eror MALFORMED_JSON terkonfirmasi');

    // TEST 9: Simulasi Aksi Terlarang yang Diusulkan Model (Security Gate)
    console.log("\n[UJI 9] Uji Penolakan Tindakan Ilegal yang Diusulkan Model...");
    const disallowedResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Perintah bahaya',
        options: { sim_mode: 'disallowed_action' }
    });
    assert(disallowedResp.status === 403, 'Aksi di luar allowlist ditolak dengan HTTP 403 Forbidden');
    assert(disallowedResp.data.error_code === 'DISALLOWED_ACTION', 'Kode eror DISALLOWED_ACTION terkonfirmasi');

    // TEST 10: Simulasi Parameter Koordinat Di Luar Batas
    console.log("\n[UJI 10] Uji Penolakan Parameter Di Luar Batas Resolusi...");
    const oobResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Gerak jauh',
        options: { sim_mode: 'out_of_bounds' }
    });
    assert(oobResp.status === 400, 'Koordinat di luar batas ditolak dengan HTTP 400');
    assert(oobResp.data.error_code.startsWith('OUT_OF_BOUNDS'), 'Kode eror OUT_OF_BOUNDS terkonfirmasi');

    // TEST 11: Simulasi Jumlah Langkah Berlebihan (> 10 Langkah)
    console.log("\n[UJI 11] Uji Penolakan Jumlah Langkah Berlebihan (> 10)...");
    const excessiveResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Langkah banyak',
        options: { sim_mode: 'excessive_steps' }
    });
    assert(excessiveResp.status === 403, 'Jumlah langkah > 10 ditolak dengan HTTP 403');
    assert(excessiveResp.data.error_code === 'EXCESSIVE_STEPS', 'Kode eror EXCESSIVE_STEPS terkonfirmasi');

    // TEST 12: Simulasi Kegagalan Upstream AI Provider (500 / Network Error)
    console.log("\n[UJI 12] Uji Penanganan Error Provider AI...");
    const provErrorResp = await request('POST', '/api/ai/plan', {
        device_id: 'BURSA-AI-TEST-DONGLE',
        prompt: 'Uji eror',
        options: { sim_mode: 'provider_error' }
    });
    assert(provErrorResp.status === 502, 'Kegagalan upstream provider ditangani rapi dengan HTTP 502 Bad Gateway');
    assert(provErrorResp.data.error_code === 'PROVIDER_ERROR', 'Kode eror PROVIDER_ERROR terkonfirmasi');

    // TEST 13: Validasi Ganda (Double Validation) pada Titik Eksekusi
    console.log("\n[UJI 13] Verifikasi Validasi Ganda pada Server Eksekusi...");
    const tamperedPlan = {
        plan_id: "plan-tampered-01",
        device_id: "BURSA-AI-TEST-DONGLE",
        steps: [
            { action: "mouse_move", params: { x: 100, y: 100 } },
            { action: "unauthorized_remote_injection", params: {} } // Injeksi ilegal setelah validasi
        ]
    };
    const tamperedResp = await request('POST', '/api/plan/execute', tamperedPlan);
    assert(tamperedResp.status === 403, 'Server eksekusi secara independen memblokir aksi ilegal (Double Validation)');

    // Tutup koneksi dongle
    dongle.close();

    console.log("\n==========================================================");
    console.log(`  HASIL AKHIR UJI TAHAP 05: ${passed} LULUS, ${failed} GAGAL`);
    console.log("==========================================================");

    } finally {
        serverProc.kill();
        await new Promise(r => setTimeout(r, 300));
    }

    process.exit(failed > 0 ? 1 : 0);
}

runAITests().catch(err => {
    console.error("Kesalahan fatal saat uji AI:", err);
    process.exit(1);
});
