import { useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryProvider } from "./query-provider";

function Probe() {
  return <span>{useQueryClient() ? "has-client" : "no-client"}</span>;
}

describe("QueryProvider", () => {
  it("provides a query client to children", () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );
    expect(screen.getByText("has-client")).toBeInTheDocument();
  });
});
