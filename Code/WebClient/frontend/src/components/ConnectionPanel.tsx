import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRobotStore } from '@/stores/robotStore'
import { api } from '@/lib/api'

const STORAGE_KEY = 'robot-last-ip'
const DEFAULT_HOSTS = ['raspberrypi.local', '192.168.4.1']

// Park position: arm up and centered (out of camera view)
const PARK_CLAMP = 90   // Centered
const PARK_LIFT = 150   // Fully up

// Initialize arm to park position after connection
async function parkArm(setServo1Angle: (a: number) => void, setServo2Angle: (a: number) => void) {
  try {
    await api.servo(0, PARK_CLAMP)
    await api.servo(1, PARK_LIFT)
    setServo1Angle(PARK_CLAMP)
    setServo2Angle(PARK_LIFT)
  } catch (e) {
    console.error('Failed to park arm:', e)
  }
}

export function ConnectionPanel() {
  const { ip, setIp, connected, setConnected, setServo1Angle, setServo2Angle } = useRobotStore()
  const [loading, setLoading] = useState(false)
  const [autoConnecting, setAutoConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoConnectAttempted = useRef(false)

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnectAttempted.current || connected) return
    autoConnectAttempted.current = true

    const tryAutoConnect = async () => {
      setAutoConnecting(true)
      setError(null)

      // Build list of IPs to try: saved IP first, then defaults
      const savedIp = localStorage.getItem(STORAGE_KEY)
      const hostsToTry = savedIp
        ? [savedIp, ...DEFAULT_HOSTS.filter(h => h !== savedIp)]
        : DEFAULT_HOSTS

      for (const host of hostsToTry) {
        try {
          await api.connect(host)
          setIp(host)
          setConnected(true)
          localStorage.setItem(STORAGE_KEY, host)
          // Park arm to clear camera view
          await parkArm(setServo1Angle, setServo2Angle)
          setAutoConnecting(false)
          return
        } catch {
          // Try next host
        }
      }

      setAutoConnecting(false)
      setError('Auto-connect failed. Enter IP manually.')
    }

    tryAutoConnect()
  }, [connected, setIp, setConnected, setServo1Angle, setServo2Angle])

  const handleConnect = async () => {
    if (connected) {
      setLoading(true)
      try {
        await api.disconnect()
        setConnected(false)
      } catch (e) {
        console.error('Disconnect error:', e)
      } finally {
        setLoading(false)
      }
    } else {
      setLoading(true)
      setError(null)
      try {
        await api.connect(ip)
        setConnected(true)
        localStorage.setItem(STORAGE_KEY, ip)
        // Park arm to clear camera view
        await parkArm(setServo1Angle, setServo2Angle)
      } catch (e) {
        setError('Failed to connect')
        console.error('Connect error:', e)
      } finally {
        setLoading(false)
      }
    }
  }

  const isLoading = loading || autoConnecting

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {autoConnecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : connected ? (
              <Wifi className="h-5 w-5" />
            ) : (
              <WifiOff className="h-5 w-5" />
            )}
            Connection
          </CardTitle>
          <Badge variant={autoConnecting ? 'secondary' : connected ? 'success' : 'destructive'}>
            {autoConnecting ? 'Auto-connecting...' : connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="raspberrypi.local"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            disabled={connected || isLoading}
          />
          <Button
            onClick={handleConnect}
            disabled={isLoading}
            variant={connected ? 'destructive' : 'default'}
          >
            {isLoading ? '...' : connected ? 'Disconnect' : 'Connect'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
