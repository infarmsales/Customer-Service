/* ===========================================================
   Infarm CS — Katalog Produk bersama (products.json)
   Dipakai oleh: dashboard.js (tab Rincian Produk),
                 broadcast.js (Segmentasi Pelanggan berdasarkan produk)
   Sample bawaan dipakai bila products.json tidak bisa dimuat
   (mis. dibuka via file://). Saat dijalankan lewat backend
   (localhost:3000), katalog penuh 373 SKU akan dimuat.
   =========================================================== */

const PRODUCT_FALLBACK = [
  { sku: 'POC-BUAH-250', nama_produk: 'INFARM - POC Buah 250 ml Pupuk Organik Cair untuk Fase Berbunga & Berbuah', kategori: 'Nutrisi Tanaman', product_ids_shopee: ['—'] },
  { sku: 'NT-FURADAN-1KG', nama_produk: 'INFARM - Furadan 3GR Ukuran 1 Kg Insektisida & Nematisida', kategori: 'Pestisida', product_ids_shopee: ['—'] },
  { sku: 'NT-MAGNESIUM-1KG', nama_produk: 'INFARM - Pupuk Magnesium Sulfat 1 Kg (MgSO4) Garam Inggris', kategori: 'Nutrisi Tanaman', product_ids_shopee: ['—'] },
  { sku: 'BCA-CMK-MICHA', nama_produk: 'INFARM - Benih Cabai Keriting Micha Hibrida Bibit Cabe Pedas', kategori: 'Benih', product_ids_shopee: ['42423482548'] },
  { sku: 'BCA-CMB-BONCHA', nama_produk: 'INFARM - Benih Cabai Merah Besar Boncha Bibit Cabe Premium', kategori: 'Benih', product_ids_shopee: ['42209555488'] },
  { sku: 'BCA-TMT-BIGMATO', nama_produk: 'INFARM - Benih Tomat Big Mato Hibrida Bibit Tomat Besar', kategori: 'Benih', product_ids_shopee: ['43430183907'] },
  { sku: 'BCA-MLN-SUNMELO', nama_produk: 'INFARM - Benih Buah Melon Sunmelo Hibrida Bibit Melon Premium', kategori: 'Benih', product_ids_shopee: ['41380201898'] },
  { sku: 'PKT-HIDRO-12LT', nama_produk: 'INFARM - Paket Hidroponik Lengkap 12 Lubang Free Benih AB Mix Rockwool', kategori: 'Hidroponik', product_ids_shopee: ['23126882937'] },
  { sku: '30BAG-POLYH-3535', nama_produk: 'INFARM - Polybag Premium Ukuran 35x35 isi 30 Pcs Tebal Tidak Mudah Sobek', kategori: 'Pot & Polybag', product_ids_shopee: ['20312574687'] },
  { sku: 'BAG-PLANTER', nama_produk: 'INFARM - Planter Bag 25 35 50 75 Liter Pot Tanaman Kain Tebal Premium', kategori: 'Pot & Polybag', product_ids_shopee: ['25188238958'] },
];

let PRODUCTS = [];
let productsLoaded = false;

async function loadProducts() {
  try {
    const r = await fetch('products.json');
    if (!r.ok) throw new Error('not ok');
    const data = await r.json();
    const flat = [];
    const cats = data.produk_per_kategori || {};
    for (const [kategori, items] of Object.entries(cats)) {
      items.forEach((p) => flat.push({ ...p, kategori }));
    }
    PRODUCTS = flat;
    productsLoaded = true;
  } catch (_) {
    PRODUCTS = PRODUCT_FALLBACK; // fallback offline
    productsLoaded = false;
  }
}

function searchProducts(query, limit = 20) {
  const q = (query || '').trim().toLowerCase();
  return PRODUCTS.filter((p) =>
    !q || p.nama_produk.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  ).slice(0, limit);
}

function catalogStatusText() {
  return productsLoaded
    ? `${PRODUCTS.length} SKU termuat dari products.json`
    : `Mode contoh (${PRODUCTS.length} SKU). Katalog penuh termuat saat dibuka via backend (localhost:3000).`;
}
