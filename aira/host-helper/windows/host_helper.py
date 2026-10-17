"""
BURSA Host Helper - Windows Minimal Companion (Zero Heavy Bloat)
Target: Windows 10/11

Fungsi Utama:
1. Mengambil tangkapan layar (screenshot) lokal menggunakan API Windows native (GDI / PowerShell fallback).
2. Mengeksekusi tindakan terbatas pada sistem lokal yang HANYA ADA DALAM ALLOWLIST (misal: membuka Notepad).
3. Memvalidasi bahwa aplikasi target benar-benar berjalan (Verifikasi Hasil).
4. Menolak segala bentuk perintah shell arbitrer yang tidak dikenal.
"""

import sys
import os
import json
import time
import base64
import urllib.request
import urllib.error
import subprocess

SERVER_URL = os.environ.get("BURSA_SERVER_URL", "http://localhost:8000")
HELPER_ID = f"host-helper-{os.environ.get('COMPUTERNAME', 'PC')}"
BURSA_API_KEY = os.environ.get("BURSA_API_KEY", "")

# ============================================================
# KEAMANAN: ALLOWLIST APLIKASI DAN TINDAKAN
# ============================================================
ALLOWED_APPS = {
    "notepad": "notepad.exe",
    "notepad.exe": "notepad.exe",
    "calc": "calc.exe",
    "calc.exe": "calc.exe",
    "calculator": "calc.exe",
    "mspaint": "mspaint.exe",
    "mspaint.exe": "mspaint.exe"
}

def is_safe_app_name(name):
    """Memvalidasi nama aplikasi terhadap daftar allowlist ketat."""
    if not name or not isinstance(name, str):
        return None
    # Blokir karakter injeksi shell
    for char in [";", "&", "|", "`", "$", "(", ")", "<", ">", "\n", "\r", "\\", "/"]:
        if char in name:
            return None
    cleaned = name.strip().lower()
    return ALLOWED_APPS.get(cleaned, None)

# ============================================================
# TANGKAPAN LAYAR WINDOWS (NATIVE FALLBACK)
# ============================================================
def capture_screen_base64():
    """
    Mengambil tangkapan layar desktop Windows.
    Menggunakan Pillow jika terpasang, atau fallback ke skrip PowerShell native.
    """
    # Coba gunakan PIL jika tersedia
    try:
        from PIL import ImageGrab
        import io
        img = ImageGrab.grab()
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=65)
        b64_str = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode('utf-8')
        return b64_str, img.width, img.height
    except ImportError:
        pass

    # Fallback ke utilitas PowerShell .NET bawaan Windows (Nol dependensi luar)
    temp_img_path = os.path.join(os.environ.get("TEMP", "."), "bursa_screen_temp.jpg")
    ps_cmd = (
        "Add-Type -AssemblyName System.Windows.Forms, System.Drawing; "
        "$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
        "$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height; "
        "$graphics = [System.Drawing.Graphics]::FromImage($bitmap); "
        "$graphics.CopyFromScreen($screen.X, $screen.Y, 0, 0, $screen.Size); "
        f"$bitmap.Save('{temp_img_path}', [System.Drawing.Imaging.ImageFormat]::Jpeg); "
        "$graphics.Dispose(); $bitmap.Dispose();"
    )
    
    try:
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd], 
                       check=True, timeout=5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(temp_img_path):
            with open(temp_img_path, "rb") as f:
                data = f.read()
            os.remove(temp_img_path)
            b64_str = "data:image/jpeg;base64," + base64.b64encode(data).decode('utf-8')
            return b64_str, 1920, 1080
    except Exception as e:
        print(f"[Host Helper] Peringatan: Gagal mengambil screenshot: {e}")
        
    return None, 0, 0

# ============================================================
# VERIFIKASI HASIL (RESULT VERIFICATION)
# ============================================================
def verify_process_running(exe_name):
    """
    Memverifikasi apakah proses aplikasi benar-benar berjalan di Windows.
    """
    try:
        output = subprocess.check_output(
            ["tasklist", "/NH", "/FI", f"IMAGENAME eq {exe_name}"],
            timeout=3,
            universal_newlines=True
        )
        return exe_name.lower() in output.lower()
    except Exception:
        return False

