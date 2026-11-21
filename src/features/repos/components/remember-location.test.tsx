import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RememberLocation } from "./remember-location";

describe("RememberLocation", () => {
  it("stores the place as a path in a cookie and renders nothing", () => {
    const { container } = render(<RememberLocation place={{ owner: "acme", name: "web", page: "ops" }} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.cookie).toContain("orrery_last=%2Fp%2Facme%2Fweb%2Fops");
  });
  it("adds the Secure attribute over HTTPS", () => {
    const writes: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", { configurable: true, set: (v: string) => void writes.push(v), get: () => "" });
    const location = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, protocol: "https:" } });
    render(<RememberLocation place={{ owner: "acme", name: "web", page: null }} />);
    expect(writes[0]).toContain("; secure");
    Reflect.deleteProperty(document, "cookie");
    if (original) Object.defineProperty(Document.prototype, "cookie", original);
    Object.defineProperty(window, "location", { configurable: true, value: location });
  });
});
