# OCR Engineering Notes

Catatan teknis tentang bagaimana OCR struk di app ini bekerja, batasannya,
dan cara menambah "pengetahuan" baru ke sistem — ditulis supaya siapa pun
(termasuk future-me) bisa lanjutin tanpa harus reverse-engineer dari nol.

## Arsitektur saat ini

```
Foto struk → preprocessImage() → Tesseract.js (dual-pass) → parseReceipt() → Bill
             (ocr.ts)                                          (parser heuristik,
                                                                 BUKAN AI/ML)
```

- **`ocr.ts`** — image processing (deskew, normalisasi kontras lokal, upscale)
  + menjalankan Tesseract.js 2x dengan mode segmentasi berbeda (PSM 6 & 4),
  lalu pilih hasil dengan skor terbaik (`scoreParse`).
- **`parseReceipt.ts`** — parser **rule-based** (regex + daftar kata kunci).
  Ini BUKAN model yang belajar dari data — ini kode deterministik yang cocok
  atau tidak cocok dengan pola tertentu. "Menambah pengetahuan" ke parser ini
  artinya menambah/memperbaiki ATURAN, bukan memberi contoh untuk di-training.

## Dua kelas kegagalan yang BERBEDA — penting untuk didiagnosis dengan benar

Waktu troubleshooting hasil OCR yang salah, langkah pertama selalu: **cek teks
mentah yang dikeluarkan Tesseract SEBELUM disalahkan ke parser.** Dua kelas
kegagalan ini butuh solusi yang sama sekali berbeda:

### Kelas 1 — Parser salah buang baris yang teksnya sebenarnya BENAR

Contoh nyata yang ditemukan & diperbaiki di sesi ini:
- `"1 NEW PACKAGE VIP 2 JAM"` hilang total karena kata **"jam"** ada di daftar
  skip-keyword (untuk skip baris "Jam: 22:12"), tapi "jam" di sini adalah
  bagian dari nama paket ("2 JAM" = 2 hours), bukan label waktu.
- `"2 Nasi Goreng Billzard"` hilang karena venue-nya bernama **"Billzard"**,
  yang mengandung substring kata kunci **"bill"** (dimaksudkan untuk skip
  header seperti "Bill No: 123").
- Ternyata ini pola sistemik, bukan cuma 2 kasus kebetulan: `"Vegetable Fried
  Rice"` (nabrak `table`), `"Cashew Chicken"` (nabrak `cash`), `"Overtime
  Burger"` (nabrak `time`) — semua hilang karena `isKeywordMatch` di
  `parseReceipt.ts` defaultnya pakai substring bebas (`.includes()`) tanpa
  batas kata. **Sudah digeneralisasi**: semua keyword satu-kata sekarang
  otomatis pakai `\b...\b` (word boundary), bukan daftar pendek yang
  di-hardcode manual — jadi keyword BARU yang ditambah ke `SKIP_KEYWORDS`
  ke depannya otomatis aman dari pola tabrakan ini juga.

**Ciri-ciri kelas ini:** teks yang keluar dari Tesseract sudah benar/terbaca
jelas, tapi item tidak muncul di daftar pesanan sama sekali. **Ini 100% bisa
diperbaiki** — solusinya menyempit ke `\bkata\b` (word boundary) atau
menambah syarat konteks, lalu dikunci dengan regression test (lihat di bawah).

**Batasan word-boundary**: ini cuma menyelesaikan tabrakan SUBSTRING (kata
kuncinya bukan kata yang berdiri sendiri di teks aslinya). Ada kasus lain
yang word-boundary TIDAK bisa selesaikan: kata kunci `"meja"` dan `"dana"`
memang muncul sebagai kata utuh baik di label metadata ("Meja : 5") MAUPUN
di nama menu asli ("Nasi Meja Rames", "Es Dana Kelapa") — keduanya sama-sama
valid secara gramatikal, jadi `\bmeja\b` tidak bisa membedakan mana yang mana.
Ini butuh heuristik konteks seperti yang dibuat untuk `"jam"` (lihat kode di
`isKeywordMatch`), TAPI belum dibuat untuk `"meja"`/`"dana"` karena belum ada
bukti nyata dari struk asli — jangan tambah heuristik berdasarkan tebakan,
tunggu sampai ada kasus nyata (lihat bagian Testing di bawah untuk caranya).

### Kelas 2 — Tesseract salah BACA karakter (font legibility)

Contoh nyata: foto struk yang tajam, lurus, terang — tapi "1 NEW PACKAGE VIP
2 JAM 99.000" terbaca jadi **"a PACKAGE VIP 9 JAN 995"**. Font dot-matrix
printer POS (titik-titik renggang, karakter mepet) ada di luar distribusi
data training Tesseract yang defaultnya dilatih untuk cetakan/font normal.

**Ciri-ciri kelas ini:** teks yang keluar dari Tesseract sendiri sudah ngaco
dari sononya — parser tidak punya cara membedakan "9" hasil salah baca dari
"9" yang benar. **Ini TIDAK bisa diperbaiki dengan mengubah `parseReceipt.ts`
atau nambah aturan** — perbaikannya harus di level image processing /
model / engine, dan ada plafon akurasi yang realistis untuk OCR offline di
browser terhadap font seperti ini.

