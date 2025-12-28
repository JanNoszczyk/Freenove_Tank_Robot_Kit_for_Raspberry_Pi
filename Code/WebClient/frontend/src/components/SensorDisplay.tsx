import { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRobotStore } from '@/stores/robotStore'
import { useSensors } from '@/hooks/useSensors'
import { Radar, Grip } from 'lucide-react'

const MAX_ULTRASONIC = 200 // cm - max display range for ultrasonic
const MAX_LIDAR = 1200 // cm - max display range for LiDAR (TF-Mini S max is 12m)

export function SensorDisplay() {
  const {
    connected,
    ultrasonicDistance,
    gripperStatus,
    infraredValue,
    lidarDistance,
  } = useRobotStore()
  const { requestAllSensors } = useSensors()

  // Request all sensors periodically when connected
  useEffect(() => {
    if (!connected) return

    // Initial request
    requestAllSensors()

    const interval = setInterval(() => {
      requestAllSensors()
    }, 500) // Poll every 500ms for responsive display

    return () => clearInterval(interval)
  }, [connected, requestAllSensors])

  // Don't show if not connected
  if (!connected) {
    return null
  }

  // Distance visualization helpers for ultrasonic
  const getUltrasonicColor = (distance: number | null) => {
    if (distance === null) return 'bg-gray-400'
    if (distance < 15) return 'bg-red-500'
    if (distance < 30) return 'bg-orange-500'
    if (distance < 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getUltrasonicLabel = (distance: number | null) => {
    if (distance === null) return 'No reading'
    if (distance < 15) return 'DANGER'
    if (distance < 30) return 'Close'
    if (distance < 50) return 'Near'
    return 'Clear'
  }

  const getUltrasonicPercent = (distance: number | null) => {
    if (distance === null) return 0
    return Math.min(100, (distance / MAX_ULTRASONIC) * 100)
  }

  // LiDAR visualization helpers
  const getLidarColor = (distance: number | null) => {
    if (distance === null || distance <= 0) return 'bg-gray-400'
    if (distance < 30) return 'bg-red-500'
    if (distance < 100) return 'bg-orange-500'
    if (distance < 200) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getLidarLabel = (distance: number | null) => {
    if (distance === null || distance <= 0) return 'No reading'
    if (distance < 30) return 'DANGER'
    if (distance < 100) return 'Close'
    if (distance < 200) return 'Near'
    return 'Clear'
  }

  const getLidarPercent = (distance: number | null) => {
    if (distance === null || distance <= 0) return 0
    return Math.min(100, (distance / MAX_LIDAR) * 100)
  }

  // Infrared (line following) visualization - 3 sensors as bits
  const getInfraredSensors = (value: number | null): [boolean, boolean, boolean] => {
    if (value === null) return [false, false, false]
    // Bits: IR1 (left) = bit 2, IR2 (center) = bit 1, IR3 (right) = bit 0
    return [
      (value & 0b100) !== 0, // Left sensor
      (value & 0b010) !== 0, // Center sensor
      (value & 0b001) !== 0, // Right sensor
    ]
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
  const hasLidar = lidarDistance !== null && lidarDistance > 0
  const hasInfrared = infraredValue !== null
  const hasGripper = gripperStatus !== null
  const hasSensorData = hasUltrasonic || hasLidar || hasInfrared || hasGripper

  // If no sensor data at all, show minimal state
  if (!hasSensorData) {
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

  const [irLeft, irCenter, irRight] = getInfraredSensors(infraredValue)

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
                Ultrasonic
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
            <div className="relative h-4 bg-secondary rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${getUltrasonicColor(ultrasonicDistance)}`}
                style={{ width: `${getUltrasonicPercent(ultrasonicDistance)}%` }}
              />
            </div>

            {/* Status label */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">0</span>
              <span className={`font-semibold px-2 py-0.5 rounded ${
                ultrasonicDistance! < 15 ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                ultrasonicDistance! < 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                ultrasonicDistance! < 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              }`}>
                {getUltrasonicLabel(ultrasonicDistance)}
              </span>
              <span className="text-muted-foreground">{MAX_ULTRASONIC}cm</span>
            </div>
          </div>
        )}

        {/* LiDAR Distance */}
        {hasLidar && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-lg">🔴</span>
                LiDAR
              </span>
              <span className={`text-sm font-bold ${
                lidarDistance! < 30 ? 'text-red-500' :
                lidarDistance! < 100 ? 'text-orange-500' :
                lidarDistance! < 200 ? 'text-yellow-600' :
                'text-green-500'
              }`}>
                {lidarDistance} cm
              </span>
            </div>

            {/* Visual distance bar */}
            <div className="relative h-4 bg-secondary rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${getLidarColor(lidarDistance)}`}
                style={{ width: `${getLidarPercent(lidarDistance)}%` }}
              />
            </div>

            {/* Status label */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">0</span>
              <span className={`font-semibold px-2 py-0.5 rounded ${
                lidarDistance! < 30 ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                lidarDistance! < 100 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                lidarDistance! < 200 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              }`}>
                {getLidarLabel(lidarDistance)}
              </span>
              <span className="text-muted-foreground">{MAX_LIDAR}cm</span>
            </div>
          </div>
        )}

        {/* Infrared Line Sensors */}
        {hasInfrared && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="text-lg">📍</span>
                Line Sensors
              </span>
              <span className="text-sm text-muted-foreground">
                ({infraredValue})
              </span>
            </div>

            {/* 3 sensor indicators */}
            <div className="flex items-center justify-center gap-4 p-2 bg-secondary/50 rounded-lg">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full transition-colors ${
                  irLeft ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`} />
                <span className="text-xs text-muted-foreground">L</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full transition-colors ${
                  irCenter ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`} />
                <span className="text-xs text-muted-foreground">C</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full transition-colors ${
                  irRight ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`} />
                <span className="text-xs text-muted-foreground">R</span>
              </div>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              {infraredValue === 0 ? 'All off line' :
               infraredValue === 2 ? 'On track (center)' :
               infraredValue === 7 ? 'All on line' :
               'Following line'}
            </p>
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

        {/* Danger warning for either sensor */}
        {((hasUltrasonic && ultrasonicDistance! < 15) || (hasLidar && lidarDistance! < 30)) && (
          <div className="flex items-center gap-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-md text-red-700 dark:text-red-300 text-xs">
            <span className="text-base">⚠️</span>
            <span className="font-medium">Obstacle detected! Movement may be limited.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
