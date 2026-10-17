# BURSA Project Rules & Guidelines (Permanent)

## 1. Prinsip Utama
- **Lanjutkan, Jangan Bangun Ulang**: Proyek ini bernama BURSA (nama folder `aira` sengaja dipertahankan). Dilarang melakukan re-scaffold, rebuild from scratch, atau membuat repositori baru.
- **Audit Kondisi Aktual Sebelum Mengubah**: Selalu verifikasi kondisi aktual (source code, status jaringan, status port, dan hasil pengujian riil) sebelum mengambil kesimpulan atau menyentuh kode.
- **Baca Dokumentasi dan Tes Terkait**: Sebelum memodifikasi file apa pun, telaah file arsitektur, dokumentasi protokol, dan tes yang bersesuaian.
- **Satu Tahap & Satu Perubahan Logis**: Kerjakan satu langkah terisolasi dalam satu iterasi. Jangan mencampur aduk beberapa perbaikan dalam satu langkah.
- **Hindari Refactor yang Tidak Perlu**: Pertahankan kode yang sudah ada dan berfungsi. Perbaiki hanya bug atau gap spesifik.
- **Jangan Mengubah Kredensial & Konfigurasi Tanpa Alasan**: Dilarang mengedit `credentials.h`, `.env`, konfigurasi IP/port, atau struktur firmware tanpa bukti akar masalah yang terkonfirmasi.
- **Dilarang Klaim Berhasil Tanpa Bukti**: Status sukses hanya boleh dinyatakan jika didukung oleh log verifikasi, status command, atau respons balik aktual dari perangkat/server.
- **Dilarang Flash Perangkat Otomatis**: Tindakan kompilasi atau flashing firmware ke hardware fisik wajib melalui konfirmasi eksplisit dari pengguna.
- **Dilarang Tindakan Destruktif Git**: Dilarang menjalankan `git reset`, `git clean`, rebase, penghapusan branch/file, atau membuang perubahan lokal yang belum di-commit.
- **Laporan Konkret**: Laporkan setiap file yang disentuh dan hasil verifikasi secara jujur dan transparan.

## 2. Arsitektur Komponen
- **Hardware**: LILYGO T-Dongle-S3 (ESP32-S3, USB-A, LCD ST7735 0.96", LED APA102, Tombol BOOT/GPIO0).
- **Firmware**: PlatformIO (Arduino/C++), modul: `main.cpp`, `wifi_manager`, `ws_client`, `command_parser`, `usb_hid`, `led_manager`, `display_manager`, `button_handler`.
- **Server**: Node.js & Express (`aira/server/src/server.js`) dengan WebSocket upgrade manual, allowlist aksi ketat, dan AI Planner.
- **Host Helper Windows**: Python (`aira/host-helper/windows/host_helper.py`) untuk screenshot native fallback dan verifikasi proses allowlist lokal.
- **Web Dashboard**: React / Vite (`aira/web`).
- **Pola Desain**: Siklus Observe–Think–Act–Verify.
