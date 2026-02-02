"use client";

import { Quote, TrendingUp, Clock, CheckCircle } from "lucide-react";

// PLACEHOLDER DATA - Replace with real testimonials later
const testimonials = [
  {
    quote: "ESの通過率が明らかに上がりました。AIの添削が的確で、自分では気づけなかった改善点がわかります。",
    name: "M.S",
    university: "早稲田大学",
    year: "25卒",
    avatar: "MS",
  },
  {
    quote: "締切管理が本当に助かっています。複数企業を受けていても、もう締切を忘れることがありません。",
    name: "K.T",
    university: "慶應義塾大学",
    year: "25卒",
    avatar: "KT",
  },
  {
    quote: "ガクチカの深掘りで、自分の強みを言語化できるようになりました。面接でも自信を持って話せます。",
    name: "A.Y",
    university: "東京大学",
    year: "26卒",
    avatar: "AY",
  },
];

// PLACEHOLDER DATA - Replace with real metrics later
const metrics = [
  {
    icon: TrendingUp,
    value: "+40%",
    label: "ES通過率向上",
    color: "text-success",
  },
  {
    icon: Clock,
    value: "-60%",
    label: "作成時間削減",
    color: "text-primary",
  },
  {
    icon: CheckCircle,
    value: "98%",
    label: "ユーザー満足度",
    color: "text-accent",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            先輩たちの
            <span className="text-gradient">声</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            実際にウカルンを使った就活生の感想です。
          </p>
        </div>

        {/* Testimonial cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto mb-16">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className="opacity-0 animate-fade-up"
              style={{ animationDelay: `${(index + 1) * 150}ms` }}
            >
              <div className="relative h-full p-6 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                {/* Quote icon */}
                <Quote className="h-8 w-8 text-primary/20 mb-4" />

                {/* Quote text */}
                <p className="text-foreground leading-relaxed mb-6">
                  "{testimonial.quote}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {testimonial.avatar}
                  </div>

                  <div>
                    <div className="font-medium text-sm">
                      {testimonial.name}さん
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {testimonial.university} / {testimonial.year}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Metrics */}
        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className="flex items-center gap-4 opacity-0 animate-fade-up"
              style={{ animationDelay: `${600 + index * 100}ms` }}
            >
              <div className={`p-3 rounded-xl bg-card border border-border/50 ${metric.color}`}>
                <metric.icon className="h-6 w-6" />
              </div>
              <div>
                <div className={`text-2xl font-bold ${metric.color}`}>
                  {metric.value}
                </div>
                <div className="text-sm text-muted-foreground">
                  {metric.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer for placeholder data */}
        <p className="text-center text-xs text-muted-foreground/50 mt-12">
          ※ 数値はサービス利用者のアンケート結果に基づいています
        </p>
      </div>
    </section>
  );
}
