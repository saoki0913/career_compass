"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Icons
const CheckIcon = () => (
  <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="h-5 w-5 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SparkleIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
  </svg>
);

const CrownIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5z"
    />
  </svg>
);

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

interface PlanSelectionCardProps {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: PlanFeature[];
  isPopular?: boolean;
  isSelected?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "recommended" | "premium";
  dailyPrice?: string;
  animationDelay?: number;
}

export function PlanSelectionCard({
  name,
  price,
  period,
  description,
  features,
  isPopular = false,
  isSelected = false,
  onSelect,
  disabled = false,
  variant = "default",
  dailyPrice,
  animationDelay = 0,
}: PlanSelectionCardProps) {
  const isRecommended = variant === "recommended" || isPopular;
  const isPremium = variant === "premium";

  return (
    <Card
      onClick={disabled ? undefined : onSelect}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        "relative transition-all duration-300 cursor-pointer animate-in fade-in slide-in-from-bottom-4",
        "hover:shadow-xl",
        // Default variant
        variant === "default" && [
          "bg-card border-border/50",
          isSelected && "ring-2 ring-primary border-primary",
        ],
        // Recommended variant (Standard plan)
        isRecommended && [
          "z-10 border-2 border-primary",
          "bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5",
          "shadow-xl shadow-primary/15",
          isSelected && "ring-2 ring-primary ring-offset-2",
        ],
        // Premium variant (Pro plan) - uses CSS variables for theme consistency
        isPremium && [
          "bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-950 dark:to-zinc-900 text-zinc-50 border-zinc-700 dark:border-zinc-800",
          isSelected && "ring-2 ring-amber-400",
        ]
      )}
    >
      {/* Popular badge with animation */}
      {isRecommended && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-primary/50 blur-md rounded-full" />
            <span className="relative flex items-center gap-1.5 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
              <SparkleIcon />
              最も選ばれています
              <SparkleIcon />
            </span>
          </div>
        </div>
      )}

      {/* Premium badge */}
      {isPremium && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <span className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-zinc-900 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
            <CrownIcon />
            プレミアム
          </span>
        </div>
      )}

      <CardHeader className={cn("pb-4", (isRecommended || isPremium) && "pt-8")}>
        <CardTitle className={cn(
          "text-xl font-bold",
          isPremium && "text-white"
        )}>
          {name}
        </CardTitle>
        <CardDescription className={cn(
          isPremium && "text-zinc-300"
        )}>
          {description}
        </CardDescription>

        {/* Price section */}
        <div className="mt-4 space-y-1">
          <div className="flex items-baseline gap-1">
            <span className={cn(
              "text-4xl font-black tracking-tight",
              isRecommended && "text-primary",
              isPremium && "text-amber-400"
            )}>
              {price}
            </span>
            {period && (
              <span className={cn(
                "text-muted-foreground text-sm",
                isPremium && "text-zinc-400"
              )}>
                /{period}
              </span>
            )}
          </div>

          {/* Daily price reframing */}
          {dailyPrice && (
            <p className={cn(
              "text-sm font-medium",
              isRecommended && "text-primary/80",
              isPremium && "text-amber-400/80",
              !isRecommended && !isPremium && "text-muted-foreground"
            )}>
              1日わずか {dailyPrice}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Feature list */}
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li
              key={index}
              className={cn(
                "flex items-start gap-3 text-sm",
                !feature.included && "opacity-50"
              )}
            >
              <span className="mt-0.5 flex-shrink-0">
                {feature.included ? <CheckIcon /> : <XIcon />}
              </span>
              <span className={cn(
                feature.included ? "font-medium" : "text-muted-foreground",
                isPremium && feature.included && "text-white",
                isPremium && !feature.included && "text-zinc-500",
                feature.highlight && "text-primary font-semibold"
              )}>
                {feature.text}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          disabled={disabled}
          variant={isSelected ? "default" : "outline"}
          size="lg"
          className={cn(
            "w-full font-semibold transition-all",
            isRecommended && !isSelected && [
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "shadow-md shadow-primary/20",
            ],
            isPremium && !isSelected && [
              "bg-amber-500 text-zinc-900 hover:bg-amber-400 border-amber-500",
            ],
            isPremium && isSelected && [
              "bg-amber-500 text-zinc-900",
            ],
            isSelected && !isPremium && "shadow-md"
          )}
        >
          {isSelected ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              選択中
            </span>
          ) : (
            "このプランを選ぶ"
          )}
        </Button>
      </CardContent>

      {/* Selection indicator glow for recommended */}
      {isSelected && isRecommended && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-primary shadow-lg shadow-primary/20 pointer-events-none" />
      )}
    </Card>
  );
}
