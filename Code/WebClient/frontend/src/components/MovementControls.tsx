import { useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRobotStore } from '@/stores/robotStore'
import { api } from '@/lib/api'
import { Joystick } from './Joystick'

const MAX_SPEED = 4000
const SEND_INTERVAL = 50 // Send commands every 50ms

export function MovementControls() {
  const { connected } = useRobotStore()
  const targetRef = useRef({ left: 0, right: 0 })
  const lastSentRef = useRef({ left: 0, right: 0 })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDraggingRef = useRef(false)

  // Continuously send motor commands while dragging
  useEffect(() => {
    if (!connected) return

    intervalRef.current = setInterval(async () => {
      if (!isDraggingRef.current) return

      const { left, right } = targetRef.current

      // Only send if values changed
      if (left === lastSentRef.current.left && right === lastSentRef.current.right) {
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
    }
  }, [connected])

  const handleMove = useCallback((x: number, y: number) => {
    isDraggingRef.current = true

    // Tank drive: y = forward/back, x = turn
    // Simple arcade-to-tank conversion
    const forward = y * MAX_SPEED
    const turn = x * MAX_SPEED

    // Mix forward and turn
    let left = forward + turn
    let right = forward - turn

    // Normalize if over max
    const maxVal = Math.max(Math.abs(left), Math.abs(right))
    if (maxVal > MAX_SPEED) {
      const scale = MAX_SPEED / maxVal
      left *= scale
      right *= scale
    }

    targetRef.current = {
      left: Math.round(left),
      right: Math.round(right),
    }
  }, [])

  const handleRelease = useCallback(async () => {
    isDraggingRef.current = false
    targetRef.current = { left: 0, right: 0 }
    lastSentRef.current = { left: -1, right: -1 } // Force next send

    // Immediately stop
    try {
      await api.motor(0, 0)
    } catch (e) {
      console.error('Motor error:', e)
    }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Movement</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <Joystick
          size={150}
          onMove={handleMove}
          onRelease={handleRelease}
          disabled={!connected}
          label="WASD or drag"
        />
      </CardContent>
    </Card>
  )
}
