import type { Metadata } from "next";
import { Suspense } from "react";
import UjiPercakapan from "@/components/tiktok/UjiPercakapan";

export const metadata: Metadata = { title: "Uji Chat TikTok" };

/* Sama dengan /shopee: alat diagnosa, sengaja tidak ada di rail, tetap
   di grup (dashboard) supaya terjaga AuthGuard. Suspense dibutuhkan
   karena komponennya membaca ?tiktok= hasil callback. */
export default function Page() {
  return (
    <Suspense>
      <UjiPercakapan />
    </Suspense>
  );
}
