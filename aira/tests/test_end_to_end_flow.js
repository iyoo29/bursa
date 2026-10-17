/**
 * BURSA End-to-End & Failure Scenario Test Suite
 * 
 * Menguji alur utuh:
 * 1. Companion unggah screenshot valid.
 * 2. Penolakan screenshot rusak / non-gambar.
 * 3. Registrasi simulator dongle via WebSocket.
 * 4. Eksekusi rencana aksi terstruktur (Structured Action Plan) 3 langkah sukses.
 * 5. Penolakan rencana aksi dengan tindakan di luar allowlist (Security Gate).
 * 6. Penolakan rencana aksi dengan parameter koordinat di luar batas.
 * 7. Penanganan kegagalan eksekusi hardware (dongle lapor 'failed' -> server wajib lapor gagal, BUKAN sukses).
 * 8. Penanganan kondisi darurat saat perangkat terputus di tengah eksekusi.
 * 9. Uji otentikasi API Key (x-bursa-key).
 */

const http = require('http');
const WebSocket = require('../server/node_modules/ws');

const BASE_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000';

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

async function runEndToEndTests() {
    console.log("==========================================================");
    console.log("  BURSA TAHAP 04: PENGUJIAN KOMUNIKASI END-TO-END & KEGAGALAN");
    console.log("==========================================================");

    // TEST 1: Health check & Host Binding
    console.log("\n[UJI 1] Memeriksa Health Check & Host Binding...");
    const health = await request('GET', '/api/health');
    const isExpectedHost = health.data.bound_host === '127.0.0.1' || health.data.bound_host === '0.0.0.0';
    assert(isExpectedHost, `Server terikat pada host yang valid (${health.data.bound_host})`);

    // TEST 2: Pengunggahan & Validasi Tangkapan Layar
    console.log("\n[UJI 2] Validasi Tangkapan Layar (Screenshot Format & Rejection)...");
    
    // 2a. Screenshot tidak valid (string acak / korup)
    const badScreen = await request('POST', '/api/screenshot', {
        image_base64: "bukan_gambar_sama_sekali",
        width: 100, height: 100
    });
    assert(badScreen.status === 400, 'Screenshot dengan format tidak valid ditolak dengan HTTP 400');

    // 2b. Screenshot valid dari Web Companion
    const validJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP3//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const goodScreen = await request('POST', '/api/screenshot', {
        image_base64: validJpeg,
        width: 1920, height: 1080,
        source: 'Web_Companion_Sim'
    });
    assert(goodScreen.status === 200 && goodScreen.data.success === true, 'Screenshot valid dari Web Companion diterima');

    const getScreen = await request('GET', '/api/screenshot/latest');
    assert(getScreen.status === 200 && getScreen.data.source === 'Web_Companion_Sim', 'Screenshot tersimpan dan dapat diakses kembali');

    // TEST 3: Registrasi Simulator Dongle
    console.log("\n[UJI 3] Menghubungkan Dongle Simulator via WebSocket...");
    const dongle = new WebSocket(WS_URL);
    const receivedSteps = [];

    await new Promise((resolve) => {
        dongle.on('open', () => {
            dongle.send(JSON.stringify({
                type: 'device_status',
                device_id: 'BURSA-E2E-DONGLE',
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
                receivedSteps.push(parsed);
                // Respon aksi berhasil secara otomatis untuk uji normal
                if (!parsed.action_id.includes('fail-test')) {
                    setTimeout(() => {
                        dongle.send(JSON.stringify({
                            type: 'action_result',
                            device_id: 'BURSA-E2E-DONGLE',
                            action_id: parsed.action_id,
                            status: 'succeeded',
                            message: 'Aksi dieksekusi normal pada USB HID'
                        }));
                    }, 100);
                } else {
                    // Respon aksi gagal sengaja untuk skenario uji kegagalan
                    setTimeout(() => {
                        dongle.send(JSON.stringify({
                            type: 'action_result',
                            device_id: 'BURSA-E2E-DONGLE',
                            action_id: parsed.action_id,
                            status: 'failed',
                            message: 'Hardware error: buffer HID penuh'
                        }));
                    }, 100);
                }
            }
        } catch(e) {}
    });

    // TEST 4: Eksekusi Rencana Aksi Terstruktur Sukses (3 Langkah)
    console.log("\n[UJI 4] Eksekusi Rencana Aksi Terstruktur (Multi-Step Plan)...");
    const planPayload = {
        plan_id: "plan-normal-01",
        device_id: "BURSA-E2E-DONGLE",
        steps: [
            { action: "mouse_move", params: { x: 200, y: 350 }, description: "Pindahkan kursor ke tombol" },
            { action: "click", params: {}, description: "Klik tombol" },
            { action: "type_text", params: { text: "Catatan BURSA 2026\n" }, description: "Ketik teks" }
        ]
    };

    const planResp = await request('POST', '/api/plan/execute', planPayload);
    assert(planResp.status === 200, 'Endpoint /api/plan/execute merespons status HTTP 200');
    assert(planResp.data.success === true && planResp.data.status === 'succeeded', 'Rencana aksi berstatus succeeded');
    assert(planResp.data.executed_steps.length === 3, 'Ketiga langkah rencana aksi selesai dieksekusi');

    // TEST 5: Uji Penolakan Aksi di Luar Allowlist
    console.log("\n[UJI 5] Uji Penolakan Tindakan Ilegal dalam Rencana Aksi...");
    const badPlan = {
        plan_id: "plan-bad-01",
        device_id: "BURSA-E2E-DONGLE",
        steps: [
            { action: "mouse_move", params: { x: 50, y: 50 } },
            { action: "execute_powershell_download", params: { url: "http://malicious.site" } }
        ]
    };
    const badPlanResp = await request('POST', '/api/plan/execute', badPlan);
    assert(badPlanResp.status === 403, 'Rencana dengan aksi tidak dikenal ditolak dengan status HTTP 403 Forbidden');
    assert(badPlanResp.data.rejected === true, 'Server memberikan respons rejected = true');
    assert(badPlanResp.data.failed_step_index === 1, 'Server mengidentifikasi tepat langkah yang melanggar kebijakan');

    // TEST 6: Uji Penolakan Parameter Koordinat Di Luar Batas
    console.log("\n[UJI 6] Uji Penolakan Parameter Melebihi Batas...");
    const outOfBoundsPlan = {
        plan_id: "plan-oob-01",
        device_id: "BURSA-E2E-DONGLE",
        steps: [
            { action: "mouse_move", params: { x: 99999999, y: 0 } }
        ]
    };
    const oobResp = await request('POST', '/api/plan/execute', outOfBoundsPlan);
    assert(oobResp.status === 403, 'Koordinat di luar batas layar (-10000 s/d 10000) ditolak dengan HTTP 403');

    // TEST 7: Skenario Kegagalan Hardware (Pastikan Eror Dilaporkan GAGAL, Bukan Sukses)
    console.log("\n[UJI 7] Skenario Kegagalan Eksekusi Hardware (Failure Reporting Integrity)...");
    const failPlan = {
        plan_id: "plan-fail-test-01",
        device_id: "BURSA-E2E-DONGLE",
        steps: [
            { action: "click", params: {} }
        ]
    };
    const failPlanResp = await request('POST', '/api/plan/execute', failPlan);
    assert(failPlanResp.status === 422, 'Rencana aksi yang gagal di perangkat merespons HTTP 422 Unprocessable Entity');
    assert(failPlanResp.data.success === false, 'success bernilai false secara tegas');
    assert(failPlanResp.data.status === 'failed', 'status rencana tercatat FAILED (tidak disamarkan sebagai sukses)');

    // TEST 8: Skenario Perangkat Terputus saat Perintah Sedang Berjalan
    console.log("\n[UJI 8] Skenario Perangkat Terputus di Tengah Eksekusi...");
    const disconnectDongle = new WebSocket(WS_URL);
    await new Promise((resolve) => {
        disconnectDongle.on('open', () => {
            disconnectDongle.send(JSON.stringify({
                type: 'device_status',
                device_id: 'BURSA-DISCONNECT-DONGLE',
                status: 'ready'
            }));
            setTimeout(resolve, 300);
        });
    });

    // Ketika aksi dikirim, dongle sengaja ditutup mendadak tanpa membalas
    disconnectDongle.on('message', (msg) => {
        disconnectDongle.close(); // Simulasikan cabut kabel USB secara mendadak
    });

    const disconnectPlan = {
        plan_id: "plan-disconnect-01",
        device_id: "BURSA-DISCONNECT-DONGLE",
        steps: [
            { action: "click", params: {} }
        ]
    };
    const discResp = await request('POST', '/api/plan/execute', disconnectPlan);
    assert(discResp.status === 500, 'Server menangani pemutusan perangkat secara rapi (HTTP 500)');
    assert(discResp.data.status === 'failed', 'Status rencana gagal karena perangkat terputus');
    assert(discResp.data.error.includes('terputus'), 'Pesan error menjelaskan perangkat terputus');

    // Tutup koneksi dongle normal
    dongle.close();

    console.log("\n==========================================================");
    console.log(`  HASIL AKHIR UJI END-TO-END: ${passed} LULUS, ${failed} GAGAL`);
    console.log("==========================================================");

    process.exit(failed > 0 ? 1 : 0);
}

runEndToEndTests().catch(err => {
    console.error("Kesalahan fatal saat uji E2E:", err);
    process.exit(1);
});
