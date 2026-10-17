# BURSA Project Status & Architecture Snapshot

Dokumen ini menyediakan konteks arsitektur, status komponen aktual, dan catatan kontinuitas untuk sesi pengembangan berikutnya.

---

## 1. Arsitektur dan Lokasi Komponen

Pola Arsitektur: **Observe – Think – Act – Verify**

| Komponen | Lokasi | Teknologi | Peran |
|---|---|---|---|
| **Firmware Dongle** | `aira/firmware/t-dongle-s3/` | C++ / Arduino / PlatformIO | USB HID (Keyboard/Mouse), Display LCD ST7735, LED APA102, Tombol Emergency Stop, WebSocket Client |
| **Server Pusat** | `aira/server/` | Node.js / Express / `ws` | API Gateway REST, WebSocket Hub, Keamanan (Allowlist, Handshake Auth), AI Planner Orchestration |
| **Windows Host Helper** | `aira/host-helper/windows/` | Python 3 | Tangkapan layar desktop (Pillow / .NET fallback), Verifikasi proses allowlist lokal (`notepad.exe`, `calc.exe`, dsb.) |
| **Web Dashboard** | `aira/web/` | React / Vite / CSS Vanilla Glassmorphism | Antarmuka pengguna visual, pemantau perangkat, input prompt AI, review rencana aksi, persetujuan eksekusi |
| **Rangkaian Pengujian** | `aira/tests/` | Node.js scripts | Simulasi sistem, autentikasi WebSocket, alur End-to-End, integrasi AI provider, dan workflow UI |

---

## 2. Status Komponen Proyek

