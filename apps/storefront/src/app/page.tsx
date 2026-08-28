import { StorefrontV2 } from "../components/storefront-v2";

export default function Home() {
  return (
    <StorefrontV2 storeSlug={process.env.NEXT_PUBLIC_STORE_SLUG ?? "demo"} />
  );
}
