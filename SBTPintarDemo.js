"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Wallet, CalendarDays, FileText, Siren,
  Phone, MessageCircle, Plus, X, Printer, ShieldCheck, Upload,
  UserCog, CheckCircle2, Clock, AlertTriangle, XCircle, Send, ImageIcon, Pencil, ClipboardCheck, Info, Trash2, MoreVertical, KeyRound,
  TrendingUp, TrendingDown, Users, ChevronDown, PieChart as PieChartIcon, Settings, Ban,
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
const roleLabel = { pengurus: "Pengurus", security: "Security", warga: "Warga" };
const canVerifikasi = (role) => role === "pengurus";
const canApprove = (role) => role === "pengurus";
const canKelolaAkses = (role) => role === "pengurus";
const canCatatKeuangan = (role) => role === "pengurus";

// ============================================================
// Pos Anggaran — SATU sumber untuk kategori transaksi SEKALIGUS budget
// tahunan. Tiap Pos = kategori transaksi (dipilih langsung saat catat
// pengeluaran) + pagu tahunan (bisa diedit pengurus) + daftar sub-kategori.
// Realisasi = total transaksi keluar tahun berjalan dengan kategori =
// nama pos itu — tidak ada lagi aturan pencocokan terpisah yang bisa
// "putus" kalau nama diubah, karena rename pos otomatis migrasi transaksi.
// ============================================================
const POS_ANGGARAN_DEFAULT = [
  {
    grup: "Operasional",
    pos: [
      { id: "pos1", nama: "Gaji Security", pagu: 1650000 * 3 * 12, sub: ["Pembayaran Gaji Security", "Kasbon Security"], catatan: "termasuk kasbon security" },
      { id: "pos2", nama: "Kopi/Gula/Gas LPG", pagu: 250000 * 12, sub: ["Kopi/Gula/Gas LPG"] },
      { id: "pos3", nama: "Insentif Babinsa/Bhabinkamtibmas", pagu: 200000 * 12, sub: ["Insentif Bhabinkamtibmas", "Insentif Bhabinsa"] },
      { id: "pos4", nama: "Tagihan Bulanan", pagu: 50000 * 12, sub: ["Tagihan PDAM", "Tagihan Listrik", "Tagihan Internet"] },
      { id: "pos5", nama: "Jasa Pengambilan Sampah", pagu: 500000 * 12, sub: ["Jasa Pengambilan Sampah"] },
    ],
  },
  { grup: "Subsidi THR", pos: [{ id: "pos6", nama: "Subsidi THR", pagu: 1500000, sub: ["Subsidi THR"] }] },
  { grup: "Iuran RT", pos: [{ id: "pos7", nama: "Iuran RT / Dana Kematian", pagu: 5000 * 35 * 12, sub: ["Iuran Dana Kematian"] }] },
  {
    grup: "Kegiatan warga",
    pos: [
      { id: "pos8", nama: "Kegiatan Warga (Umum)", pagu: 5000000, sub: ["Rapat Pengurus", "Pertemuan Warga", "Kerja Bakti", "Pelaksanaan Qurban", "17 Agustusan", "Tahun Baru", "Buka Bersama", "Halal Bihalal", "Kegiatan Lainnya"] },
      { id: "pos9", nama: "Kegiatan Bapak-bapak", pagu: 500000, sub: ["Kegiatan Bapak-bapak"] },
      { id: "pos10", nama: "Kegiatan Ibu-ibu", pagu: 500000, sub: ["Kegiatan Ibu-ibu"] },
      { id: "pos11", nama: "Kegiatan Anak-anak", pagu: 500000, sub: ["Kegiatan Anak-anak"] },
    ],
  },
  { grup: "Pengadaan barang / jasa", pos: [{ id: "pos12", nama: "Pengadaan Barang/Jasa", pagu: 500000, sub: ["Pengadaan Barang/Jasa"] }] },
  { grup: "Bantuan sosial", pos: [{ id: "pos13", nama: "Bantuan Sosial", pagu: 1000000, sub: ["Bantuan Sosial"] }] },
];
// Kategori di luar budget — tidak dilacak pagu, selalu tersedia di dropdown
const KATEGORI_TANPA_BUDGET = "Lain-lain";
const SUB_TANPA_BUDGET = ["Lain-lain"];

function flattenPos(posAnggaran) {
  return posAnggaran.flatMap((g) => g.pos.map((p) => ({ ...p, grup: g.grup })));
}
function getKategoriList(posAnggaran) {
  return [...flattenPos(posAnggaran).map((p) => p.nama), KATEGORI_TANPA_BUDGET];
}
function getSubUntukKategori(posAnggaran, kategoriNama) {
  const pos = flattenPos(posAnggaran).find((p) => p.nama === kategoriNama);
  return pos ? pos.sub : SUB_TANPA_BUDGET;
}
function hitungRealisasiPos(posNama, transaksi, tahun) {
  return transaksi
    .filter((t) => t.tipe === "keluar" && t.kategori === posNama && t.tanggal.slice(0, 4) === String(tahun))
    .reduce((s, t) => s + t.jumlah, 0);
}
// beban operasional = pengeluaran rutin wajib tiap bulan — dipakai untuk
// kartu Cadangan Kas di Ringkasan
function getKategoriOperasional(posAnggaran) {
  const grupOperasional = posAnggaran.find((g) => g.grup === "Operasional");
  return grupOperasional ? grupOperasional.pos.map((p) => p.nama) : [];
}

// pemasukan di luar IPL (yang otomatis dari verifikasi pembayaran) — dicatat manual oleh pengurus
// (catatan pemasukan sekarang otomatis — Pembayaran IPL & Iuran THR
// dihasilkan sistem lewat verifikasi, tidak perlu input manual lagi)
// Periode Iuran THR — sukarela, 1x/tahun, bergeser ikut kalender Lebaran.
// Pengurus atur bulan & tahun-nya tiap tahun lewat menu Setting.
const THR_CONFIG_DEFAULT = { tahun: "2026", bulan: "2026-03", aktif: true };

// ============================================================
// seed data
// ============================================================
const SALDO_AWAL_KAS = 6800000;
const IPL_PER_BULAN = 200000;
const IPL_DISKON = 100000;
const REKENING_IPL = { bank: "Bank BCA", nomor: "1234567890", atasNama: "Bendahara" };
const BUKTI_CONTOH = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=200&q=60";

// Status IPL per rumah berbasis RIWAYAT PERIODE, bukan 1 angka tetap —
// karena bisa berubah dari waktu ke waktu (pindah huni, disita bank,
// dijual lagi, dst). riwayatIPL = daftar periode terurut kronologis:
//   { dari: "2026-01", sampai: "2026-05" atau null (masih berlaku), status: "aktif"/"nonaktif", tarif }
// Kalau rumah tidak punya riwayatIPL sama sekali (data lama), dianggap
// 1 periode aktif-normal terbuka dari awal — supaya tidak ada yang "hilang"
// tagihannya begitu saja saat fitur ini ditambahkan.
function getTagihanBulan(w, monthKey) {
  const riwayat = w.riwayatIPL && w.riwayatIPL.length > 0
    ? w.riwayatIPL
    : [{ dari: null, sampai: null, status: "aktif", tarif: w.iplPerBulan || IPL_PER_BULAN }];
  const periode = riwayat.find((p) => (!p.dari || p.dari <= monthKey) && (!p.sampai || p.sampai >= monthKey));
  if (!periode || periode.status === "nonaktif") return { status: "nonaktif", tarif: 0 };
  return { status: "aktif", tarif: periode.tarif };
}
// tambah periode baru — otomatis menutup periode terbuka sebelumnya
// (set `sampai`-nya ke bulan sebelum periode baru mulai)
function tambahPeriodeIPL(riwayatLama, periodeBaru) {
  const bulanSebelum = (mk) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
  const riwayat = (riwayatLama || []).map((p) => p.sampai === null ? { ...p, sampai: bulanSebelum(periodeBaru.dari) } : p);
  return [...riwayat, { id: uid(), ...periodeBaru }].sort((a, b) => (a.dari || "0000-00").localeCompare(b.dari || "0000-00"));
}

// status organisasi — dropdown baku, dikelola admin lewat menu Akses
const STATUS_OPTIONS = ["Ketua", "Bendahara", "Sekretaris", "Keamanan", "EO & Dokumentasi", "Security", "Warga"];
const ROLE_OPTIONS = ["pengurus", "security", "warga"];

// cari kontak utama (yang di-flag reminderIPL) untuk 1 rumah; fallback ke
// penghuni pertama kalau belum ada yang di-flag sama sekali
function getKontakUtama(wargaId, penggunaList) {
  const penghuni = penggunaList.filter((p) => p.wargaId === wargaId);
  return penghuni.find((p) => p.reminderIPL) || penghuni[0] || null;
}
function getPenghuniRumah(wargaId, penggunaList) {
  return penggunaList.filter((p) => p.wargaId === wargaId);
}

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
  ["Bani", "A1"], ["Deri", "A2"], ["Agus Wijaya", "A3"], ["Dewi Lestari", "A4"],
  ["Hendra Gunawan", "B1"], ["Rina Marlina", "B2"], ["Joko Prasetyo", "B3"], ["Nur Aini", "B4"],
];
const semuaNamaBlok = [...namaBlokInti, ...namaBlokTambahan]; // total 36 rumah

// pola tunggakan supaya data contoh realistis: sebagian warga menunggak 1-3 bulan,
// sebagian sedang menunggu verifikasi bulan berjalan, sisanya lunas semua
const ARREARS_3 = new Set([7, 22]);
const ARREARS_2 = new Set([2, 15, 28]);
const ARREARS_1 = new Set([5, 9, 18, 31]);
const MENUNGGU_BULAN_INI = new Set([0, 4, 12, 20, 25]);
// skenario partisipasi Iuran THR 2026 (sukarela — sengaja tidak semua ikut)
const THR_50RB = new Set([1, 3, 6, 8, 10, 13, 16, 19, 21, 24, 27, 30, 33, 35]); // 14 rumah @ Rp50rb
const THR_100RB = new Set([4, 11, 17, 26, 32]); // 5 rumah @ Rp100rb
const THR_LEBIH = { 14: 150000, 23: 200000, 29: 250000 }; // 3 rumah, nominal lebih besar
const THR_MENUNGGU = { 2: 50000, 20: 100000 }; // 2 rumah sudah upload, menunggu verifikasi pengurus

// `warga` = entitas RUMAH (bukan orang) — 1 baris per no. rumah (format
// "SBT 01".."SBT 36"), jadi dasar kewajiban IPL. Nama & nomor HP penghuni
// ada di `pengguna` (bisa lebih dari 1 orang per rumah). "Pos Security"
// BUKAN bagian dari array ini karena tidak ikut tagihan IPL — security
// ditampilkan dengan lokasi teks biasa, lihat WargaDirectoryView.
const formatNoRumah = (i) => `SBT ${String(i + 1).padStart(2, "0")}`;
// `kepemilikan` (Pemilik/Penyewa) dipasang per-orang di `pengguna`, BUKAN di
// rumah — supaya kasus pemilik tidak tinggal di situ (disewakan) tetap bisa
// tercatat: pemilik & penyewa sama-sama muncul di kartu rumah yang sama.
const PENYEWA_INDEXES = new Set([2, 9, 14, 20, 27, 33]); // sebagian penghuni berstatus penyewa, sisanya pemilik
const seedWarga = semuaNamaBlok.map(([_namaAwal], i) => {
  const arrears = ARREARS_3.has(i) ? 3 : ARREARS_2.has(i) ? 2 : ARREARS_1.has(i) ? 1 : 0;
  const menungguBulanIni = arrears === 0 && MENUNGGU_BULAN_INI.has(i);
  const statusBayar = {};
  months12Desc.forEach((monthKey, k) => {
    if (k < arrears) statusBayar[monthKey] = { status: "belum", bukti: null };
    else if (k === 0 && menungguBulanIni) statusBayar[monthKey] = { status: "menunggu", bukti: BUKTI_CONTOH };
    else statusBayar[monthKey] = { status: "lunas", bukti: null };
  });
  const thr = {};
  if (THR_50RB.has(i)) thr["2026"] = { status: "lunas", jumlah: 50000, bukti: null };
  else if (THR_100RB.has(i)) thr["2026"] = { status: "lunas", jumlah: 100000, bukti: null };
  else if (THR_LEBIH[i]) thr["2026"] = { status: "lunas", jumlah: THR_LEBIH[i], bukti: null };
  else if (THR_MENUNGGU[i]) thr["2026"] = { status: "menunggu", jumlah: THR_MENUNGGU[i], bukti: BUKTI_CONTOH };
  // riwayat status IPL — contoh kasus nyata di 2 rumah pertama, sisanya
  // default 1 periode aktif-normal terbuka (belum pernah berubah)
  let riwayatIPL;
  if (i === 0) {
    // SBT 01: dihuni & tarif normal Jan-Mei, lalu kosong tapi pemilik tetap
    // wajib kontribusi dengan tarif diskon sejak Juni
    riwayatIPL = [
      { id: "r1a", dari: "2026-01", sampai: "2026-05", status: "aktif", tarif: IPL_PER_BULAN },
      { id: "r1b", dari: "2026-06", sampai: null, status: "aktif", tarif: IPL_DISKON },
    ];
  } else if (i === 1) {
    // SBT 02: normal Jan-Mei, disita bank sejak Juni — tidak ada kewajiban
    // sampai ada pemilik baru (pengurus tinggal tambah periode baru nanti)
    riwayatIPL = [
      { id: "r2a", dari: "2026-01", sampai: "2026-05", status: "aktif", tarif: IPL_PER_BULAN },
      { id: "r2b", dari: "2026-06", sampai: null, status: "nonaktif", tarif: 0 },
    ];
  } else {
    riwayatIPL = [{ id: `r${i}-default`, dari: null, sampai: null, status: "aktif", tarif: IPL_PER_BULAN }];
  }
  return {
    id: `w${i + 1}`,
    noRumah: formatNoRumah(i),
    iplPerBulan: IPL_PER_BULAN,
    statusBayar,
    thr,
    riwayatIPL,
  };
});

const seedKegiatan = [
  {
    id: "k1", tipe: "Kegiatan", tanggal: `${recentMonths[0]}-07`,
    judul: "Kerja Bakti Bulanan & Gotong Royong Saluran Air",
    isi: "Kerja bakti rutin membersihkan saluran air dan area taman cluster, diikuti sekitar 20 KK. Fokus utama pembersihan got depan Blok A dan B, serta pengecatan ulang pos satpam. Konsumsi disediakan dari kas warga.",
    diajukanOleh: "Pak Ridwan",
  },
  {
    id: "k2", tipe: "Notulensi", tanggal: `${recentMonths[0]}-14`,
    judul: "Notulensi Rapat Warga Bulanan",
    isi: "- Laporan keuangan bulan berjalan disetujui warga\n- Usulan penambahan CCTV di pintu masuk cluster akan disurvei biayanya oleh Pak Anwar\n- Rencana HUT RI disepakati minggu ketiga Agustus\n- Warga diimbau segera melunasi IPL yang tertunggak lewat fitur Bayar IPL di aplikasi",
    diajukanOleh: "Pak Surya",
  },
  {
    id: "k3", tipe: "Kegiatan", tanggal: todayISO(),
    judul: "Rencana Nonton Bareng 17 Agustusan di Lapangan Cluster",
    isi: "Pengurus berencana mengadakan nonton bareng & lomba kecil menyambut 17 Agustus di lapangan tengah cluster. Anggaran konsumsi akan diambil dari kas kegiatan.",
    diajukanOleh: "Pak Ridwan",
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
    .filter((monthKey) => getTagihanBulan(w, monthKey).status === "aktif" && w.statusBayar[monthKey]?.status === "lunas")
    .map((monthKey) => ({
      id: `masuk-${w.id}-${monthKey}`, tipe: "masuk", tanggal: `${monthKey}-05`,
      kategori: "Pembayaran IPL", subkategori: null,
      keterangan: `IPL ${monthLabel(monthKey)} — ${w.noRumah}`, jumlah: getTagihanBulan(w, monthKey).tarif,
      wargaId: w.id, monthKey,
    }))
);
const seedPemasukanDariThr = seedWarga
  .filter((w) => w.thr?.["2026"]?.status === "lunas")
  .map((w) => ({
    id: `masuk-thr-${w.id}`, tipe: "masuk", tanggal: `${THR_CONFIG_DEFAULT.bulan}-20`,
    kategori: "Iuran THR", subkategori: null,
    keterangan: `Iuran THR 2026 — ${w.noRumah}`, jumlah: w.thr["2026"].jumlah,
    wargaId: w.id, thrTahun: "2026",
  }));

const seedTransaksi = [
  ...seedPemasukanDariIuran,
  ...seedPemasukanDariThr,
  { id: "t1", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Gaji Security", subkategori: "Pembayaran Gaji Security", keterangan: "Gaji bulanan — Pak Sandi", jumlah: 1650000 },
  { id: "t2", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Gaji Security", subkategori: "Pembayaran Gaji Security", keterangan: "Gaji bulanan — Pak Fajar", jumlah: 1650000 },
  { id: "t3", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Gaji Security", subkategori: "Pembayaran Gaji Security", keterangan: "Gaji bulanan — Pak Ferial", jumlah: 1650000 },
  { id: "t4", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Insentif Babinsa/Bhabinkamtibmas", subkategori: "Insentif Bhabinkamtibmas", keterangan: "Insentif bulanan", jumlah: 100000 },
  { id: "t5", tipe: "keluar", tanggal: `${recentMonths[0]}-05`, kategori: "Insentif Babinsa/Bhabinkamtibmas", subkategori: "Insentif Bhabinsa", keterangan: "Insentif bulanan", jumlah: 100000 },
  { id: "t5b", tipe: "keluar", tanggal: `${recentMonths[0]}-11`, kategori: "Gaji Security", subkategori: "Kasbon Security", keterangan: "Kasbon — Pak Sandi (keperluan keluarga mendesak)", jumlah: 500000 },
  { id: "t6", tipe: "keluar", tanggal: `${recentMonths[0]}-08`, kategori: "Jasa Pengambilan Sampah", subkategori: "Jasa Pengambilan Sampah", keterangan: "Iuran petugas kebersihan bulanan", jumlah: 500000 },
  { id: "t7", tipe: "keluar", tanggal: `${recentMonths[0]}-10`, kategori: "Tagihan Bulanan", subkategori: "Tagihan Listrik", keterangan: "Listrik pos satpam & taman", jumlah: 350000 },
  { id: "t8", tipe: "keluar", tanggal: `${recentMonths[0]}-07`, kategori: "Kegiatan Warga (Umum)", subkategori: "Kerja Bakti", keterangan: "Konsumsi kerja bakti bulanan", jumlah: 600000 },
  { id: "t9", tipe: "keluar", tanggal: `${recentMonths[0]}-12`, kategori: "Iuran RT / Dana Kematian", subkategori: "Iuran Dana Kematian", keterangan: "Setoran dana kematian bulanan", jumlah: 300000 },
];

// Hotline Center Kota Bogor — sumber: akun Instagram resmi @dinkeskotabogor
// ("Hotline Center untuk Situasi Darurat"), per 6 November 2025. Sebaiknya
// dicek berkala karena nomor instansi bisa berubah. Sekarang bisa
// diedit/dihapus/ditambah lewat aplikasi (menu Kontak Darurat, pengurus).
const seedKontakDarurat = [
  { id: "kd1", nama: "Layanan Darurat Kota Bogor", ket: "Pengaduan masyarakat 24 jam — pelayanan publik, lingkungan, kesehatan, kejadian darurat", hp: "112" },
  { id: "kd2", nama: "SiBadra Kota Bogor", ket: "Pengaduan masyarakat — pelayanan publik, lingkungan, kesehatan, kejadian darurat", hp: "0811 9600 0060", wa: "08119600060" },
  { id: "kd3", nama: "DAMKAR Kota Bogor", ket: "Kebakaran, penyelamatan & evakuasi darurat", hp: "(0251) 8322100", wa: "085385104100" },
  { id: "kd4", nama: "PSC GESIT DINKES Kota Bogor", ket: "Layanan ambulans & pertolongan medis darurat", hp: "119", wa: "08111116093" },
  { id: "kd5", nama: "KSR PMI Kota Bogor", ket: "Kedaruratan medis, donor darah & evakuasi korban bencana", hp: "0857 7294 9625", wa: "085772949625" },
  { id: "kd6", nama: "BPBD Kota Bogor", ket: "Penanggulangan bencana alam, evakuasi & bantuan darurat", hp: "0888 0911 2569", wa: "088809112569" },
  { id: "kd7", nama: "TAGANA Kota Bogor", ket: "Bantuan sosial, logistik & dukungan psikososial saat bencana", hp: "0878 7333 1178", wa: "087873331178" },
  // nomor institusi resmi terverifikasi via pencarian (bukan dari Instagram di atas)
  { id: "kd8", nama: "RSUD Kota Bogor", ket: "Rumah Sakit Umum Daerah Kota Bogor — IGD 24 jam", hp: "(0251) 8312292", wa: "82183883851" },
  { id: "kd9", nama: "Polsek Bogor Barat", ket: "Kantor Kepolisian Sektor Bogor Barat", hp: "(0251) 8322054" },
];

// Perangkat Desa & Keamanan Wilayah — nama & nomor contoh, WAJIB diganti
// data asli. Bisa diedit/dihapus/ditambah lewat aplikasi.
const seedPerangkatDesa = [
  { id: "pd1", nama: "Drs. Ahmad Fauzi", jabatan: "Camat Bogor Barat", hp: "0812 3456 7890" },
  { id: "pd2", nama: "", jabatan: "Kepala Desa", hp: "" },
  { id: "pd3", nama: "", jabatan: "Ketua RW", hp: "" },
  { id: "pd4", nama: "", jabatan: "Ketua RT", hp: "" },
  { id: "pd5", nama: "Pak Suherman", jabatan: "Bhabinkamtibmas — Polsek Bogor Barat", hp: "0813 1234 5678" },
  { id: "pd6", nama: "Kopka Suryanto", jabatan: "Babinsa — Koramil setempat", hp: "0812 8765 4321" },
];

const seedPengguna = [
  { id: "u1", nama: "Admin Sistem", hp: "081200000000", role: "pengurus", jabatan: "" },
  // pengurus juga penduduk asli — masing-masing dikaitkan ke rumahnya sendiri
  // (SBT 05-09), bukan akun "melayang" tanpa alamat
  { id: "u2", nama: "Pak Ridwan", hp: "081210000001", role: "pengurus", jabatan: "Ketua", wargaId: "w5", kepemilikan: "Pemilik", reminderIPL: true },
  { id: "u3", nama: "Pak Surya", hp: "081210000002", role: "pengurus", jabatan: "Sekretaris", wargaId: "w6", kepemilikan: "Pemilik", reminderIPL: true },
  { id: "u4", nama: "Pak Bayu", hp: "081210000003", role: "pengurus", jabatan: "Bendahara", wargaId: "w7", kepemilikan: "Penyewa", reminderIPL: true },
  { id: "u5", nama: "Pak Anwar", hp: "081210000004", role: "pengurus", jabatan: "Keamanan", wargaId: "w8", kepemilikan: "Pemilik", reminderIPL: true },
  { id: "u5b", nama: "Pak Doni", hp: "081210000005", role: "pengurus", jabatan: "EO & Dokumentasi", wargaId: "w9", kepemilikan: "Pemilik", reminderIPL: true },
  // contoh: istri Pak Ridwan ikut tinggal di rumah yang sama (SBT 05) —
  // statusnya "Warga" biasa, bukan "Pengurus", walau serumah dengan Ketua
  { id: "u_w5b", nama: "Istri Pak Ridwan", hp: "081210000099", role: "warga", jabatan: "", kepemilikan: "Pemilik", wargaId: "w5", reminderIPL: false },
  { id: "u6", nama: "Pak Sandi", hp: "081220000001", role: "security", jabatan: "" },
  { id: "u7", nama: "Pak Fajar", hp: "081220000002", role: "security", jabatan: "" },
  { id: "u8", nama: "Pak Ferial", hp: "081220000003", role: "security", jabatan: "" },
  // penghuni tiap rumah — nama & no.hp asli penghuni ada DI SINI (bukan di
  // `warga`), supaya 1 rumah bisa punya lebih dari 1 akun (suami/istri/dll).
  // `reminderIPL: true` menandai siapa yang jadi kontak utama penagihan —
  // cuma boleh 1 orang per rumah (dijaga lewat function updateWargaLengkap).
  // Rumah w5-w9 SUDAH dihuni pengurus (lihat atas), jadi di-skip di sini
  // supaya tidak ada 2 "kontak utama" berebutan di rumah yang sama.
  ...semuaNamaBlok
    .map(([nama], i) => ({
      id: `u_w${i + 1}`,
      nama,
      hp: `0812300000${String(i + 1).padStart(2, "0")}`,
      role: "warga",
      jabatan: "",
      kepemilikan: PENYEWA_INDEXES.has(i) ? "Penyewa" : "Pemilik",
      wargaId: `w${i + 1}`,
      reminderIPL: true,
    }))
    .filter((p) => !["w5", "w6", "w7", "w8", "w9"].includes(p.wargaId)),
  // contoh SBT 03: rumah disewakan — Agus & istri tinggal di situ sebagai
  // penyewa (Agus jadi kontak utama IPL), pemilik aslinya (Budiman) tidak
  // tinggal di situ tapi tetap tercatat sebagai pemilik rumah tersebut
  { id: "u_w3b", nama: "Istri Agus Wijaya", hp: "081230000099", role: "warga", jabatan: "", kepemilikan: "Penyewa", wargaId: "w3", reminderIPL: false },
  { id: "u_w3c", nama: "Budiman", hp: "081230000098", role: "warga", jabatan: "", kepemilikan: "Pemilik", wargaId: "w3", reminderIPL: false },
];

// nomor HP asli untuk 2 penghuni teratas — dipakai untuk tes notifikasi reminder WA
seedPengguna.find((p) => p.id === "u_w1").hp = "08111666724"; // Bani, Blok A1
seedPengguna.find((p) => p.id === "u_w2").hp = "082112578429"; // Deri, Blok A2

// daftar jabatan default (khusus pengurus) — bisa ditambah/diubah/dihapus admin di menu Warga
const JABATAN_OPTIONS_DEFAULT = ["Ketua", "Sekretaris", "Bendahara", "Keamanan", "EO & Dokumentasi"];

const LOGO_PAGUYUBAN = "data:image/png;base64,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";

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



// ============================================================
// storage
// ============================================================
const KEYS = { warga: "sbt:warga:v6", transaksi: "sbt:transaksi:v4", kegiatan: "sbt:kegiatan:v3", pengguna: "sbt:pengguna:v7", absensi: "sbt:absensi:v1", jabatanOptions: "sbt:jabatanoptions:v1", kontakDarurat: "sbt:kontakdarurat:v2", perangkatDesa: "sbt:perangkatdesa:v2", posAnggaran: "sbt:posanggaran:v1", thrConfig: "sbt:thrconfig:v1" };
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

function TrenSaldoChart({ data }) {
  const [aktif, setAktif] = useState(data.length - 1);
  const width = 600, height = 210, padTop = 14, padBottom = 26, padLeft = 46, padRight = 10;
  const values = data.map((d) => d.saldo);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(0, ...values);
  const niceMax = Math.max(4000000, Math.ceil(maxV / 4000000) * 4000000);
  const range = niceMax - minV || 1;
  const ticks = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax];

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const yFor = (v) => padTop + (1 - (v - minV) / range) * innerH;
  const points = data.map((d, i) => ({ x: padLeft + i * stepX, y: yFor(d.saldo), ...d }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const titik = points[aktif];
  const formatJt = (v) => v === 0 ? "0" : `${Math.round(v / 1000000)}jt`;

  return (
    <div>
      {titik && (
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 2, background: COLORS.bg, borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, color: COLORS.inkSoft, fontWeight: 600 }}>{monthLabel(titik.bulan)}</span>
          <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: COLORS.accent }}>{formatRp(titik.saldo)}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke={COLORS.divider} strokeWidth="1" />
              <text x={padLeft - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill={COLORS.inkSoft} fontFamily="monospace">{formatJt(t)}</text>
            </g>
          );
        })}
        <path d={pathD} fill="none" stroke={COLORS.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i} onClick={() => setAktif(i)} style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r="10" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={i === aktif ? 5.5 : 3.5} fill={i === aktif ? COLORS.accentDeep : COLORS.accent} stroke={i === aktif ? "#fff" : "none"} strokeWidth="1.5" />
            <text x={p.x} y={height - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="10.5" fill={COLORS.inkSoft} fontFamily="monospace">{monthLabelShort(p.bulan)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MasukKeluarChart({ data }) {
  const maxV = Math.max(...data.flatMap((d) => [d.masuk, d.keluar]), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150, padding: "6px 4px 0" }}>
        {data.map((d) => (
          <div key={d.bulan} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: "100%" }}>
              <div style={{ width: 9, height: `${Math.max(2, (d.masuk / maxV) * 100)}%`, background: COLORS.success, borderRadius: "3px 3px 0 0" }} />
              <div style={{ width: 9, height: `${Math.max(2, (d.keluar / maxV) * 100)}%`, background: COLORS.danger, borderRadius: "3px 3px 0 0" }} />
            </div>
            <div style={{ fontSize: 10, color: COLORS.inkSoft, fontFamily: "monospace" }}>{monthLabelShort(d.bulan)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10, fontSize: 11.5, color: COLORS.inkSoft }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.success }} />Masuk</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.danger }} />Keluar</span>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, iconBg, iconColor, cardBg, label, value, valueColor, style }) {
  return (
    <Card style={{ padding: 13, background: cardBg || COLORS.card, display: "flex", alignItems: "center", gap: 11, ...style }}>
      <div style={{ width: 32, height: 32, borderRadius: 999, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} color={iconColor} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkSoft, lineHeight: 1.3 }}>{label}</div>
        <div className="mono" style={{ fontSize: 15.5, fontWeight: 700, color: valueColor || COLORS.ink, letterSpacing: "-0.01em" }}>{value}</div>
      </div>
    </Card>
  );
}

function DualStatCard({ icon: Icon, iconBg, iconColor, title, statA, statB, style }) {
  return (
    <Card style={{ padding: 13, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={14} color={iconColor} />
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.inkSoft }}>{title}</div>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: COLORS.inkFaint, marginBottom: 2 }}>{statA.label}</div>
          <div className="mono" style={{ fontSize: 15.5, fontWeight: 700, color: statA.color || COLORS.ink }}>{statA.value}</div>
          {statA.sub && <div style={{ fontSize: 10, color: COLORS.inkFaint, marginTop: 2 }}>{statA.sub}</div>}
        </div>
        <div style={{ width: 1, background: COLORS.divider, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: COLORS.inkFaint, marginBottom: 2 }}>{statB.label}</div>
          <div className="mono" style={{ fontSize: 15.5, fontWeight: 700, color: statB.color || COLORS.ink }}>{statB.value}</div>
          {statB.sub && <div style={{ fontSize: 10, color: COLORS.inkFaint, marginTop: 2 }}>{statB.sub}</div>}
        </div>
      </div>
    </Card>
  );
}

function BudgetGrupSection({ grup, items }) {
  const [open, setOpen] = useState(false);
  const grupPagu = items.reduce((s, p) => s + p.pagu, 0);
  const grupRealisasi = items.reduce((s, p) => s + p.realisasi, 0);
  const pct = grupPagu > 0 ? Math.min(100, (grupRealisasi / grupPagu) * 100) : 0;
  const overBudget = grupPagu > 0 && grupRealisasi > grupPagu;

  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "block" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.accent, display: "flex", alignItems: "center", gap: 5 }}>
            {grup}
            <ChevronDown size={13} color={COLORS.accent} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </span>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: overBudget ? COLORS.danger : COLORS.ink, flexShrink: 0 }}>{formatRp(grupRealisasi)} <span style={{ color: COLORS.inkFaint, fontWeight: 500 }}>/ {formatRp(grupPagu)}</span></span>
        </div>
        <div style={{ height: 7, background: COLORS.bg, borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: overBudget ? COLORS.danger : COLORS.accent, borderRadius: 4 }} />
        </div>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16, paddingLeft: 12, borderLeft: `2px solid ${COLORS.divider}` }}>
          {items.map((pos) => (
            <BudgetPosItem
              key={pos.id}
              nama={pos.nama}
              catatan={pos.catatan}
              realisasi={pos.realisasi}
              pagu={pos.pagu}
              color={COLORS.accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetPosItem({ nama, realisasi, pagu, color, catatan }) {
  const pct = pagu > 0 ? Math.min(100, (realisasi / pagu) * 100) : 0;
  const overBudget = pagu > 0 && realisasi > pagu;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 4, gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{nama}{catatan && <span style={{ fontWeight: 400, fontSize: 11, color: COLORS.inkFaint }}> ({catatan})</span>}</span>
        <span className="mono" style={{ fontWeight: 700, color: overBudget ? COLORS.danger : color, flexShrink: 0 }}>{formatRp(realisasi)}</span>
      </div>
      <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: overBudget ? COLORS.danger : color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkFaint }}>dari pagu {formatRp(pagu)}{overBudget ? " — melebihi pagu" : ""}</div>
    </div>
  );
}

function PemasukanBreakdownItem({ label, value, target, color, note }) {
  const pct = target ? Math.min(100, (value / target) * 100) : null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ fontWeight: 700, color }}>{formatRp(value)}</span>
      </div>
      {target ? (
        <>
          <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, marginBottom: 4 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkFaint }}>dari target {formatRp(target)}{note ? ` (${note})` : ""}</div>
        </>
      ) : (
        note && <div style={{ fontSize: 11, color: COLORS.inkFaint, marginTop: 2 }}>{note}</div>
      )}
    </div>
  );
}

