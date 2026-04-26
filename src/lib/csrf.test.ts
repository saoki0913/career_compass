import { getCsrfFailureReason } from "@/lib/csrf";

type CsrfRequestLike = Parameters<typeof getCsrfFailureReason>[0];

function createRequest(cookieToken?: string, headerToken?: string) {
  return {
    cookies: {
      get(name: string) {
        if (name !== "csrf_token" || !cookieToken) {
          return undefined;
        }
        return { value: cookieToken };
      },
    },
    headers: new Headers(headerToken ? { "x-csrf-token": headerToken } : {}),
  } as CsrfRequestLike;
}

describe("getCsrfFailureReason", () => {
  it("returns null when cookie and header match", () => {
    expect(getCsrfFailureReason(createRequest("abc123", "abc123"))).toBeNull();
  });

  it("returns missing when either token is absent", () => {
    expect(getCsrfFailureReason(createRequest(undefined, "abc123"))).toBe("missing");
    expect(getCsrfFailureReason(createRequest("abc123", undefined))).toBe("missing");
  });

  it("returns invalid when tokens do not match", () => {
    expect(getCsrfFailureReason(createRequest("abc123", "xyz789"))).toBe("invalid");
  });
});
