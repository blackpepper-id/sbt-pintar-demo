# Panduan Deploy Demo SBT Pintar ke Vercel (untuk ditunjukkan ke warga)

Ini project **terpisah** dari project produksi (`sbt-pintar-web.zip`) yang
sedang dibangun dengan Supabase. Tujuannya cuma untuk **demo cepat**
menunjukkan progres & tampilan ke warga — data di dalamnya contoh/dummy,
login pakai PIN simulasi, TIDAK terhubung ke database sungguhan.

Jangan pakai project ini untuk data warga yang asli. Kalau nanti mau
lanjut ke aplikasi produksi sungguhan, itu pakai `sbt-pintar-web.zip` yang
terpisah (sudah pernah dikirim sebelumnya).

---

## Langkah 1 — Extract & buka di VS Code

1. Extract `sbt-pintar-demo.zip` ke folder mana saja (misal Desktop)
2. VS Code → **File → Open Folder** → pilih folder `sbt-pintar-demo`
3. Buka Terminal (**Terminal → New Terminal**)

## Langkah 2 — Install & tes di komputer sendiri

```
npm install
```
Tunggu 1-3 menit, lalu:
```
npm run dev
```
Buka `http://localhost:3000` — harus muncul tampilan SBT Pintar dengan
banner hijau kecil di atas "🚧 Demo tampilan...".

Coba login pakai PIN `123456` untuk cek semua menu jalan normal. Kalau ada
error merah di terminal, screenshot dan tanyakan.

## Langkah 3 — Upload ke GitHub

1. GitHub.com → **New repository** → nama misal `sbt-pintar-demo` →
   jangan centang apapun → **Create repository**
2. Di Terminal VS Code:
   ```
   git init
   git add .
   git commit -m "demo SBT Pintar untuk warga"
   git branch -M main
   git remote add origin [ALAMAT_REPO_KAMU]
   git push -u origin main
   ```
   Ganti `[ALAMAT_REPO_KAMU]` dengan link yang ditampilkan GitHub setelah
   Create repository (bentuknya seperti
   `https://github.com/namakamu/sbt-pintar-demo.git`)

## Langkah 4 — Deploy ke Vercel

1. vercel.com → **Continue with GitHub** (pakai akun GitHub yang sama)
2. **Add New → Project** → pilih repo `sbt-pintar-demo`
3. Biarkan semua pengaturan default (Next.js otomatis terdeteksi) →
   **Deploy**
4. Tunggu ±1 menit → dapat link seperti `sbt-pintar-demo.vercel.app`

## Langkah 5 — Share ke warga

Link `sbt-pintar-demo.vercel.app` itu sudah bisa dibuka siapa saja lewat
browser HP/laptop, tanpa install apapun. Bisa langsung dishare ke grup WA
RT dengan pesan kira-kira:

> Warga yang terhormat, kami sedang membangun aplikasi digital untuk
> manajemen cluster & laporan keuangan (SBT Pintar). Ini demo tampilannya,
> silakan dicoba: [link]. Data yang tampil masih contoh, login pakai PIN
> `123456` untuk akun mana pun yang mau dicoba (Admin/Pengurus/Security/
> Warga). Masukan & saran sangat diterima 🙏

## Kalau nanti ada revisi tampilan lagi

Setiap kali saya (Claude) kasih file `SBT-Pintar.jsx` versi baru:
1. Ganti isi file `SBTPintarDemo.js` di folder ini dengan isi file baru
2. Pastikan baris pertama tetap ada `"use client";`
3. Cari fungsi `loadKey`/`saveKey` di bagian storage — pastikan masih versi
   yang sudah disesuaikan (pakai `window.localStorage` sebagai fallback),
   jangan sampai tertimpa balik ke versi asli yang pakai `window.storage`
   saja (nanti error lagi di browser sungguhan)
4. `git add . && git commit -m "update tampilan" && git push`
5. Vercel otomatis re-deploy dalam ±1 menit setiap ada push baru — tidak
   perlu setup ulang

## Kalau Stuck

Screenshot error lengkap + sebutkan ada di Langkah berapa → tanyakan di
chat project SBT Pintar.
