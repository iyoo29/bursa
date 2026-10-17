/**
 * OpenAI / Compatible Vision AI Provider
 * Mendukung OpenAI, Gemini (via endpoint kompatibel), Groq, atau Ollama lokal.
 * Menggunakan modul https bawaan Node.js tanpa dependensi eksternal tambahan.
 */

const https = require('https');
const http = require('http');
const BaseAIProvider = require('./base_provider');

class OpenAICompatibleProvider extends BaseAIProvider {
    constructor() {
        super('openai');
        this.apiKey = process.env.OPENAI_API_KEY || null;
        this.baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    }

    async generateActionPlan({ prompt, screenshotBase64, deviceId, timeoutMs = 15000 }) {
        if (!this.apiKey) {
            throw new Error("OpenAI Provider Error: OPENAI_API_KEY tidak dikonfigurasi di environment server.");
        }

        const url = new URL(`${this.baseURL}/chat/completions`);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const systemPrompt = `Anda adalah Agen AI untuk sistem BURSA yang mengendalikan PC melalui perangkat USB HID (LILYGO T-Dongle-S3).
Tugas Anda adalah menganalisis tangkapan layar desktop pengguna dan menghasilkan rencana tindakan terstruktur HANYA DALAM FORMAT JSON VALID.

ATURAN KEAMANAN WAJIB:
1. Hanya gunakan aksi berikut: "mouse_move", "click", "double_click", "right_click", "type_text", "key_combination", "delay".
2. Jangan pernah mengeksekusi shell langsung atau perintah berbahaya.
3. Maksimal 10 langkah per rencana.
4. Format JSON yang WAJIB dihasilkan:
{
  "plan_id": "string",
  "device_id": "${deviceId}",
  "explanation": "ringkasan tindakan dalam bahasa Indonesia",
  "requires_confirmation": false,
  "steps": [
    { "action": "nama_aksi", "params": { ... }, "description": "penjelasan langkah" }
  ]
}`;

        const messages = [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: [
                    { type: "text", text: `Instruksi Pengguna: ${prompt}` },
                    {
                        type: "image_url",
                        image_url: {
                            url: screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/jpeg;base64,${screenshotBase64}`
                        }
                    }
                ]
            }
        ];

        const payload = JSON.stringify({
            model: this.model,
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 1000
        });

        return new Promise((resolve, reject) => {
            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: timeoutMs
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            return reject(new Error(`API Provider Error (${res.statusCode}): ${parsed.error?.message || data}`));
                        }
                        const content = parsed.choices?.[0]?.message?.content;
                        resolve(content);
                    } catch (e) {
                        reject(new Error(`Gagal mengurai respons API provider: ${e.message}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Timeout: Panggilan API AI melebihi batas waktu ${timeoutMs}ms.`));
            });

            req.on('error', (err) => {
                reject(new Error(`Kesalahan koneksi ke AI provider: ${err.message}`));
            });

            req.write(payload);
            req.end();
        });
    }
}

module.exports = OpenAICompatibleProvider;
