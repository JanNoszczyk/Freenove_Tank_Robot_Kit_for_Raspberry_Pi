import { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRobotStore } from '@/stores/robotStore'
import { useSensors } from '@/hooks/useSensors'
import { Radar, Grip } from 'lucide-react'

const MAX_DISTANCE = 200 // cm - max display range

export function SensorDisplay() {
  const { connected, ultrasonicDistance, gripperStatus } = useRobotStore()
  const { requestUltrasonic } = useSensors()

  // Request ultrasonic reading periodically when connected
  useEffect(() => {
    if (!connected) return

    // Initial request
    requestUltrasonic()

    const interval = setInterval(() => {
      requestUltrasonic()
    }, 500) // Poll every 500ms for responsive display

    return () => clearInterval(interval)
  }, [connected, requestUltrasonic])

  // Don't show if not connected
  if (!connected) {
    return null
  }

  // Distance visualization helpers
  const getDistanceColor = (distance: number | null) => {
    if (distance === null) return 'bg-gray-400'
    if (distance < 15) return 'bg-red-500'
    if (distance < 30) return 'bg-orange-500'
    if (distance < 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getDistanceLabel = (distance: number | null) => {
    if (distance === null) return 'No reading'
    if (distance < 15) return 'DANGER'
    if (distance < 30) return 'Close'
    if (distance < 50) return 'Near'
    return 'Clear'
  }

  const getDistancePercent = (distance: number | null) => {
    if (distance === null) return 0
    return Math.min(100, (distance / MAX_DISTANCE) * 100)
  }

  // Gripper status helpers
  const getGripperIcon = (status: string | null) => {
    if (status === 'up_complete') return '🤏' // Closed/pinched
    if (status === 'down_complete') return '🖐️' // Open
    return '✋' // Stopped/neutral
  }

  const getGripperLabel = (status: string | null) => {
    if (status === 'up_complete') return 'Closed'
    if (status === 'down_complete') return 'Open'
    if (status === 'stopped') return 'Stopped'
    return 'Unknown'
  }

  const hasUltrasonic = ultrasonicDistance !== null
  const hasGripper = gripperStatus !== null

  // If no sensor data at all, show minimal state
  if (!hasUltrasonic && !hasGripper) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Radar className="h-5 w-5" />
            Sensors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Waiting for sensor data...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Radar className="h-5 w-5" />
          Sensors
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ultrasonic Distance */}
        {hasUltrasonic && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-lg">📡</span>
                Distance
              </span>
              <span className={`text-sm font-bold ${
                ultrasonicDistance! < 15 ? 'text-red-500' :
                ultrasonicDistance! < 30 ? 'text-orange-500' :
                ultrasonicDistance! < 50 ? 'text-yellow-600' :
                'text-green-500'
              }`}>
                {ultrasonicDistance!.toFixed(1)} cm
              </span>
            </div>

            {/* Visual distance bar */}
            <div className="relative h-6 bg-secondary rounded-full overflow-hidden">
              {/* Danger zone marker */}
              <div className="absolute left-0 top-0 bottom-0 w-[7.5%] bg-red-200 dark:bg-red-900/30" />
              {/* Warning zone marker */}
              <div className="absolute left-[7.5%] top-0 bottom-0 w-[7.5%] bg-orange-200 dark:bg-orange-900/30" />
              {/* Caution zone marker */}
              <div className="absolute left-[15%] top-0 bottom-0 w-[10%] bg-yellow-200 dark:bg-yellow-900/30" />

              {/* Distance indicator */}
              <div
                className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${getDistanceColor(ultrasonicDistance)}`}
                style={{ width: `${getDistancePercent(ultrasonicDistance)}%` }}
              />

              {/* Distance marker line */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white shadow-lg transition-all duration-300"
                style={{ left: `calc(${getDistancePercent(ultrasonicDistance)}% - 2px)` }}
              />
            </div>

            {/* Status label */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">0 cm</span>
              <span className={`font-semibold px-2 py-0.5 rounded ${
                ultrasonicDistance! < 15 ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                ultrasonicDistance! < 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                ultrasonicDistance! < 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              }`}>
                {getDistanceLabel(ultrasonicDistance)}
              </span>
              <span className="text-muted-foreground">{MAX_DISTANCE} cm</span>
            </div>

            {/* Warning message for danger zone */}
            {ultrasonicDistance! < 15 && (
              <div className="flex items-center gap-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-md text-red-700 dark:text-red-300 text-xs">
                <span className="text-base">⚠️</span>
                <span className="font-medium">Obstacle detected! Movement may be blocked.</span>
              </div>
            )}
          </div>
        )}

        {/* Gripper Status */}
        {hasGripper && (
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <span className="text-sm font-medium flex items-center gap-2">
              <Grip className="h-4 w-4" />
              Gripper
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xl">{getGripperIcon(gripperStatus)}</span>
              <span className={`text-sm font-semibold px-2 py-1 rounded ${
                gripperStatus === 'up_complete' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                gripperStatus === 'down_complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}>
                {getGripperLabel(gripperStatus)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
