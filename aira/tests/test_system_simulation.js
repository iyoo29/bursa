/**
 * Pengujian Sistem Otomatis BURSA (Simulasi Lokal Tanpa Perangkat Fisik)
 * 
 * Menguji:
 * 1. Health check REST API.
 * 2. Registrasi perangkat via WebSocket (Simulasi T-Dongle-S3).
 * 3. Penerimaan dan penyimpanan tangkapan layar (Web Companion / Host Helper).
 * 4. Pengiriman aksi yang diizinkan (Allowlist).
 * 5. Penolakan aksi berbahaya / tidak dikenal (Keamanan).
 * 6. Pelaporan dan verifikasi hasil aksi (action_result).
 */

const http = require('http');
const WebSocket = require('../server/node_modules/ws');

const BASE_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  [LULUS] ${testName}`);
        passedTests++;
    } else {
        console.error(`  [GAGAL] ${testName}`);
        failedTests++;
    }
}

function httpGet(path) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE_URL}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        }).on('error', reject);
    });
}

function httpPost(path, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const req = http.request(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
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
        req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log("==================================================");
    console.log("  MEMULAI PENGUJIAN PROTOKOL & KEAMANAN BURSA");
    console.log("==================================================");

    // 1. Health check test
    console.log("\n1. Menguji Endpoint /api/health...");
    const health = await httpGet('/api/health');
    assert(health.status === 200 && health.data.status === 'ok', 'Server REST API merespons status OK');

    // 2. Simulasi koneksi T-Dongle-S3 via WebSocket
    console.log("\n2. Menguji Registrasi Dongle via WebSocket...");
    const wsDongle = new WebSocket(WS_URL);
    
    await new Promise((resolve) => {
        wsDongle.on('open', () => {
            // Kirim status perangkat
            wsDongle.send(JSON.stringify({
                type: 'device_status',
                device_id: 'BURSA-TD-SIM01',
                status: 'ready',
                firmware_version: '1.0.0'
            }));
            setTimeout(resolve, 300);
        });
    });

    // Verifikasi dongle muncul di /api/devices
    const devicesResp = await httpGet('/api/devices');
    const simDevice = (devicesResp.data.devices || []).find(d => d.id === 'BURSA-TD-SIM01');
    assert(simDevice !== undefined, 'Perangkat simulasi terdaftar di daftar perangkat server');
    assert(simDevice && simDevice.status === 'ready', 'Status perangkat sesuai dengan yang dilaporkan');

    // 3. Menguji Pengiriman Aksi Valid (Allowlist)
    console.log("\n3. Menguji Eksekusi Aksi yang Diizinkan (Allowlist)...");
    let receivedCommand = null;
    wsDongle.on('message', (msg) => {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.type === 'action') {
                receivedCommand = parsed;
            }
        } catch(e) {}
    });

    const validActionResp = await httpPost('/api/devices/BURSA-TD-SIM01/execute', {
        action: 'type_text',
        params: { text: "Uji Coba Valid" }
    });
    assert(validActionResp.status === 200 && validActionResp.data.success === true, 'Aksi type_text disetujui server');
    
    // Tunggu pesan diterima di websocket dongle
    await new Promise(r => setTimeout(r, 200));
    assert(receivedCommand !== null && receivedCommand.action === 'type_text', 'Perintah diterima oleh WebSocket dongle');

    // Dongle mengirimkan action_result
    wsDongle.send(JSON.stringify({
        type: 'action_result',
        device_id: 'BURSA-TD-SIM01',
        action_id: receivedCommand.action_id,
        status: 'succeeded'
    }));
    await new Promise(r => setTimeout(r, 200));

    // Periksa riwayat aksi di server
    const historyResp = await httpGet('/api/actions/history');
    const matchedHistory = (historyResp.data.history || []).find(h => h.action_id === receivedCommand.action_id);
    assert(matchedHistory !== undefined && matchedHistory.status === 'succeeded', 'Riwayat aksi tercatat sukses di server');

    // 4. Menguji Penolakan Aksi Berbahaya / Arbitrer (Keamanan)
    console.log("\n4. Menguji Pencegahan Aksi Berbahaya (Security Gate)...");
    const badActionResp = await httpPost('/api/devices/BURSA-TD-SIM01/execute', {
        action: 'execute_shell_rm_rf',
        params: { cmd: "rm -rf /" }
    });
    assert(badActionResp.status === 403, 'Aksi berbahaya execute_shell_rm_rf diblokir dengan status HTTP 403');
    assert(badActionResp.data.rejected === true, 'Server memberikan indikasi eksplisit rejected = true');

    // 5. Menguji Alur Tangkapan Layar (Web Companion / Host Helper)
    console.log("\n5. Menguji Pengunggahan dan Pengambilan Tangkapan Layar...");
    const sampleBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...";
    const screenshotUpload = await httpPost('/api/screenshot', {
        image_base64: sampleBase64,
        width: 1920,
        height: 1080,
        source: 'TEST_SUITE'
    });
    assert(screenshotUpload.status === 200 && screenshotUpload.data.success === true, 'Tangkapan layar berhasil diunggah ke server');

    const screenshotGet = await httpGet('/api/screenshot/latest');
    assert(screenshotGet.status === 200 && screenshotGet.data.image_base64 === sampleBase64, 'Tangkapan layar terbaru berhasil diambil dari server');
    assert(screenshotGet.data.source === 'TEST_SUITE', 'Sumber tangkapan layar tercatat dengan benar');

    // Tutup koneksi
    wsDongle.close();

    console.log("\n==================================================");
    console.log(`  HASIL PENGUJIAN: ${passedTests} LULUS, ${failedTests} GAGAL`);
    console.log("==================================================");

    process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error("Kesalahan eksekusi tes:", err);
    process.exit(1);
});
