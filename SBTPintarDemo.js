"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Wallet, CalendarDays, FileText, Siren,
  Phone, MessageCircle, Plus, X, Printer, ShieldCheck, Upload,
  UserCog, CheckCircle2, Clock, AlertTriangle, XCircle, Send, ImageIcon, Pencil, ClipboardCheck, Info,
} from "lucide-react";

// ============================================================
// helpers
// ============================================================
const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const monthNamesShort = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (dateStr) => dateStr.slice(0, 7);
const monthLabel = (key) => { const [y, m] = key.split("-"); return `${monthNames[parseInt(m, 10) - 1]} ${y}`; };
const monthLabelShort = (key) => { const [y, m] = key.split("-"); return `${monthNamesShort[parseInt(m, 10) - 1]} '${y.slice(2)}`; };
const formatRp = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- konten kegiatan/notulensi: parsing baris "-" jadi bullet list ----------
function stripMarkup(text) {
  return (text || "").replace(/^- /gm, "").replace(/\n+/g, " ").trim();
}
function truncateText(text, maxLen = 160) {
  const clean = stripMarkup(text);
  if (clean.length <= maxLen) return { text: clean, truncated: false };
  return { text: clean.slice(0, maxLen).trimEnd() + "…", truncated: true };
}
function parseContentBlocks(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flushP = () => { if (paragraph.length) { blocks.push({ type: "p", text: paragraph.join(" ") }); paragraph = []; } };
  const flushL = () => { if (list.length) { blocks.push({ type: "ul", items: list }); list = []; } };
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) { flushP(); list.push(trimmed.slice(2)); }
    else if (trimmed === "") { flushP(); flushL(); }
    else { flushL(); paragraph.push(trimmed); }
  });
  flushP(); flushL();
  return blocks;
}
function ContentBlocks({ text, style }) {
  const blocks = parseContentBlocks(text);
  return (
    <div style={style}>
      {blocks.map((b, i) => b.type === "ul" ? (
        <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 20 }}>
          {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{it}</li>)}
        </ul>
      ) : (
        <p key={i} style={{ margin: "0 0 10px" }}>{b.text}</p>
      ))}
    </div>
  );
}

// ---------- absensi security: helper tanggal & grid kalender ----------
function toLocalISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function dayLabelShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${hari[dt.getDay()]}, ${dt.getDate()} ${bulan[dt.getMonth()]} ${y}`;
}
function buildCalendarGrid(days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - (days - 1));
  const gridStart = new Date(earliest);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const dayOffset = Math.round((today - d) / 86400000);
    cells.push({ iso: toLocalISODate(d), tanggalNum: d.getDate(), dayOffset, inRange: dayOffset >= 0 && dayOffset < days, isToday: dayOffset === 0 });
  }
  return cells;
}


const now = new Date();
const currentMonthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;

// bulan-bulan dalam rentang N terakhir, urut menaik (paling lama -> sekarang)
function monthsRangeAsc(n) {
  return Array.from({ length: n }).map((_, idx) => {
    const back = n - 1 - idx;
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  });
}
const recentMonths = [0, 1, 2].map((back) => {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}); // [bulan ini, bulan lalu, 2 bulan lalu] -- dipakai Laporan
const months12Asc = monthsRangeAsc(12); // 12 bulan terakhir, lama -> baru
const months12Desc = [...months12Asc].reverse(); // baru -> lama

function toWaNumber(hp) {
  let d = String(hp).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}
function waLink(hp, text) {
  return `https://wa.me/${toWaNumber(hp)}?text=${encodeURIComponent(text)}`;
}

// ============================================================
// akses & peran
// ============================================================
const roleLabel = { admin: "Administrator", pengurus: "Pengurus", security: "Security", warga: "Warga" };
const canVerifikasi = (role) => role === "admin" || role === "pengurus";
const canApprove = (role) => role === "admin" || role === "pengurus";
const canKelolaAkses = (role) => role === "admin";
const canCatatKeuangan = (role) => role === "admin" || role === "pengurus";
const canKelolaDarurat = (role) => role === "admin" || role === "pengurus" || role === "security";

// ============================================================
// struktur kategori transaksi
// ============================================================
const KATEGORI_PENGELUARAN = {
  "Keamanan": ["Pembayaran Gaji Security", "Pembayaran Insentif Bhabinkamtibmas", "Pembayaran Insentif Bhabinsa", "Kasbon Security", "Pengadaan Barang/Jasa"],
  "Kebersihan": ["Jasa Pengambilan Sampah"],
  "Tagihan": ["Tagihan PDAM", "Tagihan Listrik", "Tagihan Internet"],
  "Kegiatan": ["Rapat Pengurus", "Pertemuan Warga", "Kerja Bakti", "Pelaksanaan Qurban", "17 Agustusan", "Tahun Baru", "Buka Bersama", "Halal Bihalal", "Kegiatan Lainnya"],
  "Iuran RT": ["Iuran Dana Kematian"],
  "Lain-lain": ["Lain-lain"],
};
const KATEGORI_PENGELUARAN_LIST = Object.keys(KATEGORI_PENGELUARAN);

// ============================================================
// seed data
// ============================================================
const SALDO_AWAL_KAS = 6800000;
const IPL_PER_BULAN = 200000;
const BUKTI_CONTOH = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=200&q=60";

const namaBlokTambahan = [
  ["Wahyu Hidayat", "C1"], ["Fitri Handayani", "C2"], ["Eko Prasetyo", "C3"], ["Maya Kusuma", "C4"],
  ["Andi Saputra", "D1"], ["Lina Marpaung", "D2"], ["Rudi Hartono", "D3"], ["Dian Permata", "D4"],
  ["Bambang Setiawan", "E1"], ["Sri Wahyuni", "E2"], ["Tono Sutrisno", "E3"], ["Ayu Lestari", "E4"],
  ["Dedi Kurniawan", "F1"], ["Yuni Anggraini", "F2"], ["Fajar Nugroho", "F3"], ["Ratna Sari", "F4"],
  ["Iwan Setiadi", "G1"], ["Devi Puspita", "G2"], ["Anton Wibowo", "G3"], ["Wulan Safitri", "G4"],
  ["Hari Purnomo", "H1"], ["Indah Permatasari", "H2"], ["Sigit Purnama", "H3"], ["Novi Rahmawati", "H4"],
  ["Yudi Kurnia", "I1"], ["Tuti Sundari", "I2"], ["Arif Rahman", "I3"], ["Melati Putri", "I4"],
];
const namaBlokInti = [
  ["Budi Santoso", "A1"], ["Siti Rahma", "A2"], ["Agus Wijaya", "A3"], ["Dewi Lestari", "A4"],
  ["Hendra Gunawan", "B1"], ["Rina Marlina", "B2"], ["Joko Prasetyo", "B3"], ["Nur Aini", "B4"],
];
const semuaNamaBlok = [...namaBlokInti, ...namaBlokTambahan]; // total 36 warga

// pola tunggakan supaya data contoh realistis: sebagian warga menunggak 1-3 bulan,
// sebagian sedang menunggu verifikasi bulan berjalan, sisanya lunas semua
const ARREARS_3 = new Set([7, 22]);
const ARREARS_2 = new Set([2, 15, 28]);
const ARREARS_1 = new Set([5, 9, 18, 31]);
const MENUNGGU_BULAN_INI = new Set([0, 4, 12, 20, 25]);

const seedWarga = semuaNamaBlok.map(([nama, blok], i) => {
  const arrears = ARREARS_3.has(i) ? 3 : ARREARS_2.has(i) ? 2 : ARREARS_1.has(i) ? 1 : 0;
  const menungguBulanIni = arrears === 0 && MENUNGGU_BULAN_INI.has(i);
  const statusBayar = {};
  months12Desc.forEach((monthKey, k) => {
    if (k < arrears) statusBayar[monthKey] = { status: "belum", bukti: null };
    else if (k === 0 && menungguBulanIni) statusBayar[monthKey] = { status: "menunggu", bukti: BUKTI_CONTOH };
    else statusBayar[monthKey] = { status: "lunas", bukti: null };
  });
  return {
    id: `w${i + 1}`, nama, blok,
    hp: `0812300000${String(i + 1).padStart(2, "0")}`,
    iplPerBulan: IPL_PER_BULAN, statusBayar,
  };
});

// ============================================================
// ⚠️ OVERRIDE UNTUK INTERNAL TEST — isi nomor HP ASLI di sini saja.
// JANGAN commit/push file ini ke GitHub publik & JANGAN kirim balik
// ke chat Claude kalau sudah diisi nomor asli.
// Format: diawali "0" seperti nomor HP Indonesia biasa (bukan +62).
// ============================================================
// seedWarga[0].hp = "08xxxxxxxxxx"; // ganti jadi nomor warga test #1 (nama: Budi Santoso, Blok A1)
// seedWarga[1].hp = "08xxxxxxxxxx"; // ganti jadi nomor warga test #2 (nama: Siti Rahma, Blok A2)

const seedKegiatan = [
  {
    id: "k1", tipe: "Kegiatan", tanggal: `${recentMonths[0]}-07`,
    judul: "Kerja Bakti Bulanan & Gotong Royong Saluran Air",
    isi: "Kerja bakti rutin membersihkan saluran air dan area taman cluster, diikuti sekitar 20 KK. Fokus utama pembersihan got depan Blok A dan B, serta pengecatan ulang pos satpam. Konsumsi disediakan dari kas warga.",
    diajukanOleh: "Pak Chandra",
  },
  {
    id: "k2", tipe: "Notulensi", tanggal: `${recentMonths[0]}-14`,
    judul: "Notulensi Rapat Warga Bulanan",
    isi: "- Laporan keuangan bulan berjalan disetujui warga\n- Usulan penambahan CCTV di pintu masuk cluster akan disurvei biayanya oleh Pak Feri\n- Rencana HUT RI disepakati minggu ketiga Agustus\n- Warga diimbau segera melunasi IPL yang tertunggak lewat fitur Bayar IPL di aplikasi",
    diajukanOleh: "Pak Hafiz",
  },
  {
    id: "k3", tipe: "Kegiatan", tanggal: todayISO(),
    judul: "Rencana Nonton Bareng 17 Agustusan di Lapangan Cluster",
    isi: "Pengurus berencana mengadakan nonton bareng & lomba kecil menyambut 17 Agustus di lapangan tengah cluster. Anggaran konsumsi akan diambil dari kas kegiatan.",
    diajukanOleh: "Pak Chandra",
  },
];

// ---------- data contoh absensi security (30 hari terakhir) ----------
// petugas pagi & malam bergantian antar 3 orang security, mayoritas "Aman
// Terkendali", beberapa "Ada Gangguan", beberapa sengaja kosong (belum lapor)
const ABSENSI_KEJADIAN = [
  { back: 10, shift: "malam", keterangan: "Ada suara mencurigakan dari arah pagar belakang Blok C sekitar jam 23.30, sudah dicek keliling, tidak ditemukan orang." },
  { back: 23, shift: "malam", keterangan: "Keributan kecil antar warga di area parkir, sudah dilerai dan diarahkan ke pengurus." },
  { back: 18, shift: "pagi", keterangan: "Kendaraan tidak dikenal parkir lama di depan pos, sudah ditanya dan sudah pergi." },
];
const ABSENSI_KOSONG_OFFSET = new Set([2, 15]); // hari ini dianggap belum lapor untuk kedua shift

