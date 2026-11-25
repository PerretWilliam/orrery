"use client";

import { Component, type ReactNode } from "react";

/**
 * One per widget: a widget that throws while drawing is replaced by `fallback`, and the rest of the page is untouched.
 * The fallback is built on the server and handed in, so this client file pulls in no translation code.
 */
export class WidgetBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
