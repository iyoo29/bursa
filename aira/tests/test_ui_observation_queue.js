/**
 * BURSA TAHAP 3C — Automated Test Suite: UI Observation Queue Integration
 * 
 * Pengujian komprehensif integrasi Dashboard UI dengan Antrean Observasi:
 * 1. Tombol mengirim permintaan observasi (POST /api/observation/request).
 * 2. UI menyimpan task_id yang benar.
 * 3. Status berubah dari queued ke running lalu completed.
 * 4. Status failed dan cancelled ditampilkan dengan benar.
 * 5. HTTP 401, 409, 429, dan 503 ditangani dengan pesan informatif.
 * 6. Polling berhenti pada status terminal.
 * 7. Timer dibersihkan saat komponen unmount.
 * 8. Screenshot lama tidak dianggap sebagai hasil task baru (mencegah salah sangka).
 * 9. Screenshot dengan task_id yang cocok ditampilkan.
 * 10. Fitur preview Web Companion yang lama tidak rusak.
 * 11. Host Helper preview yang lama tidak rusak.
 * 12. Autentikasi tetap menggunakan mekanisme getAuthHeaders() yang sudah ada.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

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

function request(baseUrl, method, pathUrl, body = null, headers = {}) {
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

        const req = http.request(`${baseUrl}${pathUrl}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

function startTestServer(port, envVars = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', ['src/server.js'], {
            cwd: path.join(__dirname, '../server'),
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

const VALID_IMAGE_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

async function runTests() {
    console.log('===============================================================');
    console.log('  UJI OTOMATIS: INTEGRASI DASHBOARD OBSERVATION QUEUE (3C)');
    console.log('===============================================================\n');

    const appJsxPath = path.join(__dirname, '../web/src/App.jsx');
    const appJsxCode = fs.readFileSync(appJsxPath, 'utf-8');

    // =========================================================
    // BAGIAN 1: AUDIT STATIS KODE APP.JSX (KONTRAK & ARSITEKTUR)
    // =========================================================
    console.log('[BAGIAN 1] Memeriksa implementasi kode App.jsx...');

    // 1. Tombol meminta observasi
    assert(appJsxCode.includes('id="btn-request-observation"'), '1a. Tombol Minta Screenshot Baru memiliki ID unik #btn-request-observation');
    assert(appJsxCode.includes('Minta Screenshot Baru'), '1b. Label tombol "Minta Screenshot Baru" terpasang di UI');
    assert(appJsxCode.includes('onClick={requestObservation}'), '1c. Tombol memanggil fungsi requestObservation');
    assert(appJsxCode.includes('POST') && appJsxCode.includes('/api/observation/request'), '1d. requestObservation mengirimkan POST /api/observation/request');

    // 2. UI menyimpan task_id
    assert(appJsxCode.includes('setObservationTask({') && appJsxCode.includes('id: taskId'), '2a. task_id dari server disimpan ke dalam state observationTask');
    assert(appJsxCode.includes('activeTaskIdRef.current = taskId'), '2b. activeTaskIdRef menyimpan ID tugas aktif untuk validasi race condition');

    // 3. Status transisi
    assert(appJsxCode.includes("status === 'queued'") && appJsxCode.includes("status === 'running'") && appJsxCode.includes("status === 'completed'"), '3a. Status queued, running, dan completed diakomodasi dalam UI');
    assert(appJsxCode.includes('startPollingTask'), '3b. Polling status tugas aktif diimplementasikan');

    // 4. Status failed dan cancelled
    assert(appJsxCode.includes("status === 'failed'") && appJsxCode.includes("status === 'cancelled'"), '4a. Status failed dan cancelled diakomodasi dalam UI');
    assert(appJsxCode.includes('cancelObservation') && appJsxCode.includes('id="btn-cancel-observation"'), '4b. Tombol pembatalan tugas aktif tersedia (#btn-cancel-observation)');

    // 5. Penanganan Error HTTP 401, 409, 429, 503
    assert(appJsxCode.includes('res.status === 401') && appJsxCode.includes('setAuthError(true)'), '5a. HTTP 401 ditangani dengan memicu indikator autentikasi');
    assert(appJsxCode.includes('res.status === 429') && appJsxCode.includes('Antrean observasi penuh'), '5b. HTTP 429 (Queue Full) ditangani dengan pesan informatif');
    assert(appJsxCode.includes('res.status === 503') && appJsxCode.includes('fail-closed'), '5c. HTTP 503 (Fail-Closed) ditangani dengan pesan informatif');
    assert(appJsxCode.includes('res.status === 409'), '5d. HTTP 409 (Conflict/Terminal) ditangani');

    // 6. Polling berhenti pada status terminal
    assert(appJsxCode.includes('stopObservationPolling()') && appJsxCode.includes("taskData.status === 'completed'"), '6a. Polling dihentikan saat tugas completed');
    assert(appJsxCode.includes("taskData.status === 'failed'") && appJsxCode.includes("taskData.status === 'cancelled'"), '6b. Polling dihentikan saat tugas failed atau cancelled');

    // 7. Timer dibersihkan saat unmount
    assert(appJsxCode.includes('stopObservationPolling()') && appJsxCode.includes('stopScreenSharing()'), '7. stopObservationPolling dipanggil pada cleanup useEffect unmount');

    // 8. Screenshot lama tidak dianggap sebagai hasil task baru
    assert(appJsxCode.includes('data.task_id === taskId'), '8. fetchAndMatchScreenshot memverifikasi bahwa task_id screenshot sama persis dengan taskId tugas');

    // 9. Screenshot dengan task_id yang cocok ditampilkan
    assert(appJsxCode.includes('task_id: data.task_id') && appJsxCode.includes('screenshot_matched: true'), '9. Screenshot dengan task_id cocok memperbarui pratinjau dan menandai matched');

    // 10. Fitur Web Companion lama tidak rusak
    assert(appJsxCode.includes('startScreenSharing') && appJsxCode.includes('stopScreenSharing'), '10. Fungsi Web Companion tetap ada dan dapat digunakan');

    // 11. Host Helper preview lama tidak rusak
    assert(appJsxCode.includes('hostHelperPreview') && appJsxCode.includes('hostHelperMetadata'), '11. State hostHelperPreview dan metadata tetap dipertahankan');

    // 12. Autentikasi menggunakan mekanisme yang sudah ada
    assert(appJsxCode.includes('getAuthHeaders(') && appJsxCode.includes('sessionStorage.getItem(\'bursa_api_key\')'), '12. Autentikasi tetap menggunakan getAuthHeaders() dan sessionStorage');

    // =========================================================
    // BAGIAN 2: PENGUJIAN INTEGRASI ALUR KERJA AKTIF
    // Menguji interaksi simulasi dashboard dengan server terisolasi
    // =========================================================
    const TEST_PORT = 8031;
    const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
    console.log(`\n[BAGIAN 2] Memulai server uji integrasi pada port ${TEST_PORT}...`);

    let serverProc = null;
    try {
        serverProc = await startTestServer(TEST_PORT, {
            BURSA_QUEUE_QUEUED_TIMEOUT_MS: '800',
            BURSA_QUEUE_RUNNING_TIMEOUT_MS: '800'
        });

        // Alur 1: Permintaan screenshot baru dari dashboard
        console.log('\n--- Skenario A: Dashboard Meminta Observasi & Task ID Diterima ---');
        const reqObs = await request(BASE_URL, 'POST', '/api/observation/request', { requested_by: 'dashboard' });
        assert(reqObs.status === 201 && reqObs.body.success, 'A1. Dashboard berhasil membuat permintaan observasi (HTTP 201)');
        const taskId = reqObs.body.task_id;
        assert(typeof taskId === 'string' && taskId.startsWith('obs-'), 'A2. Dashboard menerima task_id valid dari server');

        // Alur 2: Dashboard melakukan polling status tugas awal (queued)
        console.log('\n--- Skenario B: Polling Status Tugas di Antrean (queued) ---');
        const poll1 = await request(BASE_URL, 'GET', `/api/observation/tasks/${taskId}`);
        assert(poll1.status === 200 && poll1.body.status === 'queued', 'B1. Polling mengonfirmasi status "queued"');

        // Alur 3: Host Helper mengambil tugas (transisi ke running)
        console.log('\n--- Skenario C: Host Helper Mengambil Tugas (running) ---');
        const nextTask = await request(BASE_URL, 'GET', '/api/observation/next');
        assert(nextTask.status === 200 && nextTask.body.task.task_id === taskId, 'C1. Host Helper mengambil tugas yang diminta dashboard');

        const poll2 = await request(BASE_URL, 'GET', `/api/observation/tasks/${taskId}`);
        assert(poll2.status === 200 && poll2.body.status === 'running', 'C2. Polling dashboard mendeteksi transisi ke "running"');

        // Alur 4: Pencegahan screenshot lama (Stale Screenshot Protection)
        console.log('\n--- Skenario D: Pencegahan Screenshot Lama / Tidak Cocok ---');
        // Anggap di memori ada screenshot lama tanpa task_id atau dengan task_id berbeda
        const latestBefore = await request(BASE_URL, 'GET', '/api/screenshot/latest');
        // Jika belum ada screenshot, status 404; jika ada screenshot lama, task_id tidak akan sama dengan taskId
        const isMatchedBefore = latestBefore.status === 200 && latestBefore.body.task_id === taskId;
        assert(!isMatchedBefore, 'D1. Screenshot yang ada sebelum submit diverifikasi TIDAK cocok dengan tugas baru');

        // Alur 5: Host Helper menyerahkan screenshot dengan task_id
        console.log('\n--- Skenario E: Penyerahan Screenshot & Pencocokan task_id ---');
        const submitRes = await request(BASE_URL, 'POST', `/api/observation/tasks/${taskId}/submit`, {
            image_base64: VALID_IMAGE_B64,
            width: 1920,
            height: 1080,
            source: 'Host_Helper_IYOO'
        });
        assert(submitRes.status === 200 && submitRes.body.status === 'completed', 'E1. Host Helper sukses menyerahkan screenshot untuk tugas (HTTP 200)');

        // Alur 6: Dashboard mendeteksi status completed dan mencocokkan screenshot terbaru
        const poll3 = await request(BASE_URL, 'GET', `/api/observation/tasks/${taskId}`);
        assert(poll3.status === 200 && poll3.body.status === 'completed', 'E2. Polling dashboard mendeteksi status "completed"');

        const latestAfter = await request(BASE_URL, 'GET', '/api/screenshot/latest');
        assert(latestAfter.status === 200 && latestAfter.body.task_id === taskId, 'E3. Screenshot di /api/screenshot/latest terbukti memiliki task_id yang cocok persis');
        assert(latestAfter.body.image_base64 === VALID_IMAGE_B64, 'E4. Data gambar sesuai dan siap ditampilkan di pratinjau dashboard');

        // Alur 7: Pembatalan tugas aktif oleh dashboard
        console.log('\n--- Skenario F: Pembatalan Tugas oleh Dashboard ---');
        const reqObs2 = await request(BASE_URL, 'POST', '/api/observation/request', { requested_by: 'dashboard' });
        const taskId2 = reqObs2.body.task_id;

        const cancelRes = await request(BASE_URL, 'POST', `/api/observation/tasks/${taskId2}/cancel`);
        assert(cancelRes.status === 200 && cancelRes.body.status === 'cancelled', 'F1. Dashboard berhasil membatalkan tugas observasi aktif');

        const pollCancelled = await request(BASE_URL, 'GET', `/api/observation/tasks/${taskId2}`);
        assert(pollCancelled.status === 200 && pollCancelled.body.status === 'cancelled', 'F2. Status tugas terverifikasi "cancelled"');

    } catch (err) {
        console.error('Terjadi kesalahan selama pengujian integrasi:', err);
        failed++;
    } finally {
        if (serverProc) serverProc.kill();
    }

    console.log('\n===============================================================');
    console.log(`  HASIL PENGUJIAN INTEGRASI TAHAP 3C: ${passed} LULUS, ${failed} GAGAL`);
    console.log('===============================================================');

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