| Komponen / Fitur | Status | Bukti / Catatan |
|---|---|---|
| **Layar ST7735 (0.96" 160x80)** | `REPORTED` | Dilaporkan menyala normal (Pin BL 38 Active LOW telah disesuaikan). Menunggu verifikasi fisik langsung di sesi ini. |
| **LED RGB APA102** | `REPORTED` | Dilaporkan berfungsi (driver native APA102 di `led_manager.cpp`, indikator boot/idle/emergency). |
| **USB Composite Mode (CDC + HID)** | `REPORTED` | Dikonfigurasi dengan `ARDUINO_USB_MODE=0` dan `ARDUINO_USB_CDC_ON_BOOT=1`. |
| **Emergency Stop Fisik (BOOT/GPIO0)** | `REPORTED` | Handler interrupt tombol BOOT ada di `button_handler.cpp` dan `main.cpp` (rilis HID + kirim status WS). |
| **Koneksi Wi-Fi Dongle** | `REPORTED` | Implementasi `wifi_manager.cpp` menggunakan WiFi STA dan NVS / konfigurasi compile-time. |
| **Koneksi WebSocket Dongle -> Server** | `LAN_ACCESS_VERIFIED` | Server mendengarkan pada `0.0.0.0:8000`. Akses LAN via `http://192.168.100.9:8000/api/ai/config` terbukti berhasil dibuka dari HP setelah aturan jaringan dipercaya di Avast Firewall. Menunggu koneksi fisik dari dongle T-Dongle S3. |
| **Server REST API & WS Handshake** | `VERIFIED` (Berjalan) | Aktif berjalan pada PID 23848 (`0.0.0.0:8000`). Terverifikasi lulus 16/16 uji autentikasi WebSocket dan merespons REST API lokal serta LAN HP. |
| **AI Planner & Double Validation** | `VERIFIED` (Codebase) | `aira/server/agent/planner.js` dan `validator.js` mengimplementasikan pembuatan langkah terstruktur dan validasi allowlist. |
| **Windows Host Helper** | `VERIFIED` (Uji Mandiri Sukses) | Berhasil mengeksekusi satu tangkapan layar desktop 1920x1080 via skrip native Windows dan mengunggahnya ke `/api/screenshot` (Sumber: `host-helper-IYOO`). |
| **Web Dashboard React** | `VERIFIED` (Berjalan) | Aktif berjalan pada PID 14588 via Vite (`0.0.0.0:5173`). Terverifikasi HTTP 200 di laptop (`http://localhost:5173/`) dan siap diakses via Wi-Fi (`http://192.168.100.9:5173/`). |
| **Pengujian E2E & Simulasi** | `VERIFIED` | Pengujian autentikasi WebSocket (`test_websocket_auth.js`) dan simulasi sistem (`test_system_simulation.js`) lulus 100%. |

---

## 3. Hasil Pengujian Bind Server & Analisis Firewall Aktual

### A. Perbaikan Bind Address Server (`HOST`) — SELESAI & DIVERIFIKASI
- **Perubahan**: Fallback `HOST` pada `aira/server/src/server.js` telah disesuaikan dari `127.0.0.1` ke `0.0.0.0`, dan fungsi `isAllowedOrigin()` diperluas untuk mengizinkan subnet lokal privat (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
- **Status Socket**: `netstat -ano | findstr :8000` mengonfirmasi:
  `TCP 0.0.0.0:8000 0.0.0.0:0 LISTENING (PID 23848)`
- **Uji Loopback**: `Test-NetConnection 127.0.0.1:8000` menghasilkan `TcpTestSucceeded : True`. Endpoint REST `http://127.0.0.1:8000/api/ai/config` merespons sukses dengan konfigurasi JSON.

### B. Catatan Pengujian Interface LAN & Perilaku Self-Hairpinning
1. **Status Socket & Loopback**: Server terkonfirmasi stabil pada `0.0.0.0:8000` (PID 23848). Loopback `127.0.0.1:8000` merespons sukses (HTTP 200).
2. **Uji Koneksi Intra-Host ke IP Sendiri (192.168.100.9)**:
   - `Test-NetConnection -ComputerName 192.168.100.9 -Port 8000` masih menghasilkan `TcpTestSucceeded : False` dan `Ping failed with status: 11050`.
   - **Catatan Teknis Arsitektur Jaringan**: Pada Windows dengan filter NDIS/Firewall aktif, pengujian intra-host yang menargetkan IP antarmuka Wi-Fi sendiri sering kali ditolak pada level driver internal (*hairpinning / loopback restriction*). Hal ini bukan bukti pasti bahwa aturan Avast gagal untuk perangkat luar.
3. **Pengujian Penentu yang Valid**:
   - Pengujian keterjangkauan port `8000` yang valid harus dilakukan dari **perangkat lain di jaringan Wi-Fi yang sama** (misalnya smartphone yang tersambung ke SSID `Laskar Gerindra` dengan membuka browser ke `http://192.168.100.9:8000/api/ai/config`, atau dongle T-Dongle S3 langsung).
4. **Status Dongle Fisik**: Belum ada koneksi dari dongle fisik yang terdeteksi di log server (`task-148.log`). Dongle berstatus `NOT CONNECTED`.

---

## 4. Parameter Jaringan Aktual (Read-Only)

- **Laptop Wi-Fi IPv4**: `192.168.100.9` (Subnet: `255.255.255.0`, Gateway: `192.168.100.1`)
- **Port Target Server**: `8000`
- **Port Serial Terdeteksi**: `COM3`, `COM4` (catatan: `platformio.ini` sebelumnya diset ke `COM5`, perlu verifikasi port dongle aktual saat pengujian fisik).

---

## 5. Hal-Hal yang DILARANG Diubah Tanpa Izin

1. Dilarang mengubah file kredensial `credentials.h` atau membocorkannya ke log/dokumen.
2. Dilarang melakukan reset, clean, atau destructive operations pada Git repository.
3. Dilarang mematikan Windows Defender atau antivirus Avast.
4. Dilarang mengubah konfigurasi sistem operasi/registry secara otomatis.
5. Dilarang melakukan flash firmware ke dongle tanpa konfirmasi pengguna.
