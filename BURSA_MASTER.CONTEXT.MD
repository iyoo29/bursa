# MASTER CONTEXT BURSA
## Visi Proyek, Arsitektur, Progres, dan Titik Terakhir Pengembangan

## 1. TUJUAN DOKUMEN

Dokumen ini menjadi sumber konteks utama untuk memahami proyek BURSA sebelum melakukan pekerjaan apa pun.

AI yang menerima dokumen ini harus memahami:
- Apa itu BURSA dan tujuan akhirnya.
- Bagaimana cara kerja BURSA yang diinginkan.
- Arsitektur dan teknologi yang direncanakan.
- Komponen yang sudah dilaporkan dibuat atau diuji.
- Bagian yang belum selesai atau belum terverifikasi.
- Titik terakhir pengembangan sebelum proyek dijeda.
- Cara melanjutkan proyek nanti tanpa mengulang pekerjaan yang sudah selesai.

**PENTING: Untuk saat ini, tugasmu hanya memahami proyek. Jangan langsung mengerjakan, memeriksa repository, menjalankan perintah, mengubah kode, menginstal sesuatu, atau melakukan pengujian.**

---

## 2. APA ITU BURSA?

BURSA adalah proyek pengembangan agen AI yang dirancang untuk membantu mengoperasikan komputer secara kontekstual melalui perangkat fisik USB HID.

BURSA bukan sekadar chatbot, macro otomatis, atau program yang menjalankan urutan klik secara kaku.

Tujuan utamanya adalah membangun agen AI yang mampu:

1. Memahami tujuan yang diberikan pengguna.
2. Mengamati kondisi komputer melalui informasi visual, seperti screenshot.
3. Memahami konteks aplikasi dan keadaan layar.
4. Menentukan langkah yang sesuai berdasarkan kondisi aktual.
5. Menjalankan tindakan melalui perangkat USB HID.
6. Mengamati kembali hasil tindakan tersebut.
7. Memastikan apakah tindakan berhasil.
8. Mengenali kesalahan atau perubahan kondisi yang tidak sesuai harapan.
9. Menyesuaikan langkah berikutnya ketika terjadi kegagalan.
10. Melanjutkan pekerjaan berdasarkan konteks dan hasil sebelumnya.

Contoh: pengguna meminta BURSA membuka aplikasi, mencari dokumen, lalu melakukan tindakan tertentu. BURSA seharusnya tidak hanya menekan tombol berdasarkan koordinat tetap. BURSA perlu mengamati layar, menentukan tindakan berdasarkan kondisi aktual, menjalankannya, lalu memeriksa apakah hasilnya sesuai dengan tujuan.

Itulah kemampuan yang ingin dikembangkan secara bertahap.

## 3. VISI AKHIR PROYEK

Visi jangka panjang BURSA adalah menjadi agen AI portabel yang dapat digunakan pada berbagai laptop atau PC yang kompatibel.

Pengguna cukup menghubungkan perangkat BURSA ke komputer. Pemrosesan AI utama dilakukan melalui layanan cloud atau VPS, sedangkan perangkat fisik menjadi jalur eksekusi input komputer melalui USB HID.

Prinsip yang diinginkan:

- Tidak perlu menginstal model AI berukuran besar di setiap komputer target.
- Tidak bergantung pada penggunaan ponsel sebagai pusat kendali.
- Mengutamakan perangkat fisik USB HID untuk mengirim input keyboard dan mouse.
- Menggunakan AI berbasis cloud agar pemrosesan dapat dilakukan secara terpusat.
- Mengusahakan kebutuhan instalasi lokal seminimal mungkin.
- Memungkinkan agen memahami konteks, memverifikasi hasil, dan beradaptasi ketika terjadi kesalahan.
- Mengembangkan sistem secara bertahap berdasarkan hasil pengujian nyata.

Perlu dipahami bahwa USB HID saja tidak cukup untuk membuat AI mengetahui isi layar. Sistem tetap membutuhkan mekanisme observasi, pemrosesan AI, komunikasi, dan pengendalian alur kerja.

