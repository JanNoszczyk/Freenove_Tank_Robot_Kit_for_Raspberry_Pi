import { useEffect, useRef, useCallback } from 'react'
import { useRobotStore } from '@/stores/robotStore'

export function useVideoStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const prevUrlRef = useRef<string | null>(null)
  const { connected, setVideoUrl } = useRobotStore()

  const cleanup = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setVideoUrl(null)
  }, [setVideoUrl])

  useEffect(() => {
    if (!connected) {
      cleanup()
      return
    }

    const ws = new WebSocket(`ws://${window.location.host}/ws/video`)
    ws.binaryType = 'blob'
    wsRef.current = ws

    ws.onmessage = (event) => {
      // Revoke previous URL to prevent memory leak
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
      }
      const url = URL.createObjectURL(event.data)
      prevUrlRef.current = url
      setVideoUrl(url)
    }

    ws.onerror = (error) => {
      console.error('Video WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('Video WebSocket closed')
      cleanup()
    }

    return cleanup
  }, [connected, cleanup, setVideoUrl])

  return { cleanup }
}
