import { create } from 'zustand'

interface RobotState {
  // Connection
  connected: boolean
  ip: string
  setIp: (ip: string) => void
  setConnected: (connected: boolean) => void

  // Video
  videoUrl: string | null
  setVideoUrl: (url: string | null) => void

  // Servos
  servo1Angle: number
  servo2Angle: number
  setServo1Angle: (angle: number) => void
  setServo2Angle: (angle: number) => void

  // LEDs
  ledMask: number
  ledR: number
  ledG: number
  ledB: number
  setLedMask: (mask: number) => void
  setLedColor: (r: number, g: number, b: number) => void

  // Mode
  mode: number // 0=free, 1=sonic, 2=line, 3=ai
  setMode: (mode: number) => void

  // Sensors
  ultrasonicDistance: number | null
  gripperStatus: string | null
  infraredValue: number | null  // 0-7, 3-bit combined value from 3 IR sensors
  lidarDistance: number | null  // Distance in cm from TF-Mini S LiDAR
  setUltrasonicDistance: (distance: number | null) => void
  setGripperStatus: (status: string | null) => void
  setInfraredValue: (value: number | null) => void
  setLidarDistance: (distance: number | null) => void

  // AI Mode
  aiState: 'idle' | 'listening' | 'thinking' | 'speaking'
  aiTranscript: Array<{ id: string; role: 'user' | 'assistant'; text: string }>
  setAiState: (state: 'idle' | 'listening' | 'thinking' | 'speaking') => void
  addAiMessage: (role: 'user' | 'assistant', text: string) => void
  clearAiTranscript: () => void
}

export const useRobotStore = create<RobotState>((set) => ({
  // Connection
  connected: false,
  ip: '192.168.4.1',
  setIp: (ip) => set({ ip }),
  setConnected: (connected) => set({ connected }),

  // Video
  videoUrl: null,
  setVideoUrl: (videoUrl) => set({ videoUrl }),

  // Servos (servo2 default is 150 = park position, arm fully up)
  servo1Angle: 90,
  servo2Angle: 150,
  setServo1Angle: (servo1Angle) => set({ servo1Angle }),
  setServo2Angle: (servo2Angle) => set({ servo2Angle }),

  // LEDs (mask 15 = all LEDs selected)
  ledMask: 15,
  ledR: 255,
  ledG: 0,
  ledB: 0,
  setLedMask: (ledMask) => set({ ledMask }),
  setLedColor: (ledR, ledG, ledB) => set({ ledR, ledG, ledB }),

  // Mode
  mode: 0,
  setMode: (mode) => set({ mode }),

  // Sensors
  ultrasonicDistance: null,
  gripperStatus: null,
  infraredValue: null,
  lidarDistance: null,
  setUltrasonicDistance: (ultrasonicDistance) => set({ ultrasonicDistance }),
  setGripperStatus: (gripperStatus) => set({ gripperStatus }),
  setInfraredValue: (infraredValue) => set({ infraredValue }),
  setLidarDistance: (lidarDistance) => set({ lidarDistance }),

  // AI Mode
  aiState: 'idle',
  aiTranscript: [],
  setAiState: (aiState) => set({ aiState }),
  addAiMessage: (role, text) =>
    set((state) => {
      const newMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        text
      }
      const newTranscript = [...state.aiTranscript, newMessage]
      // Limit to last 50 messages to prevent memory issues
      return { aiTranscript: newTranscript.slice(-50) }
    }),
  clearAiTranscript: () => set({ aiTranscript: [] }),
}))
