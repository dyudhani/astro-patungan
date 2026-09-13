// Indonesian/English UI translations. Flat key → string dictionary per
// language, with simple {placeholder} interpolation — no framework needed
// since the app is plain DOM manipulation.

export type Lang = "id" | "en";

const LANG_KEY = "patungan_lang";

const dict = {
  id: {
    // Header / hero
    brandTag: "split bill · 100% offline",
    heroTitle: "Bagi bill, <em>tanpa drama.</em>",
    heroDesc:
      "Upload foto struk, pilih siapa pesan apa, kelar. OCR jalan di browser kamu — tidak ada data yang dikirim ke server.",

    // Step 1: upload
    step1Title: "Foto struk",
    dropzoneText: "Tap untuk pilih foto struk",
    dropzoneHint: "atau drag & drop · JPG, PNG, WEBP",
    previewImgAlt: "Preview struk",
    previewRemoveAria: "Hapus",
    scanLabelChooseFirst: "Pilih foto dulu",
    scanLabelRescan: "🔍 Baca struk (offline)",
    scanLabelProcessing: "Memproses...",
    scanLabelScanAgain: "🔄 Scan ulang",
    btnSkip: "Lewati scan — input manual",
    rotateBtnText: "↻ Putar",
    rotateBtnTitle: "Putar 90°",
    btnCamera: "📷 Foto pakai kamera",
    btnPaste: "📋 Tempel teks struk",
    pasteTextPlaceholder:
      "Tempel teks struk di sini — tiap baris: nama + harga (mis. 'Es Teh 8.000')...",
    pasteTextAria: "Teks struk",
    btnParseText: "Proses teks → daftar pesanan",
    pasteEmptyAlert: "Tempel teks struk dulu.",
    noItemsFromTextAlert:
      "Tidak ada item terbaca dari teks. Coba rapikan formatnya, atau tambah manual di langkah berikutnya.",
    btnTotalOnly: "💸 Bagi rata total saja (tanpa rincian)",
    toTotalPlaceholder: "Total bill (Rp)",
    toNamesPlaceholder: "Nama teman, pisahkan dengan koma (mis: Andi, Budi, Citra)",
    toNamesAria: "Nama teman",
    btnGo: "Bagi rata",
    totalBillEmptyAlert: "Isi total bill dulu.",
    namesEmptyAlert: "Isi nama teman dulu, pisahkan dengan koma (mis: Andi, Budi, Citra).",
    btnHistory: "🕘 Riwayat patungan",
    historyEmpty: "Belum ada riwayat. Selesaikan satu patungan dulu.",
    historyPeopleCount: "{count} orang",
    historyOpenBtn: "Buka",
    historyDelBtn: "Hapus",
    ocrNoItemsWarning:
      "⚠️ OCR tidak menemukan item yang jelas. Tambah item manual di langkah berikutnya, atau coba foto yang lebih terang & lurus.",
    ocrErrorGeneric: "Gagal memproses gambar",
    ocrErrorSuffix: ". Coba foto lain atau input manual.",
    appendBannerText:
      "➕ Menambahkan ke struk yang sudah ada ({count} pesanan) — struk baru akan <b>ditambahkan</b>, bukan menimpa.",
    btnCancel: "Batal",
    addReceiptBtn: "📷 Tambah dari struk lain",
    duplicateScanConfirm:
      "Struk ini kelihatannya sama dengan yang sudah ditambahkan sebelumnya — sebagian besar pesanannya cocok. Tetap tambahkan (jadi dobel)?",
    duplicateScanConfirmYes: "Tetap tambahkan",

    // Step 2: bill
    step2Title: "Cek isi struk",
    step2Subtitle: "Penting: Sesuaikan Harga Total & Satuan jika ada yang salah baca.",
    btnAddItem: "+ Tambah pesanan",
    subtotalLabel: "Subtotal",
    taxLabel: "Pajak (Tax)",
    serviceLabel: "Service Charge",
    discountLabel: "Diskon",
    totalBillLabel: "Total Bill",
    btnToPeople: "Lanjut ke pembagian →",
    taxModeAria: "Mode pajak: Rupiah atau persen",
    serviceModeAria: "Mode service charge: Rupiah atau persen",
    discountModeAria: "Mode diskon: Rupiah atau persen",
    itemNamePlaceholder: "Nama Pesanan",
    itemNameAria: "Nama pesanan",
    moveUpTitle: "Naik",
    moveUpAria: "Pindah pesanan ke atas",
    moveDownTitle: "Turun",
    moveDownAria: "Pindah pesanan ke bawah",
    dupTitle: "Duplikat",
    dupAria: "Duplikat pesanan",
    removeItemAria: "Hapus pesanan",
    qtyTitle: "Jumlah (Qty)",
    unitPriceTitle: "Harga Satuan",
    unitPricePlaceholder: "Satuan",
    unitPriceAria: "Harga satuan",
    totalPriceTitle: "Harga Total",
    totalPricePlaceholder: "Total",
    totalPriceAria: "Harga total",
    deletedToast: '"{name}" dihapus.',
    undoLabel: "Undo",
    itemNoNameFallback: "(tanpa nama)",
    addMinItemAlert: "Tambah minimal 1 item dulu",
    scanWarningHeading: "Cek manual sebelum lanjut:",
    defaultPersonName: "Orang",
    defaultFriendName: "Teman",

    // Step 3: people
    step3Title: "Bagi per Pesanan",
    step3Subtitle:
      "Tambah nama teman yang ikut patungan, lalu tandai siapa saja yang makan di tiap pesanan.",
    newPersonPlaceholder: "Ketik nama (cth. Andi)",
    newPersonAria: "Nama teman baru",
    btnAddPerson: "+ Teman",
    btnSaveGroup: "💾 Simpan grup ini",
    btnLoadGroup: "👥 Pakai grup tersimpan",
    groupNamePlaceholder: "Nama grup (mis: Kantor Squad)",
    groupNameAria: "Nama grup",
    btnConfirmSaveGroup: "Simpan",
    btnCalculate: "Hitung & Tampilkan Hasil ↓",
    peopleListLabel: "Daftar Teman Patungan:",
    noOneJoinedYet: "Belum ada yang gabung. Tambah di atas 👆",
    editNameTitle: "Klik untuk ganti nama",
    friendNameAria: "Nama teman",
    removeFriendAria: "Hapus teman {name}",
    splitAllEvenlyBtn: "⚖️ Bagikan SEMUA pesanan rata ke semua teman",
    unassignedWarning: "{count} pesanan belum dibagi: {names}",
    perHeadOwes: "Tanggungan: {amount}",
    notChargedYet: "Belum ditagih",
    decreasePortionAria: "Kurangi porsi {name}",
    increasePortionAria: "Tambah porsi {name}",
    noNameItemFallback: "(Tanpa Nama)",
    qtyTimesPrice: "{qty} Qty × {price}",
    chargedToNFriends: "Ditagih ke {count} teman",
    noOnePayingYet: "Belum ada yang bayar",
    splitOneEvenlyBtn: "⚖️ Bagi rata ke semua",
    clearItemBtn: "Kosongkan",
    addMinPersonAlert: "Tambah minimal 1 orang dulu",
    noNamePersonFallback: "Tanpa nama",
    groupNameEmptyAlert: "Isi nama grup dulu.",
    groupNeedPersonAlert: "Tambah minimal 1 teman dulu sebelum disimpan sebagai grup.",
    groupOverwriteConfirm: 'Grup "{name}" sudah ada. Timpa dengan daftar teman saat ini?',
    groupSavedToast: 'Grup "{name}" disimpan.',
    groupEmptyList: "Belum ada grup tersimpan.",
    groupMembersLabel: "{count} orang: {names}",
    groupUseBtn: "Pakai",
    groupAddedToast: 'Grup "{name}" ditambahkan.',

    // Step 4: result
    resultHeading: "Hasil <em>Patungan</em>",
    bankDetailsHeading: "💳 Detail Pembayaran (Muncul Paling Atas PDF)",
    bankNamePlaceholder: "Nama Bank (BCA, Mandiri...)",
    bankNameAria: "Nama bank",
    bankAccPlaceholder: "No Rekening",
    bankAccAria: "Nomor rekening",
    bankHolderPlaceholder: "Atas Nama",
    bankHolderAria: "Nama pemilik rekening",
    bankLinkPlaceholder: "Link pembayaran (QRIS / GoPay / OVO / DANA / link e-wallet)",
    bankLinkAria: "Link pembayaran",
    roundingSettingsHeading: "⚙️ Pengaturan pembulatan",
    roundNearest: "Ke terdekat",
    roundUp: "Ke atas",
    roundDown: "Ke bawah",
    roundModeAria: "Mode pembulatan",
    roundPer1000: "per 1.000",
    roundPer500: "per 500",
    roundPer100: "per 100",
    roundNone: "tanpa bulat",
    roundToAria: "Kelipatan pembulatan",
    reconcileLabel: "Samakan total terkumpul = bill (selisih dibebankan ke 1 orang)",
    settleHeading: "🤝 Siapa yang nalangin / bayar duluan?",
    settlePayerAria: "Pilih yang menalangin",
    settlePlaceholderOption: "— Pilih yang nalangin —",
    settleChoosePrompt:
      "Pilih satu orang yang nalangin — nanti muncul siapa transfer berapa ke dia.",
    settleSummary: "{payer} nalangin semua, akan terima total {amount}:",
    btnWhatsApp: "📲 WhatsApp",
    btnCopyText: "📋 Salin teks",
    btnCopiedText: "✓ Tersalin!",
    btnPng: "🖼️ PNG",
    btnCsv: "⬇️ CSV",
    btnCopyLink: "🔗 Salin link",
    btnLinkCopied: "✓ Link tersalin!",
    sendPersonAria: "Kirim rincian ke {name}",
    paidLabel: "Lunas",
    paidBadge: "LUNAS",
    totalBayarLabel: "TOTAL BAYAR:",
    roundingAdjustLabel: "Pembulatan",
    grandTotalOriginal: "Total tagihan asli: {amount}",
    grandTotalCollected: "Total terkumpul setelah pembulatan: {amount}",
    grandTotalDiff: "(Selisih: {diff})",
    unassignedConfirm:
      "{count} pesanan belum dibagi ke siapa pun:\n{names}\n\nKalau dilanjut, pesanan itu tidak ditagih ke siapa pun (total terkumpul jadi kurang dari bill). Tetap lanjut?",
    proceedAnyway: "Tetap lanjut",
    btnDownloadPdf: "📥 Download / Cetak PDF",
    btnReset: "Mulai ulang",
    resetConfirm: "Mulai ulang dari awal?",
    pngLoadingBtn: "⏳ Memuat...",
    pngModuleErrorAlert: "Gagal memuat modul gambar. Cek koneksi lalu coba lagi.",
    pngErrorAlert: "Gagal membuat PNG. Coba lagi.",
    clipboardErrorAlert: "Gagal menyalin otomatis. Salin manual:\n\n{text}",
    restoreBannerText: "💾 Ada sesi tersimpan{when}. Lanjutkan?",
    restoreBannerContinue: "Lanjutkan",
    restoreFromLinkConfirm: "Buka patungan dari link yang dibagikan?",

    footerText:
      "© dyudhani 2026 | Gratis · tanpa daftar · tanpa server · OCR jalan di browser kamu",

    // Modal defaults
    ok: "OK",
    yes: "Ya",

    // Install prompt
    installBannerText: "📲 Pasang app ini di HP kamu — buka lebih cepat, tanpa buka browser.",
    installBtn: "Pasang",
    installIOSText: '📲 Pasang app ini: tap tombol Share, lalu pilih "Add to Home Screen".',
    closeAria: "Tutup",

    // Share text (WhatsApp)
    shareHeader: "*Patungan* 🧾",
    shareTransferTo: "💳 Transfer ke:",
    shareBank: "Bank {name}",
    shareHolder: "a.n. {holder}",
    sharePay: "🔗 Bayar: {link}",
    shareTotal: "💰 Total: {amount}",
    shareTransferToPayer: "🤝 Transfer ke *{payer}* (yang nalangin):",
    shareFooter: "via patungan. — https://astro-patungan.vercel.app/",
    personShareHeader: "*Patungan* 🧾 — untuk {name}",
    personShareSubtotal: "Subtotal: {amount}",
    personSharePajak: "Pajak: {amount}",
    personShareService: "Service: {amount}",
    personShareDiskon: "Diskon: -{amount}",
    personShareTotal: "💰 *Total kamu: {amount}*",
    personShareTransferToPayer: "🤝 Transfer ke *{payer}* (yang nalangin).",

    // CSV
    csvName: "Nama",
    csvItems: "Pesanan",
    csvStatus: "Status",
    csvStatusPaid: "LUNAS",
    csvStatusUnpaid: "Belum",
    csvTotalCollected: "Total Terkumpul",

    // Digital receipt (PDF/PNG)
    receiptTransferTo: "Transfer Pembayaran Ke",
    receiptDigital: "Struk Digital",
    receiptBreakdown: "Rincian Patungan:",
    receiptTotalDue: "Total Bayar",
    receiptTotalCollected: "Total Terkumpul",
    receiptPerReceipt: "Sesuai struk + pembulatan",
    receiptFooterFair: "Dihitung secara adil & transparan.",
    receiptFooterCopyright: "© dyudhani 2026 | No server, 100% aman.",

    // OCR progress
    ocrDownloadingEngine: "Mengunduh OCR engine...",
    ocrLoadingTesseract: "Memuat Tesseract OCR...",
    ocrLoadingEngine: "Memuat OCR engine...",
    ocrInitializing: "Inisialisasi...",
    ocrDownloadingLangModel: "Mengunduh model bahasa Indonesia...",
    ocrPreparing: "Menyiapkan...",
    ocrStraightening: "Meluruskan & menajamkan kontras struk...",
    ocrReadingPass1: "Membaca struk (1/2)...",
    ocrReadingPass2: "Membaca ulang (2/2)...",
    ocrReadingGeneric: "Membaca struk...",

    // parseReceipt warnings
    warnTotalMismatch:
      "Total dari rincian item ({expected}) beda jauh dari TOTAL di struk ({found}) — kemungkinan ada angka yang salah kebaca, cek manual.",
    warnSubtotalMismatch:
      "Jumlah semua item ({calc}) tidak cocok dengan Subtotal di struk ({found}) — kemungkinan ada item yang salah kebaca.",
    warnNoTotalFound:
      'Baris "Subtotal/Total" tidak terbaca dari struk — isi manual di langkah berikutnya.',
  },
  en: {
    brandTag: "split the bill · 100% offline",
    heroTitle: "Split the bill, <em>drama-free.</em>",
    heroDesc:
      "Upload the receipt photo, pick who ordered what, done. OCR runs in your browser — no data is ever sent to a server.",

    step1Title: "Receipt photo",
    dropzoneText: "Tap to choose a receipt photo",
    dropzoneHint: "or drag & drop · JPG, PNG, WEBP",
    previewImgAlt: "Receipt preview",
    previewRemoveAria: "Remove",
    scanLabelChooseFirst: "Choose a photo first",
    scanLabelRescan: "🔍 Read receipt (offline)",
    scanLabelProcessing: "Processing...",
    scanLabelScanAgain: "🔄 Scan again",
    btnSkip: "Skip scan — enter manually",
    rotateBtnText: "↻ Rotate",
    rotateBtnTitle: "Rotate 90°",
    btnCamera: "📷 Take photo with camera",
    btnPaste: "📋 Paste receipt text",
    pasteTextPlaceholder:
      "Paste receipt text here — one line per item: name + price (e.g. 'Iced Tea 8.000')...",
    pasteTextAria: "Receipt text",
    btnParseText: "Process text → order list",
    pasteEmptyAlert: "Paste the receipt text first.",
    noItemsFromTextAlert:
      "No items were read from the text. Try tidying up the format, or add items manually in the next step.",
    btnTotalOnly: "💸 Split total evenly only (no itemization)",
    toTotalPlaceholder: "Total bill (amount)",
    toNamesPlaceholder: "Friends' names, comma-separated (e.g: Andi, Budi, Citra)",
    toNamesAria: "Friends' names",
    btnGo: "Split evenly",
    totalBillEmptyAlert: "Enter the total bill first.",
    namesEmptyAlert: "Enter friends' names first, comma-separated (e.g: Andi, Budi, Citra).",
    btnHistory: "🕘 Split history",
    historyEmpty: "No history yet. Finish a split first.",
    historyPeopleCount: "{count} people",
    historyOpenBtn: "Open",
    historyDelBtn: "Delete",
    ocrNoItemsWarning:
      "⚠️ OCR couldn't find clear items. Add items manually in the next step, or try a brighter, straighter photo.",
    ocrErrorGeneric: "Failed to process image",
    ocrErrorSuffix: ". Try another photo or enter manually.",
    appendBannerText:
      "➕ Adding to the existing bill ({count} items) — the new receipt will be <b>added</b>, not replace it.",
    btnCancel: "Cancel",
    addReceiptBtn: "📷 Add from another receipt",
    duplicateScanConfirm:
      "This receipt looks the same as one already added earlier — most of its items match. Add it anyway (as a duplicate)?",
    duplicateScanConfirmYes: "Add anyway",

    step2Title: "Check the receipt",
    step2Subtitle: "Important: Adjust the Total/Unit price if something was misread.",
    btnAddItem: "+ Add item",
    subtotalLabel: "Subtotal",
    taxLabel: "Tax",
    serviceLabel: "Service Charge",
    discountLabel: "Discount",
    totalBillLabel: "Total Bill",
    btnToPeople: "Continue to split →",
    taxModeAria: "Tax mode: amount or percent",
    serviceModeAria: "Service charge mode: amount or percent",
    discountModeAria: "Discount mode: amount or percent",
    itemNamePlaceholder: "Item name",
    itemNameAria: "Item name",
    moveUpTitle: "Move up",
    moveUpAria: "Move item up",
    moveDownTitle: "Move down",
    moveDownAria: "Move item down",
    dupTitle: "Duplicate",
    dupAria: "Duplicate item",
    removeItemAria: "Delete item",
    qtyTitle: "Quantity",
    unitPriceTitle: "Unit price",
    unitPricePlaceholder: "Unit",
    unitPriceAria: "Unit price",
    totalPriceTitle: "Total price",
    totalPricePlaceholder: "Total",
    totalPriceAria: "Total price",
    deletedToast: '"{name}" deleted.',
    undoLabel: "Undo",
    itemNoNameFallback: "(no name)",
    addMinItemAlert: "Add at least 1 item first",
    scanWarningHeading: "Check manually before continuing:",
    defaultPersonName: "Person",
    defaultFriendName: "Friend",

    step3Title: "Split by Item",
    step3Subtitle:
      "Add the names of friends splitting the bill, then mark who had each item.",
    newPersonPlaceholder: "Type a name (e.g. Andi)",
    newPersonAria: "New friend's name",
    btnAddPerson: "+ Friend",
    btnSaveGroup: "💾 Save this group",
    btnLoadGroup: "👥 Use a saved group",
    groupNamePlaceholder: "Group name (e.g: Office Squad)",
    groupNameAria: "Group name",
    btnConfirmSaveGroup: "Save",
    btnCalculate: "Calculate & Show Result ↓",
    peopleListLabel: "Friends splitting the bill:",
    noOneJoinedYet: "No one's joined yet. Add above 👆",
    editNameTitle: "Click to rename",
    friendNameAria: "Friend's name",
    removeFriendAria: "Remove friend {name}",
    splitAllEvenlyBtn: "⚖️ Split ALL items evenly among everyone",
    unassignedWarning: "{count} items not yet assigned: {names}",
    perHeadOwes: "Owes: {amount}",
    notChargedYet: "Not charged yet",
    decreasePortionAria: "Decrease {name}'s portion",
    increasePortionAria: "Increase {name}'s portion",
    noNameItemFallback: "(No Name)",
    qtyTimesPrice: "{qty} Qty × {price}",
    chargedToNFriends: "Charged to {count} friends",
    noOnePayingYet: "No one's paying yet",
    splitOneEvenlyBtn: "⚖️ Split evenly among everyone",
    clearItemBtn: "Clear",
    addMinPersonAlert: "Add at least 1 person first",
    noNamePersonFallback: "No name",
    groupNameEmptyAlert: "Enter a group name first.",
    groupNeedPersonAlert: "Add at least 1 friend first before saving as a group.",
    groupOverwriteConfirm: 'Group "{name}" already exists. Overwrite with the current friend list?',
    groupSavedToast: 'Group "{name}" saved.',
    groupEmptyList: "No saved groups yet.",
    groupMembersLabel: "{count} people: {names}",
    groupUseBtn: "Use",
    groupAddedToast: 'Group "{name}" added.',

    resultHeading: "Split <em>Result</em>",
    bankDetailsHeading: "💳 Payment Details (Shown at Top of PDF)",
    bankNamePlaceholder: "Bank name (BCA, Mandiri...)",
    bankNameAria: "Bank name",
    bankAccPlaceholder: "Account number",
    bankAccAria: "Account number",
    bankHolderPlaceholder: "Account holder",
    bankHolderAria: "Account holder name",
    bankLinkPlaceholder: "Payment link (QRIS / GoPay / OVO / DANA / e-wallet link)",
    bankLinkAria: "Payment link",
    roundingSettingsHeading: "⚙️ Rounding settings",
    roundNearest: "Nearest",
    roundUp: "Round up",
    roundDown: "Round down",
    roundModeAria: "Rounding mode",
    roundPer1000: "per 1,000",
    roundPer500: "per 500",
    roundPer100: "per 100",
    roundNone: "no rounding",
    roundToAria: "Rounding increment",
    reconcileLabel: "Make collected total = bill (difference charged to 1 person)",
    settleHeading: "🤝 Who's fronting the payment?",
    settlePayerAria: "Choose who's fronting",
    settlePlaceholderOption: "— Choose who's fronting —",
    settleChoosePrompt:
      "Choose one person to front the payment — you'll then see who transfers how much to them.",
    settleSummary: "{payer} is fronting for everyone, will receive a total of {amount}:",
    btnWhatsApp: "📲 WhatsApp",
    btnCopyText: "📋 Copy text",
    btnCopiedText: "✓ Copied!",
    btnPng: "🖼️ PNG",
    btnCsv: "⬇️ CSV",
    btnCopyLink: "🔗 Copy link",
    btnLinkCopied: "✓ Link copied!",
    sendPersonAria: "Send breakdown to {name}",
    paidLabel: "Paid",
    paidBadge: "PAID",
    totalBayarLabel: "TOTAL DUE:",
    roundingAdjustLabel: "Rounding",
    grandTotalOriginal: "Original bill total: {amount}",
    grandTotalCollected: "Total collected after rounding: {amount}",
    grandTotalDiff: "(Difference: {diff})",
    unassignedConfirm:
      "{count} items not assigned to anyone:\n{names}\n\nIf you continue, those items won't be charged to anyone (collected total will be less than the bill). Continue anyway?",
    proceedAnyway: "Continue anyway",
    btnDownloadPdf: "📥 Download / Print PDF",
    btnReset: "Start over",
    resetConfirm: "Start over from scratch?",
    pngLoadingBtn: "⏳ Loading...",
    pngModuleErrorAlert: "Failed to load the image module. Check your connection and try again.",
    pngErrorAlert: "Failed to create PNG. Try again.",
    clipboardErrorAlert: "Couldn't copy automatically. Copy manually:\n\n{text}",
    restoreBannerText: "💾 There's a saved session{when}. Continue?",
    restoreBannerContinue: "Continue",
    restoreFromLinkConfirm: "Open the split from the shared link?",

    footerText: "© dyudhani 2026 | Free · no sign-up · no server · OCR runs in your browser",

    ok: "OK",
    yes: "Yes",

    installBannerText: "📲 Install this app on your phone — opens faster, no browser needed.",
    installBtn: "Install",
    installIOSText: '📲 Install this app: tap the Share button, then choose "Add to Home Screen".',
    closeAria: "Close",

    shareHeader: "*Split Bill* 🧾",
    shareTransferTo: "💳 Transfer to:",
    shareBank: "Bank {name}",
    shareHolder: "acc. holder: {holder}",
    sharePay: "🔗 Pay: {link}",
    shareTotal: "💰 Total: {amount}",
    shareTransferToPayer: "🤝 Transfer to *{payer}* (who's fronting):",
    shareFooter: "via patungan. — https://astro-patungan.vercel.app/",
    personShareHeader: "*Split Bill* 🧾 — for {name}",
    personShareSubtotal: "Subtotal: {amount}",
    personSharePajak: "Tax: {amount}",
    personShareService: "Service: {amount}",
    personShareDiskon: "Discount: -{amount}",
    personShareTotal: "💰 *Your total: {amount}*",
    personShareTransferToPayer: "🤝 Transfer to *{payer}* (who's fronting).",

    csvName: "Name",
    csvItems: "Items",
    csvStatus: "Status",
    csvStatusPaid: "PAID",
    csvStatusUnpaid: "Unpaid",
    csvTotalCollected: "Total Collected",

    receiptTransferTo: "Transfer Payment To",
    receiptDigital: "Digital Receipt",
    receiptBreakdown: "Split Breakdown:",
    receiptTotalDue: "Total Due",
    receiptTotalCollected: "Total Collected",
    receiptPerReceipt: "Per receipt + rounding",
    receiptFooterFair: "Calculated fairly and transparently.",
    receiptFooterCopyright: "© dyudhani 2026 | No server, 100% safe.",

    ocrDownloadingEngine: "Downloading OCR engine...",
    ocrLoadingTesseract: "Loading Tesseract OCR...",
    ocrLoadingEngine: "Loading OCR engine...",
    ocrInitializing: "Initializing...",
    ocrDownloadingLangModel: "Downloading language model...",
    ocrPreparing: "Preparing...",
    ocrStraightening: "Straightening & sharpening receipt contrast...",
    ocrReadingPass1: "Reading receipt (1/2)...",
    ocrReadingPass2: "Reading again (2/2)...",
    ocrReadingGeneric: "Reading receipt...",

    warnTotalMismatch:
      "The item breakdown total ({expected}) is far off from the receipt's TOTAL ({found}) — a number was likely misread, check manually.",
    warnSubtotalMismatch:
      "The sum of all items ({calc}) doesn't match the receipt's Subtotal ({found}) — an item was likely misread.",
    warnNoTotalFound:
      'The "Subtotal/Total" line wasn\'t read from the receipt — fill it in manually in the next step.',
  },
} as const;

