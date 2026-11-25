"use client";

import { Component, type ReactNode } from "react";
import { WidgetCrashed } from "./widget-states";

/** One per widget: a widget that throws while drawing is replaced by a card, and the rest of the page is untouched. */
export class WidgetBoundary extends Component<{ title?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <WidgetCrashed title={this.props.title} /> : this.props.children;
  }
}
