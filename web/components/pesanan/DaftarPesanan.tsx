"use client";

/* ===========================================================
   Tab "Daftar Pesanan" — pesanan ASLI dari tabel orders.

   Berbeda dengan tiga tab lain di halaman Pesanan (data contoh),
   isi tab ini ditulis sinkronisasi marketplace (cron 15 menit atau
   tombol "Sinkronkan sekarang" di Pengaturan). Hanya membaca: tidak
   ada tombol yang mengubah pesanan, karena sumber kebenarannya
   adalah marketplace.

   Aturan penyaringan ada di lib/daftarPesanan.ts (diuji tanpa
   jaringan); berkas ini hanya menyusun tampilannya.
   =========================================================== */

import { useMemo, useState } from "react";
import { Pill, TableWrap, Td, Th } from "@/components/ui/Bits";
import { stempel } from "@/lib/format";
import { labelStatus, teksJumlah, terlambatKirim } from "@/lib/pesananPembeli";
import {
  BATAS_BARIS,
  SARINGAN_AWAL,
  chipStatus,
  jenisPill,
  namaToko,
  pilihanToko,
  ringkasBarang,
  saringPesanan,
  saringTanpaStatus,
  type Saringan,
} from "@/lib/daftarPesanan";
import { useDaftarPesanan } from "@/lib/db/useDaftarPesanan";

function Kotak({ children, nada = "netral" }: { children: React.ReactNode; nada?: "netral" | "galat" }) {
  return (
    <p
      className={[
        "m-0 rounded-xl border px-3.5 py-2.5 text-[0.86rem] leading-relaxed",
        nada === "galat"
          ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
          : "border-line-soft bg-green-soft text-text-2",
      ].join(" ")}
    >
      {children}
    </p>
  );
}

