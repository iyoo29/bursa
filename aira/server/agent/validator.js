/**
 * BURSA Action Plan Validator
 * Memvalidasi keluaran model AI sebelum diteruskan ke server atau perangkat.
 */

const ALLOWED_DONGLE_ACTIONS = new Set([
    'mouse_move', 'click', 'mouse_click', 'double_click', 'right_click',
    'mouse_down', 'mouse_up', 'mouse_wheel', 'scroll',
    'key_press', 'key_down', 'key_up', 'type_text', 'key_combination',
    'delay', 'emergency_stop'
]);

const MAX_STEPS = 10;

function validateActionPlan(rawOutput, expectedDeviceId = null) {
    let plan = rawOutput;

    // 1. Parsing jika output berupa teks string JSON
    if (typeof rawOutput === 'string') {
        try {
            plan = JSON.parse(rawOutput.trim());
        } catch (e) {
            return {
                valid: false,
                error: `Respons AI gagal diurai sebagai JSON: ${e.message}`,
                error_code: 'MALFORMED_JSON'
            };
        }
    }

    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
        return {
            valid: false,
            error: 'Rencana aksi harus berupa objek JSON (bukan array atau nilai primitif).',
            error_code: 'INVALID_ROOT_TYPE'
        };
    }

    // 2. Validasi Atribut Utama
    if (!plan.plan_id || typeof plan.plan_id !== 'string') {
        return { valid: false, error: 'Atribut "plan_id" wajib berupa string.', error_code: 'MISSING_PLAN_ID' };
    }
    if (!plan.device_id || typeof plan.device_id !== 'string') {
        return { valid: false, error: 'Atribut "device_id" wajib berupa string.', error_code: 'MISSING_DEVICE_ID' };
    }
    if (expectedDeviceId && plan.device_id !== expectedDeviceId) {
        return { 
            valid: false, 
            error: `device_id rencana (${plan.device_id}) tidak cocok dengan perangkat target (${expectedDeviceId}).`,
            error_code: 'DEVICE_ID_MISMATCH'
        };
    }
    if (!plan.explanation || typeof plan.explanation !== 'string') {
        return { valid: false, error: 'Atribut "explanation" wajib disertakan.', error_code: 'MISSING_EXPLANATION' };
    }
    if (typeof plan.requires_confirmation !== 'boolean') {
        plan.requires_confirmation = false; // Default aman
    }

    // 3. Validasi Array Langkah (Steps)
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
        return { valid: false, error: 'Atribut "steps" wajib berupa array tindakan yang tidak kosong.', error_code: 'EMPTY_STEPS' };
    }
    if (plan.steps.length > MAX_STEPS) {
        return { 
            valid: false, 
            error: `Jumlah langkah (${plan.steps.length}) melebihi batas maksimal aman (${MAX_STEPS} langkah).`,
            error_code: 'EXCESSIVE_STEPS'
        };
    }

    // 4. Validasi Tiap Langkah dan Parameter
    const sanitizedSteps = [];

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        const stepNum = i + 1;

        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            return { valid: false, error: `Langkah ke-${stepNum} bukan merupakan objek valid.`, error_code: 'INVALID_STEP_OBJECT' };
        }

        const action = step.action;
        if (!action || typeof action !== 'string') {
            return { valid: false, error: `Langkah ke-${stepNum} tidak memiliki nama aksi yang valid.`, error_code: 'MISSING_ACTION_NAME' };
        }

        // Pengecekan Allowlist
        if (!ALLOWED_DONGLE_ACTIONS.has(action)) {
            return { 
                valid: false, 
                error: `Langkah ke-${stepNum}: Aksi "${action}" ditolak (tidak ada dalam allowlist keamanan).`,
                error_code: 'DISALLOWED_ACTION',
                action: action,
                step_index: i
            };
        }

        const params = step.params || {};

        // Validasi Koordinat Mouse
        if (params.x !== undefined) {
            if (typeof params.x !== 'number' || isNaN(params.x) || params.x < -10000 || params.x > 10000) {
                return { valid: false, error: `Langkah ke-${stepNum}: Koordinat x (${params.x}) di luar batas aman.`, error_code: 'OUT_OF_BOUNDS_X' };
            }
        }
        if (params.y !== undefined) {
            if (typeof params.y !== 'number' || isNaN(params.y) || params.y < -10000 || params.y > 10000) {
                return { valid: false, error: `Langkah ke-${stepNum}: Koordinat y (${params.y}) di luar batas aman.`, error_code: 'OUT_OF_BOUNDS_Y' };
            }
        }

        // Validasi Teks
        if (params.text !== undefined) {
            if (typeof params.text !== 'string') {
                return { valid: false, error: `Langkah ke-${stepNum}: Parameter text harus berupa string.`, error_code: 'INVALID_TEXT_PARAM' };
            }
            if (params.text.length > 1000) {
                return { valid: false, error: `Langkah ke-${stepNum}: Teks melebihi batas maksimal 1000 karakter.`, error_code: 'TEXT_TOO_LONG' };
            }
        }

        // Validasi Delay
        if (params.ms !== undefined) {
            if (typeof params.ms !== 'number' || params.ms < 0 || params.ms > 10000) {
                return { valid: false, error: `Langkah ke-${stepNum}: Delay ms harus antara 0 hingga 10000 milidetik.`, error_code: 'INVALID_DELAY' };
            }
        }

        // Bentuk langkah ter-sanitasi
        sanitizedSteps.push({
            action: action,
            params: params,
            description: step.description ? String(step.description).slice(0, 200) : `Langkah ${stepNum}: ${action}`
        });
    }

    return {
        valid: true,
        plan: {
            plan_id: plan.plan_id,
            device_id: plan.device_id,
            explanation: plan.explanation,
            requires_confirmation: Boolean(plan.requires_confirmation),
            steps: sanitizedSteps
        }
    };
}

module.exports = {
    validateActionPlan,
    ALLOWED_DONGLE_ACTIONS,
    MAX_STEPS
};
