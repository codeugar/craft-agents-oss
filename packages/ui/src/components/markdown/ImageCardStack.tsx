import * as React from 'react'
import {
  animate,
  easeIn,
  mix,
  motion,
  progress,
  useMotionValue,
  useTransform,
  wrap,
} from 'motion/react'
import { cn } from '../../lib/utils'

export interface ImageCardStackItem {
  src: string
  label?: string
  alt?: string
  /** Optional image ratio (width / height). Defaults to 4/3. */
  ratio?: number
}

export interface ImageCardStackProps {
  items: ImageCardStackItem[]
  currentIndex: number
  onIndexChange: (index: number) => void
  className?: string
  maxRotate?: number
  minSwipeDistanceRatio?: number
  minSwipeVelocity?: number
  /** Max stack height in px. Defaults to 320. */
  maxHeight?: number
}

export function ImageCardStack({
  items,
  currentIndex,
  onIndexChange,
  className,
  maxRotate = 5,
  minSwipeDistanceRatio = 0.5,
  minSwipeVelocity = 50,
  maxHeight = 320,
}: ImageCardStackProps) {
  const ref = React.useRef<HTMLUListElement>(null)
  const [width, setWidth] = React.useState(400)

  React.useEffect(() => {
    if (!ref.current) return

    const updateWidth = () => {
      if (!ref.current) return
      setWidth(ref.current.offsetWidth)
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  if (items.length === 0) {
    return null
  }

  const setNextImage = () => {
    onIndexChange(wrap(0, items.length, currentIndex + 1))
  }

  return (
    <ul
      ref={ref}
      className={cn('relative w-full h-full list-none m-0 p-0 mx-auto', className)}
      style={{ maxHeight }}
    >
      {items.map((item, index) => (
        <StackImage
          key={`${item.src}-${index}`}
          src={item.src}
          ratio={item.ratio ?? 4 / 3}
          alt={item.alt || item.label || `Image ${index + 1}`}
          index={index}
          currentIndex={currentIndex}
          totalImages={items.length}
          maxRotate={maxRotate}
          minDistance={Math.max(80, width * minSwipeDistanceRatio)}
          minSpeed={minSwipeVelocity}
          setNextImage={setNextImage}
        />
      ))}
    </ul>
  )
}

interface StackImageProps {
  src: string
  ratio: number
  alt: string
  index: number
  totalImages: number
  currentIndex: number
  maxRotate: number
  minDistance: number
  minSpeed: number
  setNextImage: () => void
}

function StackImage({
  src,
  ratio,
  alt,
  index,
  totalImages,
  currentIndex,
  maxRotate,
  minDistance,
  minSpeed,
  setNextImage,
}: StackImageProps) {
  const baseRotation = mix(0, maxRotate, Math.sin(index))
  const x = useMotionValue(0)
  const rotate = useTransform(x, [0, 400], [baseRotation, baseRotation + 10], { clamp: false })

  const stackPosition = ((index - currentIndex + totalImages) % totalImages)
  const zIndex = totalImages - stackPosition

  const onDragEnd = () => {
    const distance = Math.abs(x.get())
    const speed = Math.abs(x.getVelocity())

    if (distance > minDistance || speed > minSpeed) {
      setNextImage()
      animate(x, 0, {
        type: 'spring',
        stiffness: 600,
        damping: 50,
      })
      return
    }

    animate(x, 0, {
      type: 'spring',
      stiffness: 300,
      damping: 50,
    })
  }

  const opacity = progress(totalImages * 0.25, totalImages * 0.75, zIndex)
  const progressInStack = progress(0, totalImages - 1, zIndex)
  const scale = mix(0.5, 1, easeIn(progressInStack))

  return (
    <motion.li
      className={cn(
        'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        'overflow-hidden rounded-[10px] will-change-transform',
        'shadow-[1px_3px_8px_rgba(0,0,0,0.28)]'
      )}
      style={{
        width: 'auto',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: ratio,
        zIndex,
        rotate,
        x,
      }}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity, scale }}
      whileTap={index === currentIndex ? { scale: 0.98 } : {}}
      transition={{
        type: 'spring',
        stiffness: 600,
        damping: 30,
      }}
      drag={index === currentIndex ? 'x' : false}
      onDragEnd={onDragEnd}
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover select-none touch-none"
        onPointerDown={(event) => event.preventDefault()}
        draggable={false}
      />
    </motion.li>
  )
}
