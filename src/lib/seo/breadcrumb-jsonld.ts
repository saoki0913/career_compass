export type BreadcrumbCrumb = {
  /** ブラウザに表示するラベル */
  name: string;
  /** サイト絶対パス（"/tools" など。先頭スラッシュ必須） */
  path: string;
};

/**
 * BreadcrumbList JSON-LD を生成する。
 * `crumbs` はルートから順に並べる（例: ホーム → カテゴリ → 現ページ）。
 * `item` は `https://<siteUrl>/<path>` の完全 URL で出力する。
 */
export function buildBreadcrumbListJsonLd(siteUrl: string, crumbs: readonly BreadcrumbCrumb[]) {
  if (crumbs.length === 0) {
    return null;
  }

  const normalizedSite = siteUrl.replace(/\/+$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => {
      const normalizedPath = crumb.path.startsWith("/") ? crumb.path : `/${crumb.path}`;
      return {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: `${normalizedSite}${normalizedPath}`,
      };
    }),
  };
}
