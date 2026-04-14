import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuth } from "@/hooks/use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignInAction = vi.mocked(signInAction);
const mockSignUpAction = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-id" } as any);
});

describe("useAuth", () => {
  describe("initial state", () => {
    it("returns isLoading as false initially", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("exposes signIn and signUp functions", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  describe("signIn", () => {
    describe("happy path — anon work exists", () => {
      it("creates a project from anon work and redirects to it", async () => {
        const anonMessages = [{ role: "user", content: "hello" }];
        const anonFsData = { "/": {}, "/App.tsx": {} };
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({ messages: anonMessages, fileSystemData: anonFsData });
        mockCreateProject.mockResolvedValue({ id: "anon-project-id" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonMessages,
            data: anonFsData,
          })
        );
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
      });

      it("does not call getProjects when anon work exists", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ role: "user", content: "hello" }],
          fileSystemData: {},
        });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockGetProjects).not.toHaveBeenCalled();
      });
    });

    describe("happy path — no anon work, existing projects", () => {
      it("redirects to the most recent project", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([
          { id: "proj-1" } as any,
          { id: "proj-2" } as any,
        ]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockPush).toHaveBeenCalledWith("/proj-1");
        expect(mockCreateProject).not.toHaveBeenCalled();
      });
    });

    describe("happy path — no anon work, no existing projects", () => {
      it("creates a new project and redirects to it", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "fresh-project-id" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: [],
            data: {},
          })
        );
        expect(mockPush).toHaveBeenCalledWith("/fresh-project-id");
      });
    });

    describe("error state", () => {
      it("returns the failure result without navigating", async () => {
        mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

        const { result } = renderHook(() => useAuth());
        let returnValue: any;
        await act(async () => {
          returnValue = await result.current.signIn("user@example.com", "wrongpassword");
        });

        expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
      });

      it("returns the result even when the action throws", async () => {
        mockSignInAction.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());
        await expect(
          act(async () => {
            await result.current.signIn("user@example.com", "password123");
          })
        ).rejects.toThrow("Network error");
      });
    });

    describe("isLoading state", () => {
      it("sets isLoading to true while signing in, then false after", async () => {
        let resolveSignIn!: (value: any) => void;
        const promise = new Promise((res) => { resolveSignIn = res; });
        mockSignInAction.mockReturnValue(promise as any);

        const { result } = renderHook(() => useAuth());

        act(() => {
          result.current.signIn("user@example.com", "password123");
        });

        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          resolveSignIn({ success: false, error: "Invalid credentials" });
          await promise;
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false even when signIn fails", async () => {
        mockSignInAction.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signIn("user@example.com", "password123");
          } catch {
            // expected
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("does not treat anon work with 0 messages as valid work", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
        mockGetProjects.mockResolvedValue([{ id: "existing-project" } as any]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockPush).toHaveBeenCalledWith("/existing-project");
        expect(mockClearAnonWork).not.toHaveBeenCalled();
      });
    });
  });

  describe("signUp", () => {
    describe("happy path — anon work exists", () => {
      it("creates a project from anon work and redirects to it", async () => {
        const anonMessages = [{ role: "user", content: "hello" }];
        const anonFsData = { "/": {} };
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({ messages: anonMessages, fileSystemData: anonFsData });
        mockCreateProject.mockResolvedValue({ id: "anon-signup-project" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: anonMessages, data: anonFsData })
        );
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-signup-project");
      });
    });

    describe("happy path — no anon work, no existing projects", () => {
      it("creates a new project after sign-up and redirects", async () => {
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "new-signup-project" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "password123");
        });

        expect(mockPush).toHaveBeenCalledWith("/new-signup-project");
      });
    });

    describe("error state", () => {
      it("returns the failure result without navigating", async () => {
        mockSignUpAction.mockResolvedValue({ success: false, error: "Email already registered" });

        const { result } = renderHook(() => useAuth());
        let returnValue: any;
        await act(async () => {
          returnValue = await result.current.signUp("existing@example.com", "password123");
        });

        expect(returnValue).toEqual({ success: false, error: "Email already registered" });
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    describe("isLoading state", () => {
      it("sets isLoading to true while signing up, then false after", async () => {
        let resolveSignUp!: (value: any) => void;
        const promise = new Promise((res) => { resolveSignUp = res; });
        mockSignUpAction.mockReturnValue(promise as any);

        const { result } = renderHook(() => useAuth());

        act(() => {
          result.current.signUp("new@example.com", "password123");
        });

        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          resolveSignUp({ success: false, error: "Email already registered" });
          await promise;
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false even when signUp throws", async () => {
        mockSignUpAction.mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signUp("new@example.com", "password123");
          } catch {
            // expected
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
