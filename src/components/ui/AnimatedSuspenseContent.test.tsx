// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { AnimatedSuspenseContent } from "./AnimatedSuspenseContent";

describe("AnimatedSuspenseContent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children", () => {
    const { getByText } = render(
      <AnimatedSuspenseContent>hello</AnimatedSuspenseContent>,
    );
    expect(getByText("hello")).toBeDefined();
  });

  it("applies translate-y and opacity classes before settling", () => {
    const { container } = render(
      <AnimatedSuspenseContent>content</AnimatedSuspenseContent>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("transition-all");
    expect(wrapper.className).toContain("opacity-");
  });

  it("removes transform and transition classes after settling", () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

    const { container } = render(
      <AnimatedSuspenseContent>content</AnimatedSuspenseContent>,
    );
    const wrapper = container.firstElementChild as HTMLElement;

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(wrapper.className).not.toContain("translate-y-");
    expect(wrapper.className).not.toContain("transition-all");
    expect(wrapper.className).not.toContain("opacity-");

    raf.mockRestore();
  });

  it("passes through className prop after settling", () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

    const { container } = render(
      <AnimatedSuspenseContent className="custom-class">
        content
      </AnimatedSuspenseContent>,
    );
    const wrapper = container.firstElementChild as HTMLElement;

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(wrapper.className).toContain("custom-class");
    expect(wrapper.className).not.toContain("translate-y-");

    raf.mockRestore();
  });
});
