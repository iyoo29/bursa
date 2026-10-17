"""
BURSA TAHAP 3B - Automated Test Suite: Host Helper Observation Polling

Pengujian unit dan isolasi untuk logika polling Host Helper Windows:
1. Header autentikasi: x-bursa-key disertakan jika BURSA_API_KEY aktif.
2. Pengambilan tugas (fetch_next_task):
   - HTTP 200: Tugas berhasil diambil dan diurai.
   - HTTP 204: Antrean kosong ditangani dengan benar (mengembalikan None).
   - HTTP 401: Penolakan autentikasi ditangani dengan aman.
   - HTTP 503: Kondisi fail-closed ditangani dengan aman.
   - URLError: Gangguan jaringan/koneksi offline ditangani dengan aman.
3. Penyerahan hasil (submit_observation_result):
   - HTTP 200: Hasil berhasil diserahkan dan diverifikasi completed.
   - HTTP 409: Penolakan tugas (timeout/dibatalkan) ditangani tanpa pengiriman ulang manual.
   - HTTP 404: Penanganan tugas tidak ditemukan.
   - Network Exception: Verifikasi status tugas sebelum memutuskan hasil.
4. Loop pendamping (run_companion_loop):
   - Siklus penerimaan tugas -> screenshot mock -> submit -> reset backoff.
   - Penanganan jeda antrean kosong (HTTP 204).
   - Penanganan backoff bertahap saat server offline.
   - Penghentian normal pada KeyboardInterrupt (Ctrl+C).
5. Keamanan: Tidak ada aksi desktop nyata, tidak ada aksi HID, dan tidak ada screenshot fisik nyata yang diambil.
"""

import unittest
from unittest.mock import patch, MagicMock
import json
import io
import urllib.error
import sys
import os

# Tambahkan path host_helper ke sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../host-helper/windows')))
import host_helper

