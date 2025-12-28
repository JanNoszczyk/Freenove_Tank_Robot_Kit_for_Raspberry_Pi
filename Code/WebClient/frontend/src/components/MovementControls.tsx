import { useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRobotStore } from '@/stores/robotStore'
import { api } from '@/lib/api'
import { Joystick } from './Joystick'

// Match physical gamepad: MOTOR_BASE=3000 at 100% speed
const MAX_SPEED = 3000
const SEND_INTERVAL = 50 // Send commands every 50ms (20Hz like physical gamepad)

export function MovementControls() {
  const { connected } = useRobotStore()
  const targetRef = useRef({ left: 0, right: 0 })
  const lastSentRef = useRef({ left: 0, right: 0 })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDraggingRef = useRef(false)

  // Stop motors safely
  const stopMotors = useCallback(async () => {
    isDraggingRef.current = false
    targetRef.current = { left: 0, right: 0 }
    lastSentRef.current = { left: 0, right: 0 }
    try {
      await api.motor(0, 0)
    } catch (e) {
      console.error('Stop motors error:', e)
    }
  }, [])

  // Continuously send motor commands while dragging
  useEffect(() => {
    if (!connected) {
      // Stop motors when disconnected
      stopMotors()
      return
    }

    intervalRef.current = setInterval(async () => {
      if (!isDraggingRef.current) return

      const { left, right } = targetRef.current

      // Only send if values changed (with small threshold to reduce chatter)
      const leftDiff = Math.abs(left - lastSentRef.current.left)
      const rightDiff = Math.abs(right - lastSentRef.current.right)
      if (leftDiff < 50 && rightDiff < 50) {
        return
      }

      lastSentRef.current = { left, right }

      try {
        await api.motor(left, right)
      } catch (e) {
        console.error('Motor error:', e)
      }
    }, SEND_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      // Stop motors on unmount/cleanup
      stopMotors()
    }
  }, [connected, stopMotors])

  // Stop on tab visibility change or window blur
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isDraggingRef.current) {
        stopMotors()
      }
    }

    const handleBlur = () => {
      if (isDraggingRef.current) {
        stopMotors()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [stopMotors])

  const handleMove = useCallback((x: number, y: number) => {
    isDraggingRef.current = true

    // Tank drive mixing (same as physical gamepad)
    // forward = y (up is positive), turn = x (right is positive)
    const forward = y * MAX_SPEED
    const turn = x * MAX_SPEED

    // Differential drive: left = forward + turn, right = forward - turn
    let left = forward + turn
    let right = forward - turn

    // Clamp to valid motor range
    left = Math.max(-4095, Math.min(4095, left))
    right = Math.max(-4095, Math.min(4095, right))

    targetRef.current = {
      left: Math.round(left),
      right: Math.round(right),
    }
  }, [])

  const handleRelease = useCallback(() => {
    stopMotors()
  }, [stopMotors])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Movement</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <Joystick
          size={200}
          onMove={handleMove}
          onRelease={handleRelease}
          disabled={!connected}
          label="Drag to move"
        />
      </CardContent>
    </Card>
  )
}
