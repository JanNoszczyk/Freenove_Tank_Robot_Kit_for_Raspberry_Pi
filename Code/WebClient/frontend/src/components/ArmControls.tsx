import { useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { useRobotStore } from '@/stores/robotStore'
import { api } from '@/lib/api'
import { ParkingCircle, GripVertical } from 'lucide-react'

// Arm servo ranges
const ARM_HORIZONTAL_MIN = 30
const ARM_HORIZONTAL_MAX = 150

const ARM_VERTICAL_MIN = 90
const ARM_VERTICAL_MAX = 150

// Park position: arm fully up and centered (out of camera view)
const PARK_CLAMP = 90   // Centered
const PARK_LIFT = 150   // Fully up

export function ArmControls() {
  const { connected, servo1Angle, servo2Angle, setServo1Angle, setServo2Angle } = useRobotStore()

  const handleHorizontal = useCallback(
    async (value: number[]) => {
      const angle = value[0]
      setServo1Angle(angle)
      if (connected) {
        try {
          await api.servo(0, angle)
        } catch (e) {
          console.error('Servo error:', e)
        }
      }
    },
    [connected, setServo1Angle]
  )

  const handleVertical = useCallback(
    async (value: number[]) => {
      const angle = value[0]
      setServo2Angle(angle)
      if (connected) {
        try {
          await api.servo(1, angle)
        } catch (e) {
          console.error('Servo error:', e)
        }
      }
    },
    [connected, setServo2Angle]
  )

  const handlePark = useCallback(async () => {
    setServo1Angle(PARK_CLAMP)
    setServo2Angle(PARK_LIFT)
    if (connected) {
      try {
        await api.servo(0, PARK_CLAMP)
        await api.servo(1, PARK_LIFT)
      } catch (e) {
        console.error('Servo error:', e)
      }
    }
  }, [connected, setServo1Angle, setServo2Angle])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <GripVertical className="h-5 w-5" />
          Arm
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Clamp position (horizontal) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Clamp position (J/L)</Label>
            <span className="text-sm text-muted-foreground">{servo1Angle}°</span>
          </div>
          <Slider
            value={[servo1Angle]}
            onValueChange={handleHorizontal}
            min={ARM_HORIZONTAL_MIN}
            max={ARM_HORIZONTAL_MAX}
            step={1}
            disabled={!connected}
          />
        </div>

        {/* Vertical position */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Lift (I/K)</Label>
            <span className="text-sm text-muted-foreground">{servo2Angle}°</span>
          </div>
          <Slider
            value={[servo2Angle]}
            onValueChange={handleVertical}
            min={ARM_VERTICAL_MIN}
            max={ARM_VERTICAL_MAX}
            step={1}
            disabled={!connected}
          />
        </div>

        {/* Park button - moves arm up and out of camera view */}
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={!connected}
          onClick={handlePark}
        >
          <ParkingCircle className="h-4 w-4 mr-2" />
          Park (Clear View)
        </Button>
      </CardContent>
    </Card>
  )
}
