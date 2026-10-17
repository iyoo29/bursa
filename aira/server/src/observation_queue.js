/**
 * BURSA - Observation Queue Manager
 * 
 * Mengelola antrean FIFO dalam memori untuk permintaan tangkapan layar (screenshot)
 * dari Host Helper Windows.
 * 
 * Ketentuan Siklus & Keamanan:
 * - Urutan FIFO murni.
 * - Maksimal 5 tugas berstatus 'queued' (tugas 'running' tidak dihitung).
 * - Tepat satu tugas berstatus 'running' pada satu waktu.
 * - Maksimal 20 tugas terminal ('completed', 'failed', 'cancelled') disimpan dalam riwayat.
 * - Tugas aktif ('queued' atau 'running') tidak pernah dihapus untuk memenuhi batas riwayat.
 * - Status terpusat: queued -> running -> completed / failed / cancelled.
 * - At-most-once attempt: Tugas yang sedang 'running' tidak dimasukkan kembali ke antrean secara otomatis.
 * - Bebas base64: Objek tugas dan riwayat TIDAK menyimpan string base64 gambar demi efisiensi memori RAM.
 */

class ObservationQueue {
    constructor(options = {}) {
        this.maxQueued = options.maxQueued !== undefined 
            ? options.maxQueued 
            : (parseInt(process.env.BURSA_QUEUE_MAX_QUEUED, 10) || 5);
        this.maxHistory = options.maxHistory !== undefined 
            ? options.maxHistory 
            : (parseInt(process.env.BURSA_QUEUE_MAX_HISTORY, 10) || 20);
        this.queuedTimeoutMs = options.queuedTimeoutMs !== undefined 
            ? options.queuedTimeoutMs 
            : (parseInt(process.env.BURSA_QUEUE_QUEUED_TIMEOUT_MS, 10) || 30000);
        this.runningTimeoutMs = options.runningTimeoutMs !== undefined 
            ? options.runningTimeoutMs 
            : (parseInt(process.env.BURSA_QUEUE_RUNNING_TIMEOUT_MS, 10) || 15000);

        this.queuedTasks = [];          // Array of task objects (FIFO)
        this.currentRunningTask = null; // Single running task object or null
        this.terminalHistory = [];      // Array of terminal tasks (completed/failed/cancelled)
        this.tasksById = new Map();     // task_id -> task object
    }

