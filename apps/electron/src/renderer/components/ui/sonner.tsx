import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/context/ThemeContext"
import { Spinner } from "@craft-agent/ui"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedMode } = useTheme()

  return (
    <Sonner
      theme={resolvedMode as ToasterProps["theme"]}
      position="top-right"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner className="text-base" />,
      }}
      toastOptions={{
        className:
          "!rounded-xl !backdrop-blur-xl !bg-popover/80 !border-border",
      }}
      style={
        {
          "--normal-bg": "transparent",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