# ============================================================
# EKSEKUSI TINDAKAN AMAN BER-ALLOWLIST
# ============================================================
def execute_safe_action(action, params):
    """
    Mengeksekusi tindakan lokal yang diizinkan dan memvalidasi hasilnya.
    """
    print(f"[Host Helper] Menerima permintaan tindakan: {action}")
    
    if action == "take_screenshot":
        b64, w, h = capture_screen_base64()
        if b64:
            send_screenshot_to_server(b64, w, h)
            return {"success": True, "action": action, "width": w, "height": h}
        return {"success": False, "error": "Gagal mengambil tangkapan layar."}

    elif action == "open_app":
        app_param = params.get("app") or params.get("target") or ""
        valid_exe = is_safe_app_name(app_param)
        
        if not valid_exe:
            print(f"[Keamanan] Percobaan membuka aplikasi tidak diizinkan: {app_param}")
            return {"success": False, "error": f"Aplikasi '{app_param}' tidak terdaftar dalam allowlist keamanan."}
        
        # Eksekusi aplikasi
        try:
            subprocess.Popen([valid_exe], shell=False)
            time.sleep(1.0) # Beri jeda sistem operasi untuk memuat proses
            
            # Verifikasi hasil aktual
            running = verify_process_running(valid_exe)
            if running:
                print(f"[Host Helper] Verifikasi Berhasil: {valid_exe} terdeteksi berjalan aktif.")
                return {"success": True, "action": action, "app": valid_exe, "verified": True}
            else:
                return {"success": False, "action": action, "error": f"Aplikasi {valid_exe} gagal terverifikasi di daftar proses."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif action == "verify_process":
        app_param = params.get("app") or ""
        valid_exe = is_safe_app_name(app_param)
        if not valid_exe:
            return {"success": False, "error": "Nama proses tidak valid."}
        running = verify_process_running(valid_exe)
        return {"success": True, "process": valid_exe, "running": running}

    else:
        return {"success": False, "error": f"Aksi '{action}' ditolak (tidak ada dalam allowlist)."}

# ============================================================
# KOMUNIKASI SERVER
# ============================================================
def get_auth_headers():
    """Menghasilkan header HTTP dengan x-bursa-key jika terkonfigurasi."""
    headers = {'Content-Type': 'application/json'}
    if BURSA_API_KEY:
        headers['x-bursa-key'] = BURSA_API_KEY
    return headers

def send_screenshot_to_server(b64, w, h):
    """Mengirim tangkapan layar manual ke BURSA Server via REST API (Mode Legasi / Uji Mandiri)."""
    url = f"{SERVER_URL}/api/screenshot"
    payload = json.dumps({
        "image_base64": b64,
        "width": w,
        "height": h,
        "source": HELPER_ID
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=payload, headers=get_auth_headers())
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status == 200
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("[Host Helper] Permintaan ditolak (HTTP 401): Kunci akses API tidak valid atau belum disetel.")
        elif e.code == 503:
            print("[Host Helper] Server menolak permintaan (HTTP 503): Server mewajibkan autentikasi tetapi kunci belum dikonfigurasi.")
        else:
            print(f"[Host Helper] Server merespons HTTP {e.code}: {e.reason}")
        return False
    except Exception as e:
        print(f"[Host Helper] Gagal mengirim screenshot ke server: {e}")
        return False

def check_server_health():
    """Memeriksa apakah server lokal aktif."""
    try:
        with urllib.request.urlopen(f"{SERVER_URL}/api/health", timeout=3) as resp:
            data = json.loads(resp.read().decode())
            return data.get("status") == "ok"
    except Exception:
        return False

# ============================================================
# OBSERVATION QUEUE COMPANION POLLING (Tahap 3B)
# ============================================================
def fetch_next_task(timeout=5):
    """
    Mengambil tugas observasi berikutnya dari backend (GET /api/observation/next).
    Mengembalikan tuple: (task_dict, status_code, err_msg)
    - Jika ada tugas (HTTP 200): (task_dict, 200, None)
    - Jika antrean kosong / ada tugas running (HTTP 204): (None, 204, None)
    - Jika gagal / offline: (None, status_code_or_0, error_str)
    """
    url = f"{SERVER_URL}/api/observation/next"
    req = urllib.request.Request(url, headers=get_auth_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                body = response.read().decode('utf-8')
                data = json.loads(body)
                return data.get("task"), 200, None
            elif response.status == 204:
                return None, 204, None
            return None, response.status, None
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return None, 401, "Autentikasi ditolak (HTTP 401). Periksa BURSA_API_KEY."
        elif e.code == 503:
            return None, 503, "Layanan tidak tersedia (HTTP 503). Server dalam mode fail-closed."
        return None, e.code, f"Server merespons HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return None, 0, f"Koneksi gagal: {e.reason}"
    except Exception as e:
        return None, 0, f"Error tidak terduga: {str(e)}"

def check_task_status(task_id, timeout=5):
    """Memeriksa status spesifik satu tugas (GET /api/observation/tasks/:id)."""
    if not task_id:
        return None
    url = f"{SERVER_URL}/api/observation/tasks/{task_id}"
    req = urllib.request.Request(url, headers=get_auth_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                body = response.read().decode('utf-8')
                return json.loads(body)
    except Exception:
        pass
    return None

def submit_observation_result(task_id, b64, w, h, timeout=10):
    """
    Menyerahkan hasil screenshot untuk task_id tertentu ke backend.
    POST /api/observation/tasks/:id/submit
    Mengembalikan dict hasil: {"success": bool, "status": str, "error": str, ...}
    """
    if not task_id:
        return {"success": False, "error": "task_id tidak boleh kosong."}

    url = f"{SERVER_URL}/api/observation/tasks/{task_id}/submit"
    payload = json.dumps({
        "image_base64": b64,
        "width": w,
        "height": h,
        "source": HELPER_ID
    }).encode('utf-8')

    req = urllib.request.Request(url, data=payload, headers=get_auth_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                body = response.read().decode('utf-8')
                data = json.loads(body)
                return {
                    "success": True,
                    "task_id": task_id,
                    "status": data.get("status", "completed"),
                    "timestamp": data.get("timestamp")
                }
            return {"success": False, "status": f"HTTP_{response.status}", "error": "Status tidak diharapkan"}
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode('utf-8')
            err_data = json.loads(err_body)
            err_msg = err_data.get("message") or err_data.get("error") or str(e)
            task_status = err_data.get("status")
        except Exception:
            err_msg = str(e)
            task_status = None

        if e.code == 409:
            print(f"[Host Helper] Tugas {task_id} ditolak backend (HTTP 409): {err_msg}")
            return {"success": False, "rejected": True, "error": err_msg, "status": task_status or "conflict"}
        elif e.code == 404:
            print(f"[Host Helper] Tugas {task_id} tidak ditemukan di server (HTTP 404).")
            return {"success": False, "not_found": True, "error": err_msg, "status": "not_found"}
        else:
            print(f"[Host Helper] Penyerahan tugas {task_id} gagal (HTTP {e.code}): {err_msg}")
            return {"success": False, "error": err_msg, "status": f"HTTP_{e.code}"}
    except Exception as e:
        print(f"[Host Helper] Gangguan jaringan saat menyerahkan hasil: {e}")
        # Cek apakah tugas sudah sempat berstatus completed di backend sebelum koneksi terputus
        status_info = check_task_status(task_id)
        if status_info and status_info.get("status") == "completed":
            print(f"[Host Helper] Verifikasi status: Tugas {task_id} terkonfirmasi telah sukses di backend.")
            return {"success": True, "task_id": task_id, "status": "completed"}
        return {"success": False, "error": f"Koneksi terputus: {e}", "network_error": True}

def run_companion_loop(poll_interval=1.0, max_backoff=10.0, max_iterations=None, capture_func=None, on_task_handled=None):
    """
    Menjalankan loop polling adaptif Host Helper (Mode Pendamping).
    Mengambil tugas via GET /api/observation/next dan menyerahkan screenshot.
    """
    if capture_func is None:
        capture_func = capture_screen_base64

    print(f"[Host Helper] Mode Pendamping aktif.")
    print(f"[Host Helper] Melakukan polling ke: {SERVER_URL}/api/observation/next")
    print(f"[Host Helper] Jeda antrean kosong: {poll_interval}s | Backoff maks: {max_backoff}s")
    print("[Host Helper] Tekan Ctrl+C untuk menghentikan.")

    backoff = 1.0
    iteration = 0
    last_offline_log = 0

    try:
        while True:
            if max_iterations is not None and iteration >= max_iterations:
                break
            iteration += 1

            task, code, err = fetch_next_task()

            if task:
                task_id = task.get("task_id")
                timeout_ms = task.get("timeout_ms", 15000)
                print(f"\n[Host Helper] Tugas diterima: {task_id} (Batas waktu: {timeout_ms}ms)")

                # Reset backoff karena koneksi berhasil
                backoff = 1.0

                # 1. Ambil screenshot layar
                print(f"[Host Helper] Mengambil screenshot layar untuk tugas {task_id}...")
                b64, w, h = capture_func()
                if not b64:
                    print(f"[Host Helper] Gagal mengambil screenshot untuk tugas {task_id}.")
                    if on_task_handled:
                        on_task_handled(task_id, False, "capture_failed")
                    continue

                # 2. Kirim screenshot ke endpoint submit tugas spesifik
                print(f"[Host Helper] Mengirim screenshot ({w}x{h}) ke server...")
                result = submit_observation_result(task_id, b64, w, h)
                if result.get("success"):
                    print(f"[Host Helper] Sukses: Tugas {task_id} selesai dan diverifikasi oleh backend.")
                else:
                    print(f"[Host Helper] Perhatian: Tugas {task_id} gagal diselesaikan: {result.get('error')}")

                if on_task_handled:
                    on_task_handled(task_id, result.get("success", False), result)

            elif code == 204:
                # Antrean kosong atau ada tugas lain sedang running
                backoff = 1.0
                time.sleep(poll_interval)

            elif code in (401, 503):
                # Masalah autentikasi atau fail-closed
                now = time.time()
                if now - last_offline_log > 5.0:
                    print(f"[Host Helper] {err}")
                    last_offline_log = now
                time.sleep(min(backoff, 5.0))
                backoff = min(backoff * 1.5, max_backoff)

            else:
                # Server offline atau error koneksi -> terapkan backoff
                now = time.time()
                if now - last_offline_log > 5.0:
                    print(f"[Host Helper] Server belum dapat dijangkau ({err}). Mencoba kembali dalam {backoff:.1f}s...")
                    last_offline_log = now
                time.sleep(backoff)
                backoff = min(backoff * 1.5, max_backoff)

    except KeyboardInterrupt:
        print("\n[Host Helper] Sinyal penghentian (Ctrl+C) diterima. Mode pendamping dihentikan secara normal.")

if __name__ == "__main__":
    is_companion = (
        "--companion" in sys.argv or 
        "-c" in sys.argv or 
        os.environ.get("BURSA_COMPANION_MODE", "").lower() in ("1", "true")
    )

    if is_companion:
        run_companion_loop()
    else:
        # Default: Mode uji mandiri (one-shot self test)
        print("=" * 50)
        print(f"  BURSA Host Helper Minimal (ID: {HELPER_ID})")
        print("=" * 50)
        print(f"Target Server : {SERVER_URL}")
        print(f"Status Kunci   : {'Terkonfigurasi (disembunyikan)' if BURSA_API_KEY else 'Tidak disetel (Mode Tanpa Kunci)'}")
        print(f"Allowlist App : {list(ALLOWED_APPS.keys())}")
        print("-" * 50)
        
        if check_server_health():
            print("[Host Helper] Server terhubung normal.")
        else:
            print("[Host Helper] Server lokal belum aktif atau tidak dapat dijangkau.")
            
        print("[Host Helper] Mode uji mandiri: Mengambil tangkapan layar awal...")
        b64, w, h = capture_screen_base64()
        if b64:
            print(f"[Host Helper] Screenshot berhasil diambil ({w}x{h}).")
            if check_server_health():
                if send_screenshot_to_server(b64, w, h):
                    print("[Host Helper] Screenshot berhasil dikirim ke server!")
        else:
            print("[Host Helper] Gagal mengambil screenshot pada pengujian mandiri.")