    /**
     * Membuat permintaan observasi baru dan memasukkannya ke antrean.
     */
    requestTask(params = {}) {
        const { requested_by, timeout_ms } = params;

        // Validasi batas kapasitas antrean queued (maksimal 5)
        const currentQueuedCount = this.queuedTasks.filter(t => t.status === 'queued').length;
        if (currentQueuedCount >= this.maxQueued) {
            return {
                success: false,
                code: 429,
                error: 'QUEUE_FULL',
                message: `Antrean observasi penuh (maksimal ${this.maxQueued} tugas menunggu).`
            };
        }

        // Validasi requested_by
        let safeRequestedBy = 'dashboard';
        if (typeof requested_by === 'string' && requested_by.trim().length > 0) {
            safeRequestedBy = requested_by.trim().slice(0, 50);
        }

        // Validasi timeout_ms
        let safeTimeoutMs = this.runningTimeoutMs;
        if (typeof timeout_ms === 'number' && timeout_ms >= 500 && timeout_ms <= 120000) {
            safeTimeoutMs = timeout_ms;
        }

        const taskId = `obs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date().toISOString();

        const task = {
            id: taskId,
            status: 'queued',
            requested_by: safeRequestedBy,
            created_at: now,
            started_at: null,
            completed_at: null,
            timeout_ms: safeTimeoutMs,
            error_message: null,
            result_metadata: null,
            _timer: null
        };

        // Pasang timer timeout saat menunggu di antrean
        task._timer = setTimeout(() => {
            if (task.status === 'queued') {
                this.transitionTask(task, 'failed', 'Batas waktu antrean habis (Host Helper tidak mengambil tugas).');
            }
        }, this.queuedTimeoutMs);

        this.queuedTasks.push(task);
        this.tasksById.set(task.id, task);

        const queuePosition = this.queuedTasks.filter(t => t.status === 'queued').length;

        return {
            success: true,
            code: 201,
            task: this.getSafeTask(task),
            queue_position: queuePosition
        };
    }

    /**
     * Mengambil status satu tugas berdasarkan task_id.
     */
    getTask(taskId) {
        if (!taskId || typeof taskId !== 'string') return null;
        const task = this.tasksById.get(taskId);
        if (!task) return null;
        return this.getSafeTask(task);
    }

    /**
     * Membatalkan tugas jika masih dalam status 'queued' atau 'running'.
     */
    cancelTask(taskId) {
        if (!taskId || typeof taskId !== 'string') {
            return { success: false, code: 404, error: 'TASK_NOT_FOUND', message: 'Tugas observasi tidak ditemukan.' };
        }

        const task = this.tasksById.get(taskId);
        if (!task) {
            return { success: false, code: 404, error: 'TASK_NOT_FOUND', message: 'Tugas observasi tidak ditemukan.' };
        }

        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
            return {
                success: false,
                code: 400,
                error: 'TASK_TERMINAL',
                message: `Tugas sudah dalam status terminal (${task.status}) dan tidak dapat dibatalkan.`,
                status: task.status
            };
        }

        this.transitionTask(task, 'cancelled', 'Dibatalkan oleh peminta.');

        return {
            success: true,
            code: 200,
            task: this.getSafeTask(task),
            message: 'Tugas observasi berhasil dibatalkan.'
        };
    }

    /**
     * Mengambil tugas berikutnya dari antrean untuk dikerjakan Host Helper.
     * Menerapkan urutan FIFO dan memastikan hanya ada maksimal 1 tugas 'running'.
     */
    getNextTask() {
        // Jika sudah ada tugas yang sedang berjalan, jangan berikan tugas baru
        if (this.currentRunningTask !== null) {
            return null; // Menghasilkan HTTP 204
        }

        // Cari tugas berikutnya yang masih berstatus 'queued'
        while (this.queuedTasks.length > 0) {
            const candidate = this.queuedTasks.shift();
            if (candidate && candidate.status === 'queued') {
                // Hentikan timer queued
                if (candidate._timer) {
                    clearTimeout(candidate._timer);
                    candidate._timer = null;
                }

                // Transisi ke running
                this.transitionTask(candidate, 'running');

                // Pasang timer timeout untuk fase running
                candidate._timer = setTimeout(() => {
                    if (candidate.status === 'running') {
                        this.transitionTask(candidate, 'failed', 'Batas waktu eksekusi habis (Host Helper tidak mengirim screenshot).');
                    }
                }, candidate.timeout_ms);

                return {
                    task_id: candidate.id,
                    timeout_ms: candidate.timeout_ms
                };
            }
        }

        return null; // Antrean kosong -> HTTP 204
    }

    /**
     * Menyerahkan hasil screenshot untuk tugas yang sedang aktif.
     */
    submitResult(taskId, metadata = {}) {
        if (!taskId || typeof taskId !== 'string') {
            return { success: false, code: 404, error: 'TASK_NOT_FOUND', message: 'Tugas observasi tidak ditemukan.' };
        }

        const task = this.tasksById.get(taskId);
        if (!task) {
            return { success: false, code: 404, error: 'TASK_NOT_FOUND', message: 'Tugas observasi tidak ditemukan.' };
        }

        if (task.status !== 'running') {
            return {
                success: false,
                code: 409,
                error: 'TASK_NOT_RUNNING',
                message: `Tugas tidak dalam status running (status saat ini: ${task.status}).`,
                status: task.status
            };
        }

        // Bersihkan timer running
        if (task._timer) {
            clearTimeout(task._timer);
            task._timer = null;
        }

        // Simpan metadata hasil (TANPA string base64)
        task.result_metadata = {
            width: metadata.width || 0,
            height: metadata.height || 0,
            source: metadata.source || 'Host_Helper',
            timestamp: new Date().toISOString()
        };

        this.transitionTask(task, 'completed');

        return {
            success: true,
            code: 200,
            task: this.getSafeTask(task)
        };
    }

    /**
     * Fungsi terpusat transisi status tugas untuk mencegah konflik state.
     */
    transitionTask(task, newStatus, errorMessage = null) {
        const oldStatus = task.status;

        // Cegah perubahan status jika tugas sudah berada dalam status terminal
        if (['completed', 'failed', 'cancelled'].includes(oldStatus)) {
            return;
        }

        // Validasi jalur transisi yang diizinkan
        const validTransitions = {
            'queued': ['running', 'cancelled', 'failed'],
            'running': ['completed', 'cancelled', 'failed']
        };

        if (!validTransitions[oldStatus] || !validTransitions[oldStatus].includes(newStatus)) {
            console.warn(`[Queue] Transisi status tidak sah dari "${oldStatus}" ke "${newStatus}" untuk tugas ${task.id}`);
            return;
        }

        task.status = newStatus;

        if (newStatus === 'running') {
            task.started_at = new Date().toISOString();
            this.currentRunningTask = task;
        } else if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
            task.completed_at = new Date().toISOString();
            if (errorMessage) {
                task.error_message = errorMessage;
            }
            if (task._timer) {
                clearTimeout(task._timer);
                task._timer = null;
            }

            // Lepaskan dari status running jika sebelumnya running
            if (this.currentRunningTask && this.currentRunningTask.id === task.id) {
                this.currentRunningTask = null;
            }

            // Hapus dari antrean queued jika ada
            this.queuedTasks = this.queuedTasks.filter(t => t.id !== task.id);

            // Simpan ke riwayat terminal
            this.terminalHistory.push(task);

            // Pangkas riwayat terminal jika melebihi batas (FIFO eviction untuk terminal tasks)
            while (this.terminalHistory.length > this.maxHistory) {
                const evicted = this.terminalHistory.shift();
                if (evicted && evicted.id) {
                    this.tasksById.delete(evicted.id);
                }
            }
        }
    }

    /**
     * Menghasilkan representasi objek tugas yang aman tanpa atribut internal,
     * timer, kredensial, atau string base64.
     */
    getSafeTask(task) {
        return {
            task_id: task.id,
            status: task.status,
            requested_by: task.requested_by,
            created_at: task.created_at,
            started_at: task.started_at,
            completed_at: task.completed_at,
            timeout_ms: task.timeout_ms,
            error_message: task.error_message,
            result_metadata: task.result_metadata ? { ...task.result_metadata } : null
        };
    }

    /**
     * Membersihkan seluruh tugas dan timer (berguna untuk pengujian mandiri atau shutdown).
     */
    clear() {
        if (this.currentRunningTask && this.currentRunningTask._timer) {
            clearTimeout(this.currentRunningTask._timer);
        }
        for (const t of this.queuedTasks) {
            if (t._timer) clearTimeout(t._timer);
        }
        this.queuedTasks = [];
        this.currentRunningTask = null;
        this.terminalHistory = [];
        this.tasksById.clear();
    }
}

module.exports = ObservationQueue;
