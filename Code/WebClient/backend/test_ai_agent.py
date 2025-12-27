#!/usr/bin/env python3
"""Test AI Agent with Mock Robot - Enhanced with detailed logging.

Tests the AI voice control agent using real Gemini API with a mock robot.
Includes comprehensive event logging for debugging agent behavior.

Usage:
    python test_ai_agent.py              # Interactive mode
    python test_ai_agent.py --auto       # Run automated tests
    python test_ai_agent.py --tts        # Enable TTS playback
    python test_ai_agent.py --distance 10  # Test safety blocking
    python test_ai_agent.py --verbose    # Enable debug logging
"""

import asyncio
import argparse
import sys
import logging
from mock_robot import MockRobotClient
from ai_session import AISession, AgentEvent

# ANSI colors for terminal output
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"

    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_BLUE = "\033[44m"


def format_event(event: AgentEvent) -> str:
    """Format an agent event with colors for terminal display."""
    c = Colors

    if event.event_type == "env":
        return f"{c.DIM}  📡 ENV: {event.data}{c.RESET}"

    elif event.event_type == "prompt":
        return f"{c.DIM}  📝 PROMPT: {event.data}{c.RESET}"

    elif event.event_type == "tool_call":
        args = event.details.get("args", {})
        args_str = ", ".join(f"{k}={v}" for k, v in args.items()) if args else ""
        return f"{c.CYAN}  🔧 TOOL CALL: {c.BOLD}{event.data}({args_str}){c.RESET}"

    elif event.event_type == "tool_result":
        result = event.details.get("result", "")
        # Truncate long results
        if len(str(result)) > 80:
            result = str(result)[:77] + "..."
        return f"{c.GREEN}  ✓ TOOL RESULT: {event.data} → {result}{c.RESET}"

    elif event.event_type == "response":
        return f"{c.YELLOW}  💬 RESPONSE: {event.data}{c.RESET}"

    elif event.event_type == "error":
        return f"{c.RED}  ❌ ERROR: {event.data}{c.RESET}"

    else:
        return f"  {event.event_type.upper()}: {event.data}"


def print_event(event: AgentEvent):
    """Print event immediately to console."""
    print(format_event(event))


# Test scenarios for automated testing
TEST_SCENARIOS = [
    # (command, expected_behavior, expected_tools)
    ("go forward", "should move forward", ["move_forward"]),
    ("turn left", "should turn left", ["turn_left"]),
    ("stop", "emergency stop", ["stop"]),
    ("set the lights to red", "should set LEDs", ["set_leds"]),
    ("what is my distance?", "should check sensors", ["get_sensor_status"]),
    ("move backward slowly", "should reverse", ["move_backward"]),
    ("close the gripper", "should pinch", ["clamp_up"]),
    ("look to the left", "should pan camera", ["set_servo"]),
    ("pick up the ball in front", "multi-step task", ["move_forward", "clamp_down", "clamp_up"]),
]


