import "server-only";

/* ===========================================================
   Tarik pesanan dari Shopee — hanya MEMBACA.

   Dua langkah, karena Shopee memang memisahkannya:

     1. get_order_list    nomor pesanan yang BERUBAH dalam rentang
                          waktu (time_range_field=update_time), per 14
                          hari, per 100 nomor, mengikuti cursor
     2. get_order_detail  isi tiap pesanan, 50 nomor per panggilan,
                          hanya field yang disebut FIELD_OPSIONAL_DETAIL

   update_time, bukan create_time: sinkronisasi harus menangkap
   pesanan lama yang statusnya berubah (dikirim, selesai, batal),
   bukan hanya pesanan baru.
   =========================================================== */

import { permintaanShopee } from "./klien.ts";
import {
  FIELD_OPSIONAL_DETAIL,
  MAKS_DETAIL_PER_PANGGILAN,
  PAGE_SIZE_DAFTAR,
  bagi,
  pecahRentang,
} from "./sinkronAturan.ts";
import type { DaftarDetailPesanan, DaftarPesanan, DetailPesananShopee } from "./tipe.ts";

/**
 * Semua order_sn yang berubah di [dari, sampai] (epoch detik).
 * Memecah rentang dan mengikuti cursor sendiri. Hasilnya unik.
 *
 * @param batas bila diisi, berhenti begitu jumlahnya MELEBIHI batas —
 *   pemanggil cukup tahu "terlalu banyak, belah potongannya", tidak
 *   perlu menunggu seluruh halaman ditarik. Hasilnya lalu tidak lengkap
 *   dan tidak boleh dipakai untuk menarik detail.
 */
export async function daftarSnBerubah(
  accessToken: string,
  shopId: string,
  dari: number,
  sampai: number,
  batas: number = Number.POSITIVE_INFINITY,
): Promise<string[]> {
  const kumpulan = new Set<string>();

  for (const r of pecahRentang(dari, sampai)) {
    if (kumpulan.size > batas) break;
    let cursor = "";
    /* Pagar terhadap cursor yang berputar: Shopee tidak pernah
       mengembalikan lebih dari ini untuk 14 hari satu toko, dan kalau
       ya, lebih baik berhenti daripada menggantung fungsi serverless. */
    for (let halaman = 0; halaman < 200; halaman++) {
      const { data } = await permintaanShopee<DaftarPesanan>({
        path: "/api/v2/order/get_order_list",
        shopId,
        accessToken,
        query: {
          time_range_field: "update_time",
          time_from: r.dari,
          time_to: r.sampai,
          page_size: PAGE_SIZE_DAFTAR,
          cursor,
          response_optional_fields: "order_status",
        },
      });
      for (const o of data.order_list ?? []) if (o.order_sn) kumpulan.add(o.order_sn);
      if (kumpulan.size > batas) break;
      if (!data.more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  }

  return [...kumpulan];
}

/** Detail untuk daftar order_sn, dipecah 50 per panggilan. */
export async function detailPesanan(
  accessToken: string,
  shopId: string,
  daftarSn: readonly string[],
): Promise<DetailPesananShopee[]> {
  const hasil: DetailPesananShopee[] = [];
  for (const potongan of bagi(daftarSn, MAKS_DETAIL_PER_PANGGILAN)) {
    const { data } = await permintaanShopee<DaftarDetailPesanan>({
      path: "/api/v2/order/get_order_detail",
      shopId,
      accessToken,
      query: {
        order_sn_list: potongan.join(","),
        response_optional_fields: FIELD_OPSIONAL_DETAIL.join(","),
      },
    });
    hasil.push(...(data.order_list ?? []));
  }
  return hasil;
}
