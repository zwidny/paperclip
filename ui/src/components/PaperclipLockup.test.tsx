// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The test environment always resolves the brand to "Paperclip", which cannot
// prove the wordmark follows the configured name. Force a different one so a
// hardcoded "Paperclip" in the component fails here.
vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n")>();
  return { ...actual, useBrandName: () => "Gnzs" };
});

import { PaperclipLockup, PaperclipMark } from "./PaperclipLockup";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PaperclipLockup", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function render(node: React.ReactElement) {
    const root = createRoot(container);
    act(() => {
      root.render(node);
    });
    return container;
  }

  it("renders the configured brand name as text, not baked glyphs", () => {
    const el = render(<PaperclipLockup />);
    expect(el.textContent).toContain("Gnzs");
    expect(el.textContent).not.toContain("Paperclip");
  });

  it("only carries the paperclip mark path", () => {
    const el = render(<PaperclipLockup />);
    expect(el.querySelectorAll("path")).toHaveLength(1);
  });

  it("has no img role when decorative", () => {
    const el = render(<PaperclipLockup decorative />);
    expect(el.querySelector('[role="img"]')).toBeNull();
  });

  it("uses the title as the accessible name", () => {
    const el = render(<PaperclipLockup title="Acme" />);
    expect(el.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Acme");
  });

  it("keeps the mark decorative with a single path and no text", () => {
    const el = render(<PaperclipMark decorative />);
    expect(el.querySelectorAll("path")).toHaveLength(1);
    expect(el.textContent).toBe("");
  });
});
