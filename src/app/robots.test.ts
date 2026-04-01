import robots from "@/app/robots";

describe("robots", () => {
  it("allows public SEO pages and disallows app pages", () => {
    const config = robots();
    const primaryRule = Array.isArray(config.rules) ? config.rules[0] : config.rules;

    expect(primaryRule?.allow).toEqual(
      expect.arrayContaining([
        "/es-tensaku-ai",
        "/shukatsu-ai",
        "/entry-sheet-ai",
        "/es-ai-guide",
        "/shukatsu-kanri",
        "/data-source-policy",
      ])
    );
    expect(primaryRule?.disallow).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/companies",
        "/api/",
      ])
    );
  });
});
