"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps one failing Overview section from replacing the whole route: the
 * section shows an inline error and every other section keeps rendering.
 */
export default class SectionBoundary extends Component<
  { label: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[overview] ${this.props.label} failed to render:`, error);
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="card card-empty card-error section-error" role="alert">
          Couldn&apos;t load {this.props.label}. Reload to retry.
        </p>
      );
    }
    return this.props.children;
  }
}
