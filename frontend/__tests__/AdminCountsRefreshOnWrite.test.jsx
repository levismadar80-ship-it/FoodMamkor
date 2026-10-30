// MEH-2602: approving a business left the admin sidebar badge at its old count
// until a reload. The shared /admin/dashboard state now refetches after a
// successful admin write.
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const handlers = [];
const get = vi.fn();
vi.mock("@/lib/api", () => ({
  default: {
    get: (...a) => get(...a),
    interceptors: {
      response: {
        use: (fn) => handlers.push(fn) - 1,
        eject: (id) => { handlers[id] = null; },
      },
    },
  },
}));

import {
  AdminDashboardProvider,
  useAdminDashboard,
  isAdminWrite,
} from "@/app/[locale]/admin/dashboard-data";

function Count() {
  const { data } = useAdminDashboard();
  return <span data-testid="n">{data?.pending_producers ?? "-"}</span>;
}

const respond = (method, url) =>
  act(() => {
    handlers.filter(Boolean).forEach((h) => h({ config: { method, url } }));
  });

describe("admin counts follow writes (MEH-2602)", () => {
  it("refetches after a POST to /admin/*, not after a GET or a non-admin write", async () => {
    get.mockResolvedValueOnce({ data: { pending_producers: 3 } });
    render(
      <AdminDashboardProvider refreshKey="/admin/producers">
        <Count />
      </AdminDashboardProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("n")).toHaveTextContent("3"));
    expect(get).toHaveBeenCalledTimes(1);

    await respond("get", "/admin/producers?status=pending");
    await respond("post", "/auth/refresh");
    await new Promise((r) => setTimeout(r, 400));
    expect(get).toHaveBeenCalledTimes(1);

    get.mockResolvedValueOnce({ data: { pending_producers: 2 } });
    await respond("post", "/admin/producers/abc/approve");
    await waitFor(() => expect(screen.getByTestId("n")).toHaveTextContent("2"));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["/admin/producers/1/approve", true],
    ["https://api.example.com/admin/reviews/2", true],
    ["/api/admin/kashrut/3/approve", true],
    ["/producers/me", false],
    ["/administrator", false],
    [undefined, false],
  ])("isAdminWrite(%s) = %s", (url, want) => {
    expect(isAdminWrite(url)).toBe(want);
  });
});
