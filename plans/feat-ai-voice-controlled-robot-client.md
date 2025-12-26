# feat: AI-Powered Voice-Controlled Robot Client

**Date:** 2025-12-26
**Type:** Enhancement
**Complexity:** Medium
**Estimated Effort:** Single implementation phase (demo project)

---

## Overview

Add **AI Mode** to the Freenove Tank Robot - a new operating mode (alongside M-Free, M-Sonic, M-Line) that transforms the robot into an **intelligent agent** powered by Gemini 3 Flash.

### Core Architecture: Sense-Think-Act Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    AI MODE CORE LOOP                        │
│                                                             │
│   ┌─────────┐    ┌──────────────┐    ┌─────────────────┐   │
│   │  SENSE  │───▶│    THINK     │───▶│      ACT        │   │
│   │         │    │              │    │                 │   │
│   │ Camera  │    │ Gemini 3.0   │    │ Motors/Servos   │   │
│   │ Ultras. │    │ Flash        │    │ LEDs/Clamp      │   │
│   │ Status  │    │              │    │                 │   │
│   └─────────┘    └──────────────┘    └─────────────────┘   │
│        ▲                                      │             │
│        └──────────────────────────────────────┘             │
│              (sense again after every action)               │
└─────────────────────────────────────────────────────────────┘
```

**Key Design Principles:**
1. **Continuous Environmental Awareness** - ALL sensor readings + camera frame included in EVERY prompt to the agent
2. **Sense-Act-Sense Loop** - After every action, automatically sense environment
3. **Voice I/O via Gemini 2.5** - STT/TTS only, all reasoning by Gemini 3.0
4. **Agent has FULL robot control** - Movement, servos, LEDs, clamp
5. **Emergency Fast-Path** - "Stop/halt/emergency" bypasses LLM for instant response (<100ms)
6. **Hard-Coded Safety Layer** - Distance checks OUTSIDE LLM control (prevents prompt injection)
7. **Chat UI with Push-to-Talk** - Visual transcript, button-based voice input, auto-TTS response

### 2-Agent Architecture

| Model | Role | What It Does |
|-------|------|--------------|
| **Gemini 2.5 Native Audio** | Voice I/O | STT (speech→text), TTS (text→speech) ONLY |
| **Gemini 3 Flash** | Robot Brain | Reasoning, planning, tool execution, vision analysis |

**CRITICAL:** Every call to the Robot Brain (Gemini 3) includes:
- Current ultrasonic distance
- Current camera frame (base64 JPEG)
- Robot connection status
- Last action result

---

## Problem Statement

The robot requires manual keyboard/mouse control. AI Mode enables autonomous, intelligent behavior with voice interaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PyQt5 Client Application                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         Voice Agent (Gemini 2.5 Native Audio)           │   │
│   │         model: gemini-2.5-flash-native-audio-preview    │   │
│   ├─────────────────────────────────────────────────────────┤   │
│   │  • Real-time STT/TTS via Live API                       │   │
│   │  • Listens to user, speaks responses                    │   │
│   │  • Calls robot_command() with user's speech             │   │
│   │                                                         │   │
│   │  Tools: [robot_command]                                 │   │
│   └──────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         robot_command() - SENSOR INJECTION LAYER        │   │
│   ├─────────────────────────────────────────────────────────┤   │
│   │  1. EMERGENCY CHECK: "stop/halt/emergency" → fast-path  │   │
│   │     (bypasses LLM, executes stop() immediately)         │   │
│   │                                                         │   │
│   │  2. Capture current environment state:                  │   │
│   │     • Ultrasonic distance (cm)                          │   │
│   │     • Camera frame (320x240 JPEG, quality 50)           │   │
│   │     • Robot connection status                           │   │
│   │                                                         │   │
│   │  3. Build prompt with sensor context + user command     │   │
│   │                                                         │   │
│   │  4. Call Robot Brain (Gemini 3 Flash) with 10s timeout  │   │
│   │                                                         │   │
│   │  5. Tool execution passes through SAFETY LAYER          │   │
│   │                                                         │   │
│   │  6. SENSE AGAIN after action (0.2s async)               │   │
│   └──────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         Robot Brain (Gemini 3 Flash)                    │   │
│   │         model: gemini-3-flash-preview                   │   │
│   ├─────────────────────────────────────────────────────────┤   │
│   │  RECEIVES (every call):                                 │   │
│   │  • [ENVIRONMENT] ultrasonic, camera, status             │   │
│   │  • [COMMAND] user's voice command                       │   │
│   │                                                         │   │
│   │  CAPABILITIES (tools):                                  │   │
│   │  • Movement: forward, backward, turn_left, turn_right   │   │
│   │  • Servos: pan (ch0), tilt (ch1)                        │   │
│   │  • Clamp: up, down, stop                                │   │
│   │  • LEDs: RGB color control                              │   │
│   │  • stop() - emergency halt                              │   │
│   └──────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│   ┌──────────────────────────┴──────────────────────────────┐   │
│   │                  TCP Client (Video.py)                   │   │
│   │  Commands: CMD_MOTOR, CMD_SERVO, CMD_ACTION, CMD_LED    │   │
│   │  Sensors:  CMD_SONIC responses, video stream            │   │
│   └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │ TCP (5003 commands, 8003 video)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Raspberry Pi Robot Server                     │
│   Motors │ Servos │ Ultrasonic │ Camera │ LEDs │ Clamp         │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design:**
1. Voice Agent (2.5) handles audio I/O ONLY
2. `robot_command()` injects sensor state into EVERY prompt
3. Robot Brain (3.0) always sees environment + command
4. Automatic sense-after-act ensures continuous awareness

---

## Client-Robot Communication Architecture

### Where Gemini Runs

**Gemini runs on the CLIENT (Mac/Windows), NOT on the robot.**

```
┌─────────────────────────────────────────────────────────────────┐
│                  YOUR COMPUTER (Mac/Windows)                    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  PyQt5 Client App                                       │   │
│   │                                                         │   │
│   │   ┌───────────────┐    ┌───────────────────────────┐   │   │
│   │   │ Gemini Agents │    │    TCP Client (Video.py)  │   │   │
│   │   │ (google-adk)  │───▶│    - sendData()           │   │   │
│   │   │               │◀───│    - recvData()           │   │   │
│   │   └───────────────┘    └───────────────────────────┘   │   │
│   │          │                         │                    │   │
│   │          │ API calls               │ TCP/IP             │   │
│   │          ▼                         ▼                    │   │
│   │   ┌─────────────┐          ┌─────────────┐             │   │
│   │   │ Google API  │          │  WiFi/LAN   │             │   │
│   │   │ (Internet)  │          │  (Local)    │             │   │
│   │   └─────────────┘          └─────────────┘             │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                         │
                                         │ TCP (Port 5003 commands, 8003 video)
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI (Robot)                         │
│                                                                 │
│   ┌───────────────────────────────────────────────────────┐     │
│   │  Server (main.py)                                     │     │
│   │  - Receives commands, sends sensor data               │     │
│   │  - Controls motors, servos, LEDs                      │     │
│   │  - Streams camera video                               │     │
│   └───────────────────────────────────────────────────────┘     │
│                              │                                   │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │
│   │Motors│ │Servos│ │Sonic │ │LiDAR │ │Camera│                 │
│   └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Commands (Agent → Robot)