class TestHostHelperPolling(unittest.TestCase):

    def setUp(self):
        # Simpan nilai asli konfigurasi
        self.orig_server_url = host_helper.SERVER_URL
        self.orig_api_key = host_helper.BURSA_API_KEY
        host_helper.SERVER_URL = "http://127.0.0.1:8000"

    def tearDown(self):
        host_helper.SERVER_URL = self.orig_server_url
        host_helper.BURSA_API_KEY = self.orig_api_key

    # =========================================================
    # 1. PENGUJIAN HEADER AUTENTIKASI
    # =========================================================
    def test_auth_headers_without_key(self):
        """Header hanya berisi Content-Type ketika API key kosong."""
        host_helper.BURSA_API_KEY = ""
        headers = host_helper.get_auth_headers()
        self.assertEqual(headers.get("Content-Type"), "application/json")
        self.assertNotIn("x-bursa-key", headers)

    def test_auth_headers_with_key(self):
        """Header menyertakan x-bursa-key ketika API key terkonfigurasi."""
        host_helper.BURSA_API_KEY = "super-secret-key-123"
        headers = host_helper.get_auth_headers()
        self.assertEqual(headers.get("Content-Type"), "application/json")
        self.assertEqual(headers.get("x-bursa-key"), "super-secret-key-123")

    # =========================================================
    # 2. PENGUJIAN fetch_next_task
    # =========================================================
    @patch('urllib.request.urlopen')
    def test_fetch_next_task_success(self, mock_urlopen):
        """HTTP 200: Mengembalikan data tugas observasi."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps({
            "task": {
                "task_id": "obs-test-001",
                "timeout_ms": 15000
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        task, code, err = host_helper.fetch_next_task()
        self.assertEqual(code, 200)
        self.assertIsNone(err)
        self.assertIsNotNone(task)
        self.assertEqual(task["task_id"], "obs-test-001")
        self.assertEqual(task["timeout_ms"], 15000)

    @patch('urllib.request.urlopen')
    def test_fetch_next_task_empty_queue(self, mock_urlopen):
        """HTTP 204: Antrean kosong mengembalikan (None, 204, None)."""
        mock_resp = MagicMock()
        mock_resp.status = 204
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        task, code, err = host_helper.fetch_next_task()
        self.assertIsNone(task)
        self.assertEqual(code, 204)
        self.assertIsNone(err)

    @patch('urllib.request.urlopen')
    def test_fetch_next_task_auth_error(self, mock_urlopen):
        """HTTP 401: Penolakan otentikasi ditangani dengan benar."""
        err = urllib.error.HTTPError("http://127.0.0.1:8000/api/observation/next", 401, "Unauthorized", {}, None)
        mock_urlopen.side_effect = err

        task, code, err_msg = host_helper.fetch_next_task()
        self.assertIsNone(task)
        self.assertEqual(code, 401)
        self.assertIn("Autentikasi ditolak", err_msg)

    @patch('urllib.request.urlopen')
    def test_fetch_next_task_fail_closed(self, mock_urlopen):
        """HTTP 503: Penolakan mode fail-closed ditangani dengan benar."""
        err = urllib.error.HTTPError("http://127.0.0.1:8000/api/observation/next", 503, "Service Unavailable", {}, None)
        mock_urlopen.side_effect = err

        task, code, err_msg = host_helper.fetch_next_task()
        self.assertIsNone(task)
        self.assertEqual(code, 503)
        self.assertIn("fail-closed", err_msg)

    @patch('urllib.request.urlopen')
    def test_fetch_next_task_connection_offline(self, mock_urlopen):
        """URLError: Server tidak dapat dijangkau ditangani tanpa crash."""
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        task, code, err_msg = host_helper.fetch_next_task()
        self.assertIsNone(task)
        self.assertEqual(code, 0)
        self.assertIn("Koneksi gagal", err_msg)

    # =========================================================
    # 3. PENGUJIAN submit_observation_result
    # =========================================================
    @patch('urllib.request.urlopen')
    def test_submit_result_success(self, mock_urlopen):
        """HTTP 200: Screenshot berhasil diserahkan dan status completed."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps({
            "success": True,
            "task_id": "obs-test-001",
            "status": "completed",
            "timestamp": "2026-10-16T12:00:00.000Z"
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        res = host_helper.submit_observation_result("obs-test-001", "data:image/jpeg;base64,...", 1920, 1080)
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("status"), "completed")
        self.assertEqual(res.get("task_id"), "obs-test-001")

    @patch('urllib.request.urlopen')
    def test_submit_result_task_not_running_409(self, mock_urlopen):
        """HTTP 409: Tugas sudah timeout atau dibatalkan ditangani dengan anggun."""
        fp = io.BytesIO(json.dumps({
            "error": "TASK_NOT_RUNNING",
            "message": "Tugas tidak dalam status running (status saat ini: failed).",
            "status": "failed"
        }).encode('utf-8'))
        err = urllib.error.HTTPError("http://127.0.0.1:8000/api/observation/tasks/obs-001/submit", 409, "Conflict", {}, fp)
        mock_urlopen.side_effect = err

        res = host_helper.submit_observation_result("obs-001", "data:image/jpeg;base64,...", 1920, 1080)
        self.assertFalse(res.get("success"))
        self.assertTrue(res.get("rejected"))
        self.assertEqual(res.get("status"), "failed")

    @patch('urllib.request.urlopen')
    def test_submit_result_task_not_found_404(self, mock_urlopen):
        """HTTP 404: Tugas tidak ditemukan di server."""
        fp = io.BytesIO(json.dumps({
            "error": "TASK_NOT_FOUND",
            "message": "Tugas observasi tidak ditemukan."
        }).encode('utf-8'))
        err = urllib.error.HTTPError("http://127.0.0.1:8000/api/observation/tasks/obs-notfound/submit", 404, "Not Found", {}, fp)
        mock_urlopen.side_effect = err

        res = host_helper.submit_observation_result("obs-notfound", "data:image/jpeg;base64,...", 1920, 1080)
        self.assertFalse(res.get("success"))
        self.assertTrue(res.get("not_found"))

    @patch('host_helper.check_task_status')
    @patch('urllib.request.urlopen')
    def test_submit_network_drop_recovers_if_completed(self, mock_urlopen, mock_check_status):
        """Jika submit terputus di tengah jalan tetapi backend ternyata sudah completed, terverifikasi sukses."""
        mock_urlopen.side_effect = Exception("Connection reset by peer")
        mock_check_status.return_value = {
            "task_id": "obs-drop-001",
            "status": "completed"
        }

        res = host_helper.submit_observation_result("obs-drop-001", "data:image/jpeg;base64,...", 1920, 1080)
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("status"), "completed")

    # =========================================================
    # 4. PENGUJIAN run_companion_loop
    # =========================================================
    @patch('time.sleep')
    @patch('host_helper.submit_observation_result')
    @patch('host_helper.fetch_next_task')
    def test_companion_loop_iteration(self, mock_fetch, mock_submit, mock_sleep):
        """Memverifikasi siklus: ambil tugas -> screenshot mock -> submit -> jeda 204."""
        # Iterasi 1: dapat tugas
        # Iterasi 2: antrean kosong (204)
        mock_fetch.side_effect = [
            ({"task_id": "obs-loop-1", "timeout_ms": 10000}, 200, None),
            (None, 204, None)
        ]
        mock_submit.return_value = {"success": True, "task_id": "obs-loop-1", "status": "completed"}

        mock_capture = MagicMock(return_value=("data:image/jpeg;base64,mockdata", 1920, 1080))
        handled_tasks = []

        def on_task_handled(task_id, success, details):
            handled_tasks.append((task_id, success))

        host_helper.run_companion_loop(
            poll_interval=0.5,
            max_backoff=5.0,
            max_iterations=2,
            capture_func=mock_capture,
            on_task_handled=on_task_handled
        )

        # Verifikasi
        self.assertEqual(mock_capture.call_count, 1)
        mock_submit.assert_called_once_with("obs-loop-1", "data:image/jpeg;base64,mockdata", 1920, 1080)
        self.assertEqual(handled_tasks, [("obs-loop-1", True)])
        # Verifikasi jeda saat 204
        mock_sleep.assert_called_with(0.5)

    @patch('time.sleep')
    @patch('host_helper.fetch_next_task')
    def test_companion_loop_offline_backoff(self, mock_fetch, mock_sleep):
        """Memverifikasi penerapan backoff saat server offline."""
        mock_fetch.return_value = (None, 0, "Connection refused")

        host_helper.run_companion_loop(
            poll_interval=0.5,
            max_backoff=4.0,
            max_iterations=3,
            capture_func=lambda: ("mock", 1, 1)
        )

        # Harus memanggil sleep dengan nilai backoff yang bertambah (1.0, 1.5, ...)
        self.assertEqual(mock_sleep.call_count, 3)
        calls = [c[0][0] for c in mock_sleep.call_args_list]
        self.assertAlmostEqual(calls[0], 1.0)
        self.assertAlmostEqual(calls[1], 1.5)

    @patch('host_helper.fetch_next_task')
    def test_companion_loop_keyboard_interrupt(self, mock_fetch):
        """Memverifikasi bahwa KeyboardInterrupt (Ctrl+C) ditangani secara anggun."""
        mock_fetch.side_effect = KeyboardInterrupt()

        # Tidak boleh melempar unhandled exception
        try:
            host_helper.run_companion_loop(max_iterations=1)
            interrupted_cleanly = True
        except Exception:
            interrupted_cleanly = False

        self.assertTrue(interrupted_cleanly)


if __name__ == '__main__':
    print("===============================================================")
    print("  UJI OTOMATIS: HOST HELPER OBSERVATION POLLING (TAHAP 3B)")
    print("===============================================================\n")
    unittest.main(verbosity=2)
