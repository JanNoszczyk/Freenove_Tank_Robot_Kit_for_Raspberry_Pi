import { useEffect, useRef, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useRobotStore } from '@/stores/robotStore'
import { Mic, MicOff, Bot, Loader2, WifiOff, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const MAX_RECONNECT_DELAY = 10000 // 10 seconds max
const INITIAL_RECONNECT_DELAY = 1000 // 1 second

// Get a supported audio mimeType
function getSupportedMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  // Fallback - let browser choose
  return ''
}

type WsState = 'disconnected' | 'connecting' | 'connected'

export function AIChat() {
  const { connected, mode, aiState, aiTranscript, setAiState, addAiMessage } = useRobotStore()
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wsState, setWsState] = useState<WsState>('disconnected')
  const [inputText, setInputText] = useState('')

  const isAIMode = mode === 3

  const playAudio = useCallback(async (base64Data: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    try {
      const response = await fetch(`data:audio/wav;base64,${base64Data}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      await audio.play()
    } catch (e) {
      console.error('Failed to play audio:', e)
      setError('Audio playback failed')
    }
  }, [])

  // Use ref for reconnection to avoid circular dependency
  const connectAIRef = useRef<() => void>(() => {})

  const connectAI = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    setWsState('connecting')
    setError(null)

    const ws = new WebSocket(`ws://${window.location.host}/ws/ai`)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
      setWsState('connected')
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'state') {
          setAiState(data.state)
        } else if (data.type === 'transcript') {
          addAiMessage(data.role, data.text)
        } else if (data.type === 'audio') {
          playAudio(data.data)
        } else if (data.type === 'error') {
          setError(data.message)
          if (data.message.includes('not available')) {
            setWsState('disconnected')
          }
        }
      } catch (e) {
        console.error('Failed to parse AI message:', e)
      }
    }

    ws.onerror = () => {
      setWsState('disconnected')
      setError('AI connection error - check backend')
    }

    ws.onclose = () => {
      wsRef.current = null
      setWsState('disconnected')
      setAiState('idle')
      // Only reconnect if still in AI mode and connected
      const state = useRobotStore.getState()
      if (state.connected && state.mode === 3) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          )
          connectAIRef.current()
        }, reconnectDelayRef.current)
      }
    }
  }, [setAiState, addAiMessage, playAudio])

  // Keep ref in sync (must be in useEffect to avoid "cannot update ref during render")
  useEffect(() => {
    connectAIRef.current = connectAI
  }, [connectAI])

  // Connect WebSocket when in AI mode
  useEffect(() => {
    if (!connected || !isAIMode) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setWsState('disconnected')
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
      return
    }

    connectAI()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      // Stop any active recording
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setWsState('disconnected')
    }
  }, [connected, isAIMode, connectAI])

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [aiTranscript, scrollToBottom])

  const startRecording = async () => {
    if (wsState !== 'connected' || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('AI service not connected')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Use supported mimeType with fallback
      const mimeType = getSupportedMimeType()
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, recorderOptions)
      const actualMimeType = recorder.mimeType || 'audio/webm'

      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: actualMimeType })
        const base64 = await blobToBase64(blob)

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64,
            mimeType: actualMimeType,
          }))
        }

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setAiState('listening')
      wsRef.current.send(JSON.stringify({ type: 'start_listening' }))
      setError(null)
    } catch (e) {
      const err = e as Error
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found')
      } else {
        setError('Failed to access microphone')
      }
      console.error('Microphone error:', e)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      setAiState('thinking')
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // Send text message
  const sendText = useCallback(() => {
    if (!inputText.trim() || wsState !== 'connected' || !wsRef.current) return
    if (aiState !== 'idle') return

    const text = inputText.trim()
    setInputText('')
    setError(null)

    wsRef.current.send(JSON.stringify({
      type: 'text',
      text: text
    }))
  }, [inputText, wsState, aiState])

  // Handle Enter key in input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendText()
    }
  }, [sendText])

  // Determine button state
  const isButtonDisabled = !connected || wsState !== 'connected' || aiState === 'thinking' || aiState === 'speaking'

  // Get button content based on state
  const getButtonContent = (): { icon: LucideIcon; text: string; spin: boolean } => {
    if (wsState === 'connecting') {
      return { icon: Loader2, text: 'Connecting...', spin: true }
    }
    if (wsState === 'disconnected') {
      return { icon: WifiOff, text: 'AI Offline', spin: false }
    }
    const stateMap: Record<string, { icon: LucideIcon; text: string; spin: boolean }> = {
      listening: { icon: MicOff, text: 'Release to Send', spin: false },
      thinking: { icon: Loader2, text: 'Thinking...', spin: true },
      speaking: { icon: Loader2, text: 'Speaking...', spin: true },
      idle: { icon: Mic, text: 'Hold to Talk', spin: false }
    }
    return stateMap[aiState] || stateMap.idle
  }

  // Get connection status for display
  const getConnectionBadge = () => {
    if (!connected) {
      return <Badge variant="outline"><WifiOff className="h-3 w-3 mr-1" />Disconnected</Badge>
    }
    if (wsState === 'connecting') {
      return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Connecting...</Badge>
    }
    if (wsState === 'disconnected') {
      return <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" />AI Offline</Badge>
    }
    // Connected - show AI state
    return (
      <Badge
        variant={
          aiState === 'idle'
            ? 'secondary'
            : aiState === 'listening'
              ? 'destructive'
              : aiState === 'thinking'
                ? 'default'
                : 'outline'
        }
      >
        {aiState === 'speaking' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        {aiState}
      </Badge>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant
          </CardTitle>
          {getConnectionBadge()}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Messages area - larger height */}
        <div
          ref={scrollContainerRef}
          className="border rounded-md p-3 overflow-y-auto min-h-[200px] max-h-[400px] bg-muted/30"
        >
          {aiTranscript.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {wsState !== 'connected'
                ? 'Waiting for AI service...'
                : 'Type a message or hold the mic button to talk'}
            </p>
          ) : (
            <div className="space-y-3">
              {aiTranscript.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] text-sm px-3 py-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {/* Thinking indicator */}
              {aiState === 'thinking' && (
                <div className="flex justify-start">
                  <div className="bg-muted px-3 py-2 rounded-lg rounded-bl-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Text input */}
        <div className="flex gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            disabled={wsState !== 'connected' || aiState !== 'idle'}
            className="flex-1"
          />
          <Button
            onClick={sendText}
            disabled={!inputText.trim() || wsState !== 'connected' || aiState !== 'idle'}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Voice button */}
        {(() => {
          const { icon: Icon, text, spin } = getButtonContent()
          return (
            <Button
              size="lg"
              variant={aiState === 'listening' ? 'destructive' : 'outline'}
              disabled={isButtonDisabled}
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              className="touch-none"
            >
              <Icon className={`h-5 w-5 mr-2 ${spin ? 'animate-spin' : ''}`} />
              {text}
            </Button>
          )
        })()}
      </CardContent>
    </Card>
  )
}