```
1. User says: "Move forward"
2. Voice Agent (2.5) converts speech → text
3. Voice Agent delegates to Main Agent (3.0) via AgentTool
4. Main Agent calls tool: move_forward(speed=2000)
5. Tool function executes:
   tcp_client.sendData("CMD_MOTOR#2000#2000\n")
6. TCP sends command over WiFi to robot
7. Robot server parses command, sets motor speed
8. Robot moves forward
9. Tool returns: "Moving forward at speed 2000"
10. Main Agent returns result to Voice Agent
11. Voice Agent converts text → speech
12. User hears: "Moving forward"
```

### Data Flow: Sensors (Robot → Agent)

**Challenge:** Sensor data is ASYNC. Robot sends data whenever it has it, not on-demand.

**Solution:** SensorDataManager - background thread that caches all incoming sensor data.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ SensorDataManager (new component)                       │   │
│   │                                                         │   │
│   │   ┌─────────────────┐     ┌────────────────────────┐   │   │
│   │   │  Receive Thread │     │    Sensor Cache        │   │   │
│   │   │  (runs always)  │────▶│  ultrasonic: 42.5 cm   │   │   │
│   │   │                 │     │  lidar: 38.2 cm        │   │   │
│   │   │  Parses:        │     │  last_action: "done"   │   │   │
│   │   │  CMD_SONIC#42.5 │     │  timestamp: 1703...    │   │   │
│   │   │  CMD_ACTION#10  │     └────────────────────────┘   │   │
│   │   └─────────────────┘              │                    │   │
│   │                                    │ read               │   │
│   │                                    ▼                    │   │
│   │   ┌─────────────────────────────────────────────────┐   │   │
│   │   │ Agent Tool: read_distance()                     │   │   │
│   │   │                                                 │   │   │
│   │   │ # Reads cached value (instant, no TCP wait)     │   │   │
│   │   │ return f"Ultrasonic: {cache.ultrasonic}cm"      │   │   │
│   │   └─────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Camera (Robot → Agent)

```
1. Robot streams JPEG frames continuously (port 8003)
2. Client receives frames in video thread (already exists in Video.py)
3. Latest frame stored in global variable
4. Agent tool get_camera_frame():
   - Grabs latest frame
   - Encodes to base64 JPEG
   - Returns to Main Agent (3.0)
5. Main Agent analyzes image (multimodal vision)
6. Returns description: "I see a red ball 1 meter ahead"
```

### TCP Protocol Reference

| Command | Format | Response | Description |
|---------|--------|----------|-------------|
| **Motor** | `CMD_MOTOR#left#right\n` | None | Set wheel speeds (-4095 to 4095) |
| **Servo** | `CMD_SERVO#channel#angle\n` | None | Move servo (ch 0-1, angle 90-150) |
| **LED** | `CMD_LED#mode#R#G#B#mask\n` | None | Set LED colors |
| **Ultrasonic** | `CMD_SONIC#\n` | `CMD_SONIC#42.5` | Request distance reading |
| **Mode** | `CMD_MODE#mode\n` | None | Set mode (0=move, 1=sonar, 2=infrared) |
| **Action** | `CMD_ACTION#action\n` | `CMD_ACTION#0/10/20` | Clamp control (0=stop, 1=up, 2=down) |