const seedAbsensiSecurity = (() => {
  const list = [];
  const namaSecurityByShift = { pagi: "Pak Sandi", malam: "Pak Fajar" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let back = 0; back < 30; back++) {
    if (ABSENSI_KOSONG_OFFSET.has(back)) continue; // sengaja tidak dibuat -> "belum lapor"
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const iso = toLocalISODate(d);
    ["pagi", "malam"].forEach((shift) => {
      const kejadian = ABSENSI_KEJADIAN.find((k) => k.back === back && k.shift === shift);
      list.push({
        id: `abs-${iso}-${shift}`,
        tanggal: iso,
        shift,
        petugasNama: namaSecurityByShift[shift],
        kondisi: kejadian ? "Ada Gangguan" : "Aman Terkendali",
        keterangan: kejadian ? kejadian.keterangan : "",
        waktuLapor: shift === "pagi" ? "07:00" : "19:00",
      });
    });
  }
  return list;
})();

// transaksi pemasukan dibangkitkan dari status IPL "lunas" pada 3 bulan terakhir saja
// (selaras dengan cakupan dropdown bulan di menu Laporan)
const seedPemasukanDariIuran = seedWarga.flatMap((w) =>
  recentMonths
    .filter((monthKey) => w.statusBayar[monthKey]?.status === "lunas")
    .map((monthKey) => ({
      id: `masuk-${w.id}-${monthKey}`, tipe: "masuk", tanggal: `${monthKey}-05`,
      kategori: "Pembayaran IPL", subkategori: null,
      keterangan: `IPL ${monthLabel(monthKey)} — ${w.nama}`, jumlah: w.iplPerBulan,
      wargaId: w.id, monthKey,
    }))
);

const seedTransaksi = [
  ...seedPemasukanDariIuran,
  { id: "t1", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Keamanan", subkategori: "Pembayaran Gaji Security", keterangan: "Gaji bulanan — Pak Sandi", jumlah: 1650000 },
  { id: "t2", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Keamanan", subkategori: "Pembayaran Gaji Security", keterangan: "Gaji bulanan — Pak Fajar", jumlah: 1650000 },
  { id: "t3", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Keamanan", subkategori: "Pembayaran Gaji Security", keterangan: "Gaji bulanan — Pak Ferial", jumlah: 1650000 },
  { id: "t4", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Keamanan", subkategori: "Pembayaran Insentif Bhabinkamtibmas", keterangan: "Insentif bulanan", jumlah: 100000 },
  { id: "t5", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Keamanan", subkategori: "Pembayaran Insentif Bhabinsa", keterangan: "Insentif bulanan", jumlah: 100000 },
  { id: "t5b", tipe: "keluar", tanggal: `${recentMonths[0]}-11`, kategori: "Keamanan", subkategori: "Kasbon Security", keterangan: "Kasbon — Pak Sandi (keperluan keluarga mendesak)", jumlah: 500000 },
  { id: "t6", tipe: "keluar", tanggal: `${recentMonths[0]}-08`, kategori: "Kebersihan", subkategori: "Jasa Pengambilan Sampah", keterangan: "Iuran petugas kebersihan bulanan", jumlah: 500000 },
  { id: "t7", tipe: "keluar", tanggal: `${recentMonths[0]}-10`, kategori: "Tagihan", subkategori: "Tagihan Listrik", keterangan: "Listrik pos satpam & taman", jumlah: 350000 },
  { id: "t8", tipe: "keluar", tanggal: `${recentMonths[0]}-07`, kategori: "Kegiatan", subkategori: "Kerja Bakti", keterangan: "Konsumsi kerja bakti bulanan", jumlah: 600000 },
  { id: "t9", tipe: "keluar", tanggal: `${recentMonths[0]}-12`, kategori: "Iuran RT", subkategori: "Iuran Dana Kematian", keterangan: "Setoran dana kematian bulanan", jumlah: 300000 },
];

const pengurus = [
  { nama: "Pak Chandra", jabatan: "Ketua RT", hp: "081210000001" }, // 🔧 TEST: ganti hp ini jadi nomor asli HP pengurus untuk uji coba
  { nama: "Pak Hafiz", jabatan: "Sekretaris", hp: "081210000002" },
  { nama: "Pak Yani", jabatan: "Bendahara", hp: "081210000003" },
  { nama: "Pak Feri", jabatan: "Keamanan", hp: "081210000004" },
];
const security = [
  { nama: "Pak Sandi", jabatan: "Security", hp: "081220000001" },
  { nama: "Pak Fajar", jabatan: "Security", hp: "081220000002" },
  { nama: "Pak Ferial", jabatan: "Security", hp: "081220000003" },
];
const kontakEksternal = [
  { nama: "Damkar Kota Bogor", ket: "Kebakaran & penyelamatan, 24 jam", hp: "0251-8322100", wa: "85385104100" },
  { nama: "Polsek Bogor Barat", ket: "Kepolisian sektor", hp: "0251-8322054" },
  { nama: "RSUD Kota Bogor", ket: "RS rujukan terdekat — Jl. DR. Sumeru", hp: "0251-8312292" },
  { nama: "Puskesmas Sindangbarang", ket: "Fasilitas kesehatan terdekat", hp: "0251-8629884" },
  { nama: "Bhabinkamtibmas", ket: "Polsek Bogor Barat — lengkapi nomor petugas setempat", hp: "(belum diisi)" },
  { nama: "Babinsa", ket: "Koramil setempat — lengkapi nomor petugas setempat", hp: "(belum diisi)" },
];

const seedPengguna = [
  { id: "u1", nama: "Admin Sistem", hp: "081200000000", role: "admin" },
  { id: "u2", nama: "Pak Chandra", hp: "081210000001", role: "pengurus" },
  { id: "u3", nama: "Pak Hafiz", hp: "081210000002", role: "pengurus" },
  { id: "u4", nama: "Pak Yani", hp: "081210000003", role: "pengurus" },
  { id: "u5", nama: "Pak Feri", hp: "081210000004", role: "pengurus" },
  { id: "u6", nama: "Pak Sandi", hp: "081220000001", role: "security" },
  { id: "u7", nama: "Pak Fajar", hp: "081220000002", role: "security" },
  { id: "u8", nama: "Pak Ferial", hp: "081220000003", role: "security" },
  ...seedWarga.map((w) => ({ id: `u_${w.id}`, nama: w.nama, hp: w.hp, role: "warga" })),
];

const issueOptions = ["Keamanan / Mencurigakan", "Kebakaran", "Medis / Kesehatan", "Konflik Warga", "Lainnya"];

// status aktivitas darurat — dibuat sederhana: Baru -> Diproses -> Selesai
const ALARM_STATUS = ["Baru", "Diproses", "Selesai"];

const seedAlarmLog = [
  { id: "al1", tanggal: `${recentMonths[0]}-02`, waktu: "21:14:03", pelapor: "Rina Marlina", issue: "Keamanan / Mencurigakan — ada orang tidak dikenal mondar-mandir di depan Blok B", status: "Selesai", ditanganiOleh: "Pak Sandi" },
  { id: "al2", tanggal: `${recentMonths[0]}-06`, waktu: "05:47:21", pelapor: "Agus Wijaya", issue: "Medis / Kesehatan — anak demam tinggi, minta rekomendasi ke Puskesmas terdekat", status: "Selesai", ditanganiOleh: "Pak Chandra" },
  { id: "al3", tanggal: `${recentMonths[0]}-13`, waktu: "23:02:55", pelapor: "Dewi Lestari", issue: "Keamanan / Mencurigakan — suara benda jatuh dari arah pagar belakang Blok A", status: "Diproses", ditanganiOleh: "Pak Fajar" },
  { id: "al4", tanggal: `${recentMonths[1]}-27`, waktu: "14:20:10", pelapor: "Hendra Gunawan", issue: "Konflik Warga — keributan kecil terkait parkir motor", status: "Diproses", ditanganiOleh: null },
  { id: "al5", tanggal: todayISO(), waktu: "07:38:44", pelapor: "Siti Rahma", issue: "Lainnya — pohon tumbang menutup jalan depan Blok C", status: "Baru", ditanganiOleh: null },
];

// ============================================================
// design tokens — terinspirasi bahasa desain Apple: bersih, tipis,
// banyak ruang kosong, satu warna aksen, tanpa dekorasi berlebih
// ============================================================
const COLORS = {
  // krem hangat + hijau pupus + oranye — memadukan identitas oranye-putih
  // cluster dengan hijau pupus paguyuban warga
  bg: "#FAF6EF",
  bgAlt: "#EEF4E7",
  card: "#FFFFFF",
  ink: "#2B2A24",
  inkSoft: "#78735F",
  inkFaint: "#AFA890",
  accent: "#E4711E",
  accentSoft: "#FBE7D4",
  accentDeep: "#B85714",
  sageDeep: "#4C7A4A",
  sage: "#7AA968",
  sageSoft: "#E3EFDC",
  success: "#4C8A47",
  successSoft: "#E7F3E2",
  warning: "#C98A1B",
  warningSoft: "#FBEFD9",
  danger: "#D6402E",
  dangerSoft: "#FBE5DF",
  divider: "#E9E2D2",
};

function alarmStatusColor(status) {
  if (status === "Selesai") return COLORS.success;
  if (status === "Diproses") return COLORS.warning;
  return COLORS.danger;
}


// ============================================================
// storage
// ============================================================
const KEYS = { warga: "sbt:warga:v3", transaksi: "sbt:transaksi:v3", kegiatan: "sbt:kegiatan:v3", alarm: "sbt:alarmlog:v4", pengguna: "sbt:pengguna:v3", absensi: "sbt:absensi:v1" };
async function loadKey(key, fallback) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get(key, true);
      return r ? JSON.parse(r.value) : fallback;
    }
  } catch (e) { /* fall through ke localStorage */ }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
  } catch (e) { /* ignore */ }
  return fallback;
}
async function saveKey(key, value) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set(key, JSON.stringify(value), true);
      return;
    }
  } catch (e) { /* fall through ke localStorage */ }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) { /* best effort */ }
}

// ============================================================
// small UI atoms
// ============================================================
function StatusBadge({ status, compact }) {
  const map = {
    lunas: { bg: COLORS.successSoft, fg: COLORS.success, label: "Lunas", Icon: CheckCircle2 },
    menunggu: { bg: COLORS.warningSoft, fg: COLORS.warning, label: "Menunggu", Icon: Clock },
    belum: { bg: COLORS.dangerSoft, fg: COLORS.danger, label: "Belum Bayar", Icon: XCircle },
  };
  const { bg, fg, label, Icon } = map[status] || map.belum;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "3px 8px" : "5px 11px",
      background: bg, color: fg, borderRadius: 999, fontWeight: 600, fontSize: compact ? 11.5 : 12.5,
    }}>
      <Icon size={compact ? 12 : 14} strokeWidth={2.4} /> {label}
    </span>
  );
}

