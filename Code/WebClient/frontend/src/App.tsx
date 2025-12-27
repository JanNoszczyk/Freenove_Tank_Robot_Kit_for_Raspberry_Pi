import { ConnectionPanel } from '@/components/ConnectionPanel'
import { VideoStream } from '@/components/VideoStream'
import { MovementControls } from '@/components/MovementControls'
import { ArmControls } from '@/components/ArmControls'
import { LEDPanel } from '@/components/LEDPanel'
import { ModeSelector } from '@/components/ModeSelector'
import { SensorDisplay } from '@/components/SensorDisplay'
import { AIChat } from '@/components/AIChat'
import { EmergencyStop } from '@/components/EmergencyStop'
import { useKeyboardControls } from '@/hooks/useKeyboardControls'
import { useRobotStore } from '@/stores/robotStore'
import './index.css'

function App() {
  useKeyboardControls()
  const { mode } = useRobotStore()
  const isAIMode = mode === 3

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tank Robot Control</h1>
          <div className="flex items-center gap-4">
            {!isAIMode && (
              <div className="text-sm text-muted-foreground">
                WASD: Move | IJKL: Arm | O/P: Gripper
              </div>
            )}
            <EmergencyStop />
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Video */}
          <div className="lg:col-span-2">
            <VideoStream />
          </div>

          {/* Right Column: Mode-dependent content */}
          <div className="space-y-4">
            <ConnectionPanel />
            <ModeSelector />

            {isAIMode ? (
              /* AI Mode: Show chat */
              <AIChat />
            ) : (
              /* Manual Mode: Show all controls */
              <>
                <MovementControls />
                <ArmControls />
                <LEDPanel />
                <SensorDisplay />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
