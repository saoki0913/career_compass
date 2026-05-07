import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("node:https", () => ({
  request: requestMock,
}));

import { guardedFetch, normalizePublicHttpsUrl, validatePublicUrl } from "@/lib/security/public-url";

function mockHttpsResponse(params: {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}) {
  requestMock.mockImplementationOnce((options, callback) => {
    if (typeof options.lookup === "function") {
      options.lookup(options.hostname, {}, vi.fn());
    }
    const request = new EventEmitter() as EventEmitter & {
      write: (chunk: Buffer | string) => void;
      end: () => void;
      destroy: (error?: Error) => void;
    };
    request.write = vi.fn();
    request.destroy = vi.fn((error?: Error) => {
      if (error) {
        request.emit("error", error);
      }
    });
    request.end = vi.fn(() => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string>;
      };
      response.statusCode = params.status;
      response.statusMessage = params.status >= 300 && params.status < 400 ? "Found" : "OK";
      response.headers = params.headers ?? {};
      callback(response);
      response.end(params.body ?? "");
    });
    return request;
  });
}

describe("public-url", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    requestMock.mockReset();
  });

  it("rejects explicit private network addresses", async () => {
    const result = await validatePublicUrl("https://10.0.0.8/recruit");

    expect(result.allowed).toBe(false);
    expect(result.code).toBe("LOCAL_ADDRESS");
  });

  it("rejects explicit credentials and non-standard ports", async () => {
    const withCredentials = await validatePublicUrl("https://user:pass@example.com/recruit");
    const withPort = await validatePublicUrl("https://example.com:8443/recruit");

    expect(withCredentials.allowed).toBe(false);
    expect(withCredentials.code).toBe("URL_HAS_CREDENTIALS");
    expect(withPort.allowed).toBe(false);
    expect(withPort.code).toBe("INVALID_PORT");
  });

  it("normalizes safe public HTTPS URLs and rejects protocol-relative URLs", async () => {
    const safe = await normalizePublicHttpsUrl(" https://93.184.216.34/recruit?b=1#section ");
    const protocolRelative = await normalizePublicHttpsUrl("//example.com/recruit");

    expect(safe).toEqual({
      ok: true,
      value: "https://93.184.216.34/recruit?b=1",
    });
    expect(protocolRelative.ok).toBe(false);
    expect(protocolRelative.code).toBe("INVALID_URL");
  });

  it("revalidates redirect destinations", async () => {
    mockHttpsResponse({
      status: 302,
      headers: { location: "https://169.254.169.254/latest" },
    });

    await expect(guardedFetch("https://93.184.216.34/recruit")).rejects.toThrow(
      "内部アドレスにはアクセスできません。",
    );
  });

  it("pins guarded fetch to the validated resolved IP", async () => {
    const lookupCallbacks: Array<ReturnType<typeof vi.fn>> = [];
    requestMock.mockImplementationOnce((options, callback) => {
      const lookupCallback = vi.fn();
      lookupCallbacks.push(lookupCallback);
      options.lookup(options.hostname, {}, lookupCallback);
      const request = new EventEmitter() as EventEmitter & {
        write: (chunk: Buffer | string) => void;
        end: () => void;
        destroy: (error?: Error) => void;
      };
      request.write = vi.fn();
      request.destroy = vi.fn();
      request.end = vi.fn(() => {
        const response = new PassThrough() as PassThrough & {
          statusCode: number;
          statusMessage: string;
          headers: Record<string, string>;
        };
        response.statusCode = 200;
        response.statusMessage = "OK";
        response.headers = { "content-type": "text/plain" };
        callback(response);
        response.end("ok");
      });
      return request;
    });

    const response = await guardedFetch("https://93.184.216.34/recruit");

    expect(await response.text()).toBe("ok");
    expect(lookupCallbacks[0]).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(requestMock.mock.calls[0][0]).toMatchObject({
      hostname: "93.184.216.34",
      servername: "93.184.216.34",
    });
  });
});
