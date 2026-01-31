import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-all duration-200 overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border-border text-foreground [a&]:hover:bg-secondary [a&]:hover:text-secondary-foreground",
        ghost: "[a&]:hover:bg-secondary [a&]:hover:text-secondary-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        // Semantic variants - solid
        success: "bg-success text-success-foreground [a&]:hover:bg-success/90",
        warning: "bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
        info: "bg-info text-info-foreground [a&]:hover:bg-info/90",
        // Soft variants - subtle background
        "soft-primary": "bg-primary/10 text-primary border-primary/20 [a&]:hover:bg-primary/20",
        "soft-destructive": "bg-destructive/10 text-destructive border-destructive/20 [a&]:hover:bg-destructive/20",
        "soft-success": "bg-success/10 text-success border-success/20 [a&]:hover:bg-success/20",
        "soft-warning": "bg-warning/10 text-warning-foreground border-warning/20 [a&]:hover:bg-warning/20",
        "soft-info": "bg-info/10 text-info border-info/20 [a&]:hover:bg-info/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
