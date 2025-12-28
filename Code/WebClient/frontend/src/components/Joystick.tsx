import { useRef, useCallback, useState, useEffect } from 'react'

interface JoystickProps {
  size?: number
  onMove: (x: number, y: number) => void
  onRelease?: () => void
  disabled?: boolean
  label?: string
}

export function Joystick({
  size = 180, // Larger default for easier mobile control
  onMove,
  onRelease,
  disabled = false,
  label,
}: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const pointerIdRef = useRef<number | null>(null)

  const knobSize = size * 0.35
  const maxDistance = (size - knobSize) / 2

  const calculatePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0, normalX: 0, normalY: 0 }

      const rect = containerRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      let dx = clientX - centerX
      let dy = clientY - centerY

      // Clamp to circle
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance
        dy = (dy / distance) * maxDistance
      }

      // Normalize to -1 to 1
      const normalX = dx / maxDistance
      const normalY = -dy / maxDistance // Invert Y so up is positive

      return { x: dx, y: dy, normalX, normalY }
    },
    [maxDistance]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !containerRef.current) return

      e.preventDefault()
      e.stopPropagation()

      // Capture pointer on the container, not the target
      containerRef.current.setPointerCapture(e.pointerId)
      pointerIdRef.current = e.pointerId
      setIsDragging(true)

      const pos = calculatePosition(e.clientX, e.clientY)
      setPosition({ x: pos.x, y: pos.y })
      onMove(pos.normalX, pos.normalY)
    },
    [calculatePosition, onMove, disabled]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to the captured pointer
      if (!isDragging || e.pointerId !== pointerIdRef.current) return

      e.preventDefault()
      const pos = calculatePosition(e.clientX, e.clientY)
      setPosition({ x: pos.x, y: pos.y })
      onMove(pos.normalX, pos.normalY)
    },
    [isDragging, calculatePosition, onMove]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to the captured pointer
      if (e.pointerId !== pointerIdRef.current) return

      if (containerRef.current) {
        containerRef.current.releasePointerCapture(e.pointerId)
      }
      pointerIdRef.current = null
      setIsDragging(false)
      setPosition({ x: 0, y: 0 })
      onRelease?.()
    },
    [onRelease]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pointerIdRef.current !== null && containerRef.current) {
        try {
          containerRef.current.releasePointerCapture(pointerIdRef.current)
        } catch {
          // Ignore if already released
        }
      }
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={containerRef}
        className={`relative rounded-full border-2 touch-none select-none ${
          disabled
            ? 'bg-muted border-muted-foreground/20 cursor-not-allowed'
            : 'bg-secondary border-border cursor-grab active:cursor-grabbing'
        }`}
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        // Don't use pointerLeave - we have pointer capture
      >
        {/* Cross guides */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-[1px] bg-border/50" />
          <div className="absolute w-[1px] h-full bg-border/50" />
        </div>

        {/* Direction indicators */}
        <div className="absolute inset-0 pointer-events-none">
          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/50">▲</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/50">▼</span>
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">◀</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">▶</span>
        </div>

        {/* Knob - pointer-events-none so it doesn't interfere */}
        <div
          className={`absolute rounded-full shadow-lg pointer-events-none transition-transform duration-75 ${
            disabled ? 'bg-muted-foreground/30' : 'bg-primary'
          } ${isDragging ? 'scale-110' : ''}`}
          style={{
            width: knobSize,
            height: knobSize,
            left: size / 2 - knobSize / 2 + position.x,
            top: size / 2 - knobSize / 2 + position.y,
          }}
        />
      </div>
      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
    </div>
  )
}
