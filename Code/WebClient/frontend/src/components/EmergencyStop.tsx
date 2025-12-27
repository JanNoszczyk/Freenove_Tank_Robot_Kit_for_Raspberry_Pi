import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { useRobotStore } from '@/stores/robotStore'

export function EmergencyStop() {
  const { connected } = useRobotStore()
  const [confirmShutdown, setConfirmShutdown] = useState(false)

  const handleStop = useCallback(async () => {
    try {
      await api.stop()
      await api.motor(0, 0)
    } catch (e) {
      console.error('Emergency stop error:', e)
    }
  }, [])

  const handleShutdown = useCallback(async () => {
    if (!confirmShutdown) {
      setConfirmShutdown(true)
      // Reset after 3 seconds if not confirmed
      setTimeout(() => setConfirmShutdown(false), 3000)
      return
    }
    try {
      await api.shutdown()
    } catch (e) {
      console.error('Shutdown error:', e)
    }
    setConfirmShutdown(false)
  }, [confirmShutdown])

  return (
    <div className="flex items-center gap-2">
      {/* Emergency Stop - Big Red Button */}
      <button
        onClick={handleStop}
        disabled={!connected}
        className={`
          w-16 h-16 rounded-full
          flex items-center justify-center
          text-white font-bold text-xs uppercase tracking-wider
          shadow-lg
          transition-all duration-150
          ${connected
            ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 active:scale-95 cursor-pointer'
            : 'bg-gray-400 cursor-not-allowed'
          }
        `}
        title="Emergency Stop - kills all movement"
      >
        STOP
      </button>

      {/* Shutdown Button */}
      <button
        onClick={handleShutdown}
        disabled={!connected}
        className={`
          w-16 h-16 rounded-full
          flex items-center justify-center
          text-white font-bold text-[10px] uppercase tracking-wider leading-tight
          shadow-lg
          transition-all duration-150
          ${!connected
            ? 'bg-gray-400 cursor-not-allowed'
            : confirmShutdown
              ? 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 active:scale-95 cursor-pointer animate-pulse'
              : 'bg-gray-700 hover:bg-gray-800 active:bg-gray-900 active:scale-95 cursor-pointer'
          }
        `}
        title={confirmShutdown ? "Click again to confirm shutdown" : "Shutdown Raspberry Pi"}
      >
        {confirmShutdown ? 'CONFIRM?' : 'POWER OFF'}
      </button>
    </div>
  )
}
