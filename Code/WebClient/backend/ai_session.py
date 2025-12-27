"""AI Session for Web Backend - Voice control via WebSocket.

Pipeline: Browser Audio (webm) → STT (Gemini) → Agent (ADK) → TTS (Gemini) → Browser
"""

import os
import io
import base64
import asyncio
import tempfile
import logging
from pathlib import Path
from typing import Optional, Callable, Any
from dataclasses import dataclass, field
from dotenv import load_dotenv

from google import genai
from google.genai import types
from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService

# Load .env
load_dotenv()

# Configure logging
logger = logging.getLogger("ai_session")

# Model configuration
STT_MODEL = "gemini-2.5-flash"  # Speech-to-text model
TTS_MODEL = "gemini-2.5-flash"  # Text-to-speech model
TTS_VOICE = "Puck"
AGENT_MODEL = "gemini-3-flash-preview"  # Agent reasoning (latest, higher rate limits)

# Safety constants
ULTRASONIC_STALE_THRESHOLD = 2.0
SAFETY_DISTANCE_BLOCK = 15

# Robot brain prompt - improved for tool execution
ROBOT_BRAIN_INSTRUCTION = """You are the brain of a tank robot. Your job is to EXECUTE commands using tools.

## CRITICAL RULES
1. ALWAYS use tools to perform actions - never just describe what you would do
2. For multi-step tasks, call tools in sequence (e.g., "pick up ball" = move_forward → clamp_down → clamp_up)
3. Check sensor readings using get_sensor_status() when needed
4. If blocked by obstacle, try alternative approaches (back up, turn)

## AVAILABLE TOOLS
- move_forward(speed=2000) / move_backward(speed=2000) - Move tank (speed: 0-2500)
- turn_left(speed=1500) / turn_right(speed=1500) - Rotate in place
- stop() - Emergency stop all motors
- set_servo(channel, angle) - Camera: channel 0=pan, 1=tilt, angle 90-150
- set_leds(r, g, b) - Set LED color (0-255 each)
- clamp_up() / clamp_down() - Gripper control (up=close/pinch, down=open/release)
- get_sensor_status() - Read distance and clamp state

## SAFETY
- Forward movement blocked if distance < 15cm or no reading
- Emergency stop on "stop/halt/freeze/emergency"

## RESPONSE STYLE
- Be CONCISE: "Moving forward." not "I am now executing the forward movement command."
- After executing tools, briefly confirm what was done
- If a tool returns BLOCKED, explain why and suggest alternatives

## EXAMPLES
User: "go forward" → call move_forward() → "Moving forward."
User: "pick up the ball" → call move_forward(), clamp_down(), clamp_up() → "Picked up the ball."
User: "look left" → call set_servo(0, 120) → "Looking left."
User: "what do you see?" → call get_sensor_status() → report readings
"""


@dataclass
class AgentEvent:
    """Represents an event during agent execution."""
    event_type: str  # "env", "prompt", "thinking", "tool_call", "tool_result", "response", "error"
    data: Any
    details: dict = field(default_factory=dict)

    def __str__(self):
        if self.event_type == "tool_call":
            args = self.details.get("args", {})
            return f"TOOL CALL: {self.data}({args})"
        elif self.event_type == "tool_result":
            return f"TOOL RESULT: {self.data} → {self.details.get('result', '')}"
        elif self.event_type == "env":
            return f"ENV: {self.data}"
        elif self.event_type == "prompt":
            return f"PROMPT: {self.data}"
        elif self.event_type == "response":
            return f"RESPONSE: {self.data}"
        elif self.event_type == "error":
            return f"ERROR: {self.data}"
        else:
            return f"{self.event_type.upper()}: {self.data}"


