/**
 * LoginPage 组件级测试 — 真实渲染 + 真实内联校验逻辑
 *
 * 被测真实模块:
 *   - ../pages/LoginPage (默认导出) — 真实 render, 触发其内联的
 *     邮箱正则 / 密码正则 / open-redirect 防护逻辑。改源码正则或防护判断,
 *     对应用例立即变红 (变异敏感)。
 *
 * Mock 边界 (仅外部副作用, 不含任何被测逻辑):
 *   - @/lib/trpc              → useMutation 桩 (网络层)
 *   - @/_core/hooks/useAuth   → storeAuth (本地存储副作用)
 *
 * 注: 本文件此前版本本地复制 pwRegex/emailRegex/isSafeRedirect/isBalanced
 * 字面量自测, 与真实源码零关联, 已全部移除。
 * 「记账平衡」真实逻辑在服务端 server/db/accounting.ts, 由
 * server/routers/tasks.test.ts 覆盖, 客户端无对应真实实现可测。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import LoginPage from "../pages/LoginPage";
import { storeAuth } from "@/_core/hooks/useAuth";

// ── mock 边界: 仅 trpc 网络层与 storeAuth 副作用 ──
const { loginMutate, registerMutate } = vi.hoisted(() => ({
  loginMutate: vi.fn(),
  registerMutate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      login: {
        useMutation: () => ({ mutateAsync: loginMutate, isPending: false }),
      },
      register: {
        useMutation: () => ({ mutateAsync: registerMutate, isPending: false }),
      },
    },
  },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ storeAuth: vi.fn() }));

/** 把 window.location 替换为可观测 href 赋值的 fake (search 委托真实 location) */
function spyLocation() {
  let href = "";
  const real = window.location;
  const fake = Object.create(Object.getPrototypeOf(real));
  Object.defineProperty(fake, "href", {
    configurable: true,
    get: () => href,
    set: (v: string) => {
      href = v;
    },
  });
  // 组件会读 window.location.search 解析 redirect 参数, 必须透传真实值,
  // 否则恶意 redirect 用例会"空转通过"(根本没读到参数)
  Object.defineProperty(fake, "search", {
    configurable: true,
    get: () => real.search,
  });
  const spy = vi
    .spyOn(window, "location", "get")
    .mockReturnValue(fake as Location);
  return { getHref: () => href, restore: () => spy.mockRestore() };
}

function fillLogin(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("邮箱"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText("密码"), {
    target: { value: password },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/login");
});
afterEach(() => cleanup());

describe("LoginPage · 登录模式真实校验", () => {
  it("非法邮箱被真实内联邮箱正则拦截, 不发起 mutation", () => {
    render(<LoginPage />);
    fillLogin("not-an-email", "whatever");
    fireEvent.submit(document.querySelector("form")!);
    expect(screen.getByText("请输入有效邮箱")).toBeTruthy();
    expect(loginMutate).not.toHaveBeenCalled();
  });

  it("空密码被拦截", () => {
    render(<LoginPage />);
    fillLogin("user@example.com", "");
    fireEvent.submit(document.querySelector("form")!);
    expect(screen.getByText("请输入密码")).toBeTruthy();
    expect(loginMutate).not.toHaveBeenCalled();
  });

  it("合法输入 → 真实调用 login mutation + storeAuth 写会话", async () => {
    loginMutate.mockResolvedValue({
      token: "tok-1",
      user: { id: 7, name: "u" },
    });
    render(<LoginPage />);
    fillLogin("user@example.com", "Abcd1234!@kkk");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() =>
      expect(loginMutate).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "Abcd1234!@kkk",
      })
    );
    await waitFor(() =>
      expect(storeAuth).toHaveBeenCalledWith("tok-1", { id: 7, name: "u" })
    );
  });
});