Apabila Host Helper masih dibutuhkan untuk mengambil screenshot atau menyediakan informasi komputer, kebutuhan tersebut harus dievaluasi secara jujur. Jangan mengklaim bahwa BURSA sudah sepenuhnya berjalan tanpa program pendamping di komputer sebelum kemampuan tersebut benar-benar terbukti.

---

## 4. ARSITEKTUR AI YANG DIINGINKAN

Rencana arsitektur yang ingin dikembangkan adalah menggunakan:

- **VPS:** tempat layanan utama berjalan secara terpusat.
- **Hermes Agent:** agen untuk membantu mengelola alur kerja, konteks, penggunaan tools, dan orkestrasi.
- **9Router:** lapisan akses atau perutean ke model AI yang kompatibel.
- **Model AI/LLM:** melakukan analisis dan penalaran sesuai kemampuan model yang dipilih.
- **BURSA Backend:** mengelola komunikasi, kontrol alur, keamanan, dan koordinasi komponen.
- **Planner dan Validator:** membantu menentukan tindakan serta memeriksa apakah tindakan layak dan sesuai hasil yang diharapkan.
- **Host Helper:** komponen lokal yang secara historis direncanakan untuk membantu observasi layar dan interaksi dengan komputer.
- **Perangkat USB HID:** mengeksekusi input keyboard dan mouse.
- **Dashboard:** antarmuka untuk berinteraksi dengan sistem dan memantau prosesnya.

**Catatan penting:** Hermes Agent, 9Router, dan VPS merupakan bagian dari arsitektur yang diinginkan. Jangan menganggap ketiganya sudah terpasang, terhubung, atau berfungsi dalam proyek saat ini. Status implementasinya perlu diperiksa ketika pengguna meminta pekerjaan dilanjutkan.

### 4.1 Alur kerja yang diharapkan

Secara konseptual, alurnya adalah:

1. Pengguna memberikan instruksi kepada BURSA.
2. Sistem mendapatkan konteks komputer, termasuk screenshot jika diperlukan.
3. Informasi tersebut diteruskan ke komponen AI melalui jalur komunikasi yang sesuai.
4. Hermes Agent dan model AI membantu memahami tujuan serta menentukan langkah.
5. 9Router digunakan untuk mengakses atau memilih model yang kompatibel sesuai konfigurasi.
6. Planner menyusun tindakan yang diperlukan.
7. Validator dan mekanisme keamanan memeriksa tindakan sebelum dieksekusi.
8. Perintah diteruskan ke jalur eksekusi USB HID.
9. Perangkat mengirim input keyboard atau mouse.
10. Sistem mengamati kembali kondisi komputer.
11. Validator mengevaluasi hasil tindakan.
12. Jika gagal, agen menganalisis keadaan baru dan menentukan langkah koreksi yang sesuai.
13. Proses berlanjut sampai tujuan tercapai, dibatalkan, atau dihentikan dengan aman.

Ini adalah alur konseptual, bukan pernyataan bahwa seluruh rangkaian tersebut sudah terimplementasi.

### 4.2 Perbedaan fungsi setiap komponen

**LLM atau model AI**

Model yang melakukan pemrosesan bahasa, analisis, dan penalaran. Kemampuan memahami gambar atau screenshot bergantung pada dukungan model yang digunakan.

**Hermes Agent**

Lapisan agen yang membantu mengelola tugas, konteks, tools, dan orkestrasi. Hermes tidak otomatis menggantikan semua komponen khusus yang diperlukan BURSA.

**9Router**

Lapisan akses atau routing untuk model AI yang kompatibel. Dukungan model, autentikasi, format API, biaya, dan batas penggunaan harus diperiksa berdasarkan konfigurasi aktual.

**VPS**

Server jarak jauh untuk menjalankan layanan yang memang dibutuhkan secara terpusat. VPS bukan model AI dan tidak otomatis membuat semua kemampuan sistem tersedia.

**BURSA**

Sistem utama yang mengintegrasikan observasi, perencanaan, keamanan, eksekusi, verifikasi, dan pemulihan kesalahan.

**USB HID**

Jalur input fisik yang memungkinkan perangkat bertindak seperti keyboard atau mouse. USB HID tidak dengan sendirinya memahami konteks layar atau menentukan tindakan cerdas.

---

## 5. MODEL AI DAN PERTIMBANGAN BIAYA