function Card({ children, style }) {
  return <div style={{ background: COLORS.card, border: `1px solid ${COLORS.divider}`, borderRadius: 16, ...style }}>{children}</div>;
}

function SectionTitle({ subtitle, title, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div>
        <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", color: COLORS.ink, margin: 0 }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 13.5, color: COLORS.inkSoft, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", pill, style, type = "button", disabled, className }) {
  const base = { fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, borderRadius: pill ? 999 : 10, padding: pill ? "11px 22px" : "9px 16px", cursor: disabled ? "not-allowed" : "pointer", border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "opacity .15s, transform .1s", opacity: disabled ? 0.45 : 1 };
  const variants = {
    primary: { background: COLORS.accent, color: "#fff" },
    danger: { background: COLORS.danger, color: "#fff" },
    ghost: { background: COLORS.bg, color: COLORS.ink },
    subtle: { background: "transparent", color: COLORS.accent },
    success: { background: COLORS.success, color: "#fff" },
  };
  return <button type={type} className={className} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function Field({ label, children }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: COLORS.inkSoft, fontWeight: 600 }}>{label}{children}</label>;
}
const inputStyle = { fontFamily: "'Inter', sans-serif", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.divider}`, background: COLORS.bg, color: COLORS.ink, outline: "none" };

function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: COLORS.bg, borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{
          border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          fontFamily: "'Inter', sans-serif", background: value === opt.value ? COLORS.card : "transparent",
          color: value === opt.value ? COLORS.ink : COLORS.inkSoft,
          boxShadow: value === opt.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

function TxCard({ t }) {
  return (
    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${COLORS.divider}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 3 }}>{t.tanggal}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{t.keterangan}</div>
        <div style={{ fontSize: 11.5, color: COLORS.inkFaint }}>{t.kategori}{t.subkategori ? ` · ${t.subkategori}` : ""}</div>
      </div>
      <div className="mono" style={{ flexShrink: 0, fontWeight: 700, fontSize: 13.5, color: t.tipe === "masuk" ? COLORS.success : COLORS.danger, whiteSpace: "nowrap" }}>
        {t.tipe === "masuk" ? "+" : "−"}{formatRp(t.jumlah)}
      </div>
    </div>
  );
}
function EmptyRow({ text }) {
  return <div style={{ padding: 20, textAlign: "center", color: COLORS.inkSoft, fontSize: 13.5 }}>{text}</div>;
}

// ============================================================
// main app
// ============================================================
export default function SBTPintar() {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [warga, setWarga] = useState(seedWarga);
  const [transaksi, setTransaksi] = useState(seedTransaksi);
  const [kegiatan, setKegiatan] = useState(seedKegiatan);
  const [alarmLog, setAlarmLog] = useState(seedAlarmLog);
  const [absensiSecurity, setAbsensiSecurity] = useState(seedAbsensiSecurity);
  const [pengguna, setPengguna] = useState(seedPengguna);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const role = loggedInUser?.role || null;
  const namaAktif = loggedInUser?.nama || "";

  useEffect(() => {
    if (role === "security" && ["dashboard", "laporan", "iuran"].includes(tab)) {
      setTab("kegiatan");
    }
  }, [role, tab]);
  const [laporanBulan, setLaporanBulan] = useState(currentMonthKey);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showKegiatanForm, setShowKegiatanForm] = useState(false);
  const [editingKegiatan, setEditingKegiatan] = useState(null);
  const [kegiatanDetail, setKegiatanDetail] = useState(null);
  const [showPanicForm, setShowPanicForm] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [cellModal, setCellModal] = useState(null); // { warga, monthKey }
  const [gridFilter, setGridFilter] = useState("semua");
  const [armed, setArmed] = useState(false);
  const [toast, setToast] = useState(null);
  const lastTapRef = useRef(0);
  const armTimerRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);

    (async () => {
      const [w, t, k, a, p, abs] = await Promise.all([
        loadKey(KEYS.warga, null), loadKey(KEYS.transaksi, null),
        loadKey(KEYS.kegiatan, null), loadKey(KEYS.alarm, null), loadKey(KEYS.pengguna, null),
        loadKey(KEYS.absensi, null),
      ]);
      if (w) setWarga(w); else saveKey(KEYS.warga, seedWarga);
      if (t) setTransaksi(t); else saveKey(KEYS.transaksi, seedTransaksi);
      if (k) setKegiatan(k); else saveKey(KEYS.kegiatan, seedKegiatan);
      if (a) setAlarmLog(a); else saveKey(KEYS.alarm, seedAlarmLog);
      if (p) setPengguna(p); else saveKey(KEYS.pengguna, seedPengguna);
      if (abs) setAbsensiSecurity(abs); else saveKey(KEYS.absensi, seedAbsensiSecurity);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const DEMO_PIN = "123456";

  function normalizeHp(raw) {
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("62")) d = "0" + d.slice(2);
    return d;
  }
  function handleLogin(hp, pin) {
    const cleanHp = normalizeHp(hp);
    const found = pengguna.find((p) => normalizeHp(p.hp) === cleanHp);
    if (!found) return { ok: false, message: "No. HP tidak terdaftar. Hubungi Administrator untuk didaftarkan di menu Akses." };
    if (pin !== DEMO_PIN) return { ok: false, message: `PIN salah. (Demo: gunakan PIN ${DEMO_PIN} untuk akun mana pun.)` };
    setLoggedInUser(found);
    return { ok: true };
  }
  function handleLogout() { setLoggedInUser(null); }

  // warga yang sedang login (kalau role === 'warga')
  const myWarga = useMemo(() => {
    if (!loggedInUser || loggedInUser.role !== "warga") return null;
    return warga.find((w) => `u_${w.id}` === loggedInUser.id) || null;
  }, [loggedInUser, warga]);

  // ---- Iuran IPL ----
  const uploadBuktiBanyakBulan = useCallback((wargaId, monthKeys, dataUrl) => {
    setWarga((prev) => {
      const next = prev.map((w) => {
        if (w.id !== wargaId) return w;
        const nextStatus = { ...w.statusBayar };
        monthKeys.forEach((mk) => { nextStatus[mk] = { status: "menunggu", bukti: dataUrl }; });
        return { ...w, statusBayar: nextStatus };
      });
      saveKey(KEYS.warga, next);
      return next;
    });
    setToast(`Bukti transfer untuk ${monthKeys.length} bulan terkirim, menunggu verifikasi pengurus.`);
  }, []);

  const verifikasiLunas = useCallback((wargaId, monthKey, buktiManual) => {
    const w = warga.find((x) => x.id === wargaId);
    setWarga((prev) => {
      const next = prev.map((x) => x.id === wargaId ? { ...x, statusBayar: { ...x.statusBayar, [monthKey]: { ...x.statusBayar[monthKey], status: "lunas", bukti: buktiManual || x.statusBayar[monthKey]?.bukti || null } } } : x);
      saveKey(KEYS.warga, next);
      return next;
    });
    setTransaksi((prev) => {
      const next = [...prev, { id: uid(), tipe: "masuk", tanggal: todayISO(), kategori: "Pembayaran IPL", subkategori: null, keterangan: `IPL ${monthLabel(monthKey)} — ${w ? w.nama : ""}`, jumlah: w ? w.iplPerBulan : IPL_PER_BULAN, wargaId, monthKey }];
      saveKey(KEYS.transaksi, next);
      return next;
    });
    setToast("Pembayaran ditandai lunas.");
  }, [warga]);

  const batalkanStatus = useCallback((wargaId, monthKey) => {
    setWarga((prev) => {
      const next = prev.map((w) => { if (w.id !== wargaId) return w; return { ...w, statusBayar: { ...w.statusBayar, [monthKey]: { status: "belum", bukti: null } } }; });
      saveKey(KEYS.warga, next);
      return next;
    });
    setTransaksi((prev) => {
      const next = prev.filter((t) => !(t.wargaId === wargaId && t.monthKey === monthKey));
      saveKey(KEYS.transaksi, next);
      return next;
    });
  }, []);

  // ---- Pengeluaran ----
  const addExpense = (data) => {
    setTransaksi((prev) => { const next = [...prev, { id: uid(), tipe: "keluar", ...data }]; saveKey(KEYS.transaksi, next); return next; });
    setShowExpenseForm(false);
  };

  // ---- Kegiatan & Notulensi ----
  const addKegiatan = (data) => {
    setKegiatan((prev) => {
      const next = [{ id: uid(), ...data, diajukanOleh: namaAktif }, ...prev];
      saveKey(KEYS.kegiatan, next);
      return next;
    });
    setShowKegiatanForm(false);
  };
  const editKegiatan = (id, data) => {
    setKegiatan((prev) => {
      const next = prev.map((k) => k.id === id ? { ...k, ...data } : k);
      saveKey(KEYS.kegiatan, next);
      return next;
    });
    setEditingKegiatan(null);
    setToast("Catatan diperbarui.");
  };

  // ---- Panic button ----
  function handlePanicTap() {
    const now2 = Date.now();
    if (now2 - lastTapRef.current < 650) {
      clearTimeout(armTimerRef.current);
      setArmed(false);
      setShowPanicForm(true);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now2;
      setArmed(true);
      clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setArmed(false), 700);
    }
  }
  const submitPanic = ({ pelapor, issue, catatan }) => {
    setAlarmLog((prev) => {
      const next = [{ id: uid(), tanggal: todayISO(), waktu: new Date().toLocaleTimeString("id-ID"), pelapor, issue: catatan ? `${issue} — ${catatan}` : issue, status: "Baru", ditanganiOleh: null }, ...prev];
      saveKey(KEYS.alarm, next);
      return next;
    });
    setShowPanicForm(false);
    setToast(`Alarm terkirim! Notifikasi dikirim ke ${pengurus.length} pengurus & ${security.length} security untuk followup.`);
  };
  const updateAlarmStatus = (id, status) => {
    setAlarmLog((prev) => {
      const next = prev.map((a) => a.id === id ? { ...a, status, ditanganiOleh: status === "Baru" ? null : (a.ditanganiOleh || namaAktif) } : a);
      saveKey(KEYS.alarm, next);
      return next;
    });
  };

  // ---- Absensi Security ----
  const addAbsensiLaporan = (data) => {
    setAbsensiSecurity((prev) => {
      const next = [...prev, { id: uid(), ...data, petugasNama: namaAktif, waktuLapor: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) }];
      saveKey(KEYS.absensi, next);
      return next;
    });
    setToast("Laporan jaga tersimpan.");
  };

  // ---- Akses pengguna ----
  const updatePenggunaRole = (id, newRole) => {
    setPengguna((prev) => { const next = prev.map((p) => p.id === id ? { ...p, role: newRole } : p); saveKey(KEYS.pengguna, next); return next; });
  };
  const addPengguna = (data) => {
    setPengguna((prev) => { const next = [...prev, { id: uid(), ...data }]; saveKey(KEYS.pengguna, next); return next; });
    setShowAddUser(false);
  };

  // ---- computed ----
  const saldo = useMemo(() => SALDO_AWAL_KAS + transaksi.reduce((s, t) => s + (t.tipe === "masuk" ? t.jumlah : -t.jumlah), 0), [transaksi]);
  const bulanIniMasuk = useMemo(() => transaksi.filter((t) => t.tipe === "masuk" && monthKeyOf(t.tanggal) === currentMonthKey).reduce((s, t) => s + t.jumlah, 0), [transaksi]);
  const bulanIniKeluar = useMemo(() => transaksi.filter((t) => t.tipe === "keluar" && monthKeyOf(t.tanggal) === currentMonthKey).reduce((s, t) => s + t.jumlah, 0), [transaksi]);
  const belumBayarCount = useMemo(() => warga.filter((w) => w.statusBayar[currentMonthKey]?.status !== "lunas").length, [warga]);
  const sudahBayarCount = warga.length - belumBayarCount;
  const recentTx = useMemo(() => [...transaksi].sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 6), [transaksi]);

  const laporanTx = useMemo(() => transaksi.filter((t) => monthKeyOf(t.tanggal) === laporanBulan), [transaksi, laporanBulan]);
  const laporanMasuk = laporanTx.filter((t) => t.tipe === "masuk").reduce((s, t) => s + t.jumlah, 0);
  const laporanKeluar = laporanTx.filter((t) => t.tipe === "keluar").reduce((s, t) => s + t.jumlah, 0);
  const laporanByKategori = useMemo(() => {
    const map = {};
    laporanTx.filter((t) => t.tipe === "keluar").forEach((t) => {
      const key = t.subkategori ? `${t.kategori} - ${t.subkategori}` : t.kategori;
      map[key] = (map[key] || 0) + t.jumlah;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [laporanTx]);
  const semuaPengeluaran = useMemo(() => [...transaksi].filter((t) => t.tipe === "keluar").sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [transaksi]);

  // arrears streak (jumlah bulan menunggak berturut-turut dari bulan ini mundur)
  function arrearsStreak(w) {
    let streak = 0;
    for (let k = 0; k < months12Desc.length; k++) {
      if (w.statusBayar[months12Desc[k]]?.status === "belum") streak++;
      else break;
    }
    return streak;
  }
  const gridWarga = useMemo(() => {
    return warga.filter((w) => {
      if (gridFilter === "semua") return true;
      if (gridFilter === "menunggak") return arrearsStreak(w) > 0;
      if (gridFilter === "menunggu") return w.statusBayar[currentMonthKey]?.status === "menunggu";
      return true;
    });
  }, [warga, gridFilter]);
  const jumlahMenunggak = warga.filter((w) => arrearsStreak(w) > 0).length;
  const jumlahMenunggu = warga.filter((w) => w.statusBayar[currentMonthKey]?.status === "menunggu").length;

  const tabs = [
    ...(role !== "security" ? [{ id: "dashboard", label: "Ringkasan", icon: LayoutDashboard }] : []),
    ...(role !== "security" ? [{ id: "laporan", label: "Laporan", icon: FileText }] : []),
    ...(role !== "security" ? [{ id: "iuran", label: "Iuran IPL", icon: Wallet }] : []),
    { id: "kegiatan", label: "Kegiatan", icon: CalendarDays },
    { id: "darurat", label: "Kontak Darurat", icon: Siren },
    { id: "absensi", label: "Absensi Security", icon: ClipboardCheck },
    ...(canKelolaAkses(role) ? [{ id: "akses", label: "Akses", icon: UserCog }] : []),
  ];

  if (loading) {
    return <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, fontFamily: "'Inter', sans-serif", color: COLORS.inkSoft }}>Memuat data SBT Pintar…</div>;
  }
  if (!loggedInUser) {
    return <LoginScreen pengguna={pengguna} onLogin={handleLogin} demoPin={DEMO_PIN} />;
  }

  return (
    <div className="app-root" style={{ minHeight: "100%", background: COLORS.bg, fontFamily: "'Inter', sans-serif", color: COLORS.ink, paddingBottom: 90 }}>
      <style>{`
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 11px 12px; font-size: 13.5px; }
        thead th { font-size: 11px; letter-spacing: 0.02em; color: ${COLORS.inkSoft}; font-weight: 600; border-bottom: 1px solid ${COLORS.divider}; }
        tbody tr { border-bottom: 1px solid ${COLORS.divider}; }
        tbody tr:last-child { border-bottom: none; }
        .mono { font-variant-numeric: tabular-nums; }
        button { font-family: 'Inter', sans-serif; }
        button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${COLORS.accent}; outline-offset: 1px; }
        @media (max-width: 760px) { .sidebar { display: none !important; } .bottomnav { display: flex !important; } .maincol { margin-left: 0 !important; padding: 20px 16px !important; } .grid-scroll { max-width: calc(100vw - 32px); } .panic-btn { bottom: 78px !important; } }
        .panic-btn { position: fixed; left: 50%; transform: translateX(-50%) translateZ(0); -webkit-transform: translateX(-50%) translateZ(0); bottom: 26px; z-index: 60; width: 64px; height: 64px; border-radius: 50%; background: ${COLORS.danger}; border: 4px solid #fff; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 22px rgba(214,64,46,0.4); cursor: pointer; transition: transform .12s; }
        .panic-btn.armed { transform: translateX(-50%) scale(1.12) translateZ(0); -webkit-transform: translateX(-50%) scale(1.12) translateZ(0); box-shadow: 0 0 0 9px rgba(214,64,46,0.18), 0 8px 22px rgba(214,64,46,0.4); }
        .panic-hint { position: fixed; left: 50%; transform: translateX(-50%); bottom: 98px; z-index: 60; background: ${COLORS.ink}; color: #fff; font-size: 12px; padding: 6px 12px; border-radius: 999px; white-space: nowrap; }
        @media (max-width: 760px) { .panic-hint { bottom: 150px; } }
        .fab-btn { position: fixed; right: 22px; bottom: 24px; z-index: 55; -webkit-transform: translateZ(0); transform: translateZ(0); }
        @media (max-width: 760px) { .fab-btn { right: 16px; bottom: 78px; } }
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, .app-root { background: #fff !important; }
          .maincol { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
          .grid-cell, button { box-shadow: none !important; }
          table { font-size: 11.5px; }
          th, td { color: #000 !important; padding: 6px 8px !important; }
          .mono { color: #000 !important; }
          [style*="border-radius"] { border-radius: 0 !important; }
        }
        .toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: ${COLORS.ink}; color: #fff; padding: 11px 20px; border-radius: 12px; font-size: 13.5px; z-index: 70; max-width: 90vw; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .grid-cell { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: transform .1s; }
        .row-3 { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 560px) { .row-3 { grid-template-columns: 1fr 1fr 1fr; } }
        .grid-cell:hover { transform: scale(1.08); }
      `}</style>

      {/* header */}
      <header className="no-print" style={{ background: COLORS.sageDeep, color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, borderBottom: `3px solid ${COLORS.accent}`, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ShieldCheck size={19} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 16.5, letterSpacing: "-0.01em", lineHeight: 1.1, color: "#fff" }}>SBT Pintar</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Cluster Sindangbarang Terrace</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.2, color: "#fff" }}>{namaAktif}</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)" }}>{roleLabel[role]}</div>
          </div>
          <Btn variant="ghost" onClick={handleLogout} style={{ padding: "7px 12px", fontSize: 12.5, background: "rgba(255,255,255,0.16)", color: "#fff" }}>Keluar</Btn>
        </div>
      </header>

      <div style={{ display: "flex" }}>
        {/* sidebar */}
        <nav className="sidebar no-print" style={{ width: 216, flexShrink: 0, padding: "20px 14px", background: COLORS.bgAlt, position: "sticky", top: 66, height: "calc(100% - 66px)", borderRight: `1px solid ${COLORS.divider}` }}>
          {tabs.map((t) => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", marginBottom: 3, background: active ? COLORS.accentSoft : "transparent", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, color: active ? COLORS.accent : COLORS.inkSoft, textAlign: "left" }}>
                <Icon size={17} strokeWidth={2.2} /> {t.label}
              </button>
            );
          })}
        </nav>

        {/* bottom nav (mobile) */}
        <nav className="bottomnav no-print" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, background: COLORS.card, borderTop: `1px solid ${COLORS.divider}`, padding: "8px 4px", justifyContent: "space-around", zIndex: 40, WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }}>
          {tabs.map((t) => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? COLORS.accent : COLORS.inkFaint, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                <Icon size={19} strokeWidth={2.2} /> {t.label}
              </button>
            );
          })}
        </nav>

        {/* main */}
        <main className="maincol" style={{ flex: 1, padding: "28px 28px", maxWidth: 1000 }}>
          {tab === "dashboard" && (
            <>
              <SectionTitle title="Ringkasan Kas" subtitle={monthLabel(currentMonthKey)} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 14, marginBottom: 26 }}>
                <Card style={{ padding: 20 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Saldo Kas Saat Ini</div><div className="mono" style={{ fontSize: 25, fontWeight: 700, color: COLORS.ink, marginTop: 8, letterSpacing: "-0.01em" }}>{formatRp(saldo)}</div><div style={{ fontSize: 11, color: COLORS.inkFaint, marginTop: 5 }}>termasuk saldo awal {formatRp(SALDO_AWAL_KAS)}</div></Card>
                <Card style={{ padding: 20 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Pemasukan Bulan Ini</div><div className="mono" style={{ fontSize: 25, fontWeight: 700, color: COLORS.success, marginTop: 8, letterSpacing: "-0.01em" }}>{formatRp(bulanIniMasuk)}</div></Card>
                <Card style={{ padding: 20 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Pengeluaran Bulan Ini</div><div className="mono" style={{ fontSize: 25, fontWeight: 700, color: COLORS.danger, marginTop: 8, letterSpacing: "-0.01em" }}>{formatRp(bulanIniKeluar)}</div></Card>
                <Card style={{ padding: 20 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Warga Sudah Bayar</div><div className="mono" style={{ fontSize: 25, fontWeight: 700, color: sudahBayarCount === warga.length ? COLORS.success : COLORS.warning, marginTop: 8, letterSpacing: "-0.01em" }}>{sudahBayarCount} / {warga.length}</div></Card>
              </div>
              <Card>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Mutasi Terbaru</div>
                <div>
                  {recentTx.map((t) => <TxCard key={t.id} t={t} />)}
                  {recentTx.length === 0 && <EmptyRow text="Belum ada transaksi." />}
                </div>
              </Card>
            </>
          )}

          {tab === "iuran" && role === "warga" && (
            <WargaIuranView
              myWarga={myWarga}
              onOpenPay={() => setShowPayModal(true)}
            />
          )}

          {tab === "iuran" && role !== "warga" && (
            <>
              <SectionTitle title="Iuran IPL Semua Warga" subtitle="12 bulan terakhir" action={
                <SegmentedControl
                  value={gridFilter}
                  onChange={setGridFilter}
                  options={[
                    { value: "semua", label: `Semua (${warga.length})` },
                    { value: "menunggak", label: `Menunggak (${jumlahMenunggak})` },
                    { value: "menunggu", label: `Menunggu (${jumlahMenunggu})` },
                  ]}
                />
              } />
              <Card style={{ overflow: "hidden" }}>
                <div className="grid-scroll" style={{ overflowX: "auto" }}>
                  <table style={{ minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th style={{ position: "sticky", left: 0, background: COLORS.card, minWidth: 170 }}>Warga</th>
                        {months12Asc.map((mk) => <th key={mk} style={{ textAlign: "center" }}>{monthLabelShort(mk)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {gridWarga.map((w) => (
                        <tr key={w.id}>
                          <td style={{ position: "sticky", left: 0, background: COLORS.card }}>
                            <div style={{ fontWeight: 600 }}>{w.nama}</div>
                            <div className="mono" style={{ fontSize: 11.5, color: COLORS.inkSoft }}>Blok {w.blok}</div>
                          </td>
                          {months12Asc.map((mk) => {
                            const st = w.statusBayar[mk]?.status || "belum";
                            const map = {
                              lunas: { bg: COLORS.successSoft, fg: COLORS.success, Icon: CheckCircle2 },
                              menunggu: { bg: COLORS.warningSoft, fg: COLORS.warning, Icon: Clock },
                              belum: { bg: COLORS.dangerSoft, fg: COLORS.danger, Icon: XCircle },
                            };
                            const { bg, fg, Icon } = map[st];
                            return (
                              <td key={mk} style={{ textAlign: "center" }}>
                                <button className="grid-cell" style={{ background: bg, color: fg }} onClick={() => setCellModal({ warga: w, monthKey: mk })} aria-label={`${w.nama} — ${monthLabel(mk)} — ${st}`}>
                                  <Icon size={16} strokeWidth={2.4} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {gridWarga.length === 0 && <tr><td colSpan={13} style={{ textAlign: "center", color: COLORS.inkSoft, padding: 24 }}>Tidak ada warga pada filter ini.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 12 }}>Ketuk salah satu kotak status untuk verifikasi, kirim pengingat, atau lihat bukti transfer.</div>
            </>
          )}

          {tab === "kegiatan" && (
            <>
              <SectionTitle
                title="Kegiatan &amp; Notulensi"
                subtitle={!canApprove(role) ? "Dokumentasi dari pengurus — tampilan lihat saja" : undefined}
                action={canApprove(role) ? <Btn onClick={() => setShowKegiatanForm(true)}><Plus size={15} /> Tambah Catatan</Btn> : undefined}
              />
              {showKegiatanForm && <KegiatanForm onCancel={() => setShowKegiatanForm(false)} onSubmit={addKegiatan} />}
              {editingKegiatan && <KegiatanForm initial={editingKegiatan} onCancel={() => setEditingKegiatan(null)} onSubmit={(data) => editKegiatan(editingKegiatan.id, data)} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {kegiatan.map((k) => {
                  const { text: preview, truncated } = truncateText(k.isi, 160);
                  const showExpand = truncated || !!k.foto;
                  return (
                    <Card key={k.id} style={{ overflow: "hidden" }}>
                      {k.foto && (
                        <img src={k.foto} alt="" onClick={() => setKegiatanDetail(k)} style={{ width: "100%", height: 160, objectFit: "cover", cursor: "pointer" }} />
                      )}
                      <div style={{ padding: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: k.tipe === "Notulensi" ? COLORS.warning : COLORS.accent }}>{k.tipe}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="mono" style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{k.tanggal}</span>
                            {canApprove(role) && (
                              <button onClick={() => setEditingKegiatan(k)} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 26, height: 26, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Edit catatan">
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div onClick={() => showExpand && setKegiatanDetail(k)} style={{ fontWeight: 700, fontSize: 16.5, marginBottom: 5, letterSpacing: "-0.01em", cursor: showExpand ? "pointer" : "default" }}>{k.judul}</div>
                        <div style={{ fontSize: 13.5, color: COLORS.inkSoft }}>{preview}</div>
                        {showExpand && (
                          <button onClick={() => setKegiatanDetail(k)} style={{ background: "none", border: "none", color: COLORS.accent, fontWeight: 600, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 8 }}>
                            Baca Selengkapnya →
                          </button>
                        )}
                        {k.diajukanOleh && <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 8 }}>Diajukan oleh: {k.diajukanOleh}</div>}
                      </div>
                    </Card>
                  );
                })}
                {kegiatan.length === 0 && <div style={{ color: COLORS.inkSoft, padding: 20, textAlign: "center" }}>Belum ada catatan kegiatan atau notulensi.</div>}
              </div>
            </>
          )}

          {tab === "laporan" && (
            <>
              <div className="print-only" style={{ display: "none", marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 20 }}>SBT Pintar — Laporan Keuangan</div>
                <div style={{ fontSize: 13, color: "#444" }}>Cluster Sindangbarang Terrace · {monthLabel(laporanBulan)} · Dicetak {todayISO()}</div>
              </div>
              <SectionTitle title="Laporan Keuangan" action={
                <div className="no-print" style={{ display: "flex", gap: 8 }}>
                  <select value={laporanBulan} onChange={(e) => setLaporanBulan(e.target.value)} style={inputStyle}>
                    {recentMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                  <Btn variant="ghost" onClick={() => window.print()}><Printer size={15} /> Cetak</Btn>
                </div>
              } />
              <div className="row-3" style={{ marginBottom: 20 }}>
                <Card style={{ padding: 18 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Pemasukan</div><div className="mono" style={{ fontSize: 21, fontWeight: 700, color: COLORS.success, marginTop: 6 }}>{formatRp(laporanMasuk)}</div></Card>
                <Card style={{ padding: 18 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Pengeluaran</div><div className="mono" style={{ fontSize: 21, fontWeight: 700, color: COLORS.danger, marginTop: 6 }}>{formatRp(laporanKeluar)}</div></Card>
                <Card style={{ padding: 18 }}><div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>Selisih Bersih</div><div className="mono" style={{ fontSize: 21, fontWeight: 700 }}>{formatRp(laporanMasuk - laporanKeluar)}</div></Card>
              </div>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Pengeluaran per Kategori — {monthLabel(laporanBulan)}</div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                  {laporanByKategori.map(([kat, jml]) => (
                    <div key={kat}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span>{kat}</span><span className="mono">{formatRp(jml)}</span></div>
                      <div style={{ height: 6, background: COLORS.bg, borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${laporanKeluar ? (jml / laporanKeluar) * 100 : 0}%`, background: COLORS.accent, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                  {laporanByKategori.length === 0 && <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>Tidak ada pengeluaran bulan ini.</div>}
                </div>
              </Card>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15.5 }}>Riwayat Seluruh Pengeluaran</span>
                  {canCatatKeuangan(role) && <Btn className="no-print" onClick={() => setShowExpenseForm(!showExpenseForm)} style={{ padding: "7px 14px", fontSize: 12.5 }}><Plus size={14} /> Catat Pengeluaran</Btn>}
                </div>
                {showExpenseForm && canCatatKeuangan(role) && (
                  <div className="no-print" style={{ padding: 18 }}><ExpenseFormInline onCancel={() => setShowExpenseForm(false)} onSubmit={addExpense} /></div>
                )}
                <div>
                  {semuaPengeluaran.map((t) => <TxCard key={t.id} t={t} />)}
                  {semuaPengeluaran.length === 0 && <EmptyRow text="Belum ada pengeluaran tercatat." />}
                </div>
              </Card>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5, color: COLORS.success }}>Rincian Pemasukan (IPL) — {monthLabel(laporanBulan)}</div>
                <div>
                  {laporanTx.filter((t) => t.tipe === "masuk").sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((t) => (
                    <div key={t.id} style={{ padding: "12px 20px", borderBottom: `1px solid ${COLORS.divider}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 3 }}>{t.tanggal}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.keterangan}</div>
                      </div>
                      <div className="mono" style={{ flexShrink: 0, fontWeight: 700, fontSize: 13.5, color: COLORS.success, whiteSpace: "nowrap" }}>+{formatRp(t.jumlah)}</div>
                    </div>
                  ))}
                  {laporanTx.filter((t) => t.tipe === "masuk").length === 0 && <EmptyRow text="Belum ada pemasukan bulan ini." />}
                </div>
              </Card>
              <Card>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5, color: COLORS.danger }}>Rincian Pengeluaran — {monthLabel(laporanBulan)}</div>
                <div>
                  {laporanTx.filter((t) => t.tipe === "keluar").sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((t) => <TxCard key={t.id} t={t} />)}
                  {laporanTx.filter((t) => t.tipe === "keluar").length === 0 && <EmptyRow text="Belum ada pengeluaran bulan ini." />}
                </div>
              </Card>
            </>
          )}

          {tab === "darurat" && (
            <>
              <SectionTitle title="Kontak Darurat" />
              <Card style={{ padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: COLORS.dangerSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Siren size={22} color={COLORS.danger} />
                </div>
                <div style={{ fontSize: 13.5, color: COLORS.inkSoft }}>
                  Tombol darurat ada di <b style={{ color: COLORS.ink }}>lingkaran merah bawah layar</b> selama Anda berada di halaman ini. Ketuk <b style={{ color: COLORS.ink }}>dua kali berturut-turut</b> untuk mengirim alarm ke pengurus & security. Ketukan tunggal sengaja tidak berfungsi supaya tombol tidak tersenggol tanpa sengaja.
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <Card style={{ padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 12 }}>Pengurus</div>
                  {pengurus.map((p) => <ContactRow key={p.hp} {...p} />)}
                </Card>
                <Card style={{ padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 12 }}>Security</div>
                  {security.map((p) => <ContactRow key={p.hp} {...p} />)}
                </Card>
              </div>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Layanan Darurat Eksternal</div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {kontakEksternal.map((k) => (
                    <div key={k.nama} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLORS.divider}` }}>
                      <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{k.nama}</div><div style={{ fontSize: 12, color: COLORS.inkSoft }}>{k.ket}</div></div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className="mono" style={{ fontSize: 12.5, color: k.hp.startsWith("(") ? COLORS.warning : COLORS.ink }}>{k.hp}</span>
                        {!k.hp.startsWith("(") && <a href={`tel:${k.hp.replace(/-/g, "")}`}><Btn variant="ghost" style={{ padding: "7px 10px" }}><Phone size={13} /></Btn></a>}
                        {k.wa && <a href={waLink(k.wa, "")} target="_blank" rel="noreferrer"><Btn variant="success" style={{ padding: "7px 10px" }}><MessageCircle size={13} /></Btn></a>}
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: "10px 0 0", fontSize: 12, color: COLORS.inkSoft }}>
                    Untuk Bhabinkamtibmas &amp; Babinsa wilayah Sindangbarang, nomor petugas yang sedang bertugas perlu dilengkapi pengurus RT.
                  </div>
                </div>
              </Card>

              <Card>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Aktivitas Darurat</div>
                <div>
                  {alarmLog.map((a) => (
                    <div key={a.id} style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.divider}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                        <div className="mono" style={{ fontSize: 12, color: COLORS.inkSoft }}>{a.tanggal} <span>{a.waktu}</span></div>
                        {canKelolaDarurat(role) ? (
                          <select value={a.status} onChange={(e) => updateAlarmStatus(a.id, e.target.value)} style={{ ...inputStyle, padding: "5px 9px", fontSize: 12, color: alarmStatusColor(a.status), fontWeight: 700, flexShrink: 0 }}>
                            {ALARM_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: 12, color: alarmStatusColor(a.status), flexShrink: 0 }}>{a.status}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{a.issue}</div>
                      <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                        Pelapor: {a.pelapor} · Ditangani: <span style={{ color: a.ditanganiOleh ? COLORS.ink : COLORS.inkFaint }}>{a.ditanganiOleh || "—"}</span>
                      </div>
                    </div>
                  ))}
                  {alarmLog.length === 0 && <EmptyRow text="Belum ada laporan darurat." />}
                </div>
              </Card>
            </>
          )}

          {tab === "absensi" && (
            <AbsensiSecurityView
              absensiSecurity={absensiSecurity}
              role={role}
              namaAktif={namaAktif}
              onSubmit={addAbsensiLaporan}
            />
          )}

          {tab === "akses" && canKelolaAkses(role) && (
            <>
              <SectionTitle title="Kelola Akses Pengguna" action={<Btn onClick={() => setShowAddUser(!showAddUser)}><Plus size={15} /> Tambah Pengguna</Btn>} />
              <Card style={{ padding: 16, marginBottom: 18, fontSize: 12.5, color: COLORS.inkSoft }}>
                <b>Administrator</b>: kelola pengguna &amp; peran, akses penuh. <b>Pengurus</b>: akses penuh termasuk verifikasi IPL &amp; persetujuan konten. <b>Security</b>: seperti pengurus untuk urusan darurat, tapi tidak bisa verifikasi pembayaran, approval konten, atau kelola akses. <b>Warga</b>: semua fitur kecuali verifikasi, persetujuan, dan kelola akses.
              </Card>
              {showAddUser && <AddUserForm onCancel={() => setShowAddUser(false)} onSubmit={addPengguna} />}
              <Card>
                <div>
                  {pengguna.map((p) => (
                    <div key={p.id} style={{ padding: "12px 20px", borderBottom: `1px solid ${COLORS.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.nama}</div>
                        <div className="mono" style={{ fontSize: 12, color: COLORS.inkSoft }}>{p.hp}</div>
                      </div>
                      <select value={p.role} onChange={(e) => updatePenggunaRole(p.id, e.target.value)} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12.5, flexShrink: 0 }}>
                        <option value="admin">Administrator</option>
                        <option value="pengurus">Pengurus</option>
                        <option value="security">Security</option>
                        <option value="warga">Warga</option>
                      </select>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </main>
      </div>

      {tab === "darurat" && (
        <>
          {armed && <div className="panic-hint">Ketuk sekali lagi untuk kirim alarm</div>}
          <button className={`panic-btn${armed ? " armed" : ""}`} onClick={handlePanicTap} aria-label="Tombol darurat, ketuk dua kali">
            <Siren size={27} />
          </button>
        </>
      )}
      {showPanicForm && <PanicModal defaultPelapor={namaAktif} onCancel={() => setShowPanicForm(false)} onSubmit={submitPanic} />}
      {showPayModal && myWarga && (
        <PayIPLModal
          myWarga={myWarga}
          onCancel={() => setShowPayModal(false)}
          onSubmit={(monthKeys, dataUrl) => { uploadBuktiBanyakBulan(myWarga.id, monthKeys, dataUrl); setShowPayModal(false); }}
        />
      )}
      {cellModal && (
        <IuranCellModal
          data={cellModal}
          canVerifikasi={canVerifikasi(role)}
          onClose={() => setCellModal(null)}
          onVerifikasi={(bukti) => { verifikasiLunas(cellModal.warga.id, cellModal.monthKey, bukti); setCellModal(null); }}
          onBatalkan={() => { batalkanStatus(cellModal.warga.id, cellModal.monthKey); setCellModal(null); }}
        />
      )}
      {kegiatanDetail && (
        <KegiatanDetailModal
          k={kegiatanDetail}
          onClose={() => setKegiatanDetail(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ============================================================
// Iuran IPL — tampilan Warga (mirip riwayat tagihan)
// ============================================================
function WargaIuranView({ myWarga, onOpenPay }) {
  if (!myWarga) {
    return (
      <>
        <SectionTitle title="Iuran IPL Saya" />
        <Card style={{ padding: 24, textAlign: "center", color: COLORS.inkSoft }}>Data warga untuk akun ini belum terhubung. Hubungi Administrator.</Card>
      </>
    );
  }
  const rows = months12Desc.map((mk) => ({ monthKey: mk, ...myWarga.statusBayar[mk] }));
  const belumCount = rows.filter((r) => r.status === "belum").length;
  const totalTunggakan = belumCount * myWarga.iplPerBulan;

  return (
    <>
      <SectionTitle title="Iuran IPL Saya" subtitle={`Blok ${myWarga.blok} · ${formatRp(myWarga.iplPerBulan)}/bulan`} />
      <Card style={{ padding: 20, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600 }}>{belumCount === 0 ? "Status Pembayaran" : "Total Tunggakan"}</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: belumCount === 0 ? COLORS.success : COLORS.danger, marginTop: 4, letterSpacing: "-0.01em" }}>
            {belumCount === 0 ? "Lunas Semua ✓" : formatRp(totalTunggakan)}
          </div>
          {belumCount > 0 && <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 3 }}>{belumCount} bulan belum dibayar</div>}
        </div>
      </Card>

      <Card style={{ paddingBottom: 90 }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Riwayat Tagihan</div>
        <div>
          {rows.map((r) => (
            <div key={r.monthKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${COLORS.divider}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{monthLabel(r.monthKey)}</div>
                <div className="mono" style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 2 }}>{formatRp(myWarga.iplPerBulan)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </Card>

      {belumCount > 0 && (
        <div className="fab-btn">
          <Btn pill onClick={onOpenPay} style={{ boxShadow: "0 10px 24px rgba(0,113,227,0.35)", fontSize: 15, padding: "13px 22px" }}>
            <Wallet size={16} /> Bayar IPL
          </Btn>
        </div>
      )}
    </>
  );
}

function PayIPLModal({ myWarga, onCancel, onSubmit }) {
  // urut dari yang PALING LAMA menunggak -> paling baru, supaya pembayaran
  // wajib dilunasi berurutan dari tunggakan tertua (tidak boleh loncat bulan)
  const unpaidMonths = months12Asc.filter((mk) => myWarga.statusBayar[mk]?.status === "belum");
  // selectedCount = jumlah bulan (dihitung dari yang tertua) yang akan dibayar
  const [selectedCount, setSelectedCount] = useState(unpaidMonths.length);
  const [preview, setPreview] = useState(null);
  const total = selectedCount * myWarga.iplPerBulan;

  // Ketuk salah satu baris untuk menentukan "dibayar sampai bulan ini" —
  // semua bulan yang lebih lama otomatis ikut tercentang, tidak bisa pilih acak/loncat.
  function handleRowTap(index) {
    setSelectedCount((prev) => (index === prev - 1 ? index : index + 1));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 420, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>Bayar IPL</div>
          <button onClick={onCancel} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
          Tunggakan dibayar berurutan dari yang paling lama. Ketuk bulan terakhir yang ingin dilunasi — bulan-bulan sebelumnya otomatis ikut tercentang.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {unpaidMonths.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft, padding: "10px 0" }}>Tidak ada tagihan yang belum dibayar.</div>}
          {unpaidMonths.map((mk, index) => {
            const checked = index < selectedCount;
            return (
              <label key={mk} onClick={(e) => { e.preventDefault(); handleRowTap(index); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: checked ? COLORS.accentSoft : COLORS.bg, cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={checked} readOnly style={{ width: 17, height: 17, accentColor: COLORS.accent, pointerEvents: "none" }} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{monthLabel(mk)}</span>
                </span>
                <span className="mono" style={{ fontSize: 13, color: COLORS.inkSoft }}>{formatRp(myWarga.iplPerBulan)}</span>
              </label>
            );
          })}
        </div>

        {unpaidMonths.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${COLORS.divider}`, marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Total ({selectedCount} bulan)</span>
              <span className="mono" style={{ fontWeight: 700, fontSize: 17 }}>{formatRp(total)}</span>
            </div>

            <Field label="Bukti Transfer">
              <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "22px 14px", border: `1.5px dashed ${COLORS.divider}`, borderRadius: 12, cursor: "pointer", background: COLORS.bg }}>
                {preview ? (
                  <img src={preview} alt="Bukti transfer" style={{ maxHeight: 120, borderRadius: 8 }} />
                ) : (
                  <>
                    <Upload size={22} color={COLORS.inkSoft} />
                    <span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Ketuk untuk pilih foto bukti transfer</span>
                  </>
                )}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setPreview(reader.result);
                  reader.readAsDataURL(file);
                }} />
              </label>
            </Field>

            <Btn onClick={() => { if (selectedCount === 0 || !preview) return; onSubmit(unpaidMonths.slice(0, selectedCount), preview); }} disabled={selectedCount === 0 || !preview} style={{ width: "100%", marginTop: 16, padding: "12px 0", fontSize: 14.5 }}>
              Kirim Bukti Pembayaran
            </Btn>
          </>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Iuran IPL — modal aksi per sel (tampilan Admin/Pengurus)
// ============================================================
function IuranCellModal({ data, canVerifikasi, onClose, onVerifikasi, onBatalkan }) {
  const { warga: w, monthKey } = data;
  const entry = w.statusBayar[monthKey] || { status: "belum", bukti: null };
  const [buktiManual, setBuktiManual] = useState(null);

  // seluruh bulan yang masih menunggak untuk warga ini (bukan cuma bulan yang diketuk),
  // supaya pengurus bisa kirim 1 pengingat untuk semua tunggakan sekaligus
  const semuaBulanMenunggak = months12Asc.filter((mk) => w.statusBayar[mk]?.status === "belum");
  const totalTunggakan = semuaBulanMenunggak.length * w.iplPerBulan;
  const daftarBulanMenunggak = semuaBulanMenunggak.map(monthLabel).join(", ");

  const waTextSatuBulan = `Halo Bpk/Ibu ${w.nama}, mengingatkan iuran IPL ${monthLabel(monthKey)} sebesar ${formatRp(w.iplPerBulan)} belum kami terima. Mohon dapat diselesaikan, terima kasih 🙏 — Pengurus RT`;
  const waTextSemua = `Halo Bpk/Ibu ${w.nama}, mengingatkan iuran IPL yang masih tertunggak selama ${semuaBulanMenunggak.length} bulan (${daftarBulanMenunggak}) dengan total ${formatRp(totalTunggakan)}. Mohon dapat diselesaikan sekaligus, terima kasih 🙏 — Pengurus RT`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 360, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16.5 }}>{w.nama}</div>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Blok {w.blok} · {monthLabel(monthKey)}</div>
          </div>
          <button onClick={onClose} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <StatusBadge status={entry.status} />
          <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{formatRp(w.iplPerBulan)}</span>
        </div>

        {entry.bukti && (
          <img src={entry.bukti} alt="Bukti transfer" onClick={() => window.open(entry.bukti, "_blank")} style={{ width: "100%", borderRadius: 10, marginBottom: 16, cursor: "pointer" }} />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entry.status === "menunggu" && canVerifikasi && (
            <Btn variant="success" onClick={() => onVerifikasi(null)} style={{ width: "100%", padding: "11px 0" }}><CheckCircle2 size={15} /> Verifikasi Lunas</Btn>
          )}

          {entry.status === "belum" && canVerifikasi && (
            <div style={{ border: `1px dashed ${COLORS.divider}`, borderRadius: 12, padding: 12, background: COLORS.bg }}>
              <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>
                Kalau warga sudah transfer & kirim bukti langsung ke WhatsApp (belum lewat menu Bayar IPL), tandai lunas manual di sini:
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: COLORS.card, border: `1px solid ${COLORS.divider}`, cursor: "pointer", marginBottom: 10, fontSize: 12.5 }}>
                <Upload size={14} color={COLORS.inkSoft} />
                {buktiManual ? "Bukti terpilih ✓ (ganti foto)" : "Upload bukti dari WhatsApp (opsional)"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setBuktiManual(reader.result);
                  reader.readAsDataURL(file);
                }} />
              </label>
              {buktiManual && <img src={buktiManual} alt="Bukti manual" style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} />}
              <Btn variant="success" onClick={() => onVerifikasi(buktiManual)} style={{ width: "100%", padding: "10px 0" }}>
                <CheckCircle2 size={15} /> Tandai Lunas
              </Btn>
            </div>
          )}

          {entry.status === "belum" && semuaBulanMenunggak.length > 1 && (
            <a href={waLink(w.hp, waTextSemua)} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
              <Btn variant="ghost" style={{ width: "100%", padding: "11px 0" }}><Send size={14} /> Ingatkan Semua Tunggakan ({semuaBulanMenunggak.length} bln · {formatRp(totalTunggakan)})</Btn>
            </a>
          )}
          {entry.status === "belum" && (
            <a href={waLink(w.hp, waTextSatuBulan)} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
              <Btn variant="ghost" style={{ width: "100%", padding: "11px 0" }}><Send size={14} /> Ingatkan {monthLabel(monthKey)} Saja</Btn>
            </a>
          )}
          {entry.status !== "belum" && canVerifikasi && (
            <Btn variant="ghost" onClick={onBatalkan} style={{ width: "100%", padding: "11px 0" }}>Batalkan Status</Btn>
          )}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Absensi Security — kalender interaktif + daftar laporan jaga
