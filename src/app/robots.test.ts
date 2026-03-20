import robots from "@/app/robots";

describe("robots", () => {
  it("allows public SEO pages and disallows app pages", () => {
    const config = robots();
    const primaryRule = Array.isArray(config.rules) ? config.rules[0] : config.rules;

    expect(primaryRule?.allow).toEqual(
      expect.arrayContaining([
        "/es-tensaku-ai",
        "/shukatsu-ai",
        "/shukatsu-kanri",
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