Pengguna ingin mengusahakan pemakaian model AI gratis jika tersedia dan sesuai kebutuhan.

Namun, jangan berasumsi semua model gratis memiliki kemampuan yang sama. Periksa hal-hal berikut ketika tahap integrasi AI dimulai:

- Apakah model mendukung input yang dibutuhkan, termasuk gambar jika diperlukan.
- Apakah model mendukung format API yang digunakan.
- Apakah model tersedia melalui 9Router.
- Apakah tersedia kuota gratis dan apa batasannya.
- Apakah latensi dan kualitas respons memadai.
- Apakah hasil model dapat diproses secara aman oleh sistem.
- Apakah layanan memerlukan biaya tambahan.
- Apakah biaya VPS tetap diperlukan meskipun model AI gratis.

Jangan menyatakan bahwa BURSA sudah menggunakan model AI sungguhan hanya karena struktur provider atau koneksi WebSocket sudah tersedia. Integrasi harus dibuktikan melalui pengujian yang sesuai.

---

## 6. TEKNOLOGI DAN KOMPONEN PROYEK

Berdasarkan laporan pengembangan terdahulu, teknologi yang digunakan atau direncanakan meliputi:

### 6.1 Firmware perangkat

- Perangkat: LILYGO T-Dongle-S3 berbasis ESP32-S3.
- Bahasa: C++ dengan Arduino dan PlatformIO.
- Fungsi yang pernah dilaporkan dikembangkan: USB HID keyboard/mouse, LCD, LED, Wi-Fi, WebSocket client, dan tombol BOOT untuk emergency stop.

Keberadaan kode tidak otomatis membuktikan seluruh fungsi bekerja secara fisik. Status setiap fungsi harus mengikuti bukti pengujian terbaru.

### 6.2 Backend

- Node.js.
- Express.
- WebSocket.
- Komponen untuk koordinasi tindakan AI, validasi, dan keamanan.

### 6.3 Host Helper

- Python.
- Direncanakan membantu pengambilan screenshot dan interaksi tertentu dengan komputer host.

### 6.4 Dashboard

- React.
- Vite.

### 6.5 Integrasi AI

- Kerangka provider bergaya OpenAI-compatible pernah dilaporkan tersedia.
- Pada audit integrasi AI sebelumnya, provider masih menggunakan mode `mock`.
- Integrasi provider AI sungguhan belum terbukti berhasil berdasarkan laporan audit tersebut.
- Adapter native untuk Gemini atau Claude dilaporkan belum tersedia pada audit yang sama.
- Rencana integrasi Hermes Agent, 9Router, dan VPS belum boleh dianggap selesai tanpa bukti terbaru.

### 6.6 Repository

Repository sebelumnya dilaporkan menggunakan nama `aira` dan branch `master`.

Informasi ini bersifat historis. Ketika pekerjaan dilanjutkan, periksa keadaan aktual terlebih dahulu. Jangan menganggap nama folder, branch, status Git, atau struktur file masih sama.

**Dilarang melakukan reset, menghapus perubahan, mengganti struktur proyek, atau menimpa file tanpa izin eksplisit pengguna.**

---

## 7. PROGRES PENGEMBANGAN YANG PERNAH DILAPORKAN

Bagian ini merupakan catatan berdasarkan audit dan percakapan terdahulu, bukan hasil pemeriksaan repository saat ini.

### 7.1 Bagian yang pernah dilaporkan tersedia

- Struktur proyek dan dokumentasi dasar.
- Dokumentasi arsitektur dan protokol komunikasi.
- Konfigurasi awal Docker Compose dan Git ignore.
- Firmware untuk beberapa fungsi perangkat.
- Backend dengan komunikasi WebSocket.
- Struktur komponen keamanan dan validasi.
- Dashboard berbasis React/Vite.
- Host Helper berbasis Python.
- Jalur pengiriman screenshot dari Dashboard melalui Backend menuju Host Helper pernah dilaporkan berhasil diuji secara end-to-end.

Walaupun fitur atau struktur tersebut pernah dilaporkan tersedia, AI yang melanjutkan proyek tetap perlu menggunakan hasil audit terbaru apabila pengguna telah memintanya. Jangan mengulang pekerjaan yang sudah terbukti selesai.

