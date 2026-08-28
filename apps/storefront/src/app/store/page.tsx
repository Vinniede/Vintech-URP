"use client";

import { usePathname } from "next/navigation";
import { StorefrontV2 } from "../../components/storefront-v2";

export default function StorePage() {
  const pathname = usePathname();
  const storeSlug = pathname.split("/").filter(Boolean)[1] ?? "";
  return <StorefrontV2 storeSlug={storeSlug} />;
}