import { useRef, useCallback, useState } from 'react'

interface JoystickProps {
  size?: number
  onMove: (x: number, y: number) => void
  onRelease?: () => void
  disabled?: boolean
  label?: string
}

export function Joystick({
  size = 120,
  onMove,
  onRelease,
  disabled = false,
  label,
}: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const knobSize = size * 0.4
  const maxDistance = (size - knobSize) / 2

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current || disabled) return

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

      setPosition({ x: dx, y: dy })

      // Normalize to -1 to 1
      const normalX = dx / maxDistance
      const normalY = -dy / maxDistance // Invert Y so up is positive

      onMove(normalX, normalY)
    },
    [maxDistance, onMove, disabled]
  )

  const handleRelease = useCallback(() => {
    setIsDragging(false)
    setPosition({ x: 0, y: 0 })
    onRelease?.()
  }, [onRelease])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      setIsDragging(true)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      handleMove(e.clientX, e.clientY)
    },
    [handleMove, disabled]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return
      handleMove(e.clientX, e.clientY)
    },
    [isDragging, handleMove]
  )

  const handlePointerUp = useCallback(() => {
    handleRelease()
  }, [handleRelease])

  return (
    <div className="flex flex-col items-center gap-1">
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
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Cross guides */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-[1px] bg-border/50" />
          <div className="absolute w-[1px] h-full bg-border/50" />
        </div>

        {/* Knob */}
        <div
          className={`absolute rounded-full shadow-md transition-transform duration-75 ${
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
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  )
}