### 7.2 Temuan audit sebelumnya yang masih perlu diperhatikan

Audit terdahulu pernah mencatat beberapa hal berikut:

1. Integrasi AI masih menggunakan provider `mock`.
2. Framework provider bergaya OpenAI-compatible sudah tersedia, tetapi pemanggilan provider sungguhan belum teruji.
3. Dukungan adapter native untuk Gemini/Claude belum tersedia pada audit tersebut.
4. Mekanisme pembatalan eksekusi batch dilaporkan belum tersedia.
5. Normalisasi koordinat lintas resolusi layar dilaporkan belum selesai.
6. Fungsi fisik perangkat HID perlu dibedakan antara implementasi kode dan hasil pengujian nyata.

Semua temuan ini harus diperlakukan sebagai **temuan historis yang perlu diverifikasi**, bukan fakta mutakhir yang sudah pasti.

---

## 8. TITIK TERAKHIR PENGEMBANGAN

Bagian ini penting agar pekerjaan dapat dilanjutkan nanti tanpa mengulang tahap sebelumnya.

### 8.1 Status terakhir yang diketahui

BURSA sedang dijeda pada milestone **pengujian fisik USB HID**.

Artinya, milestone tersebut merupakan titik pengembangan yang sedang dituju atau dijadikan patokan ketika proyek dijeda. Ini tidak berarti seluruh pengujian fisik HID sudah selesai atau dinyatakan berhasil.

Selain itu, laporan audit integrasi AI yang bersifat read-only telah diterima.

### 8.2 Langkah berikutnya yang terakhir direncanakan

Langkah berikutnya yang sudah direncanakan adalah:

**Menjalankan prompt read-only di Antigravity untuk memeriksa konfigurasi provider AI yang ada secara lokal.**

Tujuan pemeriksaan tersebut adalah mengetahui kondisi konfigurasi aktual sebelum menentukan langkah integrasi selanjutnya.

Status langkah tersebut pada catatan terakhir:

- Prompt pemeriksaan konfigurasi belum diberikan kepada Antigravity.
- Belum ada perubahan kode yang dilakukan melalui prompt tersebut.
- Belum ada pemanggilan API provider AI yang dilakukan melalui prompt tersebut.
- Belum ada hasil pemeriksaan baru yang boleh diasumsikan tersedia.

Karena itu, ketika pengguna nanti ingin melanjutkan pengembangan, gunakan titik ini sebagai checkpoint awal—kecuali pengguna memberikan informasi yang lebih baru.

### 8.3 Urutan melanjutkan proyek

Ketika pengguna secara eksplisit meminta untuk mulai bekerja:

1. Baca kembali dokumen master ini.
2. Minta atau gunakan status terbaru yang tersedia.
3. Periksa repository dan status Git sebelum melakukan perubahan, jika akses tersedia dan pengguna mengizinkan pemeriksaan.
4. Bandingkan kondisi aktual dengan checkpoint terakhir di atas.
5. Jika pemeriksaan konfigurasi provider belum dilakukan, lakukan pemeriksaan read-only terlebih dahulu.
6. Jika pemeriksaan tersebut ternyata sudah dilakukan, jangan mengulangnya; gunakan hasil terbaru untuk menentukan langkah berikutnya.
7. Evaluasi kembali status pengujian fisik USB HID.
8. Pilih satu langkah kecil berikutnya berdasarkan bukti yang tersedia.
9. Jelaskan tujuan dan dampak langkah tersebut sebelum melakukan perubahan.
10. Lakukan perubahan hanya setelah memperoleh izin pengguna jika perubahan tersebut belum diizinkan.

Jangan langsung melompat ke integrasi Hermes Agent, 9Router, atau VPS sebelum memahami keadaan aktual proyek dan menyelesaikan prasyarat yang relevan.

---

## 9. PRINSIP PENGEMBANGAN YANG WAJIB DIIKUTI

Pengembangan BURSA harus mengikuti prinsip berikut:

### 9.1 Jangan mengulang pekerjaan