export default function DaftarPesanan() {
  const { keadaan, daftar, toko, galat, terpotong, dimuatPada, muatUlang } = useDaftarPesanan();
  const [s, setS] = useState<Saringan>(SARINGAN_AWAL);

  const dasar = useMemo(() => saringTanpaStatus(daftar, s), [daftar, s]);
  const chip = useMemo(() => chipStatus(dasar), [dasar]);
  const baris = useMemo(() => saringPesanan(daftar, s), [daftar, s]);
  const opsiToko = useMemo(() => pilihanToko(daftar, toko), [daftar, toko]);
  /* Dihitung sekali per muat, bukan per render — cukup untuk penanda "terlambat". */
  const sekarang = useMemo(() => (dimuatPada ? Date.parse(dimuatPada) : 0), [dimuatPada]);

  if (keadaan === "tanpa_db") {
    return (
      <Kotak>
        Supabase belum dikonfigurasi di deployment ini, jadi pesanan asli tidak bisa dibaca. Tab lain di halaman ini
        memakai data contoh.
      </Kotak>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 max-mobile:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h2 className="m-0 text-[1rem] font-extrabold text-text">Pesanan dari marketplace</h2>
          <p className="m-0 mt-0.5 text-[0.8rem] text-muted">
            Data asli hasil sinkronisasi (otomatis tiap 15 menit, atau tombol &quot;Sinkronkan sekarang&quot; di
            Pengaturan). Hanya dibaca — perubahan pesanan tetap dilakukan di Seller Center.
          </p>
        </div>
        <button
          type="button"
          onClick={muatUlang}
          disabled={keadaan === "memuat"}
          className="min-h-10 cursor-pointer rounded-xl border border-line bg-white px-3.5 text-[0.84rem] font-semibold text-text-2 transition hover:bg-green-soft disabled:cursor-wait disabled:opacity-60"
        >
          {keadaan === "memuat" ? "Memuat…" : "↻ Muat ulang"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Saring toko"
          value={s.toko}
          onChange={(e) => setS({ ...s, toko: e.target.value, status: "semua" })}
          className="min-h-10 max-w-full rounded-[9px] border border-line bg-green-soft px-2.5 text-[0.84rem] font-semibold text-text-2"
        >
          {opsiToko.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex min-h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 max-mini:min-w-0">
          <span aria-hidden className="text-muted">
            🔍
          </span>
          <input
            type="search"
            value={s.cari}
            onChange={(e) => setS({ ...s, cari: e.target.value })}
            placeholder="Cari nomor pesanan, resi, pembeli, atau produk"
            className="w-full min-w-0 border-0 bg-transparent text-[0.86rem] outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chip.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setS({ ...s, status: o.value })}
            aria-pressed={o.value === s.status}
            className={[
              "min-h-9 cursor-pointer rounded-3xl border px-3 py-1.5 text-[0.82rem] font-semibold whitespace-nowrap transition",
              o.value === s.status
                ? "border-green bg-green-mint text-green-dark"
                : "border-line bg-white text-muted hover:bg-green-soft",
            ].join(" ")}
          >
            {o.label}
            <b className="ml-1.5 text-text">{o.count}</b>
          </button>
        ))}
      </div>

      {keadaan === "galat" && <Kotak nada="galat">Pesanan tidak terbaca: {galat}</Kotak>}

      {keadaan === "siap" && daftar.length === 0 && (
        <Kotak>
          Belum ada pesanan tersimpan. Hubungkan toko di <b>Pengaturan → Toko Terhubung</b>, lalu tekan
          &quot;Sinkronkan sekarang&quot;. Sinkronisasi pertama menarik pesanan 1 hari terakhir.
        </Kotak>
      )}

      {keadaan === "siap" && daftar.length > 0 && baris.length === 0 && (
        <Kotak>
          Tidak ada pesanan yang cocok dengan saringan ini di {daftar.length} pesanan terbaru yang dimuat.
          {terpotong ? " Pesanan yang lebih lama tidak ikut dimuat." : ""}
        </Kotak>
      )}

      {baris.length > 0 && (
        <TableWrap minWidth={1180}>
          <thead>
            <tr>
              <Th>No. Pesanan</Th>
              <Th>Toko</Th>
              <Th>Pembeli</Th>
              <Th>Produk</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Kurir · Resi</Th>
              <Th>Dibuat</Th>
              <Th>Batas kirim</Th>
            </tr>
          </thead>
          <tbody>
            {baris.map((p) => {
              const telat = sekarang > 0 && terlambatKirim(p, sekarang);
              return (
                <tr key={p.id} className="hover:bg-green-soft/50">
                  <Td className="font-mono text-[0.8rem] font-semibold whitespace-nowrap">{p.external_order_id}</Td>
                  <Td className="max-w-[180px]">
                    <span className="block truncate" title={namaToko(p.shop_id, toko)}>
                      {namaToko(p.shop_id, toko)}
                    </span>
                    <span className="text-[0.7rem] font-bold uppercase text-muted">{p.platform}</span>
                  </Td>
                  <Td className="max-w-[160px]">
                    <span className="block truncate" title={p.buyer_username ?? ""}>
                      {p.buyer_username ?? "—"}
                    </span>
                  </Td>
                  <Td className="max-w-[260px]">
                    <span className="block truncate" title={(p.items ?? []).map((i) => `${i.nama} ×${i.qty}`).join("\n")}>
                      {ringkasBarang(p.items)}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{teksJumlah(p.total_amount, p.currency)}</Td>
                  <Td>
                    <span title={p.raw_status ?? undefined}>
                      <Pill kind={jenisPill(p.status)}>{labelStatus(p.status)}</Pill>
                    </span>
                  </Td>
                  <Td className="max-w-[200px]">
                    <span className="block truncate">{p.shipping_carrier ?? "—"}</span>
                    {p.tracking_number && (
                      <span className="block truncate font-mono text-[0.74rem] text-muted">{p.tracking_number}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{p.order_created_at ? stempel(p.order_created_at) : "—"}</Td>
                  <Td className={`whitespace-nowrap ${telat ? "font-bold text-[#b91c1c]" : ""}`}>
                    {p.ship_by_date ? stempel(p.ship_by_date) : "—"}
                    {telat && <span className="block text-[0.72rem]">terlambat</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {keadaan === "siap" && daftar.length > 0 && (
        <p className="m-0 text-[0.78rem] text-muted">
          Menampilkan {baris.length} dari {daftar.length} pesanan terbaru
          {terpotong ? ` (dibatasi ${BATAS_BARIS} — pesanan lebih lama tidak dimuat)` : ""}
          {dimuatPada ? ` · dimuat ${stempel(dimuatPada)}` : ""}.
        </p>
      )}
    </section>
  );
}
