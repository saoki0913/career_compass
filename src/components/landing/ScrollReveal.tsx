"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";

type ScrollRevealProps = HTMLMotionProps<"div"> & {
  /** Distance in px the element slides up from. Default 32. */
  offset?: number;
  /** Animation duration in seconds. Default 0.7. */
  duration?: number;
  /** Extra delay in seconds. Default 0. */
  delay?: number;
};

export function ScrollReveal({
  offset = 32,
  duration = 0.7,
  delay = 0,
  children,
  style,
  ...rest
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const prefersReducedMotion = useReducedMotion();
  /** Playwright sets webdriver; reading it on first paint causes SSR/client hydration mismatch. */
  const [isAutomationBrowser, setIsAutomationBrowser] = useState(false);
  useEffect(() => {
    setIsAutomationBrowser(typeof navigator !== "undefined" && Boolean(navigator.webdriver));
  }, []);
  const shouldShowImmediately = prefersReducedMotion || isAutomationBrowser;
  const animateState =
    shouldShowImmediately || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: offset };

  return (
    <motion.div
      ref={ref}
      initial={shouldShowImmediately ? false : { opacity: 0, y: offset }}
      animate={animateState}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ willChange: "opacity, transform", ...style }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