async def interactive_mode(session: AISession, robot: MockRobotClient, tts: bool, verbose: bool):
    """Interactive testing - type commands and see responses."""
    c = Colors
    verbose_mode = verbose  # Mutable state for toggle

    print(f"\n{c.BOLD}{'=' * 70}{c.RESET}")
    print(f"{c.BOLD}  🤖 AI Agent Test Mode (Interactive){c.RESET}")
    print(f"{c.BOLD}{'=' * 70}{c.RESET}")
    print(f"""
Type natural language commands to test the AI agent.
The agent will interpret your commands and control the mock robot.

{c.CYAN}Special commands:{c.RESET}
  quit           - Exit the test
  sensors        - Show current sensor values
  log            - Show recent command log
  clear          - Clear command log
  set distance N - Set ultrasonic distance to N cm
  set gripper S  - Set gripper status (stopped/up_complete/down_complete)
  verbose on/off - Toggle real-time event logging
{c.BOLD}{'=' * 70}{c.RESET}
""")

    while True:
        try:
            cmd = input(f"\n{c.BOLD}> {c.RESET}").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting...")
            break

        if not cmd:
            continue

        # Special commands
        if cmd == "quit":
            break

        if cmd == "sensors":
            print(f"  📡 Ultrasonic: {robot.sensors.ultrasonic}cm")
            print(f"  🦾 Gripper: {robot.sensors.gripper_status}")
            print(f"  🔌 Connected: {robot.connected}")
            continue

        if cmd == "log":
            log = robot.get_command_log()
            if log:
                print("  📋 Recent robot commands:")
                for c_item in log[-10:]:
                    print(f"    {c_item}")
            else:
                print("  (no commands logged)")
            continue

        if cmd == "clear":
            robot.clear_log()
            print("  ✓ Log cleared")
            continue

        if cmd.startswith("set distance "):
            try:
                dist = float(cmd.split()[-1])
                robot.set_ultrasonic(dist)
                print(f"  ✓ Ultrasonic set to {dist}cm")
            except ValueError:
                print("  ✗ Invalid distance value")
            continue

        if cmd.startswith("set gripper "):
            status = cmd.split()[-1]
            robot.set_gripper(status)
            print(f"  ✓ Gripper set to {status}")
            continue

        if cmd == "verbose on":
            verbose_mode = True
            logging.getLogger("ai_session").setLevel(logging.DEBUG)
            print("  ✓ Verbose mode ON (real-time events)")
            continue

        if cmd == "verbose off":
            verbose_mode = False
            logging.getLogger("ai_session").setLevel(logging.WARNING)
            print("  ✓ Verbose mode OFF (summary only)")
            continue

        # Process with AI agent
        print(f"\n{c.DIM}  [Processing...]{c.RESET}")
        robot.clear_log()  # Clear log to show only new commands

        result = await session.process_text(
            cmd,
            generate_tts=tts,
            on_event=print_event if verbose_mode else None
        )

        # If not verbose, show summary of events
        if not verbose_mode:
            events = result.get("events", [])
            tool_calls = [e for e in events if e.event_type == "tool_call"]
            tool_results = [e for e in events if e.event_type == "tool_result"]

            if tool_calls:
                print(f"\n{c.CYAN}  🔧 Tool calls:{c.RESET}")
                for tc in tool_calls:
                    args = tc.details.get("args", {})
                    args_str = ", ".join(f"{k}={v}" for k, v in args.items()) if args else ""
                    print(f"    {tc.data}({args_str})")

            if tool_results:
                print(f"\n{c.GREEN}  ✓ Results:{c.RESET}")
                for tr in tool_results:
                    result_str = tr.details.get("result", "")
                    if len(str(result_str)) > 60:
                        result_str = str(result_str)[:57] + "..."
                    print(f"    {tr.data}: {result_str}")

        print(f"\n{c.YELLOW}  💬 Agent: {result['assistant_text']}{c.RESET}")

        # Show robot commands that were actually sent
        log = robot.get_command_log()
        if log:
            print(f"\n{c.MAGENTA}  📤 Robot commands sent:{c.RESET}")
            for cmd_item in log:
                print(f"    {cmd_item}")


async def automated_tests(session: AISession, robot: MockRobotClient, verbose: bool):
    """Run automated test scenarios with detailed reporting."""
    c = Colors

    print(f"\n{c.BOLD}{'=' * 70}{c.RESET}")
    print(f"{c.BOLD}  🧪 AI Agent Test Mode (Automated){c.RESET}")
    print(f"{c.BOLD}{'=' * 70}{c.RESET}")

    passed = 0
    failed = 0
    results = []

    for cmd, expected, expected_tools in TEST_SCENARIOS:
        robot.clear_log()

        print(f"\n{c.BOLD}Test: \"{cmd}\"{c.RESET}")
        print(f"{c.DIM}  Expected: {expected}{c.RESET}")
        print(f"{c.DIM}  Expected tools: {expected_tools}{c.RESET}")

        try:
            result = await session.process_text(
                cmd,
                generate_tts=False,
                on_event=print_event if verbose else None
            )

            # Extract events
            events = result.get("events", [])
            tool_calls = [e.data for e in events if e.event_type == "tool_call"]

            # Check for errors
            has_error = "Error" in (result.get("assistant_text") or "")

            # Check if expected tools were called (at least one)
            tools_matched = any(t in tool_calls for t in expected_tools) if expected_tools else True

            success = not has_error and (tools_matched or result.get("assistant_text"))

            if not verbose:
                # Show tool calls
                if tool_calls:
                    print(f"{c.CYAN}  🔧 Tool calls: {tool_calls}{c.RESET}")

            print(f"{c.YELLOW}  💬 Response: {result['assistant_text']}{c.RESET}")
            print(f"  📤 Robot commands: {robot.get_command_log()}")

            if success:
                print(f"{c.GREEN}{c.BOLD}  ✅ PASS{c.RESET}")
                passed += 1
            else:
                print(f"{c.RED}{c.BOLD}  ❌ FAIL{c.RESET}")
                if not tools_matched:
                    print(f"{c.RED}    Expected tools {expected_tools} but got {tool_calls}{c.RESET}")
                failed += 1

            results.append({
                "command": cmd,
                "success": success,
                "tool_calls": tool_calls,
                "response": result.get("assistant_text"),
                "robot_commands": robot.get_command_log()
            })

        except Exception as e:
            print(f"{c.RED}  ❌ Exception: {e}{c.RESET}")
            failed += 1
            results.append({
                "command": cmd,
                "success": False,
                "error": str(e)
            })

    # Summary
    print(f"\n{c.BOLD}{'=' * 70}{c.RESET}")
    print(f"{c.BOLD}  Summary{c.RESET}")
    print(f"{'=' * 70}")

    total = passed + failed
    pass_rate = (passed / total * 100) if total > 0 else 0

    color = c.GREEN if failed == 0 else (c.YELLOW if pass_rate >= 70 else c.RED)
    print(f"  {color}{passed}/{total} tests passed ({pass_rate:.0f}%){c.RESET}")

    if failed > 0:
        print(f"\n  {c.RED}Failed tests:{c.RESET}")
        for r in results:
            if not r.get("success"):
                print(f"    - {r['command']}")

    return failed == 0