- Jangan membuat ulang proyek dari awal.
- Jangan menghapus atau mengganti struktur yang masih digunakan.
- Jangan mengulang instalasi dan konfigurasi yang sudah terbukti selesai.
- Jangan meminta pengguna mengulangi informasi yang sudah tercatat tanpa alasan.
- Gunakan audit dan hasil pengujian sebelumnya sebagai bukti awal, lalu cocokkan dengan keadaan terbaru.

### 9.2 Kerjakan secara bertahap

- Satu langkah kecil pada satu waktu.
- Satu variabel atau perubahan utama pada satu waktu jika memungkinkan.
- Jelaskan alasan teknis dari setiap langkah.
- Hindari perubahan banyak file sekaligus ketika sumber masalah belum diketahui.
- Jangan menambahkan komponen perangkat keras atau perangkat lunak tanpa kebutuhan yang jelas.

### 9.3 Gunakan bukti, bukan asumsi

Bedakan secara jelas antara:
- Sudah direncanakan.
- Sudah dibuat.
- Sudah berhasil dibangun atau dikompilasi.
- Sudah berhasil dijalankan.
- Sudah berhasil diuji secara fisik.
- Sudah terbukti bekerja end-to-end.

Jangan menyebut fitur selesai hanya karena kode sudah ditulis atau tidak ada error saat build.

### 9.4 Izin sebelum tindakan yang berisiko

Tanpa izin eksplisit pengguna, jangan:

- Mengubah atau menghapus source code.
- Menginstal dependensi atau aplikasi.
- Menjalankan migrasi yang mengubah data.
- Menghubungkan layanan berbayar atau menggunakan API berbiaya.
- Mengubah konfigurasi VPS atau layanan cloud.
- Melakukan flashing firmware.
- Menjalankan tindakan HID yang dapat mengubah komputer.
- Menghapus data, mereset repository, atau menimpa perubahan yang ada.

Pemeriksaan read-only dapat dilakukan ketika pengguna meminta pengembangan dimulai dan memberikan akses yang diperlukan. Namun, pada tahap awal membaca dokumen ini, jangan melakukan pemeriksaan tersebut.

### 9.5 Jangan mengklaim kemampuan yang belum terbukti

Jangan menyatakan BURSA sudah mampu memahami semua aplikasi, memperbaiki setiap kesalahan secara otomatis, berjalan tanpa Host Helper, atau bekerja pada semua komputer.

Semua kemampuan tersebut merupakan target pengembangan yang harus diuji satu per satu.

---

## 10. TARGET PENGEMBANGAN JANGKA PANJANG

Tahapan berikut merupakan arah pengembangan, bukan daftar fitur yang sudah selesai.

1. Memastikan perangkat USB HID berfungsi secara fisik dengan aman.
2. Memastikan komunikasi antara perangkat dan komponen sistem bekerja sesuai protokol.
3. Memastikan screenshot dan konteks komputer dapat diperoleh secara andal.
4. Memastikan tindakan yang direncanakan dapat divalidasi sebelum eksekusi.
5. Memastikan hasil tindakan dapat diamati dan diverifikasi.
6. Mengintegrasikan provider AI sungguhan dengan konfigurasi yang benar.
7. Mengevaluasi penggunaan Hermes Agent dan 9Router melalui VPS.
8. Mengembangkan kemampuan mempertahankan konteks tugas dan merencanakan beberapa langkah.
9. Mengembangkan mekanisme pemulihan ketika tindakan gagal.
10. Menguji koordinat, resolusi layar, batas keamanan, timeout, pembatalan, dan penanganan kesalahan.
11. Mengurangi ketergantungan pada komponen lokal jika secara teknis memungkinkan.
12. Menguji sistem end-to-end berdasarkan skenario penggunaan nyata.

Urutan akhir dapat berubah setelah audit aktual. Jangan menganggap semua tahap harus diselesaikan persis dalam urutan ini apabila bukti teknis menunjukkan urutan yang lebih tepat.

---

## 11. BAGAIMANA AI HARUS MEMAHAMI DAN MENJELASKAN BURSA

Setelah membaca dokumen ini, kamu harus memahami bahwa BURSA adalah proyek agen AI berbasis komputer dengan eksekusi melalui USB HID dan pemrosesan AI yang direncanakan menggunakan layanan cloud/VPS.

Kamu juga harus memahami perbedaan antara visi akhir, arsitektur yang direncanakan, implementasi yang pernah dilaporkan, serta pekerjaan yang belum terverifikasi.