---

## Implementation

**Goal:** Working AI Mode with chat UI, push-to-talk voice control, sense-think-act loop, and safety features

### Files

```
Code/Client/
├── ai_mode.py              # NEW: AI Mode with push-to-talk + safety (~320 LOC)
├── Main.py                 # MODIFY: Add AI Mode + Chat UI (~120 LOC)
└── requirements.txt        # NEW: Dependencies
```

### ai_mode.py (~320 LOC)

```python
"""AI Mode - Intelligent robot control with Gemini 3 Flash.

Architecture:
- Voice Agent (Gemini 2.5) - STT/TTS via Live API with push-to-talk
- robot_command() - Sensor injection layer with emergency fast-path
- Robot Brain (Gemini 3 Flash) - Reasoning, vision, tool execution
- Hard-coded safety layer - Distance checks OUTSIDE LLM control

Safety features:
- Thread-safe TCP commands (prevents corruption)
- Stale sensor fail-safe (blocks forward if no reading)
- Emergency fast-path (bypasses LLM for instant stop)
- Hard-coded distance check (cannot be overridden by LLM)

EVERY call to Robot Brain includes: ultrasonic distance, camera frame, robot status
"""
import os
import time
import asyncio
import base64
import threading
from enum import Enum
from typing import Optional, Callable
import cv2
from dotenv import load_dotenv

from google import genai
from google.adk.agents import Agent
from google.adk.runner import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai import types

load_dotenv()

# ============================================================
# Configuration
# ============================================================

ULTRASONIC_STALE_THRESHOLD = 2.0  # seconds before reading is stale
SAFETY_DISTANCE_BLOCK = 15  # cm - hard block forward movement
SAFETY_DISTANCE_WARN = 30  # cm - warn but allow
API_TIMEOUT = 10.0  # seconds for LLM calls
EMERGENCY_WORDS = {"stop", "halt", "freeze", "emergency"}  # fast-path triggers

# ============================================================
# AI State - For UI feedback
# ============================================================

class AIState(Enum):
    READY = "ready"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"

# ============================================================
# Sensor Cache - Simple dict + lock
# ============================================================

_sensors = {}  # {"ultrasonic": (value, timestamp), "clamp": (status, timestamp)}
_sensor_lock = threading.Lock()

def update_sensor(key: str, value):
    """Thread-safe sensor update."""
    with _sensor_lock:
        _sensors[key] = (value, time.time())

def get_sensor(key: str) -> tuple:
    """Returns (value, age_seconds) or (None, 0) if not found."""
    with _sensor_lock:
        if key not in _sensors:
            return None, 0
        value, ts = _sensors[key]
        return value, time.time() - ts

def parse_robot_message(message: str):
    """Parse incoming robot messages and update sensor cache."""
    parts = message.strip().split("#")
    if len(parts) < 2:
        return
    cmd = parts[0]
    if cmd == "CMD_SONIC":
        try:
            update_sensor("ultrasonic", float(parts[1]))
        except ValueError:
            pass
    elif cmd == "CMD_ACTION":
        status_map = {"0": "stopped", "10": "up_complete", "20": "down_complete"}
        update_sensor("clamp", status_map.get(parts[1], "unknown"))

# ============================================================
# Video Frame - Thread-safe with lock
# ============================================================

_video_frame = None
_frame_lock = threading.Lock()
_tcp_client = None
_tcp_lock = threading.Lock()  # Thread-safe TCP commands

def set_tcp_client(client):
    global _tcp_client
    _tcp_client = client

def set_video_frame(frame):
    """Thread-safe frame update with defensive copy."""
    global _video_frame
    with _frame_lock:
        _video_frame = frame.copy() if frame is not None else None

def _encode_frame_small() -> Optional[str]:
    """Encode frame as small JPEG (320x240, quality 50) for API efficiency."""
    with _frame_lock:
        if _video_frame is None:
            return None
        frame = _video_frame.copy()
    # Encode outside lock to minimize lock time
    try:
        small = cv2.resize(frame, (320, 240))
        _, buf = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 50])
        return base64.b64encode(buf).decode()
    except Exception:
        return None

def is_connected() -> bool:
    return _tcp_client is not None and getattr(_tcp_client, 'connect_Flag', False)

# ============================================================
# Robot Actions with Hard-Coded Safety Layer
# ============================================================

def _send_command(cmd: str):
    """Thread-safe command send to robot via TCP."""
    if _tcp_client and is_connected():
        with _tcp_lock:  # Prevent command corruption from multiple threads
            _tcp_client.sendData(cmd)

def _request_sensor_update():
    """Request fresh ultrasonic reading."""
    _send_command("CMD_SONIC#\n")

def _schedule_sense():
    """Request fresh sensor reading after action."""
    _request_sensor_update()  # Direct call - simpler than async scheduling

def move_forward(speed: int = 2000) -> str:
    """Move robot forward. HARD-CODED SAFETY: blocks if distance < 15cm or no reading."""
    if not is_connected():
        return "ERROR: Robot not connected"

    # HARD-CODED SAFETY CHECK - Cannot be overridden by LLM/prompt injection
    distance, age = get_sensor("ultrasonic")

    # FAIL-SAFE: Block if no reading OR stale reading
    if distance is None or age > ULTRASONIC_STALE_THRESHOLD:
        return "BLOCKED: No reliable distance reading - cannot move forward safely"

    if distance < SAFETY_DISTANCE_BLOCK:
        return f"BLOCKED: Obstacle at {distance:.1f}cm - too close to move forward safely"

    speed = max(0, min(2500, abs(speed)))
    _send_command(f"CMD_MOTOR#{speed}#{speed}\n")
    _schedule_sense()

    if distance < SAFETY_DISTANCE_WARN:
        return f"Moving forward CAUTIOUSLY at speed {speed} (obstacle at {distance:.1f}cm)"
    return f"Moving forward at speed {speed}"

def move_backward(speed: int = 2000) -> str:
    """Move robot backward."""
    if not is_connected():
        return "ERROR: Robot not connected"
    speed = max(0, min(2500, abs(speed)))
    _send_command(f"CMD_MOTOR#{-speed}#{-speed}\n")
    _schedule_sense()
    return f"Moving backward at speed {speed}"

def turn_left(speed: int = 1500) -> str:
    """Turn robot left (counterclockwise)."""
    if not is_connected():
        return "ERROR: Robot not connected"
    speed = max(0, min(2500, abs(speed)))
    _send_command(f"CMD_MOTOR#{-speed}#{speed}\n")
    _schedule_sense()
    return f"Turning left at speed {speed}"

def turn_right(speed: int = 1500) -> str:
    """Turn robot right (clockwise)."""
    if not is_connected():
        return "ERROR: Robot not connected"
    speed = max(0, min(2500, abs(speed)))
    _send_command(f"CMD_MOTOR#{speed}#{-speed}\n")
    _schedule_sense()
    return f"Turning right at speed {speed}"

def stop() -> str:
    """EMERGENCY STOP - halt all movement immediately."""
    _send_command("CMD_MOTOR#0#0\n")  # Always try to stop, even if "not connected"
    return "STOPPED"

def set_servo(channel: int, angle: int) -> str:
    """Set servo position. channel: 0=pan, 1=tilt. angle: 90-150."""
    if not is_connected():
        return "ERROR: Robot not connected"
    channel = max(0, min(1, channel))
    angle = max(90, min(150, angle))
    _send_command(f"CMD_SERVO#{channel}#{angle}\n")
    return f"Servo {'pan' if channel == 0 else 'tilt'} set to {angle}°"

def set_leds(r: int, g: int, b: int) -> str:
    """Set LED color (RGB 0-255 each)."""
    if not is_connected():
        return "ERROR: Robot not connected"
    r, g, b = [max(0, min(255, c)) for c in (r, g, b)]
    _send_command(f"CMD_LED#1#{r}#{g}#{b}#15\n")
    return f"LEDs set to RGB({r},{g},{b})"

def clamp_up() -> str:
    """Raise/open the clamp."""
    if not is_connected():
        return "ERROR: Robot not connected"
    _send_command("CMD_ACTION#1\n")
    return "Clamp moving up"

def clamp_down() -> str:
    """Lower/close the clamp."""
    if not is_connected():
        return "ERROR: Robot not connected"
    _send_command("CMD_ACTION#2\n")
    return "Clamp moving down"

def clamp_stop() -> str:
    """Stop clamp movement."""
    if not is_connected():
        return "ERROR: Robot not connected"
    _send_command("CMD_ACTION#0\n")
    return "Clamp stopped"

ROBOT_TOOLS = [
    move_forward, move_backward, turn_left, turn_right, stop,
    set_servo, set_leds, clamp_up, clamp_down, clamp_stop,
]

# ============================================================
# Robot Brain - Gemini 3 Flash
# ============================================================

ROBOT_BRAIN_INSTRUCTION = """You are the intelligent brain of a tank robot.

## ENVIRONMENT (provided every message)
- Distance: ultrasonic cm (obstacles!)
- Camera: current view
- Clamp: gripper state

## TOOLS
Movement: move_forward(speed), move_backward(speed), turn_left(speed), turn_right(speed), stop()
Servos: set_servo(channel, angle) - 0=pan, 1=tilt, 90-150°
LEDs: set_leds(r, g, b) - 0-255
Clamp: clamp_up(), clamp_down(), clamp_stop()

## SAFETY (enforced by system, but you should also follow)
- distance < 15cm: forward movement blocked
- distance < 30cm: move cautiously
- No sensor reading: forward movement blocked
- "stop/halt/emergency": instant stop

## STYLE
Be CONCISE. "Moving forward" not "I am now executing..."
"""

_robot_brain: Optional[Agent] = None
_brain_runner: Optional[Runner] = None

def _ensure_brain_initialized():
    """Lazy initialization of Robot Brain."""
    global _robot_brain, _brain_runner
    if _robot_brain is None:
        _robot_brain = Agent(
            model="gemini-3-flash-preview",
            name="robot_brain",
            instruction=ROBOT_BRAIN_INSTRUCTION,
            tools=ROBOT_TOOLS
        )
        _brain_runner = Runner(
            agent=_robot_brain,
            app_name="robot_brain",
            session_service=InMemorySessionService()
        )

# ============================================================
# robot_command() - SENSOR INJECTION + EMERGENCY FAST-PATH
# ============================================================

async def robot_command(user_command: str) -> str:
    """Process command with full environment context.

    CRITICAL FLOW:
    1. EMERGENCY CHECK - "stop/halt/emergency" bypasses LLM entirely (<100ms)
    2. Capture environment (sensors + small camera frame)
    3. Call Robot Brain with 10s timeout
    4. Return response
    """
    # 1. EMERGENCY FAST-PATH - Bypass LLM for instant response
    cmd_lower = user_command.lower()
    if any(word in cmd_lower for word in EMERGENCY_WORDS):
        result = stop()
        return f"Emergency stop executed: {result}"

    _ensure_brain_initialized()

    # 2. Capture environment
    distance, dist_age = get_sensor("ultrasonic")
    clamp, _ = get_sensor("clamp")
    frame_b64 = _encode_frame_small()

    # Build environment context
    env_lines = ["[ENVIRONMENT]"]
    if not is_connected():
        env_lines.append("Robot: DISCONNECTED")
    else:
        env_lines.append("Robot: Connected")
        if distance is not None:
            stale = f" (stale {dist_age:.1f}s)" if dist_age > ULTRASONIC_STALE_THRESHOLD else ""
            warn = " DANGER!" if distance < 15 else (" CAUTION" if distance < 30 else "")
            env_lines.append(f"Distance: {distance:.1f}cm{stale}{warn}")
        else:
            env_lines.append("Distance: No reading (forward blocked)")
        env_lines.append(f"Camera: {'attached' if frame_b64 else 'unavailable'}")
        if clamp:
            env_lines.append(f"Clamp: {clamp}")

    prompt = "\n".join(env_lines) + f"\n\n[COMMAND]\n{user_command}"

    # 3. Build content (text + optional image)
    parts = [types.Part.from_text(prompt)]
    if frame_b64:
        parts.append(types.Part.from_bytes(
            data=base64.b64decode(frame_b64),
            mime_type="image/jpeg"
        ))

    # 4. Call Robot Brain with timeout
    try:
        response = await asyncio.wait_for(
            _brain_runner.run_async(
                user_id="user",
                session_id="ai_mode",
                new_message=types.Content(role="user", parts=parts)
            ),
            timeout=API_TIMEOUT
        )
        if response and response.content and response.content.parts:
            return response.content.parts[0].text
        return "Command processed."
    except asyncio.TimeoutError:
        return "Sorry, I'm taking too long to respond. Please try again."
    except Exception as e:
        return f"Error: {e}"

# ============================================================
# Voice Agent - Gemini 2.5 Native Audio (STT/TTS only)
# ============================================================

VOICE_AGENT_INSTRUCTION = """Voice interface for robot. Your ONLY job:
1. Listen (STT)
2. Call robot_command() with user's words
3. Speak response (TTS)

Do NOT reason. Just relay to robot_command().
"""

def create_voice_agent() -> Agent:
    return Agent(
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        name="voice_interface",
        instruction=VOICE_AGENT_INSTRUCTION,
        tools=[robot_command]
    )

# ============================================================
# AI Mode Session - Push-to-Talk Voice Control
# ============================================================

class AIModeSession:
    """Manages AI Mode voice session with push-to-talk."""

    def __init__(self):
        self.runner: Optional[Runner] = None
        self.state = AIState.READY
        self.on_state_change: Optional[Callable[[AIState], None]] = None
        self.on_transcript: Optional[Callable[[str, str], None]] = None
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def _set_state(self, state: AIState):
        """Update state and notify callback."""
        self.state = state
        if self.on_state_change:
            self.on_state_change(state)

    def _emit_transcript(self, role: str, text: str):
        """Emit transcript to callback."""
        if self.on_transcript:
            self.on_transcript(role, text)

    def initialize(self) -> bool:
        """Initialize with API key from .env file."""
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            print("ERROR: GOOGLE_API_KEY not found in .env")
            return False
        try:
            genai.configure(api_key=api_key)
            self.runner = Runner(
                agent=create_voice_agent(),
                app_name="ai_mode",
                session_service=InMemorySessionService()
            )
            return True
        except Exception as e:
            print(f"Failed to initialize AI Mode: {e}")
            return False

    def start_listening(self):
        """Called when user presses talk button."""
        if self.state != AIState.READY:
            return
        self._set_state(AIState.LISTENING)
        # Audio capture starts - handled by Live API

    def stop_listening(self):
        """Called when user releases talk button."""
        if self.state != AIState.LISTENING:
            return
        self._set_state(AIState.THINKING)
        # Audio capture stops, API processes command

    async def _run_session(self):
        """Run voice session with Live API."""
        config = RunConfig(
            streaming_mode=StreamingMode.BIDI,
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
                )
            ),
            input_audio_transcription={},
            output_audio_transcription={}
        )
        try:
            async for event in self.runner.run_live(
                user_id="user", session_id="ai_mode", run_config=config
            ):
                sc = getattr(event, 'server_content', None)
                if sc:
                    if sc.input_transcription:
                        self._emit_transcript("user", sc.input_transcription.text)
                    if sc.output_transcription:
                        self._set_state(AIState.SPEAKING)
                        self._emit_transcript("robot", sc.output_transcription.text)
                    # Check if response complete
                    if getattr(sc, 'turn_complete', False):
                        self._set_state(AIState.READY)
        except Exception as e:
            print(f"AI Mode error: {e}")
            self._set_state(AIState.READY)

    def start(self):
        """Start AI Mode in background thread."""
        def run():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._loop.run_until_complete(self._run_session())
            self._loop.close()
        self._thread = threading.Thread(target=run, daemon=True, name="AI-Voice")
        self._thread.start()

    def stop(self):
        """Stop AI Mode."""
        self._set_state(AIState.READY)
        if self._thread:
            self._thread.join(timeout=2.0)
```

### Main.py Changes (~120 LOC additions)

```python
# === ADD IMPORTS (near top) ===
from PyQt5.QtWidgets import QTextEdit, QFrame, QVBoxLayout, QLabel
from PyQt5.QtCore import Qt

try:
    from ai_mode import (
        AIModeSession, AIState, set_tcp_client, set_video_frame, parse_robot_message
    )
    AI_MODE_AVAILABLE = True
except ImportError:
    AI_MODE_AVAILABLE = False
    print("AI Mode not available. Install: pip install google-adk google-genai python-dotenv pyaudio")

# === ADD IN __init__ (after other mode buttons) ===

# AI Mode button (4th mode alongside M-Free, M-Sonic, M-Line)
self.Btn_Mode4 = QRadioButton("M-AI")
self.Btn_Mode4.setChecked(False)
self.Btn_Mode4.toggled.connect(lambda: self.on_btn_Mode(self.Btn_Mode4))

# AI Chat Panel (hidden until M-AI mode selected)
self.ai_panel = QFrame()
self.ai_panel.setFrameStyle(QFrame.StyledPanel)
self.ai_panel.setMinimumWidth(320)
self.ai_panel.setVisible(False)

# Chat transcript display
self.ai_transcript = QTextEdit()
self.ai_transcript.setReadOnly(True)
self.ai_transcript.setPlaceholderText("Select M-AI mode and hold the button to talk to your robot...")

# Status indicator
self.ai_status = QLabel("Ready")
self.ai_status.setAlignment(Qt.AlignCenter)
self.ai_status.setStyleSheet("font-weight: bold; padding: 5px;")

# Push-to-talk button
self.btn_talk = QPushButton("🎤 Hold to Talk")
self.btn_talk.setMinimumHeight(50)
self.btn_talk.pressed.connect(self.on_talk_pressed)
self.btn_talk.released.connect(self.on_talk_released)
self.btn_talk.setEnabled(False)

# Layout for AI panel
ai_layout = QVBoxLayout(self.ai_panel)
ai_layout.addWidget(QLabel("<b>🤖 AI Assistant</b>"))
ai_layout.addWidget(self.ai_transcript, stretch=1)
ai_layout.addWidget(self.ai_status)
ai_layout.addWidget(self.btn_talk)

# Add AI panel to main layout (adjust based on your layout structure)
# self.main_layout.addWidget(self.ai_panel)  # Uncomment and adjust

# AI Mode session
self.ai_session = None
if AI_MODE_AVAILABLE:
    self.ai_session = AIModeSession()

# === ADD PUSH-TO-TALK HANDLERS ===

def on_talk_pressed(self):
    """User pressed talk button - start listening."""
    if self.ai_session and self.ai_session.state == AIState.READY:
        self.ai_session.start_listening()

def on_talk_released(self):
    """User released talk button - process command."""
    if self.ai_session and self.ai_session.state == AIState.LISTENING:
        self.ai_session.stop_listening()

def on_ai_state_change(self, state: AIState):
    """Update UI based on AI state."""
    ui_states = {
        AIState.READY: ("🎤 Hold to Talk", "Ready", True, "background-color: #e8f5e9;"),
        AIState.LISTENING: ("🎤 Listening...", "Listening...", False, "background-color: #fff3e0;"),
        AIState.THINKING: ("⏳ Processing...", "Thinking...", False, "background-color: #e3f2fd;"),
        AIState.SPEAKING: ("🔊 Speaking...", "Robot speaking...", False, "background-color: #f3e5f5;"),
    }
    btn_text, status_text, enabled, style = ui_states.get(
        state, ("🎤 Hold to Talk", "Ready", True, "")
    )
    self.btn_talk.setText(btn_text)
    self.ai_status.setText(status_text)
    self.ai_status.setStyleSheet(f"font-weight: bold; padding: 5px; {style}")
    self.btn_talk.setEnabled(enabled)

def on_ai_transcript(self, role: str, text: str):
    """Add message to chat transcript."""
    if role == "user":
        self.ai_transcript.append(f"<p style='color: #1565c0;'><b>You:</b> {text}</p>")
    else:
        self.ai_transcript.append(f"<p style='color: #2e7d32;'><b>Robot:</b> {text}</p>")
    # Auto-scroll to bottom
    scrollbar = self.ai_transcript.verticalScrollBar()
    scrollbar.setValue(scrollbar.maximum())

# === ADD AI MODE CONTROL METHODS ===

def start_ai_mode(self):
    """Start AI Mode - intelligent voice-controlled robot."""
    if not AI_MODE_AVAILABLE:
        print("AI Mode not available")
        return False

    if not self.ai_session.initialize():
        print("Failed to initialize AI Mode. Check .env for GOOGLE_API_KEY")
        return False

    # Wire up callbacks for UI updates
    self.ai_session.on_state_change = self.on_ai_state_change
    self.ai_session.on_transcript = self.on_ai_transcript

    # Set up TCP client for AI
    set_tcp_client(self.TCP)
    self.ai_session.start()
    self.btn_talk.setEnabled(True)
    self.ai_transcript.append("<p><i>AI Mode started. Hold the button and speak to control your robot!</i></p>")
    print("AI Mode STARTED")
    return True

def stop_ai_mode(self):
    """Stop AI Mode."""
    if self.ai_session:
        self.ai_session.stop()
        self.btn_talk.setEnabled(False)
        print("AI Mode STOPPED")

# === MODIFY on_btn_Mode (add M-AI case + panel visibility) ===

def on_btn_Mode(self, Mode):
    # Hide AI panel for non-AI modes
    if Mode.text() != "M-AI":
        self.ai_panel.setVisible(False)
        self.stop_ai_mode()

    if Mode.text() == "M-Free":
        if Mode.isChecked():
            self.TCP.sendData(cmd.CMD_MODE + self.intervalChar + '0' + self.endChar)
    elif Mode.text() == "M-Sonic":
        if Mode.isChecked():
            self.TCP.sendData(cmd.CMD_MODE + self.intervalChar + '1' + self.endChar)
    elif Mode.text() == "M-Line":
        if Mode.isChecked():
            self.TCP.sendData(cmd.CMD_MODE + self.intervalChar + '2' + self.endChar)
    elif Mode.text() == "M-AI":
        if Mode.isChecked():
            self.ai_panel.setVisible(True)
            if not self.start_ai_mode():
                self.Btn_Mode1.setChecked(True)  # Fall back to M-Free
                self.ai_panel.setVisible(False)

# === MODIFY recvmassage() - feed sensor data to AI ===

def recvmassage(self):
    self.TCP.socket1_connect(self.h)
    restCmd = ""
    while True:
        Alldata = restCmd + str(self.TCP.recvData())
        restCmd = ""
        if Alldata == "":
            break
        else:
            cmdArray = Alldata.split("\n")
            if cmdArray[-1] != "":
                restCmd = cmdArray[-1]
                cmdArray = cmdArray[:-1]
        for oneCmd in cmdArray:
            # === CRITICAL: Feed ALL messages to AI sensor cache ===
            if AI_MODE_AVAILABLE:
                parse_robot_message(oneCmd)
            # === END CRITICAL ===

            # Existing UI updates...
            Massage = oneCmd.split("#")
            if cmd.CMD_SONIC in Massage:
                self.Ultrasonic.setText('Obstruction:%s cm' % Massage[1])
            # ... rest of existing code

# === MODIFY time() - feed video frames to AI ===

def time(self):
    try:
        if self.TCP.video_Flag == False:
            video = self.TCP.image
            # === CRITICAL: Feed video to AI for vision ===
            if AI_MODE_AVAILABLE:
                set_video_frame(video)
            # === END CRITICAL ===
            height, width, bytesPerComponent = video.shape
            # ... rest of existing code

# === MODIFY on_btn_Connect - set TCP client for AI ===

def on_btn_Connect(self):
    # ... existing code ...
    if self.Btn_Connect.text() == "Connect":
        # ... existing connection code ...
        self.Btn_Connect.setText("Disconnect")
        # Set TCP for AI Mode
        if AI_MODE_AVAILABLE:
            set_tcp_client(self.TCP)
    elif self.Btn_Connect.text() == "Disconnect":
        # Clear TCP for AI Mode
        if AI_MODE_AVAILABLE:
            set_tcp_client(None)
        # ... existing disconnect code ...
```

**Key Integration Points:**

1. **AI Chat Panel** - Visible only when M-AI mode selected, contains transcript + push-to-talk button
2. **Push-to-Talk** - `on_talk_pressed()` / `on_talk_released()` for voice control
3. **State Callbacks** - `on_ai_state_change()` updates button/status based on AI state
4. **Transcript Callbacks** - `on_ai_transcript()` displays conversation in chat window
5. **`parse_robot_message(oneCmd)`** - EVERY incoming message feeds the AI sensor cache
6. **`set_video_frame(video)`** - EVERY video frame feeds AI for vision analysis
7. **Mode switching** - Shows/hides AI panel and stops AI when switching modes

### requirements.txt

```
# Existing
PyQt5>=5.15.0
numpy>=1.21.0
opencv-python-headless>=4.5.0
Pillow>=9.0.0

# AI Voice Control
google-adk>=1.0.0
google-genai>=0.5.0
python-dotenv>=1.0.0
pyaudio>=0.2.13  # For microphone capture
```

---

## API Key Setup

**Simple approach:** `.env` file in `Code/Client/`

```bash
# Code/Client/.env
GOOGLE_API_KEY=your-key-here
```

Then just run:
```bash
python Main.py
```

Get key from: https://aistudio.google.com/apikey

**Note:** Add `.env` to `.gitignore` to avoid committing secrets.