class AISession:
    """Manages AI voice control session for a robot."""

    def __init__(self, robot_client):
        self.robot = robot_client
        self.client = None
        self.agent = None
        self.runner = None
        self.session_service = None
        self.session_id = None
        self._initialized = False

    async def _ensure_initialized(self):
        """Lazy initialization of Gemini and ADK."""
        if self._initialized:
            return

        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY or GEMINI_API_KEY not found in environment")

        self.client = genai.Client(api_key=api_key)

        # Create robot tools
        tools = self._create_tools()

        # Initialize ADK agent
        self.agent = Agent(
            model=AGENT_MODEL,
            name="robot_brain",
            instruction=ROBOT_BRAIN_INSTRUCTION,
            tools=tools
        )
        self.session_service = InMemorySessionService()
        self.runner = Runner(
            agent=self.agent,
            app_name="robot_brain",
            session_service=self.session_service
        )

        # Create session
        session = await self.session_service.create_session(
            app_name="robot_brain",
            user_id="user",
            state={}
        )
        self.session_id = session.id
        self._initialized = True

    def _create_tools(self):
        """Create robot control tools for the ADK agent."""
        robot = self.robot

        def move_forward(speed: int = 2000) -> str:
            """Move the robot forward."""
            if not robot.connected:
                return "ERROR: Robot not connected"

            distance = robot.sensors.ultrasonic
            if distance is None:
                return "BLOCKED: No distance reading"
            if distance < SAFETY_DISTANCE_BLOCK:
                return f"BLOCKED: Obstacle at {distance:.1f}cm"

            speed = max(0, min(2500, abs(speed)))
            robot.motor(speed, speed)
            robot.request_ultrasonic()
            return f"Moving forward at speed {speed}"

        def move_backward(speed: int = 2000) -> str:
            """Move the robot backward."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            speed = max(0, min(2500, abs(speed)))
            robot.motor(-speed, -speed)
            return f"Moving backward at speed {speed}"

        def turn_left(speed: int = 1500) -> str:
            """Turn the robot left."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            speed = max(0, min(2500, abs(speed)))
            robot.motor(-speed, speed)
            return f"Turning left at speed {speed}"

        def turn_right(speed: int = 1500) -> str:
            """Turn the robot right."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            speed = max(0, min(2500, abs(speed)))
            robot.motor(speed, -speed)
            return f"Turning right at speed {speed}"

        def stop() -> str:
            """Stop all motors immediately."""
            robot.stop()
            return "STOPPED"

        def set_servo(channel: int, angle: int) -> str:
            """Set servo angle. Channel 0=pan, 1=tilt. Angle 90-150."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            channel = max(0, min(1, channel))
            angle = max(90, min(150, angle))
            robot.servo(channel, angle)
            return f"Servo {'pan' if channel == 0 else 'tilt'} set to {angle} degrees"

        def set_leds(r: int, g: int, b: int) -> str:
            """Set LED color (RGB 0-255)."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            r, g, b = [max(0, min(255, c)) for c in (r, g, b)]
            robot.led(1, r, g, b, 15)
            return f"LEDs set to RGB({r},{g},{b})"

        def clamp_up() -> str:
            """Move the clamp/gripper up (pinch)."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            robot.gripper(1)
            return "Clamp moving up"

        def clamp_down() -> str:
            """Move the clamp/gripper down (release)."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            robot.gripper(2)
            return "Clamp moving down"

        def get_sensor_status() -> str:
            """Get current sensor readings."""
            distance = robot.sensors.ultrasonic
            clamp = robot.sensors.gripper_status
            connected = robot.connected

            parts = [f"Robot: {'Connected' if connected else 'DISCONNECTED'}"]
            if distance is not None:
                parts.append(f"Distance: {distance:.1f}cm")
            else:
                parts.append("Distance: No reading")
            if clamp:
                parts.append(f"Clamp: {clamp}")
            return ", ".join(parts)

        return [
            move_forward, move_backward, turn_left, turn_right, stop,
            set_servo, set_leds, clamp_up, clamp_down, get_sensor_status
        ]

    async def process_audio(self, audio_base64: str) -> dict:
        """Process audio and return result with optional TTS audio.

        Args:
            audio_base64: Base64-encoded webm audio from browser

        Returns:
            dict with keys: user_text, assistant_text, audio (base64 mp3)
        """
        await self._ensure_initialized()

        result = {
            "user_text": None,
            "assistant_text": None,
            "audio": None
        }

        # Decode audio
        audio_bytes = base64.b64decode(audio_base64)

        # Step 1: STT - Transcribe audio
        try:
            stt_response = self.client.models.generate_content(
                model=STT_MODEL,
                contents=[
                    "Transcribe this audio exactly. Return only the transcription.",
                    types.Part.from_bytes(data=audio_bytes, mime_type="audio/webm")
                ]
            )
            user_text = stt_response.text.strip()
            if not user_text:
                return result

            result["user_text"] = user_text
        except Exception as e:
            print(f"STT error: {e}")
            return result

        # Emergency stop fast-path
        if any(w in user_text.lower() for w in ("stop", "halt", "freeze", "emergency")):
            self.robot.stop()
            result["assistant_text"] = "Emergency stop executed."
            result["audio"] = await self._generate_tts("Emergency stop executed.")
            return result

        # Step 2: Process with ADK agent
        try:
            # Build environment context
            distance = self.robot.sensors.ultrasonic
            clamp = self.robot.sensors.gripper_status
            status = "Connected" if self.robot.connected else "DISCONNECTED"
            dist_str = f"{distance:.1f}cm" if distance else "No reading"

            env = f"Robot: {status}, Distance: {dist_str}"
            if clamp:
                env += f", Clamp: {clamp}"

            prompt = f"[ENV] {env}\n[COMMAND] {user_text}"

            # Run agent
            response_text = ""
            async for event in self.runner.run_async(
                user_id="user",
                session_id=self.session_id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)]
                )
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            response_text += part.text

            result["assistant_text"] = response_text or "Done."

        except asyncio.TimeoutError:
            result["assistant_text"] = "Timeout - please try again."
        except Exception as e:
            print(f"Agent error: {e}")
            result["assistant_text"] = f"Error: {e}"

        # Step 3: TTS
        if result["assistant_text"]:
            result["audio"] = await self._generate_tts(result["assistant_text"])

        return result

    async def process_text(
        self,
        text: str,
        generate_tts: bool = False,
        on_event: Optional[Callable[[AgentEvent], None]] = None
    ) -> dict:
        """Process text command directly (bypasses STT).

        Args:
            text: User command as text string
            generate_tts: Whether to generate TTS audio response
            on_event: Optional callback for real-time event logging

        Returns:
            dict with keys: user_text, assistant_text, audio, events (list of AgentEvent)
        """
        await self._ensure_initialized()

        events: list[AgentEvent] = []

        def emit(event: AgentEvent):
            events.append(event)
            logger.debug(str(event))
            if on_event:
                on_event(event)

        result = {
            "user_text": text,
            "assistant_text": None,
            "audio": None,
            "events": events
        }

        # Emergency stop fast-path
        if any(w in text.lower() for w in ("stop", "halt", "freeze", "emergency")):
            emit(AgentEvent("tool_call", "stop", {"args": {}}))
            self.robot.stop()
            emit(AgentEvent("tool_result", "stop", {"result": "STOPPED"}))
            result["assistant_text"] = "Emergency stop executed."
            emit(AgentEvent("response", result["assistant_text"]))
            if generate_tts:
                result["audio"] = await self._generate_tts("Emergency stop executed.")
            return result

        # Process with ADK agent
        try:
            distance = self.robot.sensors.ultrasonic
            clamp = self.robot.sensors.gripper_status
            status = "Connected" if self.robot.connected else "DISCONNECTED"
            dist_str = f"{distance:.1f}cm" if distance else "No reading"

            env = f"Robot: {status}, Distance: {dist_str}"
            if clamp:
                env += f", Clamp: {clamp}"

            prompt = f"[ENV] {env}\n[COMMAND] {text}"

            emit(AgentEvent("env", env))
            emit(AgentEvent("prompt", prompt))

            response_text = ""
            tool_calls_seen = set()  # Track unique tool calls

            async for event in self.runner.run_async(
                user_id="user",
                session_id=self.session_id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)]
                )
            ):
                # Log raw event for debugging
                logger.debug(f"ADK Event: {type(event).__name__}")
                if hasattr(event, 'author'):
                    logger.debug(f"  Author: {event.author}")

                if event.content and event.content.parts:
                    for part in event.content.parts:
                        # Handle function calls
                        if hasattr(part, 'function_call') and part.function_call:
                            fc = part.function_call
                            # Extract args - handle different possible formats
                            args = {}
                            if hasattr(fc, 'args') and fc.args:
                                if isinstance(fc.args, dict):
                                    args = fc.args
                                elif hasattr(fc.args, 'items'):
                                    args = dict(fc.args.items())
                                else:
                                    args = {"raw": str(fc.args)}

                            call_id = f"{fc.name}_{args}"
                            if call_id not in tool_calls_seen:
                                tool_calls_seen.add(call_id)
                                emit(AgentEvent("tool_call", fc.name, {"args": args}))

                        # Handle function responses
                        if hasattr(part, 'function_response') and part.function_response:
                            fr = part.function_response
                            # Extract result - handle different formats
                            result_data = ""
                            if hasattr(fr, 'response'):
                                if isinstance(fr.response, dict):
                                    result_data = fr.response.get('result', str(fr.response))
                                else:
                                    result_data = str(fr.response)
                            emit(AgentEvent("tool_result", fr.name, {"result": result_data}))

                        # Handle text responses
                        if hasattr(part, 'text') and part.text:
                            response_text += part.text

            result["assistant_text"] = response_text.strip() or "Done."
            emit(AgentEvent("response", result["assistant_text"]))

        except asyncio.TimeoutError:
            result["assistant_text"] = "Timeout - please try again."
            emit(AgentEvent("error", "Timeout"))
        except Exception as e:
            logger.exception(f"Agent error: {e}")
            result["assistant_text"] = f"Error: {e}"
            emit(AgentEvent("error", str(e)))

        # Optional TTS
        if generate_tts and result["assistant_text"]:
            result["audio"] = await self._generate_tts(result["assistant_text"])

        return result

    async def _generate_tts(self, text: str) -> Optional[str]:
        """Generate TTS audio and return as base64 string."""
        try:
            tts_response = self.client.models.generate_content(
                model=TTS_MODEL,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=TTS_VOICE
                            )
                        )
                    )
                )
            )

            if not tts_response.candidates:
                return None

            candidate = tts_response.candidates[0]
            if not candidate.content or not candidate.content.parts:
                return None

            for part in candidate.content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    audio_data = part.inline_data.data
                    return base64.b64encode(audio_data).decode()

            return None

        except Exception as e:
            print(f"TTS error: {e}")
            return None