Jangan menyederhanakan tujuan BURSA menjadi sekadar macro keyboard/mouse atau chatbot.

Jangan pula menganggap penggunaan Hermes Agent dan 9Router otomatis menyelesaikan kebutuhan observasi layar, keamanan, validasi tindakan, eksekusi HID, dan verifikasi hasil. BURSA tetap membutuhkan integrasi yang sesuai untuk semua bagian tersebut.

Jika terdapat kelemahan arsitektur, sampaikan dengan jujur dan berikan alasan teknis. Jangan sekadar menyetujui semua asumsi pengguna, tetapi jangan mengganti visi utama proyek tanpa menjelaskan alasan dan meminta persetujuan.

---

## 12. INSTRUKSI UNTUK AI PENERIMA DOKUMEN

**Untuk saat ini, JANGAN MULAI MENGERJAKAN PROYEK.**

Saya memberikan dokumen ini agar kamu memahami proyek BURSA dan dapat melanjutkannya nanti berdasarkan titik terakhir pengembangan.

Tugasmu sekarang hanya:

1. Membaca dan memahami seluruh dokumen.
2. Menjelaskan kembali dengan singkat apa itu BURSA dan tujuan akhirnya.
3. Menjelaskan arsitektur yang diinginkan serta peran komponen utamanya.
4. Menyebutkan progres terakhir yang tercatat.
5. Menyebutkan checkpoint pengembangan yang terakhir diketahui.
6. Menjelaskan bagian mana yang masih berupa rencana atau belum terverifikasi.
7. Menunggu instruksi saya sebelum melakukan pekerjaan teknis.

Jangan saat ini:
- Memeriksa repository.
- Meminta akses komputer.
- Menjalankan terminal atau perintah.
- Membuat atau mengubah source code.
- Menjalankan audit baru.
- Menginstal aplikasi atau dependensi.
- Membuat konfigurasi VPS.
- Menghubungkan Hermes Agent atau 9Router.
- Memanggil API AI.
- Melakukan flashing atau pengujian HID.
- Membuat ulang proyek dari awal.

Jika ada informasi yang tampak tidak konsisten, catat sebagai hal yang perlu diklarifikasi nanti. Jangan menyelesaikannya dengan menebak.

### Format respons yang saya inginkan sekarang

**A. Pemahaman proyek:** Jelaskan dengan bahasamu sendiri apa itu BURSA.

**B. Tujuan akhir:** Jelaskan kemampuan yang ingin dicapai.

**C. Arsitektur:** Jelaskan hubungan antara BURSA, USB HID, Host Helper, Backend, Hermes Agent, 9Router, model AI, dan VPS.

**D. Progres terakhir:** Jelaskan apa yang pernah dilaporkan tersedia dan apa yang belum terverifikasi.

**E. Titik melanjutkan:** Sebutkan pemeriksaan read-only konfigurasi provider AI melalui Antigravity sebagai langkah berikutnya yang terakhir direncanakan, kecuali ada informasi baru.

**F. Konfirmasi:** Tegaskan bahwa kamu memahami konteks ini dan tidak akan memulai pekerjaan sampai saya memintanya.

Jangan memberikan kode atau rencana eksekusi teknis yang panjang pada respons pertama. Fokus pada pemahaman proyek.

---

## 13. CATATAN PEMBARUAN STATUS

Dokumen ini adalah catatan konteks berdasarkan informasi yang tersedia saat disusun. Status proyek bisa berubah ketika pengguna melanjutkan pekerjaan.

Setiap kali pengembangan dilanjutkan, informasi terbaru dari pengguna, hasil audit aktual, status Git, hasil build, log, dan pengujian nyata harus diprioritaskan dibandingkan catatan historis yang belum diperbarui.

Jangan menafsirkan checkpoint sebagai bukti bahwa suatu fitur telah selesai. Perbarui status hanya berdasarkan informasi atau bukti yang benar-benar tersedia.

**Prinsip utama BURSA: pahami konteks, bertindak secara terkontrol, amati hasil, verifikasi keberhasilan, dan beradaptasi ketika terjadi kesalahan.**

**Akhir dokumen master context BURSA.**