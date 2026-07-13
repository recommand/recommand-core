import { cn } from "@core/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  // bg-muted, not the stock shadcn bg-accent: our theme aliases --accent to
  // the brand green (--folder), which reads as a broken highlight when a
  // loading block pulses in it.
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
