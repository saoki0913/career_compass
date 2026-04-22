"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type LandingSectionMotionProps = {
  children: ReactNode;
  className?: string;
  /** ファーストビューなど、フェードをかけないとき */
  instant?: boolean;
};

export function LandingSectionMotion({
  children,
  className,
  instant,
}: LandingSectionMotionProps) {
  if (instant) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-48px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
