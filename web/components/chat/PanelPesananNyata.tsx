"use client";

/* ===========================================================
   Daftar pesanan NYATA pembeli di tab "Pesanan" panel kanan Chat.

   Dipakai hanya bila usePesananPembeli() menemukan sesuatu; kalau
   tidak, Chat.tsx jatuh ke pesanan contoh seperti sebelumnya.

   Satu pembeli bisa punya beberapa pesanan, jadi ini DAFTAR, yang
   terbaru di atas. Pesanan 'perlu_dikirim' yang lewat batas kirim
   disorot — itu yang paling sering ditanyakan pembeli lewat chat.
   =========================================================== */

import { useState } from "react";
import { tanggalPanjang } from "@/lib/format";
import { labelStatus, teksJumlah, terlambatKirim, type PesananPembeli } from "@/lib/pesananPembeli";

const WARNA_STATUS: Record<string, string> = {
  menunggu_pembayaran: "bg-[#fef3c7] text-[#92400e]",
  perlu_dikirim: "bg-[#dbeafe] text-[#1e40af]",
  diproses: "bg-[#e0e7ff] text-[#3730a3]",
  dalam_pengiriman: "bg-green-mint text-green-dark",
  menunggu_konfirmasi: "bg-green-mint text-green-dark",
  selesai: "bg-green-mint text-green-dark",
  proses_batal: "bg-[#fee2e2] text-[#991b1b]",
  dibatalkan: "bg-[#f1f5f9] text-[#475569]",
  menunggu_invoice: "bg-[#fef3c7] text-[#92400e]",
  pengembalian: "bg-[#fee2e2] text-[#991b1b]",
  lainnya: "bg-[#f1f5f9] text-[#475569]",
};

export default function PanelPesananNyata({ daftar }: { daftar: PesananPembeli[] }) {
  /* Dibekukan saat komponen dipasang (penginisialisasi lazy hanya
     jalan sekali) — bukan Date.now() di badan render, yang ditolak
     eslint react-hooks/purity. Komponen ini dipasang ulang bersama
     InfoPanel tiap ganti percakapan, jadi nilainya cukup segar. */
  const [sekarang] = useState(() => Date.now());

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[0.72rem] text-muted">
        {daftar.length} pesanan dari marketplace, terbaru di atas.
      </p>

      {daftar.map((p) => {
        const terlambat = terlambatKirim(p, sekarang);
        return (
          <div
            key={p.id}
            className={[
              "rounded-2xl border p-3.5",
              terlambat ? "border-[#fca5a5] bg-[#fff7f7]" : "border-line",
            ].join(" ")}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[0.86rem] font-bold break-all">#{p.external_order_id}</div>
                <div className="mt-0.5 text-[0.72rem] text-muted">
                  {p.order_created_at ? tanggalPanjang(p.order_created_at) : "tanggal tidak diketahui"}
                </div>
              </div>
              <span
                className={[
                  "shrink-0 rounded-md px-1.5 py-0.5 text-[0.66rem] font-extrabold",
                  WARNA_STATUS[p.status] ?? WARNA_STATUS.lainnya,
                ].join(" ")}
                title={p.raw_status ?? undefined}
              >
                {labelStatus(p.status)}
              </span>
            </div>

            {terlambat && (
              <p className="mt-0 mb-2 rounded-lg bg-[#fee2e2] px-2.5 py-1.5 text-[0.76rem] font-semibold text-[#991b1b]">
                Lewat batas kirim {p.ship_by_date ? tanggalPanjang(p.ship_by_date) : ""}
              </p>
            )}

            {/* gap + shrink-0 + text-right: nama kurir sandbox bisa
                sepanjang "Sandbox-J&T Express(Don't modify)" dan tanpa
                ini ia menempel ke labelnya. */}
            <div className="flex justify-between gap-3 py-1 text-[0.82rem]">
              <span className="shrink-0 text-muted">Kurir</span>
              <b className="text-right break-words">{p.shipping_carrier ?? "—"}</b>
            </div>
            <div className="flex justify-between gap-3 py-1 text-[0.82rem]">
              <span className="shrink-0 text-muted">Resi</span>
              {/* tracking_number belum ditarik (endpoint logistics terpisah). */}
              <b className="truncate font-mono">{p.tracking_number ?? "belum tersedia"}</b>
            </div>
            {p.ship_by_date && !terlambat && (
              <div className="flex justify-between gap-3 py-1 text-[0.82rem]">
                <span className="shrink-0 text-muted">Batas kirim</span>
                <b className="text-right">{tanggalPanjang(p.ship_by_date)}</b>
              </div>
            )}

            {p.items.length > 0 && (
              <div className="mt-2 border-t border-line pt-2.5">
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {p.items.map((it, i) => (
                    <li key={`${p.id}-${i}`} className="flex items-start gap-2.5">
                      {it.gambar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.gambar}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-[10px] object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-green-mint">🌱</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.8rem] leading-snug font-semibold">{it.nama}</span>
                        <span className="mt-0.5 block text-[0.7rem] text-muted">
                          {[it.varian, it.sku].filter(Boolean).join(" · ")}
                          {it.varian || it.sku ? " · " : ""}
                          {it.qty} × {teksJumlah(it.harga, p.currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-2.5 flex justify-between border-t border-line pt-2 text-[0.88rem] font-extrabold">
              <span>Total</span>
              <span className="tabular-nums">{teksJumlah(p.total_amount, p.currency)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