function HorizontalBarChart({ data, color }) {
  const maxV = Math.max(...data.map((d) => d.jumlah), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((d) => (
        <div key={d.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: COLORS.inkSoft }}>{d.label}</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatRp(d.jumlah)}</span>
          </div>
          <div style={{ height: 8, background: COLORS.bg, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(d.jumlah / maxV) * 100}%`, background: color || COLORS.accent, borderRadius: 4 }} />
          </div>
        </div>
      ))}
      {data.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.inkFaint, textAlign: "center", padding: "10px 0" }}>Belum ada pengeluaran operasional bulan ini.</div>}
    </div>
  );
}

function CollapsibleCard({ icon: Icon, title, subtitle, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {Icon && <Icon size={18} color={COLORS.accent} style={{ flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        <ChevronDown size={18} color={COLORS.inkSoft} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && <div style={{ padding: "0 20px 20px" }}>{children}</div>}
    </Card>
  );
}

function PosAnggaranManager({ posAnggaran, onAddPos, onRenamePos, onDeletePos, onAddSub, onDeleteSub, onUpdatePagu }) {
  const [grupBaru, setGrupBaru] = useState("");
  const [namaPosBaru, setNamaPosBaru] = useState("");
  const [paguBaru, setPaguBaru] = useState("");
  const [subBaruInput, setSubBaruInput] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingPagu, setEditingPagu] = useState(null);
  const [paguValue, setPaguValue] = useState("");

  function submitPosBaru() {
    if (!grupBaru.trim() || !namaPosBaru.trim()) return;
    onAddPos(grupBaru, namaPosBaru, Number(paguBaru) || 0);
    setNamaPosBaru(""); setPaguBaru("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {posAnggaran.map((g) => (
        <div key={g.grup} style={{ border: `1px solid ${COLORS.divider}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.accent, marginBottom: 12 }}>{g.grup}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {g.pos.map((p) => (
              <div key={p.id} style={{ borderBottom: `1px dashed ${COLORS.divider}`, paddingBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {renaming === p.id ? (
                    <div style={{ display: "flex", gap: 6, flex: 1 }}>
                      <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "6px 10px" }} />
                      <Btn type="button" onClick={() => { onRenamePos(p.id, renameValue); setRenaming(null); }} style={{ padding: "6px 10px", fontSize: 12 }}>Simpan</Btn>
                      <Btn type="button" variant="ghost" onClick={() => setRenaming(null)} style={{ padding: "6px 10px", fontSize: 12 }}>Batal</Btn>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nama}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setRenaming(p.id); setRenameValue(p.nama); }} aria-label="Ganti nama" style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 24, height: 24, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={11} /></button>
                        <button onClick={() => onDeletePos(p.id)} aria-label="Hapus pos" style={{ background: COLORS.dangerSoft, border: "none", borderRadius: 999, width: 24, height: 24, cursor: "pointer", color: COLORS.danger, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={11} /></button>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: COLORS.inkFaint }}>Pagu/tahun:</span>
                  {editingPagu === p.id ? (
                    <>
                      <input type="number" autoFocus value={paguValue} onChange={(e) => setPaguValue(e.target.value)} style={{ ...inputStyle, padding: "4px 8px", fontSize: 11.5, width: 120 }} />
                      <button onClick={() => { onUpdatePagu(p.id, Number(paguValue) || 0); setEditingPagu(null); }} aria-label="Simpan pagu" style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.success, display: "flex" }}><CheckCircle2 size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{formatRp(p.pagu)}</span>
                      <button onClick={() => { setPaguValue(String(p.pagu)); setEditingPagu(p.id); }} aria-label="Edit pagu" style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkFaint, display: "flex" }}><Pencil size={11} /></button>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {p.sub.map((s) => (
                    <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "4px 8px", borderRadius: 999, background: COLORS.bg, color: COLORS.ink }}>
                      {s}
                      <button onClick={() => onDeleteSub(p.id, s)} aria-label={`Hapus ${s}`} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkFaint, display: "flex", padding: 0 }}><X size={11} /></button>
                    </span>
                  ))}
                  {p.sub.length === 0 && <span style={{ fontSize: 11.5, color: COLORS.inkFaint }}>Belum ada sub-kategori.</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={subBaruInput[p.id] || ""}
                    onChange={(e) => setSubBaruInput((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="Sub-kategori baru"
                    style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "6px 10px", fontSize: 12.5 }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddSub(p.id, subBaruInput[p.id] || ""); setSubBaruInput((prev) => ({ ...prev, [p.id]: "" })); } }}
                  />
                  <Btn type="button" variant="ghost" onClick={() => { onAddSub(p.id, subBaruInput[p.id] || ""); setSubBaruInput((prev) => ({ ...prev, [p.id]: "" })); }} style={{ padding: "6px 12px", fontSize: 12 }}>+ Sub</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ border: `1px solid ${COLORS.accent}`, borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>Tambah Pos Baru</div>
        <datalist id="daftar-grup-anggaran">
          {posAnggaran.map((g) => <option key={g.grup} value={g.grup} />)}
        </datalist>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input list="daftar-grup-anggaran" value={grupBaru} onChange={(e) => setGrupBaru(e.target.value)} placeholder="Grup (pilih/ketik baru)" style={{ ...inputStyle, minWidth: 0, fontSize: 12.5 }} />
          <input value={namaPosBaru} onChange={(e) => setNamaPosBaru(e.target.value)} placeholder="Nama pos" style={{ ...inputStyle, minWidth: 0, fontSize: 12.5 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={paguBaru} onChange={(e) => setPaguBaru(e.target.value)} placeholder="Pagu/tahun (Rp)" style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 12.5 }} />
          <Btn type="button" onClick={submitPosBaru}><Plus size={14} /> Tambah Pos</Btn>
        </div>
      </div>
    </div>
  );
}

