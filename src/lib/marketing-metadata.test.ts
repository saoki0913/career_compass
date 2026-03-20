import { createMarketingMetadata } from "@/lib/marketing-metadata";

describe("createMarketingMetadata", () => {
  it("builds canonical, open graph, and twitter metadata consistently", () => {
    const metadata = createMarketingMetadata({
      title: "ES文字数カウント | 就活Pass",
      description: "ESの文字数を数える無料ツールです。",
      path: "/tools/es-counter",
      keywords: ["ES 文字数 カウント"],
    });

    expect(metadata.alternates?.canonical).toBe("/tools/es-counter");
    expect(metadata.openGraph?.url).toBe("/tools/es-counter");
    expect(metadata.openGraph?.title).toBe("ES文字数カウント | 就活Pass");
    expect(metadata.twitter?.title).toBe("ES文字数カウント | 就活Pass");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.keywords).toEqual(["ES 文字数 カウント"]);
  });
});
