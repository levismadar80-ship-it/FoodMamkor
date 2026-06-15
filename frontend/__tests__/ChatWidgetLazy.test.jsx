import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ChatWidgetLazy from "@/components/ChatWidgetLazy";

// Stub the heavy widget so this smoke test stays deterministic and offline —
// we assert the lazy wrapper mounts and its `next/dynamic` import resolves,
// not ChatWidget's internals (next-intl / api / browser APIs).
vi.mock("@/components/ChatWidget", () => ({
  default: () => <div data-testid="chat-widget-stub" />,
}));

describe("ChatWidgetLazy", () => {
  it("mounts and resolves the lazy ChatWidget without error", async () => {
    render(<ChatWidgetLazy />);
    expect(await screen.findByTestId("chat-widget-stub")).toBeInTheDocument();
  });
});