// ============================================================
const KONDISI_ABSENSI = ["Aman Terkendali", "Ada Gangguan"];

function StripStatus({ entry }) {
  let bg = COLORS.inkFaint; // belum lapor
  if (entry) bg = entry.kondisi === "Ada Gangguan" ? COLORS.danger : COLORS.success;
  return <div style={{ flex: 1, height: 6, borderRadius: 2, background: bg }} />;
}

function AbsensiCard({ iso, shift, entry }) {
  const shiftLabel = shift === "pagi" ? "Pagi" : "Malam";
  if (!entry) {
    return (
      <Card style={{ padding: 16, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: COLORS.inkFaint }}>
          <AlertTriangle size={14} />
          {dayLabelShort(iso)} · Shift {shiftLabel} — belum ada laporan masuk.
        </div>
      </Card>
    );
  }
  const isGangguan = entry.kondisi === "Ada Gangguan";
  return (
    <Card style={{ padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 12, color: COLORS.inkSoft }}>{dayLabelShort(iso)} · Shift {shiftLabel} · {entry.waktuLapor}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: isGangguan ? COLORS.dangerSoft : COLORS.successSoft, color: isGangguan ? COLORS.danger : COLORS.success }}>
          {isGangguan ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
          {entry.kondisi}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{entry.petugasNama}</div>
      {entry.keterangan && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.divider}` }}>
          <div style={{ fontSize: 11, color: COLORS.inkFaint, marginBottom: 3 }}>Keterangan</div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.5 }}>{entry.keterangan}</div>
        </div>
      )}
    </Card>
  );
}

function AbsensiForm({ namaAktif, onCancel, onSubmit }) {
  const [tanggal, setTanggal] = useState(todayISO());
  const [shift, setShift] = useState("pagi");
  const [kondisi, setKondisi] = useState("Aman Terkendali");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (kondisi === "Ada Gangguan" && !keterangan.trim()) {
      setError("Keterangan wajib diisi kalau ada kejadian, untuk dokumentasi.");
      return;
    }
    onSubmit({ tanggal, shift, kondisi, keterangan: keterangan.trim() });
  }

  return (
    <FormShell title="Isi Laporan Jaga" onCancel={onCancel} onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 5 }}>Petugas</div>
        <div style={{ padding: "9px 11px", borderRadius: 7, background: COLORS.bg, fontWeight: 600 }}>{namaAktif}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Tanggal"><input type="date" value={tanggal} max={todayISO()} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} /></Field>
        <Field label="Shift">
          <select value={shift} onChange={(e) => setShift(e.target.value)} style={inputStyle}>
            <option value="pagi">Pagi</option>
            <option value="malam">Malam</option>
          </select>
        </Field>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 6 }}>Kondisi Selama Jaga</div>
        <div style={{ display: "flex", gap: 8 }}>
          {KONDISI_ABSENSI.map((k) => {
            const active = kondisi === k;
            const warna = k === "Ada Gangguan" ? COLORS.danger : COLORS.success;
            const warnaSoft = k === "Ada Gangguan" ? COLORS.dangerSoft : COLORS.successSoft;
            return (
              <button key={k} type="button" onClick={() => setKondisi(k)} style={{
                flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${active ? warna : COLORS.divider}`,
                background: active ? warnaSoft : "#fff",
                color: active ? warna : COLORS.inkSoft,
              }}>{k}</button>
            );
          })}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Field label={`Keterangan ${kondisi === "Ada Gangguan" ? "(wajib diisi)" : "(opsional)"}`}>
          <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={4} placeholder="Ceritakan kejadiannya, misal: kemalingan, keributan warga, kebakaran, atau hal lain yang mengganggu keamanan & ketertiban" style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
      </div>
      {error && <div style={{ fontSize: 12.5, color: COLORS.danger, background: COLORS.dangerSoft, padding: "8px 10px", borderRadius: 6, marginBottom: 12 }}>{error}</div>}
      <Btn type="submit">Simpan Laporan</Btn>
    </FormShell>
  );
}