Kalau nemu kasus item hilang/salah lagi ke depannya: **selalu cek dulu teks
mentah OCR-nya** (bisa lewat `console.log` sementara di `recognizeReceipt`,
atau tes `parseReceipt()` langsung dengan teks itu — lihat bagian Testing).
Kalau teksnya sudah benar tapi item hilang → kelas 1, perbaiki di parser.
Kalau teksnya sendiri sudah salah → kelas 2, parser tidak bisa menolong.

## Testing — cara menambah "contoh struk baru" (regression fixtures)

Karena parser ini rule-based, cara yang BENAR untuk "memberi pengetahuan baru"
bukan dengan "melatih" apa pun, tapi dengan menambah **regression test**: teks
struk asli (ground truth, dibaca manual dari foto) + hasil yang seharusnya.
Ini mencegah bug seperti "jam"/"bill" di atas terulang lagi tanpa ketahuan.

```
src/lib/__fixtures__/receipts/
  billzard-room.ts        — struk sewa VIP (ground truth, harus 100% pas)
  billzard-food.ts         — struk makanan 11 item (ground truth, harus 100% pas)
  billzard-room-badocr.ts  — OCR nyata yang gagal (ground truth SALAH secara
                              sengaja) → test bahwa safety-net warning
                              menyala, BUKAN test bahwa angkanya benar
src/lib/parseReceipt.test.ts — assertion-nya
```

**Untuk menambah struk baru** (dari foto struk apa pun yang bermasalah):
1. Ketik ulang teks struk itu manual/rapi ke file baru di
   `src/lib/__fixtures__/receipts/nama-venue-deskripsi.ts` (contoh format:
   lihat `billzard-room.ts`), isi field `expected` sesuai apa yang SEHARUSNYA
   terbaca.
2. Tambah satu blok `it(...)` di `parseReceipt.test.ts` (atau taruh di array
   loop yang sudah ada kalau strukturnya sama).
3. `npm test` — kalau merah, itu berarti parser BENERAN salah untuk pola itu
   (bukan cuma OCR-nya) → baru cari tahu keyword/regex mana yang nabrak,
   dengan pola debug yang sama seperti kasus "jam"/"bill" di atas.

Kalau struknya bermasalah karena OCR salah baca karakter (kelas 2, bukan
kelas 1) — itu bukan kandidat fixture "harus 100% pas", tapi kandidat
`*-badocr.ts` yang cuma nge-test warning-nya muncul.

```bash
npm test          # jalanin semua regression test
npx tsc --noEmit  # typecheck
npm run build     # full build
```

## Roadmap — apa yang realistis dikerjakan berikutnya

Diurutkan dari yang paling murah/aman sampai yang paling mengubah arsitektur:

1. **(Sudah jalan)** Regression fixtures + word-boundary fix untuk
   keyword-collision (kelas 1). Tambah terus tiap ketemu kasus baru.
2. **(Sudah jalan)** Preprocessing: auto-deskew halus + normalisasi kontras
   lokal (bantu kasus miring/silau, TIDAK bantu kasus font dot-matrix).
3. **(Sudah jalan)** Safety-net warning: kalau total item vs Subtotal/Tax/
   TOTAL di struk beda jauh, tampilkan peringatan supaya user cek manual
   alih-alih diam-diam salah bagi.
4. **Belum dikerjakan — "learned corrections" per-venue (opsional, tetap
   100% offline):** simpan pasangan (teks OCR mentah → koreksi manual user)
   di `localStorage` tiap kali user mengedit hasil scan di step "Cek isi
   struk". Scan berikutnya dari venue yang sama, cocokkan teks OCR baru ke
   koreksi yang pernah disimpan (fuzzy match / Levenshtein distance) dan
   auto-terapkan kalau mirip. Ini cara paling realistis untuk "sistem makin
   pintar" tanpa training model — tapi hanya membantu untuk venue/struk yang
   SAMA yang sudah pernah dikoreksi user sebelumnya, bukan struk baru dari
   tempat lain.
5. **Belum dikerjakan, ubah arsitektur — cloud Vision OCR sebagai opsi
   tambahan:** untuk font dot-matrix seperti Billzard, satu-satunya cara
   dapat akurasi jauh lebih tinggi adalah OCR yang lebih canggih dari
   Tesseract (mis. Google Cloud Vision / model vision LLM). Ini mengubah
   klaim "100% client-side, tanpa API berbayar" di README — perlu API key,
   ada biaya per-scan, dan foto terkirim keluar device. **User sudah
   diberi pilihan ini dan memilih tetap 100% offline** — dicatat di sini
   supaya keputusannya tidak hilang kalau nanti mau dipertimbangkan ulang.

## Yang TIDAK akan menyelesaikan masalah font dot-matrix

Supaya tidak buang waktu ke jalan buntu di masa depan:
- ❌ Menambah lebih banyak PSM pass Tesseract — sudah dicoba secara konsep,
  hasilnya cuma milih yang "paling tidak buruk" di antara beberapa bacaan
  yang sama-sama salah, bukan bacaan yang benar.
- ❌ Mengubah threshold/parameter parser lebih lanjut — parser cuma bisa
  bekerja dengan teks yang MASUK ke dalamnya; kalau Tesseract sendiri sudah
  salah baca karakternya, tidak ada regex yang bisa menebak nilai aslinya.
- ❌ Menambah dictionary koreksi kata generik ("PACKAGE" pasti dibaca
  "PACKAGE", dst) — tidak scalable, dan gampang salah untuk nama menu/venue
  yang unik per tempat. Kalau mau arah ini, harus per-venue via
  learned-corrections (poin 4 di atas), bukan dictionary global.
