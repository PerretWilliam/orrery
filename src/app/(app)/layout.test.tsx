import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/repos/components/shell-content", () => ({ ShellContent: ({ children }: { children: React.ReactNode }) => <div>shell {children}</div> }));

import AppLayout from "./layout";

describe("signed-in layout", () => {
  it("puts the page inside the shell", () => {
    const { container } = render(<AppLayout params={Promise.resolve({})}>page</AppLayout>);
    expect(container).toHaveTextContent("shell page");
  });
});
