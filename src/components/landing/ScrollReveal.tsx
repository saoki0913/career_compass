"use client";

import { useRef } from "react";
import { motion, useInView, type HTMLMotionProps } from "framer-motion";

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

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: offset }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: offset }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ willChange: "opacity, transform", ...style }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
