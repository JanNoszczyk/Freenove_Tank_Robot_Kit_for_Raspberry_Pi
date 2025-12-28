"""AI Session for Web Backend - Voice control via WebSocket.

Pipeline: Browser Audio (webm) → STT (Gemini) → Agent (ADK) → TTS (Gemini) → Browser
"""

import os
import io
import base64
import asyncio
import tempfile
import logging
import time
import wave
from pathlib import Path
from typing import Optional, Callable, Any
from dataclasses import dataclass, field
from dotenv import load_dotenv, find_dotenv

from google import genai
from google.genai import types
from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService
from google.adk.planners import BuiltInPlanner

# Load .env from repo root (find_dotenv walks up directory tree)
load_dotenv(find_dotenv())

# Configure logging
logger = logging.getLogger("ai_session")

# Model configuration
STT_MODEL = "gemini-3-flash-preview"  # Speech-to-text (transcription)
TTS_MODEL = "gemini-2.5-flash-preview-tts"  # Dedicated TTS model
TTS_VOICE = "Puck"  # One of 30 available voices
AGENT_MODEL = "gemini-3-flash-preview"  # Agent reasoning (latest)

# Safety constants
ULTRASONIC_STALE_THRESHOLD = 2.0
SAFETY_DISTANCE_BLOCK = 15

# Calibration constants (tune on real robot)
CM_PER_SECOND_AT_2000 = 50  # Approximate cm/sec at motor speed 2000
DEGREES_PER_SECOND_AT_1500 = 90  # Approximate degrees/sec at turn speed 1500
VISION_MODEL = "gemini-2.5-flash"  # For camera analysis

# Thinking configuration - extended reasoning for complex robot decisions
# Range: 0 (off) to 24576 (maximum). Default auto is 8192.
THINKING_BUDGET = 17200  # 70% of max (24576) - good balance of reasoning vs latency

# TTS audio output format (raw PCM from Gemini)
TTS_SAMPLE_RATE = 24000  # 24kHz
TTS_CHANNELS = 1  # Mono
TTS_SAMPLE_WIDTH = 2  # 16-bit


def pcm_to_wav(pcm_data: bytes) -> bytes:
    """Convert raw PCM audio to WAV format for browser playback."""
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(TTS_CHANNELS)
        wav_file.setsampwidth(TTS_SAMPLE_WIDTH)
        wav_file.setframerate(TTS_SAMPLE_RATE)
        wav_file.writeframes(pcm_data)
    return buffer.getvalue()


