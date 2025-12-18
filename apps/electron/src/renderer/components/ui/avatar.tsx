import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  )
}

/**
 * CrossfadeAvatar - Avatar with smooth crossfade from fallback to image
 *
 * Shows the fallback initially, then crossfades to the image when loaded.
 * Both elements are layered so the transition is smooth.
 */
interface CrossfadeAvatarProps {
  src?: string | null
  alt?: string
  fallback: React.ReactNode
  className?: string
  fallbackClassName?: string
  imageClassName?: string
}

function CrossfadeAvatar({
  src,
  alt,
  fallback,
  className,
  fallbackClassName,
  imageClassName,
}: CrossfadeAvatarProps) {
  const [isLoaded, setIsLoaded] = React.useState(false)
  const [currentSrc, setCurrentSrc] = React.useState(src)

  // Reset loaded state when src changes
  React.useEffect(() => {
    if (src !== currentSrc) {
      setIsLoaded(false)
      setCurrentSrc(src)
    }
  }, [src, currentSrc])

  return (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        className
      )}
    >
      {/* Fallback - always rendered, fades out when image loads */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-full transition-opacity duration-200",
          isLoaded ? "opacity-0" : "opacity-100",
          fallbackClassName
        )}
      >
        {fallback}
      </div>

      {/* Image - fades in when loaded */}
      {src && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          className={cn(
            "aspect-square h-full w-full object-cover transition-opacity duration-200",
            isLoaded ? "opacity-100" : "opacity-0",
            imageClassName
          )}
        />
      )}

      {/* Show fallback statically if no src */}
      {!src && (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full",
            fallbackClassName
          )}
        >
          {fallback}
        </div>
      )}
    </div>
  )
}

export { Avatar, AvatarImage, AvatarFallback, CrossfadeAvatar }
