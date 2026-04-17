import { getAppUrl } from "@/lib/app-url";
import { buildBreadcrumbListJsonLd, type BreadcrumbCrumb } from "@/lib/seo/breadcrumb-jsonld";
import { serializeJsonLd } from "@/lib/seo/json-ld";

type BreadcrumbJsonLdProps = {
  /** ルート → 現ページの順でパンくずを並べる */
  crumbs: readonly BreadcrumbCrumb[];
};

/**
 * 2 階層以上のページに BreadcrumbList 構造化データを埋め込む。
 * LP トップ (`/`) や 1 階層の機能 LP では付けない方針。
 */
export function BreadcrumbJsonLd({ crumbs }: BreadcrumbJsonLdProps) {
  if (crumbs.length === 0) {
    return null;
  }

  const siteUrl = getAppUrl();
  const graph = buildBreadcrumbListJsonLd(siteUrl, crumbs);
  if (!graph) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(graph),
      }}
    />
  );
}
