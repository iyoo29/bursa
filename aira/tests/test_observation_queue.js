/**
 * BURSA - Automated Test Suite: Observation Queue (Tahap 3A)
 * 
 * Pengujian komprehensif antrean observasi (screenshot task queue):
 * 1. Task baru masuk dengan status 'queued'.
 * 2. Task diambil sesuai urutan FIFO.
 * 3. Maksimal satu task 'running' dalam satu waktu.
 * 4. Maksimal lima task 'queued'; permintaan berikutnya ditolak (HTTP 429).
 * 5. Task tidak ditemukan menghasilkan respons yang benar (HTTP 404).
 * 6. Task 'queued' dapat dibatalkan (HTTP 200, status 'cancelled').
 * 7. Hasil task yang dibatalkan ditolak (HTTP 409).
 * 8. Task 'queued' timeout dan ditandai 'failed'.
 * 9. Task 'running' timeout dan ditandai 'failed'.
 * 10. Hasil yang datang terlambat setelah timeout ditolak (HTTP 409).
 * 11. Payload screenshot tidak valid ditolak (HTTP 400).
 * 12. Screenshot valid menyelesaikan task (HTTP 200, status 'completed').
 * 13. latestScreenshot hanya diperbarui oleh hasil task aktif yang valid.
 * 14. Screenshot manual melalui endpoint lama tetap berfungsi.
 * 15. Riwayat membatasi task terminal tanpa menghapus task aktif.
 * 16. Seluruh endpoint terlindungi mematuhi autentikasi (HTTP 401).
 * 17. Mode fail-closed diuji secara terisolasi tanpa mengubah konfigurasi aktif (HTTP 503).
 * 18. Tidak ada base64 screenshot dalam respons metadata atau riwayat task.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

// Payload gambar uji valid base64 (JPEG 1x1 pixel)
const VALID_IMAGE_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

async function runTests() {
    console.log('===============================================================');
    console.log('  UJI OTOMATIS: OBSERVATION QUEUE BACKEND (TAHAP 3A)');
    console.log('===============================================================\n');

    const PORT_DEV = 8021;
    const PORT_AUTH = 8022;
    const PORT_FAILCLOSED = 8023;

    const URL_DEV = `http://127.0.0.1:${PORT_DEV}`;
    const URL_AUTH = `http://127.0.0.1:${PORT_AUTH}`;
    const URL_FAILCLOSED = `http://127.0.0.1:${PORT_FAILCLOSED}`;

    const TEST_API_KEY = 'bursa-queue-test-key-456';

    let devServer, authServer, failclosedServer;

    try {
        // =============================================================
        // BAGIAN 1: PENGUJIAN LOGIKA & LIFECYCLE ANTREAN (PORT_DEV)
        // Gunakan timeout pendek khusus test (300ms) dan maxHistory = 3
        // =============================================================
        console.log(`[BAGIAN 1] Memulai server dev terisolasi pada port ${PORT_DEV}...`);
        devServer = await startTestServer(PORT_DEV, {
            BURSA_QUEUE_QUEUED_TIMEOUT_MS: '400',
            BURSA_QUEUE_RUNNING_TIMEOUT_MS: '400',
            BURSA_QUEUE_MAX_QUEUED: '5',
            BURSA_QUEUE_MAX_HISTORY: '3'
        });

        // 1. Task baru masuk dengan status 'queued'
        const req1 = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: 'dashboard' });
        assert(req1.status === 201 && req1.body.success === true, '1. Task baru berhasil dibuat dengan HTTP 201');
        assert(req1.body.status === 'queued', '1b. Status awal task adalah "queued"');
        assert(typeof req1.body.task_id === 'string' && req1.body.task_id.startsWith('obs-'), '1c. Task ID unik dihasilkan');
        const taskId1 = req1.body.task_id;

        // Cek status via GET /api/observation/tasks/:id
        const get1 = await request(URL_DEV, 'GET', `/api/observation/tasks/${taskId1}`);
        assert(get1.status === 200 && get1.body.status === 'queued', '1d. GET /api/observation/tasks/:id mengembalikan status "queued"');

        // 2. Task diambil sesuai urutan FIFO
        const req2 = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: 'ai_planner' });
        const taskId2 = req2.body.task_id;

        const next1 = await request(URL_DEV, 'GET', '/api/observation/next');
        assert(next1.status === 200 && next1.body.task && next1.body.task.task_id === taskId1, '2. Task pertama yang dibuat (FIFO) diambil lebih dahulu oleh Host Helper');

        // 3. Maksimal satu task 'running' dalam satu waktu
        const nextDuplicate = await request(URL_DEV, 'GET', '/api/observation/next');
        assert(nextDuplicate.status === 204, '3. GET /api/observation/next mengembalikan HTTP 204 ketika sudah ada 1 task berstatus "running"');

        // Selesaikan taskId1 agar taskId2 bisa diambil
        const submit1 = await request(URL_DEV, 'POST', `/api/observation/tasks/${taskId1}/submit`, {
            image_base64: VALID_IMAGE_B64,
            width: 1920,
            height: 1080,
            source: 'test-helper'
        });
        assert(submit1.status === 200 && submit1.body.status === 'completed', '12. Screenshot valid menyelesaikan task (HTTP 200 status "completed")');

        // Sekarang taskId2 bisa diambil
        const next2 = await request(URL_DEV, 'GET', '/api/observation/next');
        assert(next2.status === 200 && next2.body.task.task_id === taskId2, '2b. Task kedua diambil setelah task pertama selesai');

        // Selesaikan taskId2
        await request(URL_DEV, 'POST', `/api/observation/tasks/${taskId2}/submit`, {
            image_base64: VALID_IMAGE_B64
        });

        // 4. Maksimal lima task 'queued'; permintaan ke-6 ditolak (HTTP 429)
        const batchIds = [];
        for (let i = 0; i < 5; i++) {
            const r = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: `batch-${i}` });
            assert(r.status === 201, `4a. Task antrean ke-${i+1} diterima`);
            batchIds.push(r.body.task_id);
        }
        const reqOverflow = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: 'overflow' });
        assert(reqOverflow.status === 429 && reqOverflow.body.error === 'QUEUE_FULL', '4b. Permintaan ke-6 saat antrean penuh ditolak dengan HTTP 429 (QUEUE_FULL)');

        // 5. Task tidak ditemukan menghasilkan HTTP 404
        const notFoundRes = await request(URL_DEV, 'GET', '/api/observation/tasks/obs-non-existent-999');
        assert(notFoundRes.status === 404 && notFoundRes.body.error === 'TASK_NOT_FOUND', '5. Task tidak ditemukan mengembalikan HTTP 404');

        // 6. Task 'queued' dapat dibatalkan (HTTP 200, status 'cancelled')
        const cancelTarget = batchIds[0];
        const cancelRes = await request(URL_DEV, 'POST', `/api/observation/tasks/${cancelTarget}/cancel`);
        assert(cancelRes.status === 200 && cancelRes.body.status === 'cancelled', '6. Task queued berhasil dibatalkan (HTTP 200 status "cancelled")');

        // Batalkan ulang task yang sudah terminal menghasilkan HTTP 400
        const cancelRepeat = await request(URL_DEV, 'POST', `/api/observation/tasks/${cancelTarget}/cancel`);
        assert(cancelRepeat.status === 400 && cancelRepeat.body.error === 'TASK_TERMINAL', '6b. Membatalkan task yang sudah terminal ditolak dengan HTTP 400');

        // 7. Hasil task yang dibatalkan ditolak (HTTP 409)
        const submitCancelled = await request(URL_DEV, 'POST', `/api/observation/tasks/${cancelTarget}/submit`, {
            image_base64: VALID_IMAGE_B64
        });
        assert(submitCancelled.status === 409 && submitCancelled.body.error === 'TASK_NOT_RUNNING', '7. Penyerahan screenshot untuk task yang dibatalkan ditolak dengan HTTP 409');

        // Bersihkan sisa task antrean batch dengan mengambil dan menyelesaikannya
        for (let i = 1; i < 5; i++) {
            const nextBatch = await request(URL_DEV, 'GET', '/api/observation/next');
            if (nextBatch.status === 200 && nextBatch.body.task) {
                await request(URL_DEV, 'POST', `/api/observation/tasks/${nextBatch.body.task.task_id}/submit`, {
                    image_base64: VALID_IMAGE_B64
                });
            }
        }

        // 8. Task 'queued' timeout dan ditandai 'failed'
        const reqTimeoutQueued = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: 'timeout-test' });
        const timeoutQueuedId = reqTimeoutQueued.body.task_id;
        // Tunggu hingga timer 400ms selesai
        await sleep(550);
        const checkTimeoutQueued = await request(URL_DEV, 'GET', `/api/observation/tasks/${timeoutQueuedId}`);
        assert(checkTimeoutQueued.status === 200 && checkTimeoutQueued.body.status === 'failed', '8. Task queued otomatis berstatus "failed" setelah melewati batas timeout antrean');

        // 9. Task 'running' timeout dan ditandai 'failed'
        const reqTimeoutRunning = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: 'running-timeout-test' });
        const timeoutRunningId = reqTimeoutRunning.body.task_id;
        const nextRunning = await request(URL_DEV, 'GET', '/api/observation/next');
        assert(nextRunning.status === 200 && nextRunning.body.task.task_id === timeoutRunningId, '9a. Task running diambil oleh Host Helper');
        // Tunggu hingga running timer 400ms selesai
        await sleep(550);
        const checkTimeoutRunning = await request(URL_DEV, 'GET', `/api/observation/tasks/${timeoutRunningId}`);
        assert(checkTimeoutRunning.status === 200 && checkTimeoutRunning.body.status === 'failed', '9b. Task running otomatis berstatus "failed" setelah melewati batas waktu eksekusi');

        // 10. Hasil yang datang terlambat setelah timeout ditolak (HTTP 409)
        const submitLate = await request(URL_DEV, 'POST', `/api/observation/tasks/${timeoutRunningId}/submit`, {
            image_base64: VALID_IMAGE_B64
        });
        assert(submitLate.status === 409 && submitLate.body.error === 'TASK_NOT_RUNNING', '10. Penyerahan screenshot terlambat setelah timeout ditolak dengan HTTP 409');

        // 11. Payload screenshot tidak valid ditolak (HTTP 400)
        const reqForInvalid = await request(URL_DEV, 'POST', '/api/observation/request');
        const invalidTaskId = reqForInvalid.body.task_id;
        await request(URL_DEV, 'GET', '/api/observation/next');
        const submitCorrupt = await request(URL_DEV, 'POST', `/api/observation/tasks/${invalidTaskId}/submit`, {
            image_base64: 'corrupt-not-base64-content'
        });
        assert(submitCorrupt.status === 400, '11. Payload screenshot tidak valid ditolak dengan HTTP 400');
        // Bersihkan invalidTaskId dengan payload yang valid
        await request(URL_DEV, 'POST', `/api/observation/tasks/${invalidTaskId}/submit`, {
            image_base64: VALID_IMAGE_B64
        });

        // 13. latestScreenshot hanya diperbarui oleh hasil task aktif yang valid dan mencatat task_id
        const reqForLatest = await request(URL_DEV, 'POST', '/api/observation/request');
        const latestTaskId = reqForLatest.body.task_id;
        await request(URL_DEV, 'GET', '/api/observation/next');
        await request(URL_DEV, 'POST', `/api/observation/tasks/${latestTaskId}/submit`, {
            image_base64: VALID_IMAGE_B64,
            width: 1920,
            height: 1080,
            source: 'host-helper-active'
        });
        const latestCheck = await request(URL_DEV, 'GET', '/api/screenshot/latest');
        assert(latestCheck.status === 200 && latestCheck.body.task_id === latestTaskId, '13. latestScreenshot memiliki task_id yang cocok dengan task aktif');

        // 18. Tidak ada base64 screenshot dalam respons metadata atau riwayat task
        const taskCheckNoB64 = await request(URL_DEV, 'GET', `/api/observation/tasks/${latestTaskId}`);
        assert(taskCheckNoB64.status === 200, '18a. Metadata task berhasil diambil');
        const jsonStr = JSON.stringify(taskCheckNoB64.body);
        assert(!jsonStr.includes('data:image/jpeg;base64') && !jsonStr.includes('image_base64'), '18b. TIDAK ADA string base64 gambar dalam respons metadata task');

        // 14. Screenshot manual melalui endpoint lama tetap berfungsi tanpa merusak sistem
        const manualUpload = await request(URL_DEV, 'POST', '/api/screenshot', {
            image_base64: VALID_IMAGE_B64,
            width: 1280,
            height: 720,
            source: 'manual-web-companion'
        });
        assert(manualUpload.status === 200 && manualUpload.body.success === true, '14. Endpoint manual POST /api/screenshot tetap berfungsi normal');
        const latestManual = await request(URL_DEV, 'GET', '/api/screenshot/latest');
        assert(latestManual.status === 200 && latestManual.body.source === 'manual-web-companion', '14b. latestScreenshot diperbarui oleh upload manual tanpa wajib task_id');

        // 15. Riwayat membatasi task terminal tanpa menghapus task aktif
        // Di konfigurasi test, maxHistory = 3. Buat 1 task aktif 'queued', lalu selesaikan 4 task terminal.
        const activeQueuedTask = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: 'keep-alive-active' });
        const activeQueuedId = activeQueuedTask.body.task_id;

        // Hasilkan 4 tugas terminal baru
        for (let i = 0; i < 4; i++) {
            const tReq = await request(URL_DEV, 'POST', '/api/observation/request', { requested_by: `terminal-filler-${i}` });
            const tId = tReq.body.task_id;
            // Batalkan langsung agar menjadi terminal
            await request(URL_DEV, 'POST', `/api/observation/tasks/${tId}/cancel`);
        }

        // Periksa bahwa task aktif 'keep-alive-active' MASIH ADA di memori dan tidak di-evict
        const checkActive = await request(URL_DEV, 'GET', `/api/observation/tasks/${activeQueuedId}`);
        assert(checkActive.status === 200 && checkActive.body.status === 'queued', '15a. Task aktif yang sedang queued TIDAK pernah dihapus oleh batas riwayat terminal');

        // Periksa bahwa tugas terminal lama (latestTaskId) sudah ter-evict dari memori karena batas maxHistory = 3
        const checkEvicted = await request(URL_DEV, 'GET', `/api/observation/tasks/${latestTaskId}`);
        assert(checkEvicted.status === 404, '15b. Tugas terminal terlama dibersihkan secara FIFO saat melebihi maxHistory');

        // =============================================================
        // BAGIAN 2: PENGUJIAN AUTENTIKASI AKTIF (PORT_AUTH)
        // =============================================================
        console.log(`\n[BAGIAN 2] Memulai server terproteksi BURSA_API_KEY pada port ${PORT_AUTH}...`);
        authServer = await startTestServer(PORT_AUTH, {
            BURSA_API_KEY: TEST_API_KEY
        });

        // 16. Seluruh endpoint terlindungi mematuhi autentikasi (HTTP 401 tanpa token / token salah)
        const unauth1 = await request(URL_AUTH, 'POST', '/api/observation/request', { requested_by: 'hacker' });
        assert(unauth1.status === 401, '16a. POST /api/observation/request ditolak HTTP 401 tanpa header auth');

        const unauth2 = await request(URL_AUTH, 'GET', '/api/observation/tasks/obs-123');
        assert(unauth2.status === 401, '16b. GET /api/observation/tasks/:id ditolak HTTP 401 tanpa header auth');

        const unauth3 = await request(URL_AUTH, 'POST', '/api/observation/tasks/obs-123/cancel');
        assert(unauth3.status === 401, '16c. POST /api/observation/tasks/:id/cancel ditolak HTTP 401 tanpa header auth');

        const unauth4 = await request(URL_AUTH, 'GET', '/api/observation/next');
        assert(unauth4.status === 401, '16d. GET /api/observation/next ditolak HTTP 401 tanpa header auth');

        const unauth5 = await request(URL_AUTH, 'POST', '/api/observation/tasks/obs-123/submit', { image_base64: VALID_IMAGE_B64 });
        assert(unauth5.status === 401, '16e. POST /api/observation/tasks/:id/submit ditolak HTTP 401 tanpa header auth');

        // Akses dengan x-bursa-key valid berhasil
        const authReq = await request(URL_AUTH, 'POST', '/api/observation/request', { requested_by: 'authorized-client' }, {
            'x-bursa-key': TEST_API_KEY
        });
        assert(authReq.status === 201 && authReq.body.success === true, '16f. Endpoint antrean berhasil diakses saat x-bursa-key valid disertakan');

        // =============================================================
        // BAGIAN 3: PENGUJIAN FAIL-CLOSED (PORT_FAILCLOSED)
        // BURSA_AUTH_REQUIRED=true tetapi BURSA_API_KEY tidak dikonfigurasi
        // =============================================================
        console.log(`\n[BAGIAN 3] Memulai server mode fail-closed pada port ${PORT_FAILCLOSED}...`);
        failclosedServer = await startTestServer(PORT_FAILCLOSED, {
            BURSA_AUTH_REQUIRED: 'true',
            BURSA_API_KEY: ''
        });

        // 17. Mode fail-closed diuji secara terisolasi tanpa mengubah konfigurasi aktif (HTTP 503)
        const fc1 = await request(URL_FAILCLOSED, 'POST', '/api/observation/request', { requested_by: 'test' });
        assert(fc1.status === 503, '17a. POST /api/observation/request mengembalikan HTTP 503 saat fail-closed');

        const fc2 = await request(URL_FAILCLOSED, 'GET', '/api/observation/next');
        assert(fc2.status === 503, '17b. GET /api/observation/next mengembalikan HTTP 503 saat fail-closed');

        const fc3 = await request(URL_FAILCLOSED, 'GET', '/api/observation/tasks/obs-123');
        assert(fc3.status === 503, '17c. GET /api/observation/tasks/:id mengembalikan HTTP 503 saat fail-closed');

    } catch (err) {
        console.error('Terjadi kesalahan fatal selama pengujian:', err);
        failed++;
    } finally {
        if (devServer) devServer.kill();
        if (authServer) authServer.kill();
        if (failclosedServer) failclosedServer.kill();
    }

    console.log('\n===============================================================');
    console.log(`  HASIL PENGUJIAN ANTREAN OBSERVASI: ${passed} LULUS, ${failed} GAGAL`);
    console.log('===============================================================');

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
