/**
 * BURSA AI Planner Module
 * Mengoordinasikan instruksi pengguna, konteks screenshot layar, pemanggilan AI provider,
 * dan validasi skema rencana aksi.
 */

const { getAIProvider } = require('../providers');
const { validateActionPlan } = require('./validator');

const MAX_PROMPT_LENGTH = 500;

class AIPlanner {
    constructor() {
        this.provider = getAIProvider();
    }

    /**
     * Membuat rencana aksi terstruktur dari instruksi dan tangkapan layar.
     * @param {Object} params
     * @param {string} params.prompt Instruksi teks dari pengguna
     * @param {string} params.deviceId ID perangkat USB target
     * @param {Object} params.latestScreenshot Objek tangkapan layar { image_base64, timestamp }
     * @param {Object} params.options Opsi tambahan (misal simulasi pengujian)
     * @returns {Promise<Object>} Rencana aksi terverifikasi
     */
    async planAction({ prompt, deviceId, latestScreenshot, options = {} }) {
        // 1. Validasi Input Pengguna
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return {
                success: false,
                error_code: 'EMPTY_PROMPT',
                error: 'Instruksi pengguna tidak boleh kosong.'
            };
        }
        if (prompt.length > MAX_PROMPT_LENGTH) {
            return {
                success: false,
                error_code: 'PROMPT_TOO_LONG',
                error: `Instruksi melebihi batas maksimal ${MAX_PROMPT_LENGTH} karakter.`
            };
        }
        if (!deviceId || typeof deviceId !== 'string') {
            return {
                success: false,
                error_code: 'MISSING_DEVICE_ID',
                error: 'Atribut device_id wajib ditentukan.'
            };
        }

        // 2. Pemeriksaan Konteks Tangkapan Layar (Observe)
        if (!latestScreenshot || !latestScreenshot.image_base64) {
            return {
                success: false,
                error_code: 'SCREENSHOT_REQUIRED',
                error: 'Tangkapan layar tidak tersedia. Aktifkan Web Companion untuk membagikan layar terlebih dahulu.'
            };
        }

        // Periksa TTL Screenshot (Maksimal 60 detik)
        const ageMs = Date.now() - new Date(latestScreenshot.timestamp).getTime();
        if (ageMs > 60000) {
            return {
                success: false,
                error_code: 'SCREENSHOT_EXPIRED',
                error: 'Tangkapan layar telah kedaluwarsa demi privasi. Mohon perbarui tangkapan layar terbaru.'
            };
        }

        // 3. Pemanggilan Provider AI
        let rawPlanOutput;
        try {
            rawPlanOutput = await this.provider.generateActionPlan({
                prompt: prompt.trim(),
                screenshotBase64: latestScreenshot.image_base64,
                deviceId: deviceId,
                timeoutMs: options.timeoutMs || 10000,
                options: options
            });
        } catch (err) {
            return {
                success: false,
                error_code: 'PROVIDER_ERROR',
                error: `Gagal memanggil AI Provider (${this.provider.name}): ${err.message}`
            };
        }

        // 4. Validasi Skema JSON yang Ketat (Security & Schema Gate)
        const validation = validateActionPlan(rawPlanOutput, deviceId);
        if (!validation.valid) {
            return {
                success: false,
                error_code: validation.error_code || 'VALIDATION_FAILED',
                error: `Rencana tindakan AI ditolak: ${validation.error}`,
                details: validation
            };
        }

        // 5. Kembalikan Rencana Aksi yang Berhasil Divalidasi
        return {
            success: true,
            provider: this.provider.name,
            plan: validation.plan
        };
    }
}

module.exports = AIPlanner;
