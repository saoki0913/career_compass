"use client";

import { motion } from "framer-motion";
import { Shield, Zap, CreditCard, GraduationCap } from "lucide-react";

const trustBadges = [
  {
    icon: GraduationCap,
    text: "大学3年生の就活準備に特化",
    color: "text-primary",
  },
  {
    icon: Shield,
    text: "Google認証で安全にログイン",
    color: "text-blue-500",
  },
  {
    icon: Zap,
    text: "ES添削・締切管理・企業研究を統合",
    color: "text-accent",
  },
  {
    icon: CreditCard,
    text: "クレジットカード不要で開始",
    color: "text-green-500",
  },
];

export function SocialProofStrip() {
  return (
    <section className="py-10 border-y border-border/50 bg-secondary/20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
        >
          {trustBadges.map((badge, index) => (
            <motion.div
              key={badge.text}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <div
                className={`inline-flex p-2.5 rounded-xl bg-card border border-border/50 mb-3 ${badge.color}`}
              >
                <badge.icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-foreground">
                {badge.text}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
