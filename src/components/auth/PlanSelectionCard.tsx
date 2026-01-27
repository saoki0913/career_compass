"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanFeature {
  text: string;
  included: boolean;
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
}: PlanSelectionCardProps) {
  return (
    <Card
      className={cn(
        "relative transition-all",
        isSelected && "ring-2 ring-primary",
        isPopular && "border-primary"
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
            おすすめ
          </span>
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="mt-2">
          <span className="text-3xl font-bold">{price}</span>
          {period && <span className="text-muted-foreground">/{period}</span>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              {feature.included ? (
                <svg
                  className="h-4 w-4 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <span className={cn(!feature.included && "text-muted-foreground")}>
                {feature.text}
              </span>
            </li>
          ))}
        </ul>
        <Button
          onClick={onSelect}
          disabled={disabled}
          variant={isSelected ? "default" : "outline"}
          className="w-full"
        >
          {isSelected ? "選択中" : "このプランを選ぶ"}
        </Button>
      </CardContent>
    </Card>
  );
}