---

## Acceptance Criteria

### Chat UI
- [ ] AI Chat panel visible when M-AI mode selected
- [ ] Chat panel hidden for other modes (M-Free, M-Sonic, M-Line)
- [ ] Transcript displays user messages ("You: ...")
- [ ] Transcript displays robot responses ("Robot: ...")
- [ ] Transcript auto-scrolls to latest message
- [ ] Push-to-talk button works (press to listen, release to process)
- [ ] Status indicator shows current state (Ready/Listening/Thinking/Speaking)
- [ ] Button disabled while processing/speaking
- [ ] Robot speaks responses automatically (TTS via Gemini 2.5)

### Core Functionality
- [ ] M-AI mode button in UI (4th mode alongside M-Free, M-Sonic, M-Line)
- [ ] Voice commands work: "Move forward", "Stop", "Turn left", "Turn right"
- [ ] Vision queries work: "What do you see?" - analyzes camera frame
- [ ] Distance queries work: "How far is the obstacle?" - uses cached sensor
- [ ] Servo control works: "Look left", "Tilt up"
- [ ] LED control works: "Turn lights red"
- [ ] Clamp control works: "Open gripper", "Close gripper"

### Sensor Integration (CRITICAL)
- [ ] **ALL prompts to Robot Brain include current ultrasonic distance**
- [ ] **ALL prompts to Robot Brain include current camera frame**
- [ ] Agent receives environment state BEFORE making decisions
- [ ] Sense-after-act: Fresh sensor reading after every movement action