function TxCard({ t, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ padding: "12px 20px", borderBottom: `1px solid ${COLORS.divider}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 3 }}>{t.tanggal}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{t.keterangan}</div>
          <div style={{ fontSize: 11.5, color: COLORS.inkFaint }}>{t.kategori}{t.subkategori ? ` · ${t.subkategori}` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
          <div className="mono" style={{ fontWeight: 700, fontSize: 13.5, color: t.tipe === "masuk" ? COLORS.success : COLORS.danger, whiteSpace: "nowrap" }}>
            {t.tipe === "masuk" ? "+" : "−"}{formatRp(t.jumlah)}
          </div>
          {!confirming && onEdit && (
            <button onClick={onEdit} aria-label="Edit" style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 24, height: 24, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Pencil size={11} />
            </button>
          )}
          {!confirming && onDelete && (
            <button onClick={() => setConfirming(true)} aria-label="Hapus" style={{ background: COLORS.dangerSoft, border: "none", borderRadius: 999, width: 24, height: 24, cursor: "pointer", color: COLORS.danger, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.inkSoft, marginRight: "auto" }}>Hapus transaksi ini?</span>
          <Btn variant="danger" onClick={() => { onDelete(); setConfirming(false); }} style={{ padding: "5px 12px", fontSize: 12 }}>Ya, Hapus</Btn>
          <Btn variant="ghost" onClick={() => setConfirming(false)} style={{ padding: "5px 12px", fontSize: 12 }}>Batal</Btn>
        </div>
      )}
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
  const [absensiSecurity, setAbsensiSecurity] = useState(seedAbsensiSecurity);
  const [jabatanOptions, setJabatanOptions] = useState(JABATAN_OPTIONS_DEFAULT);
  const [kontakDarurat, setKontakDarurat] = useState(seedKontakDarurat);
  const [perangkatDesa, setPerangkatDesa] = useState(seedPerangkatDesa);
  const [posAnggaran, setPosAnggaran] = useState(POS_ANGGARAN_DEFAULT);
  const [thrConfig, setThrConfig] = useState(THR_CONFIG_DEFAULT);
  const [showAddKontak, setShowAddKontak] = useState(false);
  const [editingKontak, setEditingKontak] = useState(null);
  const [showAddPerangkat, setShowAddPerangkat] = useState(false);
  const [editingPerangkat, setEditingPerangkat] = useState(null);
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
  const [editingExpense, setEditingExpense] = useState(null);
  const [showKegiatanForm, setShowKegiatanForm] = useState(false);
  const [editingKegiatan, setEditingKegiatan] = useState(null);
  const [kegiatanDetail, setKegiatanDetail] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserDefaultRole, setAddUserDefaultRole] = useState("warga");
  const [showGantiPin, setShowGantiPin] = useState(false);
  const [editingWarga, setEditingWarga] = useState(null);
  const [kelolaIPLRumah, setKelolaIPLRumah] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showPayThrModal, setShowPayThrModal] = useState(false);
  const [cellModal, setCellModal] = useState(null); // { warga, monthKey }
  const [thrCellModal, setThrCellModal] = useState(null); // { warga, kontakUtama }
  const [gridFilter, setGridFilter] = useState("semua");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (loggedInUser?.harusGantiPin) {
      setToast("PIN Anda masih PIN sementara — disarankan ganti sekarang lewat ikon kunci di pojok kanan atas.");
    }
  }, [loggedInUser?.id]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);

    (async () => {
      const [w, t, k, p, abs, so, kd, pd, pa, tc] = await Promise.all([
        loadKey(KEYS.warga, null), loadKey(KEYS.transaksi, null),
        loadKey(KEYS.kegiatan, null), loadKey(KEYS.pengguna, null),
        loadKey(KEYS.absensi, null), loadKey(KEYS.jabatanOptions, null),
        loadKey(KEYS.kontakDarurat, null), loadKey(KEYS.perangkatDesa, null),
        loadKey(KEYS.posAnggaran, null), loadKey(KEYS.thrConfig, null),
      ]);
      if (w) setWarga(w); else saveKey(KEYS.warga, seedWarga);
      if (t) setTransaksi(t); else saveKey(KEYS.transaksi, seedTransaksi);
      if (k) setKegiatan(k); else saveKey(KEYS.kegiatan, seedKegiatan);
      if (p) setPengguna(p); else saveKey(KEYS.pengguna, seedPengguna);
      if (abs) setAbsensiSecurity(abs); else saveKey(KEYS.absensi, seedAbsensiSecurity);
      if (so) setJabatanOptions(so); else saveKey(KEYS.jabatanOptions, JABATAN_OPTIONS_DEFAULT);
      if (kd) setKontakDarurat(kd); else saveKey(KEYS.kontakDarurat, seedKontakDarurat);
      if (pd) setPerangkatDesa(pd); else saveKey(KEYS.perangkatDesa, seedPerangkatDesa);
      if (pa) setPosAnggaran(pa); else saveKey(KEYS.posAnggaran, POS_ANGGARAN_DEFAULT);
      if (tc) setThrConfig(tc); else saveKey(KEYS.thrConfig, THR_CONFIG_DEFAULT);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const DEMO_PIN = "123456"; // PIN awal default semua akun contoh — tetap dipakai kalau belum pernah direset

  function normalizeHp(raw) {
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("62")) d = "0" + d.slice(2);
    return d;
  }
  function handleLogin(hp, pin) {
    const cleanHp = normalizeHp(hp);
    const found = pengguna.find((p) => normalizeHp(p.hp) === cleanHp);
    if (!found) return { ok: false, message: "No. HP tidak terdaftar. Hubungi Pengurus untuk didaftarkan di menu Warga." };
    const pinAsli = found.pin || DEMO_PIN;
    if (pin !== pinAsli) return { ok: false, message: "PIN salah. Lupa PIN? Hubungi Pengurus untuk direset." };
    setLoggedInUser(found);
    return { ok: true };
  }
  function handleLogout() { setLoggedInUser(null); }

  // ---- PIN: reset oleh pengurus & ganti mandiri oleh pengguna ----
  const resetPinWarga = (id) => {
    const pinBaru = String(Math.floor(100000 + Math.random() * 900000));
    setPengguna((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, pin: pinBaru, harusGantiPin: true } : p);
      saveKey(KEYS.pengguna, next);
      return next;
    });
    return pinBaru;
  };
  const gantiPinSendiri = (pinLama, pinBaru) => {
    if (!loggedInUser) return { ok: false, message: "Sesi login tidak ditemukan." };
    const pinAsli = loggedInUser.pin || DEMO_PIN;
    if (pinLama !== pinAsli) return { ok: false, message: "PIN lama salah." };
    if (!/^\d{6}$/.test(pinBaru)) return { ok: false, message: "PIN baru harus 6 digit angka." };
    setPengguna((prev) => {
      const next = prev.map((p) => p.id === loggedInUser.id ? { ...p, pin: pinBaru, harusGantiPin: false } : p);
      saveKey(KEYS.pengguna, next);
      return next;
    });
    setLoggedInUser((prev) => ({ ...prev, pin: pinBaru, harusGantiPin: false }));
    return { ok: true };
  };

  // warga (rumah) milik user yang sedang login (kalau role === 'warga')
  const myWarga = useMemo(() => {
    if (!loggedInUser || loggedInUser.role !== "warga") return null;
    return warga.find((w) => w.id === loggedInUser.wargaId) || null;
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
      const tarif = w ? getTagihanBulan(w, monthKey).tarif : IPL_PER_BULAN;
      const next = [...prev, { id: uid(), tipe: "masuk", tanggal: todayISO(), kategori: "Pembayaran IPL", subkategori: null, keterangan: `IPL ${monthLabel(monthKey)} — ${w ? w.noRumah : ""}`, jumlah: tarif, wargaId, monthKey }];
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

  // ---- riwayat status IPL per rumah (aktif/nonaktif, tarif normal/diskon) ----
  const tambahPeriodeIPLWarga = (wargaId, periodeBaru) => {
    setWarga((prev) => {
      const next = prev.map((w) => w.id === wargaId ? { ...w, riwayatIPL: tambahPeriodeIPL(w.riwayatIPL, periodeBaru) } : w);
      saveKey(KEYS.warga, next);
      return next;
    });
    setToast("Status IPL rumah diperbarui.");
  };

  // ---- Iuran THR — sukarela, 1x/tahun, nominal bebas per rumah ----
  const uploadBuktiThr = useCallback((wargaId, tahun, jumlah, dataUrl) => {
    setWarga((prev) => {
      const next = prev.map((w) => w.id === wargaId ? { ...w, thr: { ...w.thr, [tahun]: { status: "menunggu", jumlah, bukti: dataUrl } } } : w);
      saveKey(KEYS.warga, next);
      return next;
    });
    setToast("Konfirmasi iuran THR terkirim, menunggu verifikasi pengurus.");
  }, []);
  const verifikasiThrLunas = useCallback((wargaId, tahun, jumlahFinal) => {
    const w = warga.find((x) => x.id === wargaId);
    const entry = w?.thr?.[tahun];
    const jumlah = jumlahFinal ?? entry?.jumlah ?? 0;
    setWarga((prev) => {
      const next = prev.map((x) => x.id === wargaId ? { ...x, thr: { ...x.thr, [tahun]: { ...x.thr?.[tahun], status: "lunas", jumlah } } } : x);
      saveKey(KEYS.warga, next);
      return next;
    });
    setTransaksi((prev) => {
      const next = [...prev, { id: uid(), tipe: "masuk", tanggal: todayISO(), kategori: "Iuran THR", subkategori: null, keterangan: `Iuran THR ${tahun} — ${w ? w.noRumah : ""}`, jumlah, wargaId, thrTahun: tahun }];
      saveKey(KEYS.transaksi, next);
      return next;
    });
    setToast("Iuran THR ditandai lunas.");
  }, [warga]);
  const batalkanThr = useCallback((wargaId, tahun) => {
    setWarga((prev) => {
      const next = prev.map((w) => w.id === wargaId ? { ...w, thr: { ...w.thr, [tahun]: { status: "belum", jumlah: 0, bukti: null } } } : w);
      saveKey(KEYS.warga, next);
      return next;
    });
    setTransaksi((prev) => {
      const next = prev.filter((t) => !(t.wargaId === wargaId && t.thrTahun === tahun));
      saveKey(KEYS.transaksi, next);
      return next;
    });
  }, []);
  const updateThrConfig = (data) => {
    setThrConfig((prev) => { const next = { ...prev, ...data }; saveKey(KEYS.thrConfig, next); return next; });
  };

  const updateWargaLengkap = (id, data) => {
    setPengguna((prev) => {
      let next = prev.map((p) => p.id === id ? { ...p, ...data } : p);
      // kalau kontak utama baru di-set true, pastikan cuma 1 kontak utama per rumah
      if (data.reminderIPL && data.wargaId) {
        next = next.map((p) => (p.wargaId === data.wargaId && p.id !== id) ? { ...p, reminderIPL: false } : p);
      }
      saveKey(KEYS.pengguna, next);
      return next;
    });
    setToast("Data warga diperbarui.");
  };

  // ---- Pengeluaran ----
  const addExpense = (data) => {
    setTransaksi((prev) => { const next = [...prev, { id: uid(), tipe: "keluar", ...data }]; saveKey(KEYS.transaksi, next); return next; });
    setShowExpenseForm(false);
  };
  const updateExpense = (id, data) => {
    setTransaksi((prev) => { const next = prev.map((t) => t.id === id ? { ...t, ...data } : t); saveKey(KEYS.transaksi, next); return next; });
    setToast("Pengeluaran diperbarui.");
  };
  const deleteExpense = (id) => {
    setTransaksi((prev) => { const next = prev.filter((t) => t.id !== id); saveKey(KEYS.transaksi, next); return next; });
    setToast("Pengeluaran dihapus.");
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
  const updatePenggunaJabatan = (id, jabatan) => {
    setPengguna((prev) => { const next = prev.map((p) => p.id === id ? { ...p, jabatan } : p); saveKey(KEYS.pengguna, next); return next; });
  };
  const deletePengguna = (id) => {
    setPengguna((prev) => { const next = prev.filter((p) => p.id !== id); saveKey(KEYS.pengguna, next); return next; });
    setToast("Pengguna dihapus.");
  };
  const addPengguna = (data) => {
    setPengguna((prev) => { const next = [...prev, { id: uid(), status: "", ...data }]; saveKey(KEYS.pengguna, next); return next; });
    setShowAddUser(false);
  };

  // ---- kelola daftar status/jabatan ----
  const addJabatanOption = (label) => {
    const clean = label.trim();
    if (!clean || jabatanOptions.includes(clean)) return;
    setJabatanOptions((prev) => { const next = [...prev, clean]; saveKey(KEYS.jabatanOptions, next); return next; });
  };
  const renameJabatanOption = (oldLabel, newLabel) => {
    const clean = newLabel.trim();
    if (!clean || clean === oldLabel) return;
    setJabatanOptions((prev) => { const next = prev.map((s) => s === oldLabel ? clean : s); saveKey(KEYS.jabatanOptions, next); return next; });
    setPengguna((prev) => { const next = prev.map((p) => p.jabatan === oldLabel ? { ...p, jabatan: clean } : p); saveKey(KEYS.pengguna, next); return next; });
  };
  const deleteJabatanOption = (label) => {
    const dipakai = pengguna.some((p) => p.jabatan === label);
    if (dipakai) {
      setToast(`Tidak bisa hapus "${label}" — masih dipakai pengguna. Ganti status pengguna itu dulu.`);
      return;
    }
    setJabatanOptions((prev) => { const next = prev.filter((s) => s !== label); saveKey(KEYS.jabatanOptions, next); return next; });
  };

  // ---- kontak darurat (eksternal) ----
  const addKontakDarurat = (data) => {
    setKontakDarurat((prev) => { const next = [...prev, { id: uid(), ...data }]; saveKey(KEYS.kontakDarurat, next); return next; });
    setShowAddKontak(false);
  };
  const updateKontakDarurat = (id, data) => {
    setKontakDarurat((prev) => { const next = prev.map((k) => k.id === id ? { ...k, ...data } : k); saveKey(KEYS.kontakDarurat, next); return next; });
    setEditingKontak(null);
  };
  const deleteKontakDarurat = (id) => {
    setKontakDarurat((prev) => { const next = prev.filter((k) => k.id !== id); saveKey(KEYS.kontakDarurat, next); return next; });
  };

  // ---- perangkat desa ----
  const addPerangkatDesa = (data) => {
    setPerangkatDesa((prev) => { const next = [...prev, { id: uid(), ...data }]; saveKey(KEYS.perangkatDesa, next); return next; });
    setShowAddPerangkat(false);
  };
  const updatePerangkatDesa = (id, data) => {
    setPerangkatDesa((prev) => { const next = prev.map((p) => p.id === id ? { ...p, ...data } : p); saveKey(KEYS.perangkatDesa, next); return next; });
    setEditingPerangkat(null);
  };
  const deletePerangkatDesa = (id) => {
    setPerangkatDesa((prev) => { const next = prev.filter((p) => p.id !== id); saveKey(KEYS.perangkatDesa, next); return next; });
  };

  // ---- pos anggaran (kategori transaksi + budget tahunan, 1 sumber) ----
  const updatePagu = (id, paguBaru) => {
    setPosAnggaran((prev) => {
      const next = prev.map((g) => ({ ...g, pos: g.pos.map((p) => p.id === id ? { ...p, pagu: paguBaru } : p) }));
      saveKey(KEYS.posAnggaran, next);
      return next;
    });
  };
  const addPos = (grup, nama, pagu) => {
    const cleanGrup = grup.trim();
    const cleanNama = nama.trim();
    if (!cleanGrup || !cleanNama) return;
    if (flattenPos(posAnggaran).some((p) => p.nama === cleanNama)) { setToast(`Pos "${cleanNama}" sudah ada.`); return; }
    setPosAnggaran((prev) => {
      const next = [...prev];
      const idx = next.findIndex((g) => g.grup === cleanGrup);
      const posBaru = { id: uid(), nama: cleanNama, pagu: Number(pagu) || 0, sub: [] };
      if (idx >= 0) next[idx] = { ...next[idx], pos: [...next[idx].pos, posBaru] };
      else next.push({ grup: cleanGrup, pos: [posBaru] });
      saveKey(KEYS.posAnggaran, next);
      return next;
    });
  };
  const renamePos = (id, namaBaru) => {
    const clean = namaBaru.trim();
    const posLama = flattenPos(posAnggaran).find((p) => p.id === id);
    if (!clean || !posLama || clean === posLama.nama) return;
    if (flattenPos(posAnggaran).some((p) => p.nama === clean)) { setToast(`Pos "${clean}" sudah ada.`); return; }
    setPosAnggaran((prev) => {
      const next = prev.map((g) => ({ ...g, pos: g.pos.map((p) => p.id === id ? { ...p, nama: clean } : p) }));
      saveKey(KEYS.posAnggaran, next);
      return next;
    });
    setTransaksi((prev) => {
      const next = prev.map((t) => t.kategori === posLama.nama ? { ...t, kategori: clean } : t);
      saveKey(KEYS.transaksi, next);
      return next;
    });
  };
  const deletePos = (id) => {
    const pos = flattenPos(posAnggaran).find((p) => p.id === id);
    if (!pos) return;
    const dipakai = transaksi.some((t) => t.kategori === pos.nama);
    if (dipakai) { setToast(`Tidak bisa hapus "${pos.nama}" — masih ada transaksi pakai pos ini.`); return; }
    setPosAnggaran((prev) => {
      const next = prev.map((g) => ({ ...g, pos: g.pos.filter((p) => p.id !== id) })).filter((g) => g.pos.length > 0);
      saveKey(KEYS.posAnggaran, next);
      return next;
    });
  };
  const addSubPos = (id, sub) => {
    const clean = sub.trim();
    if (!clean) return;
    setPosAnggaran((prev) => {
      const next = prev.map((g) => ({ ...g, pos: g.pos.map((p) => p.id === id && !p.sub.includes(clean) ? { ...p, sub: [...p.sub, clean] } : p) }));
      saveKey(KEYS.posAnggaran, next);
      return next;
    });
  };
  const deleteSubPos = (id, sub) => {
    const pos = flattenPos(posAnggaran).find((p) => p.id === id);
    if (!pos) return;
    const dipakai = transaksi.some((t) => t.kategori === pos.nama && t.subkategori === sub);
    if (dipakai) { setToast(`Tidak bisa hapus "${sub}" — masih ada transaksi pakai sub-kategori ini.`); return; }
    setPosAnggaran((prev) => {
      const next = prev.map((g) => ({ ...g, pos: g.pos.map((p) => p.id === id ? { ...p, sub: p.sub.filter((s) => s !== sub) } : p) }));
      saveKey(KEYS.posAnggaran, next);
      return next;
    });
  };

  // ---- computed ----
  const saldo = useMemo(() => SALDO_AWAL_KAS + transaksi.reduce((s, t) => s + (t.tipe === "masuk" ? t.jumlah : -t.jumlah), 0), [transaksi]);
  const saldoAkhirBulanLalu = useMemo(() => {
    const bulanLaluKey = months12Desc[1]; // [0] = bulan berjalan, [1] = bulan sebelumnya
    const totalSampaiBulanLalu = transaksi.filter((t) => monthKeyOf(t.tanggal) <= bulanLaluKey).reduce((s, t) => s + (t.tipe === "masuk" ? t.jumlah : -t.jumlah), 0);
    return SALDO_AWAL_KAS + totalSampaiBulanLalu;
  }, [transaksi]);
  const bulanIniMasuk = useMemo(() => transaksi.filter((t) => t.tipe === "masuk" && monthKeyOf(t.tanggal) === currentMonthKey).reduce((s, t) => s + t.jumlah, 0), [transaksi]);
  const bulanIniKeluar = useMemo(() => transaksi.filter((t) => t.tipe === "keluar" && monthKeyOf(t.tanggal) === currentMonthKey).reduce((s, t) => s + t.jumlah, 0), [transaksi]);
  const belumBayarCount = useMemo(() => warga.filter((w) => {
    const tagihan = getTagihanBulan(w, currentMonthKey);
    return tagihan.status === "aktif" && w.statusBayar[currentMonthKey]?.status !== "lunas";
  }).length, [warga]);
  const wargaAktifBulanIni = useMemo(() => warga.filter((w) => getTagihanBulan(w, currentMonthKey).status === "aktif").length, [warga]);
  const sudahBayarCount = wargaAktifBulanIni - belumBayarCount;
  const totalTunggakanSemua = useMemo(() => warga.reduce((sum, w) => {
    let total = 0;
    Object.keys(w.statusBayar).forEach((mk) => {
      const tagihan = getTagihanBulan(w, mk);
      if (tagihan.status === "aktif" && w.statusBayar[mk]?.status === "belum") total += tagihan.tarif;
    });
    return sum + total;
  }, 0), [warga]);
  const totalTunggakanBulanIni = useMemo(() => warga.reduce((sum, w) => {
    const tagihan = getTagihanBulan(w, currentMonthKey);
    const entry = w.statusBayar[currentMonthKey];
    return sum + (tagihan.status === "aktif" && entry?.status === "belum" ? tagihan.tarif : 0);
  }, 0), [warga]);
  const totalTunggakanMenumpuk = Math.max(0, totalTunggakanSemua - totalTunggakanBulanIni);

  // streak tunggakan berjalan per rumah — dihitung mundur dari bulan ini,
  // berhenti begitu ketemu bulan yang statusnya bukan "belum" — bulan
  // dengan status rumah "nonaktif" dilewati saja (tidak menghentikan streak,
  // tidak dihitung menunggak, karena memang tidak ada kewajiban bulan itu)
  const arrearsStreakByWarga = useMemo(() => warga.map((w) => {
    let streak = 0;
    for (const mk of months12Desc) {
      const tagihan = getTagihanBulan(w, mk);
      if (tagihan.status === "nonaktif") continue;
      if (w.statusBayar[mk]?.status === "belum") streak++;
      else break;
    }
    return streak;
  }), [warga]);
  const menunggakCount = useMemo(() => arrearsStreakByWarga.filter((s) => s >= 2).length, [arrearsStreakByWarga]);

  // tren saldo kas 6 bulan terakhir (akhir tiap bulan)
  const trenSaldoBulanan = useMemo(() => {
    const bulanList = months12Asc.slice(-6);
    return bulanList.map((mk) => {
      const totalSampaiBulanIni = transaksi
        .filter((t) => monthKeyOf(t.tanggal) <= mk)
        .reduce((s, t) => s + (t.tipe === "masuk" ? t.jumlah : -t.jumlah), 0);
      return { bulan: mk, saldo: SALDO_AWAL_KAS + totalSampaiBulanIni };
    });
  }, [transaksi]);

  // pemasukan vs pengeluaran per bulan, 6 bulan terakhir
  const masukKeluarBulanan = useMemo(() => {
    const bulanList = months12Asc.slice(-6);
    return bulanList.map((mk) => ({
      bulan: mk,
      masuk: transaksi.filter((t) => t.tipe === "masuk" && monthKeyOf(t.tanggal) === mk).reduce((s, t) => s + t.jumlah, 0),
      keluar: transaksi.filter((t) => t.tipe === "keluar" && monthKeyOf(t.tanggal) === mk).reduce((s, t) => s + t.jumlah, 0),
    }));
  }, [transaksi]);

  // breakdown beban operasional bulan ini, per sub-kategori
  const kategoriOperasional = useMemo(() => getKategoriOperasional(posAnggaran), [posAnggaran]);
  const bebanOperasionalBreakdown = useMemo(() => {
    const map = {};
    transaksi
      .filter((t) => t.tipe === "keluar" && monthKeyOf(t.tanggal) === currentMonthKey && kategoriOperasional.includes(t.kategori))
      .forEach((t) => {
        const key = t.subkategori || t.kategori;
        map[key] = (map[key] || 0) + t.jumlah;
      });
    return Object.entries(map).map(([label, jumlah]) => ({ label, jumlah })).sort((a, b) => b.jumlah - a.jumlah);
  }, [transaksi, kategoriOperasional]);
  const bebanOperasionalBulanIni = useMemo(() => bebanOperasionalBreakdown.reduce((s, d) => s + d.jumlah, 0), [bebanOperasionalBreakdown]);
  const cadanganKas = bebanOperasionalBulanIni; // rekomendasi: minimal 1x beban operasional bulanan
  const kelonggaranDanaKas = saldo - cadanganKas;

  // budget plan tahunan — realisasi dihitung otomatis dari transaksi tahun berjalan
  const tahunBerjalan = new Date().getFullYear();
  const budgetGrup = useMemo(() => posAnggaran.map((g) => ({
    grup: g.grup,
    pos: g.pos.map((p) => ({ ...p, realisasi: hitungRealisasiPos(p.nama, transaksi, tahunBerjalan) })),
  })), [posAnggaran, transaksi, tahunBerjalan]);
  const totalPagu = useMemo(() => flattenPos(posAnggaran).reduce((s, p) => s + p.pagu, 0), [posAnggaran]);
  const totalRealisasi = useMemo(() => budgetGrup.reduce((s, g) => s + g.pos.reduce((s2, p) => s2 + p.realisasi, 0), 0), [budgetGrup]);


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
  const targetIPLBulanan = useMemo(() => warga.reduce((sum, w) => {
    const tagihan = getTagihanBulan(w, laporanBulan);
    return sum + (tagihan.status === "aktif" ? tagihan.tarif : 0);
  }, 0), [warga, laporanBulan]);
  const laporanPemasukanIPLBulanIni = useMemo(() => laporanTx.filter((t) => t.tipe === "masuk" && t.kategori === "Pembayaran IPL" && t.monthKey === laporanBulan).reduce((s, t) => s + t.jumlah, 0), [laporanTx, laporanBulan]);
  const laporanPembayaranTunggakan = useMemo(() => laporanTx.filter((t) => t.tipe === "masuk" && t.kategori === "Pembayaran IPL" && t.monthKey && t.monthKey !== laporanBulan).reduce((s, t) => s + t.jumlah, 0), [laporanTx, laporanBulan]);
  const laporanPemasukanThr = useMemo(() => laporanTx.filter((t) => t.tipe === "masuk" && t.kategori === "Iuran THR").reduce((s, t) => s + t.jumlah, 0), [laporanTx]);
  const mutasiBulanIni = useMemo(() => [...laporanTx].sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [laporanTx]);

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
    ...(role !== "security" ? [{ id: "laporan", label: "Mutasi Transaksi", icon: FileText }] : []),
    ...(role !== "security" ? [{ id: "iuran", label: "Iuran IPL", icon: Wallet }] : []),
    { id: "kegiatan", label: "Kegiatan", icon: CalendarDays },
    { id: "darurat", label: "Kontak Darurat", icon: Siren },
    { id: "absensi", label: "Absensi Security", icon: ClipboardCheck },
    { id: "warga", label: "Warga", icon: UserCog },
    ...(canKelolaAkses(role) ? [{ id: "setting", label: "Setting", icon: Settings }] : []),
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
        html, body { overflow-x: hidden; max-width: 100vw; }
        .app-root { overflow-x: hidden; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 11px 12px; font-size: 13.5px; }
        thead th { font-size: 11px; letter-spacing: 0.02em; color: ${COLORS.inkSoft}; font-weight: 600; border-bottom: 1px solid ${COLORS.divider}; }
        tbody tr { border-bottom: 1px solid ${COLORS.divider}; }
        tbody tr:last-child { border-bottom: none; }
        .mono { font-variant-numeric: tabular-nums; }
        button { font-family: 'Inter', sans-serif; }
        button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${COLORS.accent}; outline-offset: 1px; }
        button { -webkit-tap-highlight-color: transparent; transition: transform .1s ease, opacity .1s ease, filter .1s ease; }
        button:active:not(:disabled) { transform: scale(0.95); filter: brightness(0.94); }
        a:active { opacity: 0.7; }
        @media (max-width: 760px) { .sidebar { display: none !important; } .bottomnav { display: flex !important; } .maincol { margin-left: 0 !important; padding: 20px 16px !important; } .grid-scroll { max-width: calc(100vw - 32px); } }
        @media (max-width: 480px) { .header-user-info { max-width: 84px !important; } }

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
        .toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: ${COLORS.ink}; color: #fff; padding: 11px 20px; border-radius: 12px; font-size: 13.5px; z-index: 100; max-width: 90vw; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .grid-cell { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: transform .1s; }
        .row-3 { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 560px) { .row-3 { grid-template-columns: 1fr 1fr 1fr; } }
        .grid-cell:hover { transform: scale(1.08); }
      `}</style>

      {/* header */}
      <header className="no-print app-header" style={{ background: COLORS.sageDeep, color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: `3px solid ${COLORS.accent}`, flexWrap: "nowrap", position: "sticky", top: 0, zIndex: 50, WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }}>
        <div className="header-brand" style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: "#fff" }}>
            <img src={LOGO_PAGUYUBAN} alt="Logo Paguyuban Warga" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em", lineHeight: 1.15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>SBT Pintar</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Cluster Sindangbarang Terrace</div>
          </div>
        </div>
        <div className="header-user" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right", minWidth: 0, maxWidth: 130 }} className="header-user-info">
            <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.2, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{namaAktif}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleLabel[role]}</div>
          </div>
          <button onClick={() => setShowGantiPin(true)} aria-label="Ganti PIN" title="Ganti PIN" style={{ position: "relative", background: "rgba(255,255,255,0.16)", border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <KeyRound size={14} />
            {loggedInUser?.harusGantiPin && <span style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 999, background: COLORS.warning, border: "1.5px solid " + COLORS.sageDeep }} />}
          </button>
          <Btn variant="ghost" onClick={handleLogout} style={{ padding: "6px 10px", fontSize: 11.5, background: "rgba(255,255,255,0.16)", color: "#fff", flexShrink: 0 }}>Keluar</Btn>
        </div>
      </header>

      <div style={{ display: "flex" }}>
        {/* sidebar */}
        <nav className="sidebar no-print" style={{ width: 216, flexShrink: 0, padding: "20px 14px", background: COLORS.bgAlt, position: "sticky", top: 60, height: "calc(100% - 60px)", borderRight: `1px solid ${COLORS.divider}` }}>
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
        <nav className="bottomnav no-print" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, background: COLORS.card, borderTop: `1px solid ${COLORS.divider}`, padding: "8px 4px", overflowX: "auto", WebkitOverflowScrolling: "touch", zIndex: 40, WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }}>
          {tabs.map((t) => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: active ? COLORS.accent : COLORS.inkFaint, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0, minWidth: 68, padding: "2px 4px", whiteSpace: "nowrap" }}>
                <Icon size={22} strokeWidth={2.2} /> {t.label}
              </button>
            );
          })}
        </nav>

        {/* main */}
        <main className="maincol" style={{ flex: 1, padding: "28px 32px", maxWidth: 1280 }}>
          {tab === "dashboard" && (
            <>
              <SectionTitle title="Ringkasan Kas" subtitle={monthLabel(currentMonthKey)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <KpiCard icon={Wallet} iconBg={COLORS.bg} iconColor={COLORS.ink} label="Saldo Akhir Bulan Lalu" value={formatRp(saldoAkhirBulanLalu)} />
                <KpiCard icon={TrendingUp} iconBg={COLORS.successSoft} iconColor={COLORS.success} cardBg={COLORS.successSoft} label="Pemasukan Bulan Ini" value={formatRp(bulanIniMasuk)} valueColor={COLORS.success} />
                <KpiCard icon={Wallet} iconBg={COLORS.bg} iconColor={COLORS.ink} label="Saldo Saat Ini" value={formatRp(saldo)} />
                <KpiCard icon={TrendingDown} iconBg={COLORS.dangerSoft} iconColor={COLORS.danger} cardBg={COLORS.dangerSoft} label="Pengeluaran Bulan Ini" value={formatRp(bulanIniKeluar)} valueColor={COLORS.danger} />

                <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${COLORS.divider}`, margin: "4px 0" }} />
                <DualStatCard
                  icon={Users} iconBg={COLORS.warningSoft} iconColor={COLORS.warning}
                  title={`Status Bayar IPL ${monthLabel(currentMonthKey)}`}
                  statA={{ label: "Sudah Bayar", value: `${sudahBayarCount}/${wargaAktifBulanIni} (${wargaAktifBulanIni > 0 ? Math.round((sudahBayarCount / wargaAktifBulanIni) * 100) : 0}%)`, color: COLORS.success }}
                  statB={{ label: "Belum Bayar", value: formatRp(totalTunggakanBulanIni), color: totalTunggakanBulanIni > 0 ? COLORS.warning : COLORS.success }}
                  style={{ gridColumn: "1 / -1" }}
                />
                <DualStatCard
                  icon={AlertTriangle} iconBg={COLORS.dangerSoft} iconColor={COLORS.danger}
                  title="Tunggakan (di luar tagihan bulan ini)"
                  statA={{ label: "Jumlah Rumah", value: `${menunggakCount} rumah`, color: menunggakCount > 0 ? COLORS.danger : COLORS.success }}
                  statB={{ label: "Total Tunggakan", value: formatRp(totalTunggakanMenumpuk), color: totalTunggakanMenumpuk > 0 ? COLORS.danger : COLORS.success }}
                  style={{ gridColumn: "1 / -1" }}
                />

                <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${COLORS.divider}`, margin: "4px 0" }} />

                <KpiCard icon={ShieldCheck} iconBg={COLORS.sageSoft} iconColor={COLORS.sageDeep} label="Cadangan Kas" value={formatRp(cadanganKas)} sub="1x beban operasional bulanan" />
                <KpiCard icon={Wallet} iconBg={kelonggaranDanaKas >= 0 ? COLORS.successSoft : COLORS.dangerSoft} iconColor={kelonggaranDanaKas >= 0 ? COLORS.success : COLORS.danger} label="Kelonggaran Dana Kas" value={formatRp(kelonggaranDanaKas)} valueColor={kelonggaranDanaKas >= 0 ? COLORS.success : COLORS.danger} sub="saldo saat ini − cadangan" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Card>
                  <div style={{ padding: "16px 20px 4px", fontWeight: 700, fontSize: 15.5 }}>Tren Saldo Akhir</div>
                  <div style={{ fontSize: 11.5, color: COLORS.inkFaint, padding: "0 20px" }}>{monthLabelShort(trenSaldoBulanan[0]?.bulan)} – {monthLabelShort(trenSaldoBulanan[trenSaldoBulanan.length - 1]?.bulan)}</div>
                  <div style={{ padding: "8px 12px 12px" }}><TrenSaldoChart data={trenSaldoBulanan} /></div>
                </Card>

                <Card>
                  <div style={{ padding: "16px 20px 4px", fontWeight: 700, fontSize: 15.5 }}>Pemasukan vs Pengeluaran</div>
                  <div style={{ fontSize: 11.5, color: COLORS.inkFaint, padding: "0 20px" }}>Bulanan {new Date().getFullYear()}</div>
                  <div style={{ padding: "8px 16px 4px" }}><MasukKeluarChart data={masukKeluarBulanan} /></div>
                </Card>
              </div>

              <Card style={{ marginTop: 16 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>Budget Plan &amp; Realisasi {tahunBerjalan}</div>
                    <div className="mono" style={{ fontSize: 12.5, color: totalRealisasi > totalPagu ? COLORS.danger : COLORS.inkSoft }}>{formatRp(totalRealisasi)} / {formatRp(totalPagu)}</div>
                  </div>
                  {canCatatKeuangan(role) && <div style={{ fontSize: 11, color: COLORS.inkFaint, marginTop: 4 }}>Atur pagu tiap pos lewat menu Setting → Kelola Pos Anggaran</div>}
                </div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 22 }}>
                  {budgetGrup.map((g) => (
                    <BudgetGrupSection key={g.grup} grup={g.grup} items={g.pos} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === "iuran" && role === "warga" && (
            <WargaIuranView
              myWarga={myWarga}
              onOpenPay={() => setShowPayModal(true)}
              onOpenPayThr={() => setShowPayThrModal(true)}
              thrConfig={thrConfig}
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
                        <th style={{ position: "sticky", left: 0, background: COLORS.card, minWidth: 170 }}>Rumah</th>
                        {months12Asc.map((mk) => <th key={mk} style={{ textAlign: "center" }}>{monthLabelShort(mk)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {gridWarga.map((w) => {
                        const kontakUtama = getKontakUtama(w.id, pengguna);
                        const penghuni = getPenghuniRumah(w.id, pengguna);
                        return (
                        <tr key={w.id}>
                          <td style={{ position: "sticky", left: 0, background: COLORS.card }}>
                            <div style={{ fontWeight: 600 }}>{kontakUtama ? kontakUtama.nama : "—"}</div>
                            <div className="mono" style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
                              {w.noRumah}{penghuni.length > 1 ? ` · +${penghuni.length - 1} lagi` : ""}
                            </div>
                          </td>
                          {months12Asc.map((mk) => {
                            const tagihan = getTagihanBulan(w, mk);
                            const st = tagihan.status === "nonaktif" ? "nonaktif" : (w.statusBayar[mk]?.status || "belum");
                            const map = {
                              lunas: { bg: COLORS.successSoft, fg: COLORS.success, Icon: CheckCircle2 },
                              menunggu: { bg: COLORS.warningSoft, fg: COLORS.warning, Icon: Clock },
                              belum: { bg: COLORS.dangerSoft, fg: COLORS.danger, Icon: XCircle },
                              nonaktif: { bg: COLORS.divider, fg: COLORS.inkFaint, Icon: Ban },
                            };
                            const { bg, fg, Icon } = map[st];
                            return (
                              <td key={mk} style={{ textAlign: "center" }}>
                                <button className="grid-cell" style={{ background: bg, color: fg, cursor: st === "nonaktif" ? "default" : "pointer" }} onClick={() => { if (st !== "nonaktif") setCellModal({ warga: w, monthKey: mk, kontakUtama }); }} aria-label={`${kontakUtama ? kontakUtama.nama : w.noRumah} — ${monthLabel(mk)} — ${st}`}>
                                  <Icon size={16} strokeWidth={2.4} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                        );
                      })}
                      {gridWarga.length === 0 && <tr><td colSpan={13} style={{ textAlign: "center", color: COLORS.inkSoft, padding: 24 }}>Tidak ada warga pada filter ini.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 12 }}>Ketuk salah satu kotak status untuk verifikasi, kirim pengingat, atau lihat bukti transfer.</div>

              {thrConfig.aktif && (
                <div style={{ marginTop: 24 }}>
                  <SectionTitle title={`Iuran THR ${thrConfig.tahun}`} subtitle={`Sukarela · periode ${monthLabel(thrConfig.bulan)}`} />
                  <Card style={{ overflow: "hidden" }}>
                    <div className="grid-scroll" style={{ overflowX: "auto" }}>
                      <table style={{ minWidth: 420 }}>
                        <thead>
                          <tr>
                            <th style={{ position: "sticky", left: 0, background: COLORS.card, minWidth: 170 }}>Rumah</th>
                            <th style={{ textAlign: "right" }}>Nominal</th>
                            <th style={{ textAlign: "center" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {warga.map((w) => {
                            const kontakUtama = getKontakUtama(w.id, pengguna);
                            const entry = w.thr?.[thrConfig.tahun];
                            const status = entry?.status || "belum";
                            const map = {
                              lunas: { bg: COLORS.successSoft, fg: COLORS.success, Icon: CheckCircle2 },
                              menunggu: { bg: COLORS.warningSoft, fg: COLORS.warning, Icon: Clock },
                              belum: { bg: COLORS.dangerSoft, fg: COLORS.danger, Icon: XCircle },
                            };
                            const { bg, fg, Icon } = map[status];
                            return (
                              <tr key={w.id}>
                                <td style={{ position: "sticky", left: 0, background: COLORS.card }}>
                                  <div style={{ fontWeight: 600 }}>{kontakUtama ? kontakUtama.nama : "—"}</div>
                                  <div className="mono" style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{w.noRumah}</div>
                                </td>
                                <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{entry?.jumlah > 0 ? formatRp(entry.jumlah) : "—"}</td>
                                <td style={{ textAlign: "center" }}>
                                  <button className="grid-cell" style={{ background: bg, color: fg, margin: "0 auto" }} onClick={() => setThrCellModal({ warga: w, kontakUtama })} aria-label={`${kontakUtama ? kontakUtama.nama : w.noRumah} — THR — ${status}`}>
                                    <Icon size={16} strokeWidth={2.4} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}

          {tab === "kegiatan" && (
            <>
              <SectionTitle
                title="Kegiatan &amp; Notulensi"
                subtitle={!canApprove(role) ? "Dokumentasi dari pengurus — tampilan lihat saja" : undefined}
              />
              {(showKegiatanForm || editingKegiatan) && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
                  <div style={{ width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
                    {showKegiatanForm && <KegiatanForm onCancel={() => setShowKegiatanForm(false)} onSubmit={addKegiatan} />}
                    {editingKegiatan && <KegiatanForm initial={editingKegiatan} onCancel={() => setEditingKegiatan(null)} onSubmit={(data) => editKegiatan(editingKegiatan.id, data)} />}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: canApprove(role) ? 90 : 0 }}>
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
              {canApprove(role) && (
                <div className="fab-btn">
                  <Btn pill onClick={() => setShowKegiatanForm(true)} style={{ boxShadow: "0 10px 24px rgba(228,113,30,0.35)", fontSize: 15, padding: "13px 22px" }}>
                    <Plus size={16} /> Tambah Catatan
                  </Btn>
                </div>
              )}
            </>
          )}

          {tab === "laporan" && (
            <>
              <div className="print-only" style={{ display: "none", marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 20 }}>SBT Pintar — Mutasi Transaksi</div>
                <div style={{ fontSize: 13, color: "#444" }}>Cluster Sindangbarang Terrace · {monthLabel(laporanBulan)} · Dicetak {todayISO()}</div>
              </div>
              <SectionTitle title="Mutasi Transaksi" action={
                <div className="no-print" style={{ display: "flex", gap: 8 }}>
                  <select value={laporanBulan} onChange={(e) => setLaporanBulan(e.target.value)} style={inputStyle}>
                    {recentMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                  <Btn variant="ghost" onClick={() => window.print()}><Printer size={15} /> Cetak</Btn>
                </div>
              } />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <KpiCard icon={TrendingUp} iconBg={COLORS.successSoft} iconColor={COLORS.success} cardBg={COLORS.successSoft} label="Pemasukan Bulan Ini" value={formatRp(laporanMasuk)} valueColor={COLORS.success} />
                <KpiCard icon={TrendingDown} iconBg={COLORS.dangerSoft} iconColor={COLORS.danger} cardBg={COLORS.dangerSoft} label="Pengeluaran Bulan Ini" value={formatRp(laporanKeluar)} valueColor={COLORS.danger} />
              </div>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5, color: COLORS.success }}>Ringkasan Pemasukan — {monthLabel(laporanBulan)}</div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
                  <PemasukanBreakdownItem
                    label="Pembayaran IPL Bulan Ini"
                    value={laporanPemasukanIPLBulanIni}
                    target={targetIPLBulanan}
                    color={COLORS.success}
                    note="total tarif rumah aktif bulan ini (normal + diskon)"
                  />
                  <PemasukanBreakdownItem
                    label="Pembayaran Tunggakan"
                    value={laporanPembayaranTunggakan}
                    target={totalTunggakanMenumpuk > 0 ? totalTunggakanMenumpuk : null}
                    color={COLORS.accent}
                    note="dari total tunggakan saat ini"
                  />
                  <PemasukanBreakdownItem
                    label="Iuran THR"
                    value={laporanPemasukanThr}
                    target={null}
                    color={COLORS.sageDeep}
                    note="sukarela — tidak ada target"
                  />
                </div>
              </Card>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Ringkasan Pengeluaran — {monthLabel(laporanBulan)}</div>
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

              {(showExpenseForm || editingExpense) && canCatatKeuangan(role) && (
                <SimpleEditModal title={editingExpense ? "Edit Pengeluaran" : "Catat Pengeluaran"} onCancel={() => { setShowExpenseForm(false); setEditingExpense(null); }}>
                  <ExpenseFormInline
                    initial={editingExpense}
                    posAnggaran={posAnggaran}
                    onCancel={() => { setShowExpenseForm(false); setEditingExpense(null); }}
                    onSubmit={(data) => {
                      if (editingExpense) { updateExpense(editingExpense.id, data); setEditingExpense(null); }
                      else { addExpense(data); }
                    }}
                  />
                </SimpleEditModal>
              )}

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5, color: COLORS.success }}>Riwayat Pemasukan — {monthLabel(laporanBulan)}</div>
                <div>
                  {laporanTx.filter((t) => t.tipe === "masuk").sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((t) => (
                    <div key={t.id} style={{ padding: "12px 20px", borderBottom: `1px solid ${COLORS.divider}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 3 }}>{t.tanggal}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.keterangan}</div>
                        <div style={{ fontSize: 11.5, color: COLORS.inkFaint }}>{t.kategori}</div>
                      </div>
                      <div className="mono" style={{ flexShrink: 0, fontWeight: 700, fontSize: 13.5, color: COLORS.success, whiteSpace: "nowrap" }}>+{formatRp(t.jumlah)}</div>
                    </div>
                  ))}
                  {laporanTx.filter((t) => t.tipe === "masuk").length === 0 && <EmptyRow text="Belum ada pemasukan bulan ini." />}
                </div>
              </Card>
              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5, color: COLORS.danger }}>Riwayat Pengeluaran — {monthLabel(laporanBulan)}</div>
                <div>
                  {laporanTx.filter((t) => t.tipe === "keluar").sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((t) => (
                    <TxCard
                      key={t.id}
                      t={t}
                      onEdit={canCatatKeuangan(role) ? () => { setEditingExpense(t); setShowExpenseForm(false); } : undefined}
                      onDelete={canCatatKeuangan(role) ? () => deleteExpense(t.id) : undefined}
                    />
                  ))}
                  {laporanTx.filter((t) => t.tipe === "keluar").length === 0 && <EmptyRow text="Belum ada pengeluaran bulan ini." />}
                </div>
              </Card>

              <Card>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 15.5 }}>Mutasi Transaksi — {monthLabel(laporanBulan)}</div>
                <div style={{ fontSize: 11.5, color: COLORS.inkFaint, padding: "10px 20px 0" }}>Semua transaksi bulan ini, urut tanggal terbaru</div>
                <div>
                  {mutasiBulanIni.map((t) => <TxCard key={t.id} t={t} />)}
                  {mutasiBulanIni.length === 0 && <EmptyRow text="Belum ada transaksi bulan ini." />}
                </div>
              </Card>

              {canCatatKeuangan(role) && <div style={{ height: 80 }} />}
              {canCatatKeuangan(role) && (
                <div className="fab-btn no-print">
                  <Btn pill onClick={() => setShowExpenseForm(!showExpenseForm)} style={{ boxShadow: "0 10px 24px rgba(228,113,30,0.35)", fontSize: 15, padding: "13px 22px" }}>
                    <Plus size={16} /> Catat Pengeluaran
                  </Btn>
                </div>
              )}
            </>
          )}

          {tab === "darurat" && (
            <>
              <SectionTitle title="Kontak Darurat" />

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em", color: COLORS.ink }}>Pengurus</div>
                <div style={{ padding: "6px 18px 6px" }}>
                  {pengguna.filter((p) => p.role === "pengurus").map((p) => (
                    <PerangkatDesaRow key={p.id} p={{ ...p, jabatan: p.jabatan || "Pengurus" }} canEdit={false} />
                  ))}
                </div>
                {canKelolaAkses(role) && (
                  <div style={{ padding: "0 18px 16px", fontSize: 11.5, color: COLORS.inkFaint }}>
                    Untuk tambah/ubah pengurus, kelola lewat menu <b>Warga</b> — datanya otomatis muncul di sini.
                  </div>
                )}
              </Card>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em", color: COLORS.ink }}>Security</div>
                <div style={{ padding: "6px 18px 6px" }}>
                  {pengguna.filter((p) => p.role === "security").map((p) => (
                    <PerangkatDesaRow key={p.id} p={{ ...p, jabatan: p.jabatan || "Security" }} canEdit={false} />
                  ))}
                </div>
                {canKelolaAkses(role) && (
                  <div style={{ padding: "0 18px 16px", fontSize: 11.5, color: COLORS.inkFaint }}>
                    Untuk tambah/ubah security, kelola lewat menu <b>Warga</b> — datanya otomatis muncul di sini.
                  </div>
                )}
              </Card>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em", color: COLORS.ink }}>Perangkat Desa &amp; Keamanan Wilayah</div>
                <div style={{ padding: "6px 18px 18px" }}>
                  {perangkatDesa.map((p) => (
                    <PerangkatDesaRow key={p.id} p={p} canEdit={canKelolaAkses(role)} onEdit={setEditingPerangkat} onDelete={deletePerangkatDesa} />
                  ))}
                  {perangkatDesa.length === 0 && <EmptyRow text="Belum ada data." />}
                </div>
                {canKelolaAkses(role) && (
                  showAddPerangkat ? (
                    <div style={{ padding: "0 18px 18px" }}><PerangkatDesaFormFields onCancel={() => setShowAddPerangkat(false)} onSubmit={addPerangkatDesa} /></div>
                  ) : (
                    <div style={{ padding: "0 18px 18px" }}>
                      <Btn variant="ghost" onClick={() => setShowAddPerangkat(true)} style={{ width: "100%" }}><Plus size={14} /> Tambah Perangkat / Keamanan Wilayah</Btn>
                    </div>
                  )
                )}
              </Card>

              <Card style={{ marginBottom: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.divider}`, fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em", color: COLORS.ink }}>Hotline Darurat Kota Bogor</div>
                <div style={{ padding: "6px 18px 18px" }}>
                  {kontakDarurat.map((k) => (
                    <KontakDaruratRow key={k.id} k={k} canEdit={canKelolaAkses(role)} onEdit={setEditingKontak} onDelete={deleteKontakDarurat} />
                  ))}
                  {kontakDarurat.length === 0 && <EmptyRow text="Belum ada kontak darurat." />}
                </div>
                {canKelolaAkses(role) && (
                  showAddKontak ? (
                    <div style={{ padding: "0 18px 18px" }}><KontakDaruratFormFields onCancel={() => setShowAddKontak(false)} onSubmit={addKontakDarurat} /></div>
                  ) : (
                    <div style={{ padding: "0 18px 18px" }}>
                      <Btn variant="ghost" onClick={() => setShowAddKontak(true)} style={{ width: "100%" }}><Plus size={14} /> Tambah Kontak Darurat</Btn>
                    </div>
                  )
                )}
              </Card>

              {editingKontak && (
                <SimpleEditModal title="Edit Kontak Darurat" onCancel={() => setEditingKontak(null)}>
                  <KontakDaruratFormFields initial={editingKontak} onCancel={() => setEditingKontak(null)} onSubmit={(data) => updateKontakDarurat(editingKontak.id, data)} />
                </SimpleEditModal>
              )}
              {editingPerangkat && (
                <SimpleEditModal title="Edit Perangkat Desa" onCancel={() => setEditingPerangkat(null)}>
                  <PerangkatDesaFormFields initial={editingPerangkat} onCancel={() => setEditingPerangkat(null)} onSubmit={(data) => updatePerangkatDesa(editingPerangkat.id, data)} />
                </SimpleEditModal>
              )}
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

          {tab === "warga" && (
            <>
              <SectionTitle title="Daftar Warga" />

              {canKelolaAkses(role) && (
                <Card style={{ padding: 16, marginBottom: 18, fontSize: 12.5, color: COLORS.inkSoft }}>
                  <b>Status</b> menentukan akses fitur sekaligus posisi di data penduduk: <b>Pengurus</b> (akses penuh: verifikasi IPL, persetujuan konten, kelola warga), <b>Security</b> (akses urusan darurat & absensi jaga saja), <b>Warga</b> (akses dasar warga biasa).
                  <br /><br />
                  <b>Jabatan</b> cuma berlaku untuk Pengurus (Ketua, Bendahara, dst) — murni struktur organisasi. 1 rumah bisa punya lebih dari 1 akun (misal suami & istri); tandai salah satu sebagai <b>Kontak Utama IPL</b> supaya reminder pembayaran cuma nyasar ke 1 nomor.
                </Card>
              )}

              {canKelolaAkses(role) && showAddUser && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
                  <div style={{ width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
                    <AddUserForm
                      warga={warga}
                      pengguna={pengguna}
                      jabatanOptions={jabatanOptions}
                      onAddJabatan={addJabatanOption}
                      onCancel={() => setShowAddUser(false)}
                      onSubmit={addPengguna}
                      defaultRole={addUserDefaultRole}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: canKelolaAkses(role) ? 90 : 0 }}>
                {warga.map((w) => (
                  <RumahCard
                    key={w.id}
                    rumah={w}
                    penghuni={getPenghuniRumah(w.id, pengguna)}
                    canEdit={canKelolaAkses(role)}
                    onEdit={setEditingWarga}
                    onDelete={deletePengguna}
                    onKelolaIPL={setKelolaIPLRumah}
                  />
                ))}

                <PosSecurityCard
                  security={pengguna.filter((p) => p.role === "security")}
                  canEdit={canKelolaAkses(role)}
                  onEdit={setEditingWarga}
                  onDelete={deletePengguna}
                />
              </div>

              {editingWarga && (
                <EditWargaModal
                  data={editingWarga}
                  warga={warga}
                  pengguna={pengguna}
                  jabatanOptions={jabatanOptions}
                  onAddJabatan={addJabatanOption}
                  onResetPin={resetPinWarga}
                  onCancel={() => setEditingWarga(null)}
                  onSubmit={(changes) => { updateWargaLengkap(editingWarga.id, changes); setEditingWarga(null); }}
                />
              )}

              {kelolaIPLRumah && (
                <RiwayatIPLModal
                  rumah={kelolaIPLRumah}
                  onClose={() => setKelolaIPLRumah(null)}
                  onTambahPeriode={tambahPeriodeIPLWarga}
                />
              )}

              {canKelolaAkses(role) && (
                <div className="fab-btn">
                  <Btn pill onClick={() => { setAddUserDefaultRole("warga"); setShowAddUser(true); }} style={{ boxShadow: "0 10px 24px rgba(228,113,30,0.35)", fontSize: 15, padding: "13px 22px" }}>
                    <Plus size={16} /> Tambah Warga
                  </Btn>
                </div>
              )}
            </>
          )}

          {tab === "setting" && canKelolaAkses(role) && (
            <>
              <SectionTitle title="Setting" subtitle="Semua kelola & konfigurasi aplikasi, dikumpulkan di sini" />

              <div style={{ marginBottom: 18 }}>
                <CollapsibleCard title="Kelola Pos Anggaran" subtitle="Atur grup, pos, pagu & sub-kategori — sekaligus jadi pilihan kategori transaksi" defaultOpen={false}>
                  <PosAnggaranManager
                    posAnggaran={posAnggaran}
                    onAddPos={addPos}
                    onRenamePos={renamePos}
                    onDeletePos={deletePos}
                    onAddSub={addSubPos}
                    onDeleteSub={deleteSubPos}
                    onUpdatePagu={updatePagu}
                  />
                </CollapsibleCard>
              </div>

              <CollapsibleCard title="Kelola Daftar Pengurus" subtitle="Atur daftar jabatan/status pengurus" defaultOpen={false}>
                <JabatanOptionsManager
                  jabatanOptions={jabatanOptions}
                  onAdd={addJabatanOption}
                  onRename={renameJabatanOption}
                  onDelete={deleteJabatanOption}
                />
              </CollapsibleCard>

              <div style={{ marginTop: 18 }}>
                <CollapsibleCard title="Kelola Periode THR" subtitle="Atur bulan & tahun iuran THR tahun berjalan (sukarela)" defaultOpen={false}>
                  <ThrConfigManager thrConfig={thrConfig} onUpdate={updateThrConfig} />
                </CollapsibleCard>
              </div>
            </>
          )}
        </main>
      </div>

      {showGantiPin && <GantiPinModal onCancel={() => setShowGantiPin(false)} onSubmit={gantiPinSendiri} />}
      {showPayModal && myWarga && (
        <PayIPLModal
          myWarga={myWarga}
          onCancel={() => setShowPayModal(false)}
          onSubmit={(monthKeys, dataUrl) => { uploadBuktiBanyakBulan(myWarga.id, monthKeys, dataUrl); setShowPayModal(false); }}
        />
      )}
      {showPayThrModal && myWarga && (
        <PayThrModal
          myWarga={myWarga}
          thrConfig={thrConfig}
          onCancel={() => setShowPayThrModal(false)}
          onSubmit={(jumlah, dataUrl) => { uploadBuktiThr(myWarga.id, thrConfig.tahun, jumlah, dataUrl); setShowPayThrModal(false); }}
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
      {thrCellModal && (
        <ThrCellModal
          data={thrCellModal}
          thrConfig={thrConfig}
          canVerifikasi={canVerifikasi(role)}
          onClose={() => setThrCellModal(null)}
          onVerifikasi={(jumlah) => { verifikasiThrLunas(thrCellModal.warga.id, thrConfig.tahun, jumlah); setThrCellModal(null); }}
          onBatalkan={() => { batalkanThr(thrCellModal.warga.id, thrConfig.tahun); setThrCellModal(null); }}
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
function WargaIuranView({ myWarga, onOpenPay, onOpenPayThr, thrConfig }) {
  if (!myWarga) {
    return (
      <>
        <SectionTitle title="Iuran IPL Saya" />
        <Card style={{ padding: 24, textAlign: "center", color: COLORS.inkSoft }}>Data warga untuk akun ini belum terhubung. Hubungi Pengurus.</Card>
      </>
    );
  }
  const rows = months12Desc.map((mk) => ({ type: "ipl", monthKey: mk, tagihan: getTagihanBulan(myWarga, mk), ...myWarga.statusBayar[mk] }));
  const thrEntry = myWarga.thr?.[thrConfig.tahun];
  const thrIdx = months12Desc.indexOf(thrConfig.bulan);
  if (thrConfig.aktif && thrIdx !== -1) {
    rows.splice(thrIdx, 0, { type: "thr", monthKey: `${thrConfig.bulan}-thr`, tahun: thrConfig.tahun, status: thrEntry?.status || "belum", jumlah: thrEntry?.jumlah || 0 });
  }
  const belumCount = rows.filter((r) => r.type === "ipl" && r.tagihan.status === "aktif" && r.status === "belum").length;
  const totalTunggakan = rows.filter((r) => r.type === "ipl" && r.tagihan.status === "aktif" && r.status === "belum").reduce((s, r) => s + r.tagihan.tarif, 0);
  const thrBelum = thrConfig.aktif && (!thrEntry || thrEntry.status === "belum");
  const tagihanBulanIni = getTagihanBulan(myWarga, currentMonthKey);

  return (
    <>
      <SectionTitle title="Iuran IPL Saya" subtitle={tagihanBulanIni.status === "aktif" ? `${myWarga.noRumah} · ${formatRp(tagihanBulanIni.tarif)}/bulan${tagihanBulanIni.tarif < IPL_PER_BULAN ? " (diskon)" : ""}` : `${myWarga.noRumah} · Tidak aktif bulan ini`} />
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
          {rows.map((r) => r.type === "thr" ? (
            <div key={r.monthKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${COLORS.divider}`, background: COLORS.sageSoft }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  Iuran THR {r.tahun}
                  <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.sageDeep, background: "#fff", padding: "2px 6px", borderRadius: 999 }}>SUKARELA</span>
                </div>
                <div className="mono" style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 2 }}>{r.jumlah > 0 ? formatRp(r.jumlah) : "Nominal bebas, sesuai kemampuan"}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ) : r.tagihan.status === "nonaktif" ? (
            <div key={r.monthKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${COLORS.divider}`, opacity: 0.6 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{monthLabel(r.monthKey)}</div>
                <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 2 }}>Tidak ada kewajiban bulan ini</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkFaint, background: COLORS.bg, padding: "4px 10px", borderRadius: 999 }}>TIDAK AKTIF</span>
            </div>
          ) : (
            <div key={r.monthKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${COLORS.divider}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{monthLabel(r.monthKey)}</div>
                <div className="mono" style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 2 }}>{formatRp(r.tagihan.tarif)}{r.tagihan.tarif < IPL_PER_BULAN ? " (diskon)" : ""}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </Card>

      {(belumCount > 0 || thrBelum) && (
        <div className="fab-btn" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          {thrBelum && (
            <Btn pill onClick={onOpenPayThr} variant="success" style={{ boxShadow: "0 10px 24px rgba(58,140,90,0.35)", fontSize: 14, padding: "12px 20px" }}>
              <Wallet size={15} /> Ikut Iuran THR
            </Btn>
          )}
          {belumCount > 0 && (
            <Btn pill onClick={onOpenPay} style={{ boxShadow: "0 10px 24px rgba(0,113,227,0.35)", fontSize: 15, padding: "13px 22px" }}>
              <Wallet size={16} /> Bayar IPL
            </Btn>
          )}
        </div>
      )}
    </>
  );
}

function ThrConfigManager({ thrConfig, onUpdate }) {
  const [tahun, setTahun] = useState(thrConfig.tahun);
  const [bulan, setBulan] = useState(thrConfig.bulan);
  const [aktif, setAktif] = useState(thrConfig.aktif);

  function simpan() {
    onUpdate({ tahun, bulan, aktif });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} style={{ width: 16, height: 16, accentColor: COLORS.accent }} />
        Aktifkan Iuran THR tahun ini
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Tahun"><input value={tahun} onChange={(e) => setTahun(e.target.value)} placeholder="2026" style={inputStyle} /></Field>
        <Field label="Bulan THR"><input type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.inkFaint }}>Bulan ini yang menentukan posisi "Iuran THR" muncul di riwayat tagihan warga & daftar verifikasi pengurus. Ganti tiap tahun mengikuti kalender Lebaran.</div>
      <Btn onClick={simpan} style={{ width: "fit-content" }}>Simpan Periode THR</Btn>
    </div>
  );
}

function PayThrModal({ myWarga, thrConfig, onCancel, onSubmit }) {
  const [jumlah, setJumlah] = useState("");
  const [preview, setPreview] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!jumlah || Number(jumlah) <= 0) return;
    onSubmit(Number(jumlah), preview);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 420, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Ikut Iuran THR {thrConfig.tahun}</div>
        <button onClick={onCancel} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 16 }}>Sifatnya sukarela — isi sesuai kemampuan, tidak ada nominal wajib.</div>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <Field label="Nominal (Rp)"><input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="mis. 50000" style={inputStyle} autoFocus /></Field>
        <Field label="Bukti Transfer (opsional)">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: `1px dashed ${COLORS.divider}`, borderRadius: 10, cursor: "pointer", fontSize: 12.5, color: COLORS.inkSoft }}>
            <Upload size={15} />
            {preview ? "Bukti terpilih ✓" : "Pilih foto bukti transfer"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setPreview(reader.result);
              reader.readAsDataURL(file);
            }} />
          </label>
        </Field>
        <Btn type="submit" variant="success">Kirim Konfirmasi</Btn>
      </form>
      </Card>
    </div>
  );
}

function PayIPLModal({ myWarga, onCancel, onSubmit }) {
  // urut dari yang PALING LAMA menunggak -> paling baru, supaya pembayaran
  // wajib dilunasi berurutan dari tunggakan tertua (tidak boleh loncat bulan)
  // — bulan dengan status rumah "nonaktif" dilewati, tidak ada kewajiban
  const unpaidMonths = months12Asc.filter((mk) => getTagihanBulan(myWarga, mk).status === "aktif" && myWarga.statusBayar[mk]?.status === "belum");
  // selectedCount = jumlah bulan (dihitung dari yang tertua) yang akan dibayar
  const [selectedCount, setSelectedCount] = useState(unpaidMonths.length);
  const [preview, setPreview] = useState(null);
  const total = unpaidMonths.slice(0, selectedCount).reduce((s, mk) => s + getTagihanBulan(myWarga, mk).tarif, 0);

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
                <span className="mono" style={{ fontSize: 13, color: COLORS.inkSoft }}>{formatRp(getTagihanBulan(myWarga, mk).tarif)}</span>
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
  const { warga: w, monthKey, kontakUtama } = data;
  const entry = w.statusBayar[monthKey] || { status: "belum", bukti: null };
  const tarifBulanIni = getTagihanBulan(w, monthKey).tarif;
  const [buktiManual, setBuktiManual] = useState(null);
  const namaTampil = kontakUtama ? kontakUtama.nama : w.noRumah;

  // seluruh bulan yang masih menunggak untuk warga ini (bukan cuma bulan yang diketuk),
  // supaya pengurus bisa kirim 1 pengingat untuk semua tunggakan sekaligus — bulan
  // "nonaktif" dilewati karena memang tidak ada kewajiban
  const semuaBulanMenunggak = months12Asc.filter((mk) => getTagihanBulan(w, mk).status === "aktif" && w.statusBayar[mk]?.status === "belum");
  const totalTunggakan = semuaBulanMenunggak.reduce((s, mk) => s + getTagihanBulan(w, mk).tarif, 0);
  const daftarBulanMenunggak = semuaBulanMenunggak.map(monthLabel).join(", ");

  const waTextSatuBulan = `Assalamualaikum Bpk/Ibu ${namaTampil},
mengingatkan iuran IPL ${monthLabel(monthKey)} sebesar ${formatRp(tarifBulanIni)} belum kami terima.
Mohon dapat diselesaikan.

${REKENING_IPL.bank}
${REKENING_IPL.nomor}
an ${REKENING_IPL.atasNama}

Terima kasih, 🙏 — Pengurus.`;
  const waTextSemua = `Assalamualaikum Bpk/Ibu ${namaTampil},
mengingatkan iuran IPL yang masih tertunggak selama ${semuaBulanMenunggak.length} bulan (${daftarBulanMenunggak}) dengan total ${formatRp(totalTunggakan)} belum kami terima.
Mohon dapat diselesaikan.

${REKENING_IPL.bank}
${REKENING_IPL.nomor}
an ${REKENING_IPL.atasNama}

Terima kasih, 🙏 — Pengurus.`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 360, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16.5 }}>{namaTampil}</div>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{w.noRumah} · {monthLabel(monthKey)}</div>
          </div>
          <button onClick={onClose} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <StatusBadge status={entry.status} />
          <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{formatRp(tarifBulanIni)}{tarifBulanIni < IPL_PER_BULAN ? " (diskon)" : ""}</span>
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

          {entry.status === "belum" && !kontakUtama && (
            <div style={{ fontSize: 12.5, color: COLORS.warning, background: COLORS.warningSoft, padding: "10px 12px", borderRadius: 10 }}>
              Belum ada penghuni terdaftar untuk rumah ini — tidak bisa kirim pengingat WA. Tambahkan penghuni dulu lewat menu Akses.
            </div>
          )}
          {entry.status === "belum" && kontakUtama && semuaBulanMenunggak.length > 1 && (
            <a href={waLink(kontakUtama.hp, waTextSemua)} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
              <Btn variant="ghost" style={{ width: "100%", padding: "11px 0" }}><Send size={14} /> Ingatkan Semua Tunggakan ({semuaBulanMenunggak.length} bln · {formatRp(totalTunggakan)})</Btn>
            </a>
          )}
          {entry.status === "belum" && kontakUtama && (
            <a href={waLink(kontakUtama.hp, waTextSatuBulan)} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
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

function ThrCellModal({ data, thrConfig, canVerifikasi, onClose, onVerifikasi, onBatalkan }) {
  const { warga: w, kontakUtama } = data;
  const entry = w.thr?.[thrConfig.tahun] || { status: "belum", jumlah: 0, bukti: null };
  const [jumlahManual, setJumlahManual] = useState("");
  const [buktiManual, setBuktiManual] = useState(null);
  const namaTampil = kontakUtama ? kontakUtama.nama : w.noRumah;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 360, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16.5 }}>{namaTampil}</div>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{w.noRumah} · Iuran THR {thrConfig.tahun} <span style={{ color: COLORS.sageDeep, fontWeight: 600 }}>(Sukarela)</span></div>
          </div>
          <button onClick={onClose} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <StatusBadge status={entry.status} />
          <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{entry.jumlah > 0 ? formatRp(entry.jumlah) : "—"}</span>
        </div>

        {entry.bukti && (
          <img src={entry.bukti} alt="Bukti transfer" onClick={() => window.open(entry.bukti, "_blank")} style={{ width: "100%", borderRadius: 10, marginBottom: 16, cursor: "pointer" }} />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entry.status === "menunggu" && canVerifikasi && (
            <Btn variant="success" onClick={() => onVerifikasi(null)} style={{ width: "100%", padding: "11px 0" }}><CheckCircle2 size={15} /> Verifikasi ({formatRp(entry.jumlah)})</Btn>
          )}

          {entry.status === "belum" && canVerifikasi && (
            <div style={{ border: `1px dashed ${COLORS.divider}`, borderRadius: 12, padding: 12, background: COLORS.bg }}>
              <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>
                Kalau warga sudah kasih THR langsung (tunai/WA), catat di sini — sukarela, isi sesuai yang diterima:
              </div>
              <input type="number" value={jumlahManual} onChange={(e) => setJumlahManual(e.target.value)} placeholder="Nominal (Rp)" style={{ ...inputStyle, width: "100%", marginBottom: 10 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: COLORS.card, border: `1px solid ${COLORS.divider}`, cursor: "pointer", marginBottom: 10, fontSize: 12.5 }}>
                <Upload size={14} color={COLORS.inkSoft} />
                {buktiManual ? "Bukti terpilih ✓ (ganti foto)" : "Upload bukti (opsional)"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setBuktiManual(reader.result);
                  reader.readAsDataURL(file);
                }} />
              </label>
              {buktiManual && <img src={buktiManual} alt="Bukti manual" style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} />}
              <Btn variant="success" disabled={!jumlahManual || Number(jumlahManual) <= 0} onClick={() => onVerifikasi(Number(jumlahManual))} style={{ width: "100%", padding: "10px 0" }}>
                <CheckCircle2 size={15} /> Tandai Ikut Serta
              </Btn>
            </div>
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

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
            <AbsensiForm namaAktif={namaAktif} onCancel={() => setShowForm(false)} onSubmit={(data) => { onSubmit(data); setShowForm(false); }} />
          </div>
        </div>
      )}

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
function JabatanOptionsManager({ jabatanOptions, onAdd, onRename, onDelete }) {
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {jabatanOptions.map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {editing === s ? (
              <>
                <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12.5, flex: 1 }} />
                <Btn onClick={() => { onRename(s, editValue); setEditing(null); }} style={{ padding: "5px 10px", fontSize: 11.5 }}>Simpan</Btn>
                <Btn variant="ghost" onClick={() => setEditing(null)} style={{ padding: "5px 10px", fontSize: 11.5 }}>Batal</Btn>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 13 }}>{s}</span>
                <button onClick={() => { setEditing(s); setEditValue(s); }} aria-label="Edit" style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 26, height: 26, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pencil size={11} /></button>
                <button onClick={() => onDelete(s)} aria-label="Hapus" style={{ background: COLORS.dangerSoft, border: "none", borderRadius: 999, width: 26, height: 26, cursor: "pointer", color: COLORS.danger, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Trash2 size={11} /></button>
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Tambah status baru" style={{ ...inputStyle, padding: "8px 10px", fontSize: 12.5, flex: 1 }} />
        <Btn onClick={() => { onAdd(newLabel); setNewLabel(""); }} style={{ padding: "8px 14px", fontSize: 12.5 }}><Plus size={13} /> Tambah</Btn>
      </div>
    </div>
  );
}

function ResidentRow({ p, canEdit, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const roleTampil = { pengurus: COLORS.accent, security: COLORS.warning, warga: COLORS.inkSoft };
  const roleBgTampil = { pengurus: COLORS.accentSoft, security: COLORS.warningSoft, warga: COLORS.bg };
  const roleLabelTampil = { pengurus: "Pengurus", security: "Security", warga: "Warga" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, background: COLORS.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>
          {p.nama}
          {p.reminderIPL && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: COLORS.success }}>★ Kontak Utama</span>}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
          <div style={{ width: 68, display: "flex", justifyContent: "center" }}>
            {p.kepemilikan && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: p.kepemilikan === "Pemilik" ? COLORS.successSoft : COLORS.warningSoft, color: p.kepemilikan === "Pemilik" ? COLORS.success : COLORS.warning, whiteSpace: "nowrap" }}>
                {p.kepemilikan}
              </span>
            )}
          </div>
          <div style={{ width: 78, display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: roleBgTampil[p.role], color: roleTampil[p.role], whiteSpace: "nowrap" }}>
              {p.jabatan ? p.jabatan : roleLabelTampil[p.role]}
            </span>
          </div>
          <div style={{ width: 22, display: "flex", justifyContent: "center" }}>
            {canEdit && (
              <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Opsi lainnya" style={{ background: menuOpen ? COLORS.divider : "transparent", border: `1px solid ${COLORS.divider}`, borderRadius: 999, width: 22, height: 22, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MoreVertical size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div className="mono" style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{p.hp}</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          <div style={{ width: 68, display: "flex", justifyContent: "center" }}>
            <a href={`tel:${p.hp}`}><Btn variant="ghost" style={{ padding: "6px 9px" }}><Phone size={13} /></Btn></a>
          </div>
          <div style={{ width: 78, display: "flex", justifyContent: "center" }}>
            <a href={waLink(p.hp, "")} target="_blank" rel="noreferrer"><Btn variant="success" style={{ padding: "6px 9px" }}><MessageCircle size={13} /></Btn></a>
          </div>
          <div style={{ width: 22 }} />
        </div>
      </div>
      {menuOpen && !confirming && (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", borderTop: `1px dashed ${COLORS.divider}`, paddingTop: 8 }}>
          <Btn variant="ghost" onClick={() => { onEdit(p); setMenuOpen(false); }} style={{ padding: "5px 12px", fontSize: 12 }}><Pencil size={12} /> Edit</Btn>
          <Btn variant="danger" onClick={() => setConfirming(true)} style={{ padding: "5px 12px", fontSize: 12 }}><Trash2 size={12} /> Hapus</Btn>
        </div>
      )}
      {confirming && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          <span style={{ fontSize: 12, color: COLORS.inkSoft, marginRight: "auto" }}>Hapus {p.nama}?</span>
          <Btn variant="danger" onClick={() => { onDelete(p.id); setConfirming(false); }} style={{ padding: "4px 10px", fontSize: 11.5 }}>Ya, Hapus</Btn>
          <Btn variant="ghost" onClick={() => setConfirming(false)} style={{ padding: "4px 10px", fontSize: 11.5 }}>Batal</Btn>
        </div>
      )}
    </div>
  );
}

function RumahCard({ rumah, penghuni, canEdit, onEdit, onDelete, onKelolaIPL }) {
  const tagihanBulanIni = getTagihanBulan(rumah, currentMonthKey);
  const badge = tagihanBulanIni.status === "nonaktif"
    ? { label: "Tidak Aktif", bg: COLORS.divider, fg: COLORS.inkFaint }
    : tagihanBulanIni.tarif < IPL_PER_BULAN
    ? { label: "Diskon", bg: COLORS.warningSoft, fg: COLORS.warning }
    : { label: "Normal", bg: COLORS.successSoft, fg: COLORS.success };
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{rumah.noRumah}</div>
        {canEdit ? (
          <button onClick={() => onKelolaIPL(rumah)} style={{ display: "flex", alignItems: "center", gap: 5, background: badge.bg, color: badge.fg, border: "none", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            IPL: {badge.label} <Pencil size={10} />
          </button>
        ) : (
          <span style={{ background: badge.bg, color: badge.fg, borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>IPL: {badge.label}</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {penghuni.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.inkFaint }}>Belum ada penghuni terdaftar.</div>}
        {penghuni.map((p) => (
          <ResidentRow key={p.id} p={p} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </Card>
  );
}

function RiwayatIPLModal({ rumah, onClose, onTambahPeriode }) {
  const [status, setStatus] = useState("aktif");
  const [tarifPilihan, setTarifPilihan] = useState("normal");
  const [dariBulan, setDariBulan] = useState(currentMonthKey);
  const riwayat = rumah.riwayatIPL && rumah.riwayatIPL.length > 0 ? rumah.riwayatIPL : [{ dari: null, sampai: null, status: "aktif", tarif: rumah.iplPerBulan || IPL_PER_BULAN }];

  function submit() {
    const tarif = status === "nonaktif" ? 0 : (tarifPilihan === "diskon" ? IPL_DISKON : IPL_PER_BULAN);
    onTambahPeriode(rumah.id, { dari: dariBulan, sampai: null, status, tarif });
    onClose();
  }

  return (
    <SimpleEditModal title={`Kelola Status IPL — ${rumah.noRumah}`} onCancel={onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 8, color: COLORS.inkSoft }}>Riwayat</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[...riwayat].reverse().map((p, idx) => (
            <div key={p.id || idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "9px 11px", background: COLORS.bg, borderRadius: 8 }}>
              <span>{p.dari ? monthLabel(p.dari) : "Awal"} – {p.sampai ? monthLabel(p.sampai) : "Sekarang"}</span>
              <span style={{ fontWeight: 700, color: p.status === "nonaktif" ? COLORS.inkFaint : (p.tarif < IPL_PER_BULAN ? COLORS.warning : COLORS.success) }}>
                {p.status === "nonaktif" ? "Tidak Aktif" : `${formatRp(p.tarif)}${p.tarif < IPL_PER_BULAN ? " (diskon)" : ""}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: `1px dashed ${COLORS.divider}`, paddingTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 10 }}>Tambah Perubahan Status</div>
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Berlaku Mulai Bulan"><input type="month" value={dariBulan} onChange={(e) => setDariBulan(e.target.value)} style={inputStyle} /></Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              <option value="aktif">Aktif (ada kewajiban IPL)</option>
              <option value="nonaktif">Tidak Aktif (tidak ada kewajiban)</option>
            </select>
          </Field>
          {status === "aktif" && (
            <Field label="Tarif">
              <select value={tarifPilihan} onChange={(e) => setTarifPilihan(e.target.value)} style={inputStyle}>
                <option value="normal">Normal — {formatRp(IPL_PER_BULAN)}</option>
                <option value="diskon">Diskon — {formatRp(IPL_DISKON)}</option>
              </select>
            </Field>
          )}
          <div style={{ fontSize: 11, color: COLORS.inkFaint }}>Periode yang masih berjalan otomatis ditutup pas bulan sebelum tanggal mulai di atas.</div>
          <Btn onClick={submit}>Simpan Perubahan Status</Btn>
        </div>
      </div>
    </SimpleEditModal>
  );
}

function PosSecurityCard({ security, canEdit, onEdit, onDelete }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 12 }}>Pos Security</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {security.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.inkFaint }}>Belum ada petugas security terdaftar.</div>}
        {security.map((p) => (
          <ResidentRow key={p.id} p={p} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </Card>
  );
}

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

function ExpenseFormInline({ onCancel, onSubmit, initial, posAnggaran }) {
  const kategoriList = getKategoriList(posAnggaran);
  const [tanggal, setTanggal] = useState(initial?.tanggal || todayISO());
  const [kategori, setKategori] = useState(initial?.kategori || kategoriList[0]);
  const [subkategori, setSubkategori] = useState(initial?.subkategori || getSubUntukKategori(posAnggaran, initial?.kategori || kategoriList[0])[0] || "");
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "");
  const [jumlah, setJumlah] = useState(initial?.jumlah ? String(initial.jumlah) : "");

  function changeKategori(k) {
    setKategori(k);
    setSubkategori(getSubUntukKategori(posAnggaran, k)[0] || "");
  }

  return (
    <div style={{ border: `1px solid ${initial ? COLORS.accent : COLORS.divider}`, borderRadius: 12, padding: 16, background: COLORS.bg }}>
      {initial && <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Edit Pengeluaran</div>}
      <form onSubmit={(e) => { e.preventDefault(); if (!keterangan || !jumlah) return; onSubmit({ tanggal, kategori, subkategori, keterangan, jumlah: Number(jumlah) }); }} style={{ display: "grid", gap: 12 }}>
        <Field label="Tanggal"><input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={inputStyle} /></Field>
        <Field label="Kategori">
          <select value={kategori} onChange={(e) => changeKategori(e.target.value)} style={inputStyle}>
            {kategoriList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Sub Kategori">
          <select value={subkategori} onChange={(e) => setSubkategori(e.target.value)} style={inputStyle}>
            {getSubUntukKategori(posAnggaran, kategori).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Keterangan"><input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="mis. Gaji bulanan — Pak Sandi" style={inputStyle} /></Field>
        <Field label="Jumlah (Rp)"><input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" style={inputStyle} /></Field>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn type="submit">{initial ? "Simpan Perubahan" : "Simpan Pengeluaran"}</Btn>
          <Btn type="button" variant="ghost" onClick={onCancel}>Batal</Btn>
        </div>
      </form>
    </div>
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

function JabatanSelectField({ value, onChange, jabatanOptions, onAddJabatan }) {
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  function handleSelectChange(e) {
    if (e.target.value === "__new__") { setAddingNew(true); return; }
    onChange(e.target.value);
  }
  function confirmAdd() {
    const clean = newLabel.trim();
    if (!clean) return;
    onAddJabatan(clean);
    onChange(clean);
    setAddingNew(false);
    setNewLabel("");
  }

  if (addingNew) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nama jabatan baru" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAdd(); } }} />
        <Btn type="button" onClick={confirmAdd} style={{ padding: "8px 12px", fontSize: 12.5 }}>Tambah</Btn>
        <Btn type="button" variant="ghost" onClick={() => { setAddingNew(false); setNewLabel(""); }} style={{ padding: "8px 12px", fontSize: 12.5 }}>Batal</Btn>
      </div>
    );
  }

  return (
    <select value={value} onChange={handleSelectChange} style={inputStyle}>
      <option value="">— pilih jabatan —</option>
      {jabatanOptions.map((j) => <option key={j} value={j}>{j}</option>)}
      <option value="__new__">+ Tambah jabatan baru...</option>
    </select>
  );
}

function AddUserForm({ warga, pengguna, jabatanOptions, onAddJabatan, onCancel, onSubmit, defaultRole }) {
  const [nama, setNama] = useState("");
  const [hp, setHp] = useState("");
  const [role, setRole] = useState(defaultRole || "warga");
  const [jabatan, setJabatan] = useState("");
  const [wargaId, setWargaId] = useState(warga[0]?.id || "");
  const [kepemilikan, setKepemilikan] = useState("Pemilik");

  const sudahAdaKontakUtama = pengguna.some((p) => p.wargaId === wargaId && p.reminderIPL);
  const tampilkanRumah = role !== "security";

  function handleSubmit(e) {
    e.preventDefault();
    if (!nama || !hp) return;
    const data = { nama, hp, role, jabatan: "" };
    if (role === "pengurus") {
      data.jabatan = jabatan || "";
      data.wargaId = wargaId;
      data.kepemilikan = kepemilikan;
      data.reminderIPL = !sudahAdaKontakUtama;
    } else if (role === "warga") {
      data.wargaId = wargaId;
      data.kepemilikan = kepemilikan;
      data.reminderIPL = !sudahAdaKontakUtama;
    }
    onSubmit(data);
  }

  return (
    <FormShell title="Tambah Warga" onCancel={onCancel} onSubmit={handleSubmit}>
      <div className="row-3" style={{ marginBottom: 16 }}>
        <Field label="Nama"><input value={nama} onChange={(e) => setNama(e.target.value)} style={inputStyle} /></Field>
        <Field label="No. HP"><input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="0812xxxxxxx" style={inputStyle} /></Field>
        <Field label="Status">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            <option value="pengurus">Pengurus</option><option value="security">Security</option><option value="warga">Warga</option>
          </select>
        </Field>
      </div>

      {role === "pengurus" && (
        <div style={{ marginBottom: 16 }}>
          <Field label="Jabatan">
            <JabatanSelectField value={jabatan} onChange={setJabatan} jabatanOptions={jabatanOptions} onAddJabatan={onAddJabatan} />
          </Field>
        </div>
      )}

      {tampilkanRumah && (
        <div style={{ marginBottom: 16 }}>
          <div className="row-3" style={{ marginBottom: 0 }}>
            <Field label="Rumah">
              <select value={wargaId} onChange={(e) => setWargaId(e.target.value)} style={inputStyle}>
                {warga.map((w) => <option key={w.id} value={w.id}>{w.noRumah}</option>)}
              </select>
            </Field>
            <Field label="Kepemilikan">
              <select value={kepemilikan} onChange={(e) => setKepemilikan(e.target.value)} style={inputStyle}>
                <option value="Pemilik">Pemilik</option>
                <option value="Penyewa">Penyewa</option>
              </select>
            </Field>
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 6 }}>
            {sudahAdaKontakUtama
              ? "Rumah ini sudah punya kontak utama IPL. Akun baru jadi penghuni tambahan — bisa dijadikan kontak utama kapan saja lewat tombol Edit."
              : "Rumah ini belum punya kontak utama IPL — akun baru otomatis jadi kontak utama."}
          </div>
        </div>
      )}

      {role === "security" && (
        <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 16 }}>Akun security otomatis masuk ke kartu "Pos Security", tidak perlu pilih rumah.</div>
      )}

      <Btn type="submit">Simpan</Btn>
    </FormShell>
  );
}

function EditWargaModal({ data: p, warga, pengguna, jabatanOptions, onAddJabatan, onResetPin, onCancel, onSubmit }) {
  const [nama, setNama] = useState(p.nama);
  const [hp, setHp] = useState(p.hp);
  const [role, setRole] = useState(p.role);
  const [jabatan, setJabatan] = useState(p.jabatan || "");
  const [wargaId, setWargaId] = useState(p.wargaId || warga[0]?.id || "");
  const [kepemilikan, setKepemilikan] = useState(p.kepemilikan || "Pemilik");
  const [reminderIPL, setReminderIPL] = useState(!!p.reminderIPL);
  const [pinBaruDitampilkan, setPinBaruDitampilkan] = useState(null);

  const penghuniRumahBaru = pengguna.filter((x) => x.wargaId === wargaId && x.id !== p.id);
  const rumahBaruSudahAdaKontakUtama = penghuniRumahBaru.some((x) => x.reminderIPL);
  const tampilkanRumah = role !== "security";
  const pindahRumah = tampilkanRumah && wargaId !== p.wargaId;

  function handleSubmit(e) {
    e.preventDefault();
    if (!nama || !hp) return;
    const data = { nama, hp, role, jabatan: "" };
    if (role === "security") {
      data.wargaId = undefined;
      data.kepemilikan = undefined;
      data.reminderIPL = false;
    } else {
      data.jabatan = role === "pengurus" ? (jabatan || "") : "";
      data.wargaId = wargaId;
      data.kepemilikan = kepemilikan;
      data.reminderIPL = reminderIPL;
    }
    onSubmit(data);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 420, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Edit Warga</div>
          <button onClick={onCancel} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nama"><input value={nama} onChange={(e) => setNama(e.target.value)} style={inputStyle} /></Field>
            <Field label="No. HP"><input value={hp} onChange={(e) => setHp(e.target.value)} style={inputStyle} /></Field>
          </div>

          <Field label="Status">
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              <option value="pengurus">Pengurus</option><option value="security">Security</option><option value="warga">Warga</option>
            </select>
          </Field>

          {role === "pengurus" && (
            <Field label="Jabatan">
              <JabatanSelectField value={jabatan} onChange={setJabatan} jabatanOptions={jabatanOptions} onAddJabatan={onAddJabatan} />
            </Field>
          )}

          {tampilkanRumah && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Rumah">
                  <select value={wargaId} onChange={(e) => setWargaId(e.target.value)} style={inputStyle}>
                    {warga.map((w) => <option key={w.id} value={w.id}>{w.noRumah}</option>)}
                  </select>
                </Field>
                <Field label="Kepemilikan">
                  <select value={kepemilikan} onChange={(e) => setKepemilikan(e.target.value)} style={inputStyle}>
                    <option value="Pemilik">Pemilik</option>
                    <option value="Penyewa">Penyewa</option>
                  </select>
                </Field>
              </div>
              {pindahRumah && <div style={{ fontSize: 12, color: COLORS.warning, background: COLORS.warningSoft, padding: "8px 10px", borderRadius: 8 }}>Dipindah ke rumah lain — status kontak utama di rumah lama (kalau ada) akan lepas otomatis.</div>}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={reminderIPL} onChange={(e) => setReminderIPL(e.target.checked)} style={{ width: 16, height: 16, accentColor: COLORS.accent }} />
                Jadikan kontak utama IPL untuk rumah ini
                {reminderIPL && rumahBaruSudahAdaKontakUtama && <span style={{ color: COLORS.warning, fontSize: 11.5 }}>(akan gantikan kontak utama lama)</span>}
              </label>
            </>
          )}

          <Btn type="submit">Simpan Perubahan</Btn>

          <div style={{ borderTop: `1px dashed ${COLORS.divider}`, paddingTop: 14, marginTop: 4 }}>
            {pinBaruDitampilkan ? (
              <div style={{ fontSize: 12.5, background: COLORS.successSoft, color: COLORS.success, padding: "10px 12px", borderRadius: 10 }}>
                PIN baru untuk {p.nama}: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{pinBaruDitampilkan}</b><br />
                Sampaikan ke warga lewat WA/telepon. Warga akan disarankan ganti PIN sendiri setelah login.
              </div>
            ) : (
              <Btn type="button" variant="ghost" onClick={() => setPinBaruDitampilkan(onResetPin(p.id))} style={{ width: "100%" }}>
                Reset PIN {p.nama}
              </Btn>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

function SimpleEditModal({ title, onCancel, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 380, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16.5 }}>{title}</div>
          <button onClick={onCancel} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>
        {children}
      </Card>
    </div>
  );
}

function KontakDaruratFormFields({ initial, onCancel, onSubmit }) {
  const [nama, setNama] = useState(initial?.nama || "");
  const [ket, setKet] = useState(initial?.ket || "");
  const [hp, setHp] = useState(initial?.hp || "");
  const [wa, setWa] = useState(initial?.wa || "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!nama || !hp) return;
    onSubmit({ nama, ket, hp, wa: wa || undefined });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <Field label="Nama Instansi / Layanan"><input value={nama} onChange={(e) => setNama(e.target.value)} style={inputStyle} /></Field>
      <Field label="Keterangan"><input value={ket} onChange={(e) => setKet(e.target.value)} placeholder="mis. Kebakaran & penyelamatan" style={inputStyle} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="No. Telepon"><input value={hp} onChange={(e) => setHp(e.target.value)} style={inputStyle} /></Field>
        <Field label="No. WhatsApp (opsional)"><input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="0812xxxxxxx" style={inputStyle} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn type="submit">{initial ? "Simpan Perubahan" : "Simpan Kontak"}</Btn>
        <Btn type="button" variant="ghost" onClick={onCancel}>Batal</Btn>
      </div>
    </form>
  );
}

function PerangkatDesaFormFields({ initial, onCancel, onSubmit }) {
  const [nama, setNama] = useState(initial?.nama || "");
  const [jabatan, setJabatan] = useState(initial?.jabatan || "");
  const [hp, setHp] = useState(initial?.hp || "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!jabatan) return;
    onSubmit({ nama, jabatan, hp });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <Field label="Nama"><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama pejabat/petugas" style={inputStyle} /></Field>
      <Field label="Jabatan"><input value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="mis. Ketua RT 01" style={inputStyle} /></Field>
      <Field label="No. HP"><input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="0812xxxxxxx" style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn type="submit">{initial ? "Simpan Perubahan" : "Simpan"}</Btn>
        <Btn type="button" variant="ghost" onClick={onCancel}>Batal</Btn>
      </div>
    </form>
  );
}

function KontakDaruratRow({ k, canEdit, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${COLORS.divider}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.accent }}>{k.nama}</div>
          {k.ket && <div style={{ fontSize: 12, color: COLORS.ink }}>{k.ket}</div>}
          <div className="mono" style={{ fontSize: 12.5, color: COLORS.ink, marginTop: 2 }}>{k.hp}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <a href={`tel:${k.hp.replace(/\D/g, "")}`}><Btn variant="ghost" style={{ padding: "7px 10px" }}><Phone size={13} /></Btn></a>
          {k.wa && <a href={waLink(k.wa, "")} target="_blank" rel="noreferrer"><Btn variant="success" style={{ padding: "7px 10px" }}><MessageCircle size={13} /></Btn></a>}
          {canEdit && !confirming && (
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Opsi lainnya" style={{ background: menuOpen ? COLORS.divider : "transparent", border: `1px solid ${COLORS.divider}`, borderRadius: 999, width: 26, height: 26, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MoreVertical size={13} />
            </button>
          )}
        </div>
      </div>
      {menuOpen && !confirming && (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => { onEdit(k); setMenuOpen(false); }} style={{ padding: "5px 12px", fontSize: 11.5 }}><Pencil size={11} /> Edit</Btn>
          <Btn variant="danger" onClick={() => setConfirming(true)} style={{ padding: "5px 12px", fontSize: 11.5 }}><Trash2 size={11} /> Hapus</Btn>
        </div>
      )}
      {confirming && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: COLORS.inkSoft, marginRight: "auto" }}>Hapus {k.nama}?</span>
          <Btn variant="danger" onClick={() => { onDelete(k.id); setConfirming(false); }} style={{ padding: "4px 10px", fontSize: 11 }}>Ya, Hapus</Btn>
          <Btn variant="ghost" onClick={() => setConfirming(false)} style={{ padding: "4px 10px", fontSize: 11 }}>Batal</Btn>
        </div>
      )}
    </div>
  );
}

function PerangkatDesaRow({ p, canEdit, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const kosong = !p.nama && !p.hp;
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${COLORS.divider}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: COLORS.accent }}>{p.jabatan}</div>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: kosong ? COLORS.inkFaint : COLORS.ink }}>{p.nama || "Belum diisi"}</div>
          {p.hp && <div className="mono" style={{ fontSize: 12.5, color: COLORS.ink, marginTop: 2 }}>{p.hp}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {p.hp && (
            <>
              <a href={`tel:${p.hp.replace(/\D/g, "")}`}><Btn variant="ghost" style={{ padding: "7px 10px" }}><Phone size={13} /></Btn></a>
              <a href={waLink(p.hp, "")} target="_blank" rel="noreferrer"><Btn variant="success" style={{ padding: "7px 10px" }}><MessageCircle size={13} /></Btn></a>
            </>
          )}
          {canEdit && !confirming && (
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Opsi lainnya" style={{ background: menuOpen ? COLORS.divider : "transparent", border: `1px solid ${COLORS.divider}`, borderRadius: 999, width: 26, height: 26, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MoreVertical size={13} />
            </button>
          )}
        </div>
      </div>
      {menuOpen && !confirming && (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => { onEdit(p); setMenuOpen(false); }} style={{ padding: "5px 12px", fontSize: 11.5 }}><Pencil size={11} /> Edit</Btn>
          <Btn variant="danger" onClick={() => setConfirming(true)} style={{ padding: "5px 12px", fontSize: 11.5 }}><Trash2 size={11} /> Hapus</Btn>
        </div>
      )}
      {confirming && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: COLORS.inkSoft, marginRight: "auto" }}>Hapus baris {p.jabatan}?</span>
          <Btn variant="danger" onClick={() => { onDelete(p.id); setConfirming(false); }} style={{ padding: "4px 10px", fontSize: 11 }}>Ya, Hapus</Btn>
          <Btn variant="ghost" onClick={() => setConfirming(false)} style={{ padding: "4px 10px", fontSize: 11 }}>Batal</Btn>
        </div>
      )}
    </div>
  );
}

function GantiPinModal({ onCancel, onSubmit }) {
  const [pinLama, setPinLama] = useState("");
  const [pinBaru, setPinBaru] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pinBaru)) { setError("PIN baru harus 6 digit angka."); return; }
    if (pinBaru !== konfirmasi) { setError("Konfirmasi PIN baru tidak cocok."); return; }
    const result = onSubmit(pinLama, pinBaru);
    if (!result.ok) { setError(result.message); return; }
    onCancel();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(29,29,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
      <Card style={{ padding: 22, maxWidth: 340, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16.5 }}>Ganti PIN</div>
          <button onClick={onCancel} style={{ background: COLORS.bg, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: COLORS.inkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <Field label="PIN Lama"><input type="password" inputMode="numeric" value={pinLama} onChange={(e) => setPinLama(e.target.value)} style={inputStyle} placeholder="6 digit" /></Field>
          <Field label="PIN Baru"><input type="password" inputMode="numeric" value={pinBaru} onChange={(e) => setPinBaru(e.target.value)} style={inputStyle} placeholder="6 digit" /></Field>
          <Field label="Konfirmasi PIN Baru"><input type="password" inputMode="numeric" value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} style={inputStyle} placeholder="6 digit" /></Field>
          {error && <div style={{ fontSize: 12.5, color: COLORS.danger, background: COLORS.dangerSoft, padding: "8px 10px", borderRadius: 8 }}>{error}</div>}
          <Btn type="submit">Simpan PIN Baru</Btn>
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
    const pinAkun = akun.pin || demoPin;
    setHp(akun.hp);
    setPin(pinAkun);
    setError("");
    const result = onLogin(akun.hp, pinAkun);
    if (!result.ok) setError(result.message);
  }

  return (
    <div style={{ minHeight: "100%", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <Card style={{ padding: 30, maxWidth: 380, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, overflow: "hidden", flexShrink: 0, background: "#fff", border: `1px solid ${COLORS.divider}` }}>
            <img src={LOGO_PAGUYUBAN} alt="Logo Paguyuban Warga" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", color: COLORS.ink, lineHeight: 1.1 }}>SBT Pintar</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.sageDeep, lineHeight: 1.3 }}>Community Management &amp; Financial Dashboard</div>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.3 }}>Cluster Sindangbarang Terrace</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <Field label="No. HP terdaftar"><input value={hp} onChange={(e) => setHp(e.target.value)} onKeyDown={handleKeyDown} placeholder="0812xxxxxxxx" style={inputStyle} /></Field>
          <Field label="PIN"><input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={handleKeyDown} placeholder="6 digit" style={inputStyle} /></Field>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: -6 }}>Lupa PIN? Hubungi Pengurus untuk direset.</div>
          {error && <div style={{ fontSize: 12.5, color: COLORS.danger, background: COLORS.dangerSoft, padding: "9px 12px", borderRadius: 10 }}>{error}</div>}
          <Btn type="button" onClick={doLogin} style={{ padding: "12px 0" }}>Masuk</Btn>
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.divider}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11.5, color: COLORS.inkSoft, marginBottom: 10 }}>
            Prototype demo — belum ada backend sungguhan. Gunakan PIN <b>{demoPin}</b> untuk akun yang belum pernah direset, atau login cepat sebagai:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
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