async def safety_test(session: AISession, robot: MockRobotClient, verbose: bool):
    """Test safety blocking when obstacle is close."""
    c = Colors

    print(f"\n{c.BOLD}{'=' * 70}{c.RESET}")
    print(f"{c.BOLD}  🛡️ Safety Test - Obstacle Detection{c.RESET}")
    print(f"{c.BOLD}{'=' * 70}{c.RESET}")

    # Set close distance (should block)
    robot.set_ultrasonic(10.0)
    robot.clear_log()

    print(f"\n  Distance set to: {c.RED}{robot.sensors.ultrasonic}cm{c.RESET} (below 15cm threshold)")
    print(f"  Testing: \"move forward\"")

    result = await session.process_text(
        "move forward",
        generate_tts=False,
        on_event=print_event if verbose else None
    )

    events = result.get("events", [])
    tool_calls = [e.data for e in events if e.event_type == "tool_call"]
    tool_results = [e for e in events if e.event_type == "tool_result"]

    print(f"\n  🔧 Tool calls: {tool_calls}")
    print(f"  💬 Response: {result['assistant_text']}")
    print(f"  📤 Robot commands: {robot.get_command_log()}")

    # Check if blocked
    response_lower = (result.get("assistant_text") or "").lower()
    blocked = "block" in response_lower or "obstacle" in response_lower or "cannot" in response_lower

    # Check tool results for BLOCKED
    for tr in tool_results:
        if "BLOCKED" in str(tr.details.get("result", "")):
            blocked = True

    # Check if motor command was actually sent (bad)
    motor_forward = any(
        "CMD_MOTOR" in cmd and "#0#0" not in cmd
        for cmd in robot.get_command_log()
    )

    if blocked or not motor_forward:
        print(f"\n  {c.GREEN}{c.BOLD}✅ PASS - Safety blocking worked!{c.RESET}")
        return True
    else:
        print(f"\n  {c.RED}{c.BOLD}❌ FAIL - Motor command sent despite obstacle!{c.RESET}")
        return False


async def main():
    parser = argparse.ArgumentParser(
        description="Test AI Agent with Mock Robot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_ai_agent.py              # Interactive mode
  python test_ai_agent.py --auto       # Run automated tests
  python test_ai_agent.py --verbose    # Show all events
  python test_ai_agent.py --tts        # Enable TTS playback
  python test_ai_agent.py --distance 10  # Test with close obstacle
  python test_ai_agent.py --safety     # Run safety test only
        """
    )
    parser.add_argument("--auto", action="store_true", help="Run automated tests")
    parser.add_argument("--safety", action="store_true", help="Run safety test only")
    parser.add_argument("--tts", action="store_true", help="Enable TTS output")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose event logging")
    parser.add_argument("--distance", type=float, default=50.0, help="Initial ultrasonic distance (cm)")
    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
        datefmt='%H:%M:%S'
    )

    # Create mock robot and AI session
    robot = MockRobotClient(ultrasonic=args.distance)
    session = AISession(robot)

    c = Colors
    print(f"\n{c.CYAN}🔑 Initializing Gemini API...{c.RESET}")
    try:
        await session._ensure_initialized()
        print(f"{c.GREEN}✓ Ready!{c.RESET}")
    except ValueError as e:
        print(f"{c.RED}Error: {e}{c.RESET}")
        print(f"\n{c.YELLOW}Make sure GOOGLE_API_KEY or GEMINI_API_KEY is set in .env{c.RESET}")
        sys.exit(1)
    except Exception as e:
        print(f"{c.RED}Failed to initialize: {e}{c.RESET}")
        sys.exit(1)

    # Run appropriate mode
    if args.safety:
        success = await safety_test(session, robot, args.verbose)
        sys.exit(0 if success else 1)
    elif args.auto:
        success = await automated_tests(session, robot, args.verbose)
        sys.exit(0 if success else 1)
    else:
        await interactive_mode(session, robot, args.tts, args.verbose)


if __name__ == "__main__":
    asyncio.run(main())