### Safety (CRITICAL - Hard-Coded, Cannot Be Bypassed)
- [ ] **Hard-coded safety**: `move_forward()` blocks when distance < 15cm (NOT controlled by LLM)
- [ ] **Stale sensor fail-safe**: `move_forward()` blocks when no sensor reading available
- [ ] **Emergency fast-path**: "stop/halt/freeze/emergency" executes instantly (<100ms), bypasses LLM
- [ ] **Thread-safe TCP**: Commands protected by lock to prevent corruption
- [ ] Agent warns when distance < 30cm
- [ ] `stop()` always attempts to halt, even if "not connected" (fail-safe)
- [ ] Video frame lock prevents race condition corruption
- [ ] API timeout (10s) prevents hanging on slow responses

### Error Handling
- [ ] Error shown if GOOGLE_API_KEY not set
- [ ] Works when robot disconnected (shows error via voice)
- [ ] Graceful fallback to M-Free mode on AI init failure

---

## Architecture Summary

| Component | Model | Purpose |
|-----------|-------|---------|
| Voice Agent | `gemini-2.5-flash-native-audio-preview-12-2025` | STT/TTS ONLY |
| Robot Brain | `gemini-3-flash-preview` | Reasoning, vision, tool execution |
| `robot_command()` | N/A (Python function) | **Sensor injection layer** - ensures every call includes environment state |

