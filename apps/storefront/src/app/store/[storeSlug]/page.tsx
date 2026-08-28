import { StorefrontV2 } from "../../../components/storefront-v2";

export default async function StorePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <StorefrontV2 storeSlug={storeSlug} />;
}
