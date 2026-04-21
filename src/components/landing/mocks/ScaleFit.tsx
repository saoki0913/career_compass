"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

interface ScaleFitProps {
  /** Design width in px — children are rendered at this width then CSS-scaled to fit the container */
  naturalWidth: number;
  children: ReactNode;
  className?: string;
}

/**
 * Renders children at a fixed `naturalWidth` and CSS-scales them to fit the
 * container's actual width. The outer wrapper's height is computed dynamically
 * so surrounding layout flows correctly.
 */
export function ScaleFit({ naturalWidth, children, className }: ScaleFitProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const containerWidth = outer.clientWidth;
      const scale = containerWidth / naturalWidth;
      inner.style.transform = `scale(${scale})`;
      setHeight(inner.scrollHeight * scale);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(outer);
    // Also watch the inner element for content-driven height changes
    ro.observe(inner);

    return () => ro.disconnect();
  }, [naturalWidth]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        height: height || "auto",
      }}
      aria-hidden="true"
    >
      <div
        ref={innerRef}
        className="bg-card"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: naturalWidth,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
