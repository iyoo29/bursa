/**
 * Mock AI Provider
 * Provider default untuk pengujian lokal tanpa biaya dan pengujian skenario kegagalan.
 */

const BaseAIProvider = require('./base_provider');

class MockAIProvider extends BaseAIProvider {
    constructor() {
        super('mock');
    }

    async generateActionPlan({ prompt, screenshotBase64, deviceId, timeoutMs = 8000, options = {} }) {
        const lowerPrompt = (prompt || '').toLowerCase();
        const simMode = options.sim_mode || null;

        // Simulasi 1: Timeout Provider
        if (simMode === 'timeout') {
            await new Promise(r => setTimeout(r, timeoutMs + 1000));
        }

        // Simulasi 2: Kesalahan Server Provider (HTTP 500 / Network Failure)
        if (simMode === 'provider_error') {
            throw new Error('Mock AI Provider: Simulasi kegagalan koneksi upstream (500 Internal Server Error)');
        }

        // Simulasi 3: JSON Rusak (Malformed JSON string)
        if (simMode === 'malformed_json') {
            return "{ plan_id: 'bad', steps: [ { action: 'mouse_move', params: "; // Sintaks JSON tidak lengkap
        }

        // Simulasi 4: Aksi di luar Allowlist
        if (simMode === 'disallowed_action') {
            return {
                plan_id: `plan-mock-${Date.now()}`,
                device_id: deviceId,
                explanation: "Mencoba menjalankan perintah shell terlarang",
                requires_confirmation: false,
                steps: [
                    {
                        action: "execute_arbitrary_shell",
                        params: { command: "whoami" },
                        description: "Menjalankan perintah shell arbitrer"
                    }
                ]
            };
        }

        // Simulasi 5: Parameter Koordinat Di Luar Batas
        if (simMode === 'out_of_bounds') {
            return {
                plan_id: `plan-mock-${Date.now()}`,
                device_id: deviceId,
                explanation: "Koordinat di luar resolusi layar yang wajar",
                requires_confirmation: false,
                steps: [
                    {
                        action: "mouse_move",
                        params: { x: 9999999, y: -8888888 },
                        description: "Gerak mouse ke koordinat invalid"
                    }
                ]
            };
        }

        // Simulasi 6: Jumlah Langkah Berlebihan (> 10 langkah)
        if (simMode === 'excessive_steps') {
            const steps = [];
            for (let i = 0; i < 15; i++) {
                steps.push({ action: "click", params: {}, description: `Klik ke-${i+1}` });
            }
            return {
                plan_id: `plan-mock-${Date.now()}`,
                device_id: deviceId,
                explanation: "Rencana dengan 15 langkah (melebihi batas aman)",
                requires_confirmation: false,
                steps: steps
            };
        }

        // ============================================================
        // SKENARIO NORMAL (HAPPY PATH MOCK)
        // ============================================================
        let steps = [];
        let explanation = "";
        let requiresConfirmation = false;

        if (lowerPrompt.includes('notepad') || lowerPrompt.includes('catatan') || lowerPrompt.includes('buka')) {
            explanation = "Membuka dialog Run (Win+R), mengetikkan 'notepad', dan menekan Enter.";
            steps = [
                {
                    action: "key_combination",
                    params: { keys: ["GUI", "r"] },
                    description: "Buka jendela Windows Run (Win+R)"
                },
                {
                    action: "delay",
                    params: { ms: 500 },
                    description: "Tunggu dialog Run terbuka"
                },
                {
                    action: "type_text",
                    params: { text: "notepad\n" },
                    description: "Ketik notepad dan tekan Enter"
                }
            ];
        } else if (lowerPrompt.includes('ketik') || lowerPrompt.includes('tulis')) {
            explanation = "Mengetikkan teks instruksi pengguna ke aplikasi aktif.";
            steps = [
                {
                    action: "type_text",
                    params: { text: "Salam dari Agen BURSA!\n" },
                    description: "Ketik teks ke layar aktif"
                }
            ];
        } else if (lowerPrompt.includes('tutup') || lowerPrompt.includes('hapus') || simMode === 'risky_action') {
            explanation = "Tindakan berisiko: Menutup jendela aktif dengan Alt+F4.";
            requiresConfirmation = true;
            steps = [
                {
                    action: "key_combination",
                    params: { keys: ["ALT", "F4"] },
                    description: "Tutup jendela aktif (Alt+F4)"
                }
            ];
        } else {
            // Aksi umum default
            explanation = "Menggerakkan kursor dan melakukan klik verifikasi.";
            steps = [
                {
                    action: "mouse_move",
                    params: { x: 300, y: 300 },
                    description: "Pindahkan kursor ke posisi target"
                },
                {
                    action: "click",
                    params: {},
                    description: "Klik kiri pada elemen target"
                }
            ];
        }

        return {
            plan_id: `plan-mock-${Date.now()}`,
            device_id: deviceId,
            explanation: explanation,
            requires_confirmation: requiresConfirmation,
            steps: steps
        };
    }
}

module.exports = MockAIProvider;
