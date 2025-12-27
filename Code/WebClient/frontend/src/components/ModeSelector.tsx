import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRobotStore } from '@/stores/robotStore'
import { api } from '@/lib/api'
import { Gamepad2, Bot } from 'lucide-react'

export function ModeSelector() {
  const { connected, mode, setMode } = useRobotStore()
  const isAIMode = mode === 3

  const handleModeChange = async (newMode: number) => {
    setMode(newMode)
    if (connected && newMode !== 3) {
      try {
        await api.setMode(newMode)
      } catch (e) {
        console.error('Mode error:', e)
      }
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex gap-2">
          <Button
            variant={!isAIMode ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => handleModeChange(0)}
            disabled={!connected}
          >
            <Gamepad2 className="h-4 w-4 mr-2" />
            Manual
          </Button>
          <Button
            variant={isAIMode ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => handleModeChange(3)}
            disabled={!connected}
          >
            <Bot className="h-4 w-4 mr-2" />
            AI
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