**Data Flow:**
```
User speaks → Voice Agent (2.5) → robot_command() → [Inject sensors+camera] → Robot Brain (3.0) → Tools → Robot
                                                                                          ↓
                                                                                   _sense_after_action()
```

---

## Future Enhancements (Post-MVP)

1. Wake word ("Hey Robot") - hands-free activation
2. Continuous listening mode (alternative to push-to-talk)
3. Transcript export/save to file
4. TLS encryption (for deployment on untrusted networks)
5. Autonomous patrol mode
6. Object tracking mode
7. Multi-language support

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **2-Agent Architecture** | Voice (2.5) + Brain (3.0) | 2.5 is only model with Live API; 3.0 has superior reasoning |
| **Sensor injection** | `robot_command()` wrapper | Ensures agent ALWAYS has environment context |
| **Emergency fast-path** | Bypass LLM for stop commands | <100ms response critical for safety |
| **Hard-coded safety** | Distance check in `move_forward()` | Cannot be overridden by prompt injection |
| **Stale sensor fail-safe** | Block if no reading | Safety even when sensor fails |
| **Thread-safe TCP** | Lock around sendData | Prevents command corruption from multiple threads |
| **Sense-after-act** | Direct sensor request | Simpler than async, same result |
| **Camera optimization** | 320x240, quality 50 | ~15KB payload vs ~80KB (5x smaller) |
| **API timeout** | 10 seconds | Prevents hanging, provides user feedback |
| **Frame lock** | `threading.Lock` on video | Prevents corruption during encoding |
| **Push-to-talk UI** | Hold button to speak | Clear user control, no false triggers |
| **Chat transcript** | QTextEdit panel | Visual feedback of conversation |
| **Mode integration** | M-AI (4th mode) | Consistent with M-Free/M-Sonic/M-Line |
| **Simple sensor cache** | dict + lock | No dataclass overhead, same safety |

---

*Plan created: 2025-12-26*
*Updated: Added Chat UI with push-to-talk, safety fixes (thread-safe TCP, stale sensor fail-safe), removed TLS (demo project)*
