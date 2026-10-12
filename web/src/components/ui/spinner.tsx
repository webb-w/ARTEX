"use client";

import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"
import { useLocale } from "@/lib/locale-provider";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t: ui } = useLocale();
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={ui("Loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
