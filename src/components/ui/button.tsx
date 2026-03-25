import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "border border-slate-900/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] text-white shadow-[0_20px_45px_-24px_rgba(15,23,42,0.7)] hover:bg-[linear-gradient(180deg,rgba(2,6,23,1),rgba(15,23,42,0.98))] hover:shadow-[0_24px_56px_-24px_rgba(15,23,42,0.8)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-slate-200/80 bg-white/92 text-slate-700 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.3)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "border border-transparent bg-slate-100 text-slate-700 shadow-xs hover:bg-slate-200/80",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-secondary/50",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
        success:
          "bg-success text-success-foreground shadow-sm hover:bg-success/90 hover:shadow-md",
        warning:
          "bg-warning text-warning-foreground shadow-sm hover:bg-warning/90 hover:shadow-md",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3 lg:h-9",
        xs: "h-8 gap-1 rounded-lg px-2.5 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 lg:h-6",
        sm: "h-9 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5 lg:h-8",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4",
        xl: "h-12 rounded-lg px-8 text-base has-[>svg]:px-6",
        icon: "size-10 rounded-xl lg:size-9",
        "icon-xs": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3 lg:size-6",
        "icon-sm": "size-9 rounded-lg lg:size-8",
        "icon-lg": "size-11 rounded-xl lg:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