function AbsensiSecurityView({ absensiSecurity, role, namaAktif, onSubmit }) {
  const [selectedIso, setSelectedIso] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const grid = useMemo(() => buildCalendarGrid(30), []);

  function findEntry(iso, shift) {
    return absensiSecurity.find((a) => a.tanggal === iso && a.shift === shift) || null;
  }

  const recentIsoDesc = useMemo(() => {
    return grid.filter((c) => c.inRange).sort((a, b) => a.dayOffset - b.dayOffset).slice(0, 5).map((c) => c.iso);
  }, [grid]);

  const isoListToShow = selectedIso ? [selectedIso] : recentIsoDesc;

  return (
    <>
      <SectionTitle
        title="Absensi Security"
        subtitle="Laporan kondisi jaga, 1x per shift"
      />

      {showForm && <AbsensiForm namaAktif={namaAktif} onCancel={() => setShowForm(false)} onSubmit={(data) => { onSubmit(data); setShowForm(false); }} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14, fontSize: 12, color: COLORS.inkSoft }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS.success }} />Aman</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS.danger }} />Ada Gangguan</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS.inkFaint }} />Belum Lapor</span>
      </div>

      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((h) => (
            <div key={h} style={{ textAlign: "center", fontSize: 10.5, color: COLORS.inkFaint }}>{h}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {grid.map((cell, i) => {
            if (!cell.inRange) return <div key={i} />;
            const isSelected = cell.iso === selectedIso;
            return (
              <button
                key={i}
                onClick={() => setSelectedIso(isSelected ? null : cell.iso)}
                style={{
                  aspectRatio: "1", borderRadius: 8, cursor: "pointer", padding: 3,
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  border: isSelected ? `2px solid ${COLORS.accent}` : cell.isToday ? `1.5px solid ${COLORS.ink}` : `1px solid ${COLORS.divider}`,
                  background: isSelected ? COLORS.accentSoft : "#fff",
                }}
              >
                <div style={{ fontSize: 10, color: COLORS.inkFaint, textAlign: "right" }}>{cell.tanggalNum}</div>
                <div style={{ display: "flex", gap: 2 }}>
                  <StripStatus entry={findEntry(cell.iso, "pagi")} />
                  <StripStatus entry={findEntry(cell.iso, "malam")} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{selectedIso ? dayLabelShort(selectedIso) : "Laporan Terbaru"}</div>
        {selectedIso && <Btn variant="ghost" onClick={() => setSelectedIso(null)} style={{ padding: "6px 12px", fontSize: 12 }}>Tampilkan Semua</Btn>}
      </div>

      <div style={{ paddingBottom: role === "security" ? 90 : 0 }}>
        {isoListToShow.map((iso) => (
          <React.Fragment key={iso}>
            <AbsensiCard iso={iso} shift="malam" entry={findEntry(iso, "malam")} />
            <AbsensiCard iso={iso} shift="pagi" entry={findEntry(iso, "pagi")} />
          </React.Fragment>
        ))}
      </div>

      {role === "security" && (
        <div className="fab-btn">
          <Btn pill onClick={() => setShowForm(true)} style={{ boxShadow: "0 10px 24px rgba(228,113,30,0.35)", fontSize: 15, padding: "13px 22px" }}>
            <ClipboardCheck size={16} /> Isi Laporan Jaga
          </Btn>
        </div>
      )}
    </>
  );
}

// ============================================================
// komponen lain
// ============================================================
function ContactRow({ nama, jabatan, hp }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLORS.divider}` }}>
      <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{nama}</div><div style={{ fontSize: 12, color: COLORS.inkSoft }}>{jabatan}</div></div>
      <div style={{ display: "flex", gap: 6 }}>
        <a href={`tel:${hp}`}><Btn variant="ghost" style={{ padding: "7px 10px" }}><Phone size={13} /></Btn></a>
        <a href={waLink(hp, "")} target="_blank" rel="noreferrer"><Btn variant="success" style={{ padding: "7px 10px" }}><MessageCircle size={13} /></Btn></a>
      </div>
    </div>
  );
}

function FormShell({ title, onCancel, onSubmit, children }) {
  return (
    <Card style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16.5 }}>{title}</div>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkSoft }}><X size={18} /></button>
      </div>
      <form onSubmit={onSubmit}>{children}</form>
    </Card>
  );
}

function ExpenseFormInline({ onCancel, onSubmit }) {
  const [tanggal, setTanggal] = useState(todayISO());
  const [kategori, setKategori] = useState(KATEGORI_PENGELUARAN_LIST[0]);
  const [subkategori, setSubkategori] = useState(KATEGORI_PENGELUARAN[KATEGORI_PENGELUARAN_LIST[0]][0]);
  const [keterangan, setKeterangan] = useState("");
  const [jumlah, setJumlah] = useState("");

  function changeKategori(k) {
    setKategori(k);
    setSubkategori(KATEGORI_PENGELUARAN[k][0]);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!keterangan || !jumlah) return; onSubmit({ tanggal, kategori, subkategori, keterangan, jumlah: Number(jumlah) }); }} style={{ display: "grid", gap: 12, border: `1px solid ${COLORS.divider}`, borderRadius: 12, padding: 16, background: COLORS.bg }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tanggal"><input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} /></Field>
        <Field label="Kategori">
          <select value={kategori} onChange={(e) => changeKategori(e.target.value)} style={inputStyle}>
            {KATEGORI_PENGELUARAN_LIST.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Sub Kategori">
        <select value={subkategori} onChange={(e) => setSubkategori(e.target.value)} style={inputStyle}>
          {KATEGORI_PENGELUARAN[kategori].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Keterangan"><input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="mis. Gaji bulanan — Pak Sandi" style={inputStyle} /></Field>
      <Field label="Jumlah (Rp)"><input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn type="submit">Simpan Pengeluaran</Btn>
        <Btn type="button" variant="ghost" onClick={onCancel}>Batal</Btn>
      </div>
    </form>
  );
}

function KegiatanForm({ onCancel, onSubmit, initial }) {
  const [tipe, setTipe] = useState(initial?.tipe || "Kegiatan");
  const [tanggal, setTanggal] = useState(initial?.tanggal || todayISO());
  const [judul, setJudul] = useState(initial?.judul || "");
  const [isi, setIsi] = useState(initial?.isi || "");
  const [foto, setFoto] = useState(initial?.foto || null);
  return (
    <FormShell title={initial ? "Edit Catatan" : "Tambah Catatan Kegiatan / Notulensi"} onCancel={onCancel} onSubmit={(e) => { e.preventDefault(); if (!judul) return; onSubmit({ tipe, tanggal, judul, isi, foto }); }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Jenis">
          <select value={tipe} onChange={(e) => setTipe(e.target.value)} style={inputStyle}>
            <option>Kegiatan</option><option>Notulensi</option>
          </select>
        </Field>
        <Field label="Tanggal"><input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ marginBottom: 12 }}><Field label="Judul"><input value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="mis. Rapat Rutin Bulanan" style={inputStyle} /></Field></div>
      <div style={{ marginBottom: 12 }}>
        <Field label="Isi / Ringkasan">
          <textarea value={isi} onChange={(e) => setIsi(e.target.value)} rows={5} placeholder={"Tulis isi bebas...\n\nUntuk notulensi, mulai baris dengan tanda - supaya jadi poin rapi, misal:\n- Laporan keuangan disetujui\n- Rencana HUT RI minggu ketiga Agustus"} style={{ ...inputStyle, resize: "vertical", fontFamily: "'Inter', sans-serif" }} />
        </Field>
        <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 5 }}>Tips: baris yang diawali tanda "-" otomatis tampil sebagai poin/bullet rapi.</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Field label="Foto Sampul (opsional)">
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: foto ? 0 : "20px 14px", border: foto ? "none" : `1.5px dashed ${COLORS.divider}`, borderRadius: 12, cursor: "pointer", background: foto ? "transparent" : COLORS.bg, overflow: "hidden" }}>
            {foto ? (
              <img src={foto} alt="Foto sampul" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10 }} />
            ) : (
              <>
                <Upload size={20} color={COLORS.inkSoft} />
                <span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Ketuk untuk pilih foto</span>
              </>
            )}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setFoto(reader.result);
              reader.readAsDataURL(file);
            }} />
          </label>
          {foto && (
            <button type="button" onClick={() => setFoto(null)} style={{ background: "none", border: "none", color: COLORS.danger, fontSize: 12, cursor: "pointer", padding: 0, marginTop: 6 }}>
              Hapus foto
            </button>
          )}
        </Field>
      </div>
      <Btn type="submit">{initial ? "Simpan Perubahan" : "Simpan Catatan"}</Btn>
    </FormShell>
  );
}

function KegiatanDetailModal({ k, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ maxWidth: 520, width: "100%", maxHeight: "88vh", overflowY: "auto", overflow: "hidden" }}>
        {k.foto && <img src={k.foto} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover" }} />}
        <div style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: k.tipe === "Notulensi" ? COLORS.warning : COLORS.accent }}>{k.tipe}</span>
              <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em", marginTop: 4 }}>{k.judul}</div>
            </div>
            <button onClick={onClose} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 16 }}>{k.tanggal}{k.diajukanOleh ? ` · Diajukan oleh ${k.diajukanOleh}` : ""}</div>
          <ContentBlocks text={k.isi} style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }} />
        </div>
      </Card>
    </div>
  );
}

function AddUserForm({ onCancel, onSubmit }) {
  const [nama, setNama] = useState("");
  const [hp, setHp] = useState("");
  const [role, setRole] = useState("warga");
  return (
    <FormShell title="Tambah Pengguna" onCancel={onCancel} onSubmit={(e) => { e.preventDefault(); if (!nama || !hp) return; onSubmit({ nama, hp, role }); }}>
      <div className="row-3" style={{ marginBottom: 16 }}>
        <Field label="Nama"><input value={nama} onChange={(e) => setNama(e.target.value)} style={inputStyle} /></Field>
        <Field label="No. HP"><input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="0812xxxxxxx" style={inputStyle} /></Field>
        <Field label="Peran">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            <option value="admin">Administrator</option><option value="pengurus">Pengurus</option><option value="security">Security</option><option value="warga">Warga</option>
          </select>
        </Field>
      </div>
      <Btn type="submit">Simpan Pengguna</Btn>
    </FormShell>
  );
}

function PanicModal({ defaultPelapor, onCancel, onSubmit }) {
  const [issue, setIssue] = useState(issueOptions[0]);
  const [catatan, setCatatan] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 380, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: COLORS.dangerSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle color={COLORS.danger} size={19} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Laporan Darurat</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ pelapor: defaultPelapor, issue, catatan }); }} style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 5 }}>Pelapor</div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: COLORS.bg, fontWeight: 600 }}>{defaultPelapor}</div>
          </div>
          <Field label="Jenis Masalah">
            <select value={issue} onChange={(e) => setIssue(e.target.value)} style={inputStyle}>
              {issueOptions.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Catatan singkat (opsional)"><textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={3} placeholder="mis. Ada orang mencurigakan di depan Blok B" style={{ ...inputStyle, resize: "vertical" }} /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn type="submit" variant="danger"><Siren size={14} /> Kirim Alarm</Btn>
            <Btn type="button" variant="ghost" onClick={onCancel}>Batal</Btn>
          </div>
        </form>
      </Card>
    </div>
  );
}

function LoginScreen({ pengguna, onLogin, demoPin }) {
  const [hp, setHp] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showList, setShowList] = useState(false);

  function doLogin() {
    const result = onLogin(hp, pin);
    if (!result.ok) setError(result.message);
  }
  function handleKeyDown(e) { if (e.key === "Enter") doLogin(); }
  function quickLogin(role) {
    const contoh = pengguna.find((p) => p.role === role);
    if (!contoh) return;
    loginAs(contoh);
  }
  function loginAs(akun) {
    setHp(akun.hp);
    setPin(demoPin);
    setError("");
    const result = onLogin(akun.hp, demoPin);
    if (!result.ok) setError(result.message);
  }

  return (
    <div style={{ minHeight: "100%", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <Card style={{ padding: 30, maxWidth: 380, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", color: COLORS.ink }}>SBT Pintar</div>
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 24 }}>Cluster Sindangbarang Terrace</div>

        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <Field label="No. HP terdaftar"><input value={hp} onChange={(e) => setHp(e.target.value)} onKeyDown={handleKeyDown} placeholder="0812xxxxxxxx" style={inputStyle} /></Field>
          <Field label="PIN"><input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={handleKeyDown} placeholder="6 digit" style={inputStyle} /></Field>
          {error && <div style={{ fontSize: 12.5, color: COLORS.danger, background: COLORS.dangerSoft, padding: "9px 12px", borderRadius: 10 }}>{error}</div>}
          <Btn type="button" onClick={doLogin} style={{ padding: "12px 0" }}>Masuk</Btn>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.divider}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginBottom: 10 }}>
            Prototype demo — belum ada backend sungguhan. Gunakan PIN <b>{demoPin}</b> untuk akun mana pun, atau login cepat sebagai:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <Btn variant="ghost" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={() => quickLogin("admin")}>Administrator</Btn>
            <Btn variant="ghost" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={() => quickLogin("pengurus")}>Pengurus</Btn>
            <Btn variant="ghost" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={() => quickLogin("security")}>Security</Btn>
            <Btn variant="ghost" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={() => quickLogin("warga")}>Warga</Btn>
          </div>
          <button type="button" onClick={() => setShowList(!showList)} style={{ background: "none", border: "none", color: COLORS.accent, fontWeight: 600, fontSize: 12.5, cursor: "pointer", padding: 0 }}>
            {showList ? "Sembunyikan daftar akun" : "Lihat & pilih dari semua akun terdaftar →"}
          </button>
          {showList && (
            <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 10, border: `1px solid ${COLORS.divider}`, borderRadius: 10 }}>
              {pengguna.map((p) => (
                <button key={p.id} type="button" onClick={() => loginAs(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 12px", border: "none", borderBottom: `1px solid ${COLORS.divider}`, background: COLORS.card, cursor: "pointer", textAlign: "left" }}>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.nama}</div>
                    <div className="mono" style={{ fontSize: 11, color: COLORS.inkSoft }}>{p.hp}</div>
                  </span>
                  <span style={{ fontSize: 10.5, color: COLORS.accent, fontWeight: 700 }}>{roleLabel[p.role]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
