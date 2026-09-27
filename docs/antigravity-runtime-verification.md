# Protokol Verifikasi Runtime Antigravity (Antigravity Runtime Verification Protocol)

Dokumen ini mendefinisikan protokol pengujian runtime resmi untuk memverifikasi integrasi safe-change di lingkungan Antigravity IDE secara manual dan independen.

---

## 1. Tujuan

Membuktikan bahwa file skill `.agents/skills/safe-change/SKILL.md` benar-benar dideteksi, dipahami, dan digunakan secara aktif oleh model AI di Antigravity saat runtime, bukan hanya terpasang di filesystem secara statis.

---

## 2. Prasyarat Pengujian

Sebelum memulai prosedur pengujian, pastikan lingkungan pengujian memenuhi prasyarat berikut:
1. Antigravity IDE terinstal dan aktif di mesin pengujian.
2. safe-change CLI terinstal secara global:
   ```bash
   npm install -g safe-change
   ```
   Atau binary CLI dapat diakses langsung pada PATH lingkungan eksekusi terminal.
3. Versi runtime Antigravity yang diuji dicatat dengan jelas (misalnya: versi IDE, model internal yang digunakan).
4. Repository Git pengujian bersih (clean working tree) untuk pengujian.

---

## 3. Prosedur Pengujian (4 Fase)

### Fase 1: Instalasi Skill ke Project
Jalankan perintah instalasi safe-change untuk target Antigravity:
```bash
safe-change install antigravity --scope project
```
Periksa status instalasi dan manifest kepemilikan:
```bash
safe-change status antigravity
```
Ekspektasi:
- Perintah keluar dengan kode 0 (OK).
- Output melaporkan status `installed` atau `up_to_date`.
- File `.agents/skills/safe-change/.safe-change-manifest.json` tercipta.

### Fase 2: Verifikasi Filesystem
Pastikan file fisik berada pada lokasi yang diharapkan:
1. Konfirmasi file `.agents/skills/safe-change/SKILL.md` ada dan dapat dibaca.
2. Konfirmasi digest SHA-256 dari `.agents/skills/safe-change/SKILL.md` identik (byte-for-byte) dengan canonical skill `skills/safe-change/SKILL.md` di package safe-change:
   ```bash
   # Windows PowerShell
   Get-FileHash .agents/skills/safe-change/SKILL.md -Algorithm SHA256

   # POSIX (Linux / macOS)
   sha256sum .agents/skills/safe-change/SKILL.md
   ```

### Fase 3: Pengujian Runtime Discovery
1. Buka direktori project tersebut di Antigravity IDE.
2. Mulai sesi percakapan baru dengan agent.
3. Masukkan prompt uji:
   > "What is safe-change and what can it do?"
4. Rekam respons lengkap dari model.
5. Ekspektasi:
   - Model mengidentifikasi safe-change dari skill `.agents/skills/safe-change/SKILL.md`.
   - Model menjelaskan konsep utama: perekaman baseline (`save`), deteksi regresi (`check`), dan perbandingan perubahan file (`diff`).
   - Model menyebutkan aturan keselamatan non-negotiable (tidak menjalankan git commit, git stash, git reset secara diam-diam).

### Fase 4: Pengujian Invokasi Eksekusi
1. Pada sesi percakapan yang sama atau sesi baru di project tersebut, masukkan prompt:
   > "I am about to make changes. Please use safe-change to record a baseline first."
2. Rekam tindakan dan tool calls yang dihasilkan oleh model.
3. Ekspektasi:
   - Model memanggil perintah CLI `safe-change save` secara aktif via tool terminal/bash execution.
   - Model memeriksa hasil keluaran baseline sebelum melanjutkan ke instruksi modifikasi berikutnya.

---

## 4. Cara Melaporkan Hasil

Penguji yang telah menyelesaikan keempat fase di atas diharapkan melaporkan temuan pengujian ke repository publik safe-change:
1. Buka GitHub Issue di: `https://github.com/ZAKI-MUHAMAD-FADILAH/safe-change/issues`
2. Berikan label: `runtime-verification`.
3. Sertakan informasi berikut dalam laporan:
   - Versi Antigravity IDE dan model yang digunakan.
   - Sistem Operasi (Windows, macOS, atau Linux) beserta versi rilisnya.
   - Output teks terminal pada Fase 1 dan Fase 2.
   - Salinan respons teks lengkap model pada Fase 3.
   - Riwayat eksekusi tool call model pada Fase 4.
   - Tangkapan layar (screenshot) antarmuka Antigravity IDE selama pengujian berlangsung.

---

## 5. Status Saat Ini

Runtime discovery belum diverifikasi secara independen. Filesystem installation telah tervalidasi.
Semua rilis safe-change mencantumkan status `filesystem-validated` untuk Antigravity hingga pengujian runtime independen ini selesai diverifikasi dan terdokumentasi secara publik.
