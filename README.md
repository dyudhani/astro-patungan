# Patungan — Split Bill (No AI)

Website split bill dari foto struk. Astro + Tesseract.js. **100% client-side**, tanpa database, tanpa auth, tanpa API berbayar.

## Fitur

- Upload foto struk → OCR offline pakai Tesseract.js (bahasa Indonesia + English)
- Parser cerdas untuk mendeteksi item, qty, harga, tax, service charge, diskon
- Edit hasil scan kalau ada yang salah
- Tambah orang & centang siapa pesan apa
- Item yang dipesan beberapa orang → dibagi rata
- Tax & service dibagi proporsional sesuai porsi
- Total per orang dibulatkan ke atas (default Rp 1.000)
- Download hasil sebagai PNG
- **Static site** — tidak ada server, tidak ada API key, deploy ke mana saja

## Setup Lokal

```bash
npm install
npm run dev
```

Buka http://localhost:4321

Itu saja. **Tidak ada .env, tidak ada API key**.

## Deploy

Karena ini static site (`output: 'static'`), bisa deploy ke:

- **Vercel**: import GitHub repo → deploy. Selesai.
- **Netlify**: drag & drop folder `dist/` ke Netlify, atau connect GitHub.
- **GitHub Pages**: build lalu push folder `dist/` ke branch `gh-pages`.
- **Cloudflare Pages**: connect repo → set build command `npm run build` → output `dist`.

```bash
npm run build
# output ada di folder dist/
```

## Cara kerja OCR

1. User upload foto
2. Tesseract.js (WebAssembly) di-load di browser (~2-5 MB sekali load, di-cache)
3. Model bahasa `ind+eng` diunduh otomatis (~10 MB sekali, di-cache browser)
4. Gambar diproses **di browser kamu** — tidak dikirim ke mana-mana
5. Hasil teks di-parse oleh `parseReceipt.ts` untuk extract item & total

## Customisasi

### Ubah pembulatan
Buka `src/pages/index.astro`, cari:
```ts
const ROUND_TO = 1000;
```
Ganti ke `100`, `500`, atau berapapun.

### Ubah bahasa OCR
`src/pages/index.astro`, cari `'ind+eng'` — bisa ganti ke `'eng'` saja kalau struk berbahasa Inggris (lebih cepat).

### Tweak parser
Logic deteksi item ada di `src/lib/parseReceipt.ts`. Kalau ada format struk khusus yang tidak ke-detect, edit fungsi `tryParseItemLine` atau `SKIP_KEYWORDS`.

### Ubah warna
`src/layouts/Layout.astro`, edit CSS variables di `:root`.

## Tips OCR yang Akurat

- Foto **tegak lurus** (jangan miring)
- **Cahaya cukup**, hindari shadow di tengah struk
- Struk **rata**, jangan kusut
- **Crop** kalau ada background terlalu banyak

Kalau hasil OCR jelek, pakai tombol **"Lewati scan — input manual"** dan ketik item langsung.

## Privasi

- **Tidak ada data dikirim ke server** (kecuali file Tesseract dari CDN saat pertama load)
- Tidak ada database
- Tidak ada cookie/tracking
- Semua state hanya di browser

## Tech Stack

- **Astro 4** (static output, no server)
- **Tesseract.js v5** dari CDN (OCR offline via WebAssembly, tidak di-bundle untuk hindari masalah Vite + web workers)
- **html-to-image** untuk export PNG
- Vanilla TypeScript di client

## Catatan teknis

Tesseract.js di-load dari `cdn.jsdelivr.net` lewat `<script>` tag di `Layout.astro`, **bukan** lewat `npm install`. Ini cara resmi yang direkomendasikan untuk browser karena library ini pakai web worker yang error kalau di-bundle Vite/Webpack. Konsekuensinya: app butuh koneksi internet **sekali** untuk download Tesseract (~2 MB), setelahnya browser akan cache.