# Robot brain prompt - perception-first with exploration
ROBOT_BRAIN_INSTRUCTION = """You are the brain of a tank robot. PERCEIVE before you ACT.

## CRITICAL RULES
1. Call sense() BEFORE moving to understand your environment
2. ALWAYS use tools - never just describe what you would do
3. For multi-step tasks, call tools in sequence with sense() between steps
4. Verify results with sense() after important actions
5. KEEP ARM UP by default - it blocks camera view when down

## PERCEPTION TOOLS
- sense() → Returns: ultrasonic distance, lidar distance, line sensors, arm state, AND camera view
- sense("Is there a red ball?") → Same + answer to specific question
- lidar_sweep() → Returns LiDAR readings at 3 heights (up/mid/down). Useful for profiling obstacles.

## SENSORS EXPLAINED
- Ultrasonic: Short-range (0-200cm), front-facing, good for close obstacles
- LiDAR: Long-range (0-1200cm), precise, MOUNTED ON ARM above clamp
  - Reading height changes with arm position
  - When arm up: LiDAR points forward at high position (default)
  - When arm down: LiDAR points forward at low position
- Line sensors: 3 IR sensors (L/C/R) for line following. Value 0-7 (binary: LCR)
  - 0=all off line, 2=center on line, 7=all on line
- Camera: Front-facing, blocked when arm is down

## ARM BEHAVIOR (IMPORTANT)
The robot arm moves up/down and has a clamp (gripper) at the end, with LiDAR above the clamp.
- arm_up() - Raise arm (default position). Camera unblocked. LiDAR at high position. Returns arm state.
- arm_down() - Lower arm. Blocks camera view! LiDAR at low position. Returns arm state.
- **Keep arm UP unless**:
  - Picking up objects (lower arm, close clamp, raise arm)
  - Interacting with environment at ground level
  - Doing a lidar_sweep() to scan at multiple heights

## MOVEMENT TOOLS
- move_toward(cm) - Forward using ultrasonic/lidar feedback. Precise. Stops at obstacles.
- move_timed(direction, ms) - Any direction for duration. ~50cm/sec. Directions: forward/backward/left/right
- turn_degrees(degrees) - Rotate body. Positive=left, negative=right. ~90°/sec
- stop() - Emergency stop

## OTHER TOOLS
- set_servo(channel, angle) - Camera gimbal: 0=pan, 1=tilt, 90-150°
- set_leds(r, g, b) - LED color (0-255)
- clamp_close() / clamp_open() - Aliases for arm_up/arm_down (arm and clamp are mechanically coupled)

## LINE FOLLOWING
When asked to follow a line:
1. sense() to check line sensors
2. If center sensor active (value has bit 1 set): move forward
3. If only left sensor: turn_degrees(15) to correct
4. If only right sensor: turn_degrees(-15) to correct
5. Repeat sense() and adjust

## EXPLORATION
If asked to find something not currently visible:
1. sense("Is there a [object]?")
2. If not found: turn_degrees(90) + sense() - repeat up to 4 times (360° scan)
3. If spotted: navigate toward it with move_toward() or move_timed()
4. Verify with sense() when close

## PICKING UP OBJECTS
1. sense() to locate object
2. Navigate close with move_toward()
3. arm_down() to lower arm and open clamp
4. Move forward slightly to position clamp around object
5. arm_up() to close clamp and lift (restores camera view)

## SAFETY
- move_toward() auto-blocks if obstacle < 15cm (ultrasonic) or < 30cm (lidar)
- Emergency stop on "stop/halt/freeze/emergency"
- Always arm_up() after picking up or scanning to restore camera view

## RESPONSE STYLE
- Include key perception info: "See ball 40cm left, lidar clear. Turning."
- After actions: "Turned left. Ball now ahead, 35cm."
- Be CONCISE but INFORMATIVE

## EXAMPLES
User: "go forward 30cm" → sense(), move_toward(30) → "Clear ahead. Moved 28cm, wall at 20cm."
User: "look left" → turn_degrees(90), sense() → "Turned left. Chair 60cm ahead, clear path."
User: "find the red ball" → sense("red ball?") → not found → turn_degrees(90), sense() → "Found! Ball 1m ahead." → move_toward(90) → "At the ball."
User: "what do you see?" → sense() → "Ultrasonic 45cm, LiDAR 120cm. I see a wooden table with books."
User: "scan the area" → lidar_sweep() → "Up: 120cm, Mid: 85cm, Down: 40cm. Low obstacle ahead."
User: "pick up the ball" → sense(), move_toward(20), arm_down(), move_timed("forward", 300), arm_up() → "Got it! Ball secured."
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

        # Initialize ADK agent with maximum thinking for complex reasoning
        self.agent = Agent(
            model=AGENT_MODEL,
            name="robot_brain",
            instruction=ROBOT_BRAIN_INSTRUCTION,
            tools=tools,
            planner=BuiltInPlanner(
                thinking_config=types.ThinkingConfig(
                    include_thoughts=False,  # Don't include thinking in response text
                    thinking_budget=THINKING_BUDGET
                )
            )
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

    def _build_environment_context(self) -> str:
        """Build environment context string with all sensor data."""
        status = "Connected" if self.robot.connected else "DISCONNECTED"
        parts = [f"Robot: {status}"]

        # Ultrasonic (primary obstacle sensor)
        ultrasonic = self.robot.sensors.ultrasonic
        if ultrasonic is not None:
            parts.append(f"Ultrasonic: {ultrasonic:.1f}cm")

        # LiDAR (long range)
        lidar = self.robot.sensors.lidar
        if lidar is not None and lidar > 0:
            parts.append(f"LiDAR: {lidar}cm")

        # Line sensors (infrared)
        infrared = self.robot.sensors.infrared
        if infrared is not None:
            left = (infrared & 0b100) != 0
            center = (infrared & 0b010) != 0
            right = (infrared & 0b001) != 0
            line_parts = []
            if left: line_parts.append("L")
            if center: line_parts.append("C")
            if right: line_parts.append("R")
            if line_parts:
                parts.append(f"Line: {'+'.join(line_parts)}")
            else:
                parts.append("Line: none")

        # Arm state (gripper_status reflects arm position)
        arm_state = self.robot.sensors.gripper_status
        if arm_state:
            if arm_state == "up_complete":
                parts.append("Arm: UP (camera clear)")
            elif arm_state == "down_complete":
                parts.append("Arm: DOWN (camera blocked!)")
            elif arm_state == "stopped":
                parts.append("Arm: stopped (mid-position)")
            else:
                parts.append(f"Arm: {arm_state}")

        return ", ".join(parts)

    def _create_tools(self):
        """Create robot control tools for the ADK agent."""
        robot = self.robot
        session = self  # Capture for vision API access

        # === PERCEPTION ===

        def sense(question: str = None) -> str:
            """Get full environmental awareness: sensors + camera vision.

            Args:
                question: Optional specific question about what's visible.
                         If None, returns sensors + brief scene description.

            Returns:
                Combined sensor readings and vision analysis.
            """
            # Get all sensor readings
            ultrasonic = robot.sensors.ultrasonic
            lidar = robot.sensors.lidar
            infrared = robot.sensors.infrared
            arm_state = robot.sensors.gripper_status

            parts = []

            # Ultrasonic (short range)
            if ultrasonic is not None:
                parts.append(f"Ultrasonic: {ultrasonic:.1f}cm")
            else:
                parts.append("Ultrasonic: No reading")

            # LiDAR (long range, mounted on arm)
            if lidar is not None and lidar > 0:
                parts.append(f"LiDAR: {lidar}cm")
            else:
                parts.append("LiDAR: No reading")

            # Line sensors (infrared)
            if infrared is not None:
                # Decode 3-bit value: bit2=left, bit1=center, bit0=right
                left = (infrared & 0b100) != 0
                center = (infrared & 0b010) != 0
                right = (infrared & 0b001) != 0
                line_status = []
                if left: line_status.append("L")
                if center: line_status.append("C")
                if right: line_status.append("R")
                if line_status:
                    parts.append(f"Line: {'+'.join(line_status)} active")
                else:
                    parts.append("Line: None detected")

            # Arm state (affects camera view and LiDAR height)
            if arm_state:
                if arm_state == "up_complete":
                    parts.append("Arm: UP (camera clear)")
                elif arm_state == "down_complete":
                    parts.append("Arm: DOWN (camera blocked!)")
                else:
                    parts.append(f"Arm: {arm_state}")

            # Get vision analysis
            vision_result = ""
            try:
                # Check if robot has camera frame capability
                if hasattr(robot, 'get_camera_frame'):
                    frame = robot.get_camera_frame()
                    if frame:
                        # Real camera - use Gemini vision
                        prompt = question or "Briefly describe what's visible ahead. Be concise."
                        vision_response = session.client.models.generate_content(
                            model=VISION_MODEL,
                            contents=[
                                prompt,
                                types.Part.from_bytes(data=frame, mime_type="image/jpeg")
                            ]
                        )
                        vision_result = vision_response.text.strip()
                    else:
                        vision_result = "Camera: No frame available"
                elif hasattr(robot, 'get_mock_vision'):
                    # Mock robot - return simulated vision
                    vision_result = robot.get_mock_vision(question)
                else:
                    vision_result = "Camera: Not available"
            except Exception as e:
                vision_result = f"Vision error: {e}"

            parts.append(f"Vision: {vision_result}")
            return " | ".join(parts)

        # === MOVEMENT WITH FEEDBACK ===

        def move_toward(distance_cm: int) -> str:
            """Move forward approximately distance_cm using ultrasonic/lidar feedback.

            Args:
                distance_cm: Target distance to travel in centimeters.

            Returns:
                Result with actual distance traveled.
            """
            if not robot.connected:
                return "ERROR: Robot not connected"

            start_distance = robot.sensors.ultrasonic
            lidar_distance = robot.sensors.lidar

            # Check LiDAR first (longer range, more precise)
            if lidar_distance is not None and lidar_distance > 0:
                if lidar_distance < 30:  # LiDAR safety threshold
                    return f"BLOCKED: LiDAR detects obstacle at {lidar_distance}cm"

            if start_distance is None:
                return "ERROR: No initial distance reading - cannot use ultrasonic feedback"

            target_distance = start_distance - distance_cm
            if target_distance < SAFETY_DISTANCE_BLOCK:
                available = start_distance - SAFETY_DISTANCE_BLOCK
                if available <= 0:
                    return f"BLOCKED: Already at obstacle ({start_distance:.1f}cm)"
                return f"BLOCKED: Only {available:.1f}cm available before obstacle"

            # Mock robot: simulate movement immediately (no real sensors)
            if hasattr(robot, 'simulate_move_toward'):
                robot.motor(2000, 2000)
                time.sleep(0.1)  # Brief delay for realism
                robot.stop()
                robot.simulate_move_toward(distance_cm)
                new_distance = robot.sensors.ultrasonic
                return f"Moved {distance_cm}cm. Now {new_distance:.1f}cm from obstacle."

            # Real robot: poll until target reached or timeout
            robot.motor(2000, 2000)
            robot.request_ultrasonic()

            start_time = time.time()
            timeout = 15  # seconds
            poll_interval = 0.15

            while time.time() - start_time < timeout:
                time.sleep(poll_interval)
                robot.request_ultrasonic()
                time.sleep(0.05)  # Wait for response

                current = robot.sensors.ultrasonic
                if current is None:
                    robot.stop()
                    traveled = start_distance - (robot.sensors.ultrasonic or start_distance)
                    return f"STOPPED: Lost distance reading after ~{traveled:.0f}cm"

                if current <= target_distance:
                    robot.stop()
                    traveled = start_distance - current
                    return f"Moved {traveled:.1f}cm. Now {current:.1f}cm from obstacle."

                if current < SAFETY_DISTANCE_BLOCK:
                    robot.stop()
                    traveled = start_distance - current
                    return f"STOPPED: Obstacle at {current:.1f}cm after traveling {traveled:.1f}cm"

            # Timeout
            robot.stop()
            current = robot.sensors.ultrasonic
            traveled = start_distance - current if current else distance_cm
            return f"TIMEOUT after {traveled:.0f}cm. Obstacle at {current:.1f}cm."

        def move_timed(direction: str, duration_ms: int) -> str:
            """Move in a direction for specified duration.

            Args:
                direction: One of 'forward', 'backward', 'left', 'right'
                duration_ms: How long to move in milliseconds (max 5000)

            Returns:
                Result with estimated distance traveled.
            """
            if not robot.connected:
                return "ERROR: Robot not connected"

            direction = direction.lower()
            duration_ms = max(100, min(5000, duration_ms))  # Clamp 100ms-5s
            duration_sec = duration_ms / 1000

            # Safety check for forward movement
            if direction == "forward":
                distance = robot.sensors.ultrasonic
                if distance is not None and distance < SAFETY_DISTANCE_BLOCK:
                    return f"BLOCKED: Obstacle at {distance:.1f}cm"

            # Set motor speeds based on direction
            speed = 2000
            if direction == "forward":
                robot.motor(speed, speed)
                estimated_cm = duration_sec * CM_PER_SECOND_AT_2000
            elif direction == "backward":
                robot.motor(-speed, -speed)
                estimated_cm = duration_sec * CM_PER_SECOND_AT_2000
            elif direction == "left":
                robot.motor(-1500, 1500)
                estimated_cm = None  # Rotation, not linear
            elif direction == "right":
                robot.motor(1500, -1500)
                estimated_cm = None
            else:
                return f"ERROR: Unknown direction '{direction}'. Use: forward, backward, left, right"

            # Wait for duration
            time.sleep(duration_sec)
            robot.stop()

            # Update mock robot state if applicable
            if direction == "forward" and hasattr(robot, 'simulate_move_toward'):
                robot.simulate_move_toward(estimated_cm)
            elif hasattr(robot, 'simulate_turn'):
                if direction == "left":
                    # Estimate degrees from duration: ~90°/sec at speed 1500
                    estimated_degrees = int(duration_sec * DEGREES_PER_SECOND_AT_1500)
                    robot.simulate_turn(estimated_degrees)
                elif direction == "right":
                    estimated_degrees = int(duration_sec * DEGREES_PER_SECOND_AT_1500)
                    robot.simulate_turn(-estimated_degrees)

            if estimated_cm:
                return f"Moved {direction} for {duration_ms}ms (~{estimated_cm:.0f}cm)"
            else:
                return f"Rotated {direction} for {duration_ms}ms"

        def turn_degrees(degrees: int) -> str:
            """Rotate the robot body by approximately N degrees.

            Args:
                degrees: Rotation amount. Positive = left, negative = right.

            Returns:
                Result with estimated rotation.
            """
            if not robot.connected:
                return "ERROR: Robot not connected"

            degrees = max(-360, min(360, degrees))  # Clamp to one full rotation
            if degrees == 0:
                return "No rotation needed"

            # Calculate duration from calibration
            duration_sec = abs(degrees) / DEGREES_PER_SECOND_AT_1500

            # Set motor direction
            speed = 1500
            if degrees > 0:  # Left
                robot.motor(-speed, speed)
                direction = "left"
            else:  # Right
                robot.motor(speed, -speed)
                direction = "right"

            # Wait for rotation
            time.sleep(duration_sec)
            robot.stop()

            # Update mock robot heading if applicable
            if hasattr(robot, 'simulate_turn'):
                robot.simulate_turn(degrees)

            return f"Rotated {direction} ~{abs(degrees)}°"

        def stop() -> str:
            """Emergency stop all motors immediately."""
            robot.stop()
            return "STOPPED"

        # === SERVO/LED/GRIPPER ===

        def set_servo(channel: int, angle: int) -> str:
            """Set camera servo angle. Channel 0=pan, 1=tilt. Angle 90-150."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            channel = max(0, min(1, channel))
            angle = max(90, min(150, angle))
            robot.servo(channel, angle)
            return f"Camera {'pan' if channel == 0 else 'tilt'} set to {angle}°"

        def set_leds(r: int, g: int, b: int) -> str:
            """Set LED color (RGB 0-255)."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            r, g, b = [max(0, min(255, c)) for c in (r, g, b)]
            robot.led(1, r, g, b, 15)
            return f"LEDs set to RGB({r},{g},{b})"

        # === ARM & CLAMP ===
        # The arm moves up/down. LiDAR is mounted at top of arm, clamp at bottom.
        # Arm up = camera unblocked, LiDAR high. Arm down = camera blocked, LiDAR low.

        def arm_up() -> str:
            """Raise arm to default position. Unblocks camera. LiDAR at high position. Also closes clamp."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            robot.gripper(1)
            time.sleep(0.5)  # Wait for arm movement to start
            return "Arm raising (camera unblocked, LiDAR high)"

        def arm_down() -> str:
            """Lower arm. WARNING: Blocks camera view! LiDAR at low position. Also opens clamp."""
            if not robot.connected:
                return "ERROR: Robot not connected"
            robot.gripper(2)
            time.sleep(0.5)  # Wait for arm movement to start
            return "Arm lowering (camera blocked, LiDAR low)"

        def clamp_close() -> str:
            """Close the clamp/gripper to grab objects. Same as arm_up."""
            return arm_up()

        def clamp_open() -> str:
            """Open the clamp/gripper to release objects. Same as arm_down."""
            return arm_down()

        def lidar_sweep() -> str:
            """Sweep arm through 3 heights taking LiDAR readings at each.

            Returns distance readings at: UP (high), MID (middle), DOWN (low).
            Leaves arm in UP position when done.
            """
            if not robot.connected:
                return "ERROR: Robot not connected"

            readings = {}

            # Position 1: UP (high)
            robot.gripper(1)  # Arm up
            time.sleep(1.5)  # Wait for arm to reach position
            robot.request_lidar()
            time.sleep(0.2)
            readings["up"] = robot.sensors.lidar

            # Position 2: MID (halfway - brief stop during descent)
            robot.gripper(2)  # Start lowering
            time.sleep(0.7)  # Partial descent
            robot.gripper(0)  # Stop at mid position
            time.sleep(0.3)
            robot.request_lidar()
            time.sleep(0.2)
            readings["mid"] = robot.sensors.lidar

            # Position 3: DOWN (low)
            robot.gripper(2)  # Continue down
            time.sleep(1.0)  # Full descent
            robot.request_lidar()
            time.sleep(0.2)
            readings["down"] = robot.sensors.lidar

            # Return to UP position (unblock camera)
            robot.gripper(1)
            time.sleep(1.5)

            # Format results
            up_str = f"{readings['up']}cm" if readings['up'] else "N/A"
            mid_str = f"{readings['mid']}cm" if readings['mid'] else "N/A"
            down_str = f"{readings['down']}cm" if readings['down'] else "N/A"

            return f"LiDAR sweep: Up={up_str}, Mid={mid_str}, Down={down_str}. Arm returned to UP."

        return [
            sense, move_toward, move_timed, turn_degrees, stop,
            set_servo, set_leds, arm_up, arm_down, clamp_close, clamp_open, lidar_sweep
        ]

    async def process_audio(self, audio_base64: str, mime_type: str = "audio/webm") -> dict:
        """Process audio and return result with optional TTS audio.

        Args:
            audio_base64: Base64-encoded audio from browser
            mime_type: Audio MIME type (default: audio/webm)

        Returns:
            dict with keys: user_text, assistant_text, audio (base64 wav)
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
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
                ]
            )
            user_text = stt_response.text.strip()
            if not user_text:
                result["assistant_text"] = "I didn't catch that. Please try again."
                return result

            result["user_text"] = user_text
        except Exception as e:
            print(f"STT error: {e}")
            result["assistant_text"] = f"Speech recognition failed: {e}"
            return result

        # Emergency stop fast-path
        if any(w in user_text.lower() for w in ("stop", "halt", "freeze", "emergency")):
            self.robot.stop()
            result["assistant_text"] = "Emergency stop executed."
            result["audio"] = await self._generate_tts("Emergency stop executed.")
            return result

        # Step 2: Process with ADK agent
        try:
            # Build environment context with all sensors
            env = self._build_environment_context()
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
            env = self._build_environment_context()
            prompt = f"[ENV] {env}\n[COMMAND] {text}"

            emit(AgentEvent("env", env))
            emit(AgentEvent("prompt", prompt))

            response_text = ""

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
                    # TTS returns raw PCM - convert to WAV for browser playback
                    pcm_data = part.inline_data.data
                    wav_data = pcm_to_wav(pcm_data)
                    return base64.b64encode(wav_data).decode()

            return None

        except Exception as e:
            print(f"TTS error: {e}")
            return None
