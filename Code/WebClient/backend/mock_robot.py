"""Mock Robot Client for testing AI agent without hardware.

Drop-in replacement for RobotClient that logs commands to console.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class SensorData:
    ultrasonic: Optional[float] = None
    gripper_status: Optional[str] = None


class MockRobotClient:
    """Mock robot for testing AI agent without hardware."""

    def __init__(self, ultrasonic: float = 50.0, gripper: str = "stopped"):
        self._connected = True
        self._ip = "mock://test"
        self._sensors = SensorData(ultrasonic=ultrasonic, gripper_status=gripper)
        self._command_log: list[str] = []

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def ip(self) -> Optional[str]:
        return self._ip

    @property
    def sensors(self) -> SensorData:
        return self._sensors

    def set_ultrasonic(self, distance: float):
        """Test helper: set ultrasonic reading."""
        self._sensors.ultrasonic = distance

    def set_gripper(self, status: str):
        """Test helper: set gripper status."""
        self._sensors.gripper_status = status

    def set_connected(self, connected: bool):
        """Test helper: set connection state."""
        self._connected = connected

    def _log(self, cmd: str):
        self._command_log.append(cmd)
        print(f"  [MOCK] {cmd}")

    def get_command_log(self) -> list[str]:
        """Get all commands sent during this session."""
        return self._command_log.copy()

    def clear_log(self):
        """Clear command log."""
        self._command_log.clear()

    # Robot interface methods (match RobotClient exactly)
    def motor(self, left: int, right: int):
        """Set motor speeds. Range: -4095 to 4095"""
        left = max(-4095, min(4095, left))
        right = max(-4095, min(4095, right))
        self._log(f"CMD_MOTOR#{left}#{right}")

    def stop(self):
        """Stop all motors."""
        self._log("CMD_MOTOR#0#0")

    def servo(self, channel: int, angle: int):
        """Set servo angle. Channel: 0=pan, 1=tilt. Angle: 90-150"""
        angle = max(90, min(150, angle))
        self._log(f"CMD_SERVO#{channel}#{angle}")

    def led(self, mode: int, r: int, g: int, b: int, mask: int = 15):
        """Set LED color. Mode: 0=off, 1=on, 2-5=animations."""
        r = max(0, min(255, r))
        g = max(0, min(255, g))
        b = max(0, min(255, b))
        self._log(f"CMD_LED#{mode}#{r}#{g}#{b}#{mask}")

    def led_mode(self, mode: int):
        """Set LED animation mode."""
        self._log(f"CMD_LED_MOD#{mode}")

    def set_mode(self, mode: int):
        """Set robot mode. 0=free, 1=sonic, 2=line"""
        self._log(f"CMD_MODE#{mode}")

    def gripper(self, action: int):
        """Control gripper. 0=stop, 1=up, 2=down"""
        self._log(f"CMD_ACTION#{action}")

    def request_ultrasonic(self):
        """Request ultrasonic distance reading."""
        self._log("CMD_SONIC#")