describe("LoginPage · open redirect 真实防护", () => {
  it("redirect=https://evil.com → 强制回落到 /", async () => {
    window.history.pushState({}, "", "/login?redirect=https://evil.com");
    const loc = spyLocation();
    loginMutate.mockResolvedValue({ token: "t", user: {} });
    render(<LoginPage />);
    fillLogin("user@example.com", "pw");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(loc.getHref()).toBe("/"));
    loc.restore();
  });

  it("redirect=//evil.com (协议相对) → 强制回落到 /", async () => {
    window.history.pushState({}, "", "/login?redirect=//evil.com/path");
    const loc = spyLocation();
    loginMutate.mockResolvedValue({ token: "t", user: {} });
    render(<LoginPage />);
    fillLogin("user@example.com", "pw");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(loc.getHref()).toBe("/"));
    loc.restore();
  });

  it("redirect=/dashboard (同源路径) → 放行", async () => {
    window.history.pushState({}, "", "/login?redirect=/dashboard");
    const loc = spyLocation();
    loginMutate.mockResolvedValue({ token: "t", user: {} });
    render(<LoginPage />);
    fillLogin("user@example.com", "pw");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(loc.getHref()).toBe("/dashboard"));
    loc.restore();
  });
});

describe("LoginPage · 注册模式真实校验", () => {
  function switchToRegister() {
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
  }

  it("用户名单字符 → 拦截", () => {
    render(<LoginPage />);
    switchToRegister();
    fireEvent.change(screen.getByPlaceholderText("用户名（至少 2 字）"), {
      target: { value: "A" },
    });
    fireEvent.change(screen.getByPlaceholderText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/密码（至少 12 位/), {
      target: { value: "Abcd1234!@kkk" },
    });
    fireEvent.submit(document.querySelector("form")!);
    expect(screen.getByText("用户名至少 2 个字符")).toBeTruthy();
    expect(registerMutate).not.toHaveBeenCalled();
  });

  it("弱密码 (无大写) 被真实内联密码正则拦截", () => {
    render(<LoginPage />);
    switchToRegister();
    fireEvent.change(screen.getByPlaceholderText("用户名（至少 2 字）"), {
      target: { value: "ft-user" },
    });
    fireEvent.change(screen.getByPlaceholderText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/密码（至少 12 位/), {
      target: { value: "abcdefgh1234" },
    });
    fireEvent.submit(document.querySelector("form")!);
    expect(
      screen.getByText("密码至少 12 位，需包含大写字母、小写字母、数字")
    ).toBeTruthy();
    expect(registerMutate).not.toHaveBeenCalled();
  });

  it("短密码 (<12 位) 被拦截", () => {
    render(<LoginPage />);
    switchToRegister();
    fireEvent.change(screen.getByPlaceholderText("用户名（至少 2 字）"), {
      target: { value: "ft-user" },
    });
    fireEvent.change(screen.getByPlaceholderText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/密码（至少 12 位/), {
      target: { value: "Ab1" },
    });
    fireEvent.submit(document.querySelector("form")!);
    expect(
      screen.getByText("密码至少 12 位，需包含大写字母、小写字母、数字")
    ).toBeTruthy();
    expect(registerMutate).not.toHaveBeenCalled();
  });

  it("全合法输入 → 真实调用 register mutation + 成功提示", async () => {
    registerMutate.mockResolvedValue({ userId: 1 });
    render(<LoginPage />);
    switchToRegister();
    fireEvent.change(screen.getByPlaceholderText("用户名（至少 2 字）"), {
      target: { value: "ft-user" },
    });
    fireEvent.change(screen.getByPlaceholderText("邮箱"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/密码（至少 12 位/), {
      target: { value: "Abcd1234!@kkk" },
    });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() =>
      expect(registerMutate).toHaveBeenCalledWith({
        name: "ft-user",
        email: "user@example.com",
        password: "Abcd1234!@kkk",
      })
    );
    await waitFor(() => expect(screen.getByText(/注册成功/)).toBeTruthy());
  });
});
