/**
 * Base AI Provider Interface
 * Menyediakan antarmuka standar yang agnostik terhadap vendor AI.
 */

class BaseAIProvider {
    constructor(name) {
        this.name = name;
    }

    /**
     * Menghasilkan rencana aksi JSON terstruktur dari instruksi dan screenshot.
     * @param {Object} params
     * @param {string} params.prompt Instruksi pengguna
     * @param {string} params.screenshotBase64 Data URI screenshot JPEG/PNG
     * @param {string} params.deviceId ID perangkat target
     * @param {string} params.systemPrompt Prompt instruksi sistem
     * @param {number} params.timeoutMs Batas waktu pemanggilan provider
     * @returns {Promise<Object>} Respons mentah atau JSON terurai dari model
     */
    async generateActionPlan(params) {
        throw new Error(`generateActionPlan() belum diimplementasikan untuk provider ${this.name}`);
    }
}

module.exports = BaseAIProvider;
