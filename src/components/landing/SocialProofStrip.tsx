"use client";

import { motion } from "framer-motion";
import { CreditCard, FileText, GraduationCap, Shield } from "lucide-react";

const trustBadges = [
  {
    icon: GraduationCap,
    text: "大学3年生・院1年生の就活準備に対応",
  },
  {
    icon: Shield,
    text: "Googleで30秒登録",
  },
  {
    icon: FileText,
    text: "ES・志望動機・ガクチカ・締切、全部入り",
  },
  {
    icon: CreditCard,
    text: "クレジットカード不要・いつでも解約OK",
  },
] as const;

export function SocialProofStrip() {
  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-border/50">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="grid gap-px md:grid-cols-2 xl:grid-cols-4"
          >
            {trustBadges.map((badge, index) => (
              <motion.div
                key={badge.text}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="flex items-start gap-3 bg-card px-5 py-5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40 text-primary">
                  <badge.icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium leading-6 text-foreground">{badge.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
