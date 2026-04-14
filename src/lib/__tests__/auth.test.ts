// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

// auth.ts uses "server-only" which throws in non-server environments — mock it
vi.mock("server-only", () => ({}));

// Mock next/headers cookies
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// Mock next/server — verifySession takes a NextRequest
vi.mock("next/server", () => ({
  NextRequest: class {},
}));

const { createSession, getSession, deleteSession, verifySession } =
  await import("@/lib/auth");

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createSession ────────────────────────────────────────────────────────────

test("createSession sets an httpOnly cookie", async () => {
  await createSession("user-1", "test@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledOnce();
  const [name, _token, options] = mockCookieStore.set.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(options.httpOnly).toBe(true);
  expect(options.path).toBe("/");
  expect(options.sameSite).toBe("lax");
});

test("createSession cookie expires in ~7 days", async () => {
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const [, , options] = mockCookieStore.set.mock.calls[0];
  const expires: Date = options.expires;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("createSession produces a valid JWT containing userId and email", async () => {
  await createSession("user-42", "hello@example.com");

  const [, token] = mockCookieStore.set.mock.calls[0];
  const secret = new TextEncoder().encode("development-secret-key");
  const { payload } = await jwtVerify(token, secret);

  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("hello@example.com");
});

// ─── getSession ───────────────────────────────────────────────────────────────

test("getSession returns null when no cookie is present", async () => {
  mockCookieStore.get.mockReturnValue(undefined);

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for an invalid token", async () => {
  mockCookieStore.get.mockReturnValue({ value: "not.a.valid.jwt" });

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns the session payload for a valid token", async () => {
  // Create a real token via createSession, capture it, then feed it to getSession
  await createSession("user-7", "valid@example.com");
  const [, token] = mockCookieStore.set.mock.calls[0];

  vi.clearAllMocks();
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-7");
  expect(session?.email).toBe("valid@example.com");
});

// ─── deleteSession ────────────────────────────────────────────────────────────

test("deleteSession deletes the auth-token cookie", async () => {
  await deleteSession();

  expect(mockCookieStore.delete).toHaveBeenCalledOnce();
  expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
});

// ─── verifySession ────────────────────────────────────────────────────────────

function makeRequest(token?: string) {
  return {
    cookies: {
      get: (name: string) => (name === "auth-token" && token ? { value: token } : undefined),
    },
  } as any;
}

test("verifySession returns null when no cookie is present", async () => {
  const session = await verifySession(makeRequest());
  expect(session).toBeNull();
});

test("verifySession returns null for an invalid token", async () => {
  const session = await verifySession(makeRequest("bad.token.here"));
  expect(session).toBeNull();
});

test("verifySession returns session payload for a valid token", async () => {
  await createSession("user-99", "verify@example.com");
  const [, token] = mockCookieStore.set.mock.calls[0];

  const session = await verifySession(makeRequest(token));
  expect(session?.userId).toBe("user-99");
  expect(session?.email).toBe("verify@example.com");
});