export type TKey = keyof typeof dict.id;

let lang: Lang = "id";
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "en" || saved === "id") lang = saved;
} catch {
  /* noop */
}

export function getLang(): Lang {
  return lang;
}

export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s: string = dict[lang][key] ?? dict.id[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

const listeners: (() => void)[] = [];
export function onLangChange(fn: () => void) {
  listeners.push(fn);
}

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* noop */
  }
  applyStaticTranslations();
  listeners.forEach((fn) => fn());
}

// Static markup (index.astro) has no built-in re-render, so language switches
// are applied here by id — text content, placeholders, and aria-labels.
const textMap: Record<string, TKey> = {
  "brand-tag": "brandTag",
  "hero-desc": "heroDesc",
  "step1-title": "step1Title",
  "dropzone-text": "dropzoneText",
  "dropzone-hint": "dropzoneHint",
  "btn-skip": "btnSkip",
  "step2-title": "step2Title",
  "step2-subtitle": "step2Subtitle",
  "btn-add-item": "btnAddItem",
  "btn-add-person": "btnAddPerson",
  "subtotal-label": "subtotalLabel",
  "tax-label": "taxLabel",
  "service-label": "serviceLabel",
  "discount-label": "discountLabel",
  "total-bill-label": "totalBillLabel",
  "btn-add-receipt": "addReceiptBtn",
  "btn-to-people": "btnToPeople",
  "step3-title": "step3Title",
  "step3-subtitle": "step3Subtitle",
  "btn-save-group": "btnSaveGroup",
  "btn-load-group": "btnLoadGroup",
  "btn-confirm-save-group": "btnConfirmSaveGroup",
  "btn-calculate": "btnCalculate",
  "btn-download-label": "btnDownloadPdf",
  "footer-text": "footerText",
  "btn-reset": "btnReset",
};
const htmlMap: Record<string, TKey> = {
  "hero-title": "heroTitle",
  "result-heading": "resultHeading",
};
const placeholderMap: Record<string, TKey> = {
  "new-person": "newPersonPlaceholder",
  "group-name-input": "groupNamePlaceholder",
};
const ariaMap: Record<string, TKey> = {
  "preview-remove": "previewRemoveAria",
  "new-person": "newPersonAria",
  "group-name-input": "groupNameAria",
  "t-tax-mode": "taxModeAria",
  "t-tax": "taxLabel",
  "t-service-mode": "serviceModeAria",
  "t-service": "serviceLabel",
  "t-discount-mode": "discountModeAria",
  "t-discount": "discountLabel",
};
const altMap: Record<string, TKey> = {
  "preview-img": "previewImgAlt",
};

export function applyStaticTranslations() {
  for (const [id, key] of Object.entries(textMap)) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  }
  for (const [id, key] of Object.entries(htmlMap)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t(key);
  }
  for (const [id, key] of Object.entries(placeholderMap)) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.placeholder = t(key);
  }
  for (const [id, key] of Object.entries(ariaMap)) {
    const el = document.getElementById(id);
    if (el) el.setAttribute("aria-label", t(key));
  }
  for (const [id, key] of Object.entries(altMap)) {
    const el = document.getElementById(id);
    if (el) el.setAttribute("alt", t(key));
  }
  document.documentElement.lang = lang;
  document.title = lang === "en" ? "Patungan — Split Bill Fast" : "Patungan — Split Bill Cepat";
}
