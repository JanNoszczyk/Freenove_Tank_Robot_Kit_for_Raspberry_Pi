import { useEffect, useRef } from 'react'
import { useRobotStore } from '@/stores/robotStore'

export function useSensors() {
  const wsRef = useRef<WebSocket | null>(null)
  const { connected, setUltrasonicDistance } = useRobotStore()

  useEffect(() => {
    if (!connected) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    const ws = new WebSocket(`ws://${window.location.host}/ws/sensors`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'ultrasonic') {
          setUltrasonicDistance(data.value)
        } else if (data.type === 'initial') {
          if (data.ultrasonic !== null) {
            setUltrasonicDistance(data.ultrasonic)
          }
        }
      } catch (e) {
        console.error('Failed to parse sensor data:', e)
      }
    }

    ws.onerror = (error) => {
      console.error('Sensor WebSocket error:', error)
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connected, setUltrasonicDistance])

  const requestUltrasonic = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_ultrasonic' }))
    }
  }

  return { requestUltrasonic }
}
