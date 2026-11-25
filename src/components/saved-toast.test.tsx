import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const success = vi.hoisted(() => vi.fn());
vi.mock("@yusufceng1z/ding-react", () => ({ toast: { success } }));

import { SavedToast } from "./saved-toast";

const show = () =>
  render(
    <StrictMode>
      <SavedToast message="Saved." />
    </StrictMode>,
  );

describe("SavedToast", () => {
  beforeEach(() => success.mockClear());

  it("says it once and takes saved out of the address, keeping the rest", () => {
    window.history.replaceState(null, "", "/admin?saved=1&error=x");
    show().unmount();
    show();
    expect(success).toHaveBeenCalledExactlyOnceWith("Saved.");
    expect(window.location.pathname + window.location.search).toBe("/admin?error=x");
  });

  it("stays quiet when the address says nothing was saved", () => {
    window.history.replaceState(null, "", "/admin");
    show();
    expect(success).not.toHaveBeenCalled();
  });
});
