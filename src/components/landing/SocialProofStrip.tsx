"use client";

import { motion } from "framer-motion";
import { Users, FileText, Building2, Clock } from "lucide-react";

const stats = [
  {
    icon: Users,
    value: "1,200+",
    label: "人の就活生が利用中",
    color: "text-primary",
  },
  {
    icon: FileText,
    value: "5,000+",
    label: "件のES添削実績",
    color: "text-violet-500",
  },
  {
    icon: Building2,
    value: "800+",
    label: "社の企業情報",
    color: "text-blue-500",
  },
  {
    icon: Clock,
    value: "98%",
    label: "の締切遵守率",
    color: "text-green-500",
  },
];

export function SocialProofStrip() {
  return (
    <section className="py-12 border-y border-border/50 bg-secondary/20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <div
                className={`inline-flex p-2.5 rounded-xl bg-card border border-border/50 mb-3 ${stat.color}`}
              >
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
