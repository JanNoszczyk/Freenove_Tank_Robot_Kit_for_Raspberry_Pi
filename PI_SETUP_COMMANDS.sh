#!/bin/bash
# =============================================================================
# Freenove Tank Robot - Complete Pi Setup Script
# Hardware: Raspberry Pi 3B | PCB Version: V1.0 | Camera: OV5647
# =============================================================================
# Run this script on your Raspberry Pi after SSH login
#
# Usage:
#   bash PI_SETUP_COMMANDS.sh              # Phase 1: Install dependencies
#   sudo reboot                            # Reboot after Phase 1
#   bash PI_SETUP_COMMANDS.sh --post-reboot    # Phase 2: Post-reboot setup
#   bash PI_SETUP_COMMANDS.sh --setup-systemd   # RECOMMENDED: Headless auto-start
#   bash PI_SETUP_COMMANDS.sh --setup-autostart # Optional: Desktop auto-start
#   bash PI_SETUP_COMMANDS.sh --install-client  # Optional: Install Pi client GUI
#   bash PI_SETUP_COMMANDS.sh --arm-calibration  # Calibrate servos for arm assembly
# =============================================================================

set -e  # Exit on error

echo "=============================================="
echo "Freenove Tank Robot Setup (Pi 3B, PCB V1.0)"
echo "=============================================="

# -----------------------------------------------------------------------------
# OPTIONAL: Install Client GUI on Pi (for running client locally)
# -----------------------------------------------------------------------------
if [ "$1" == "--install-client" ]; then
    echo ""
    echo "[CLIENT] Installing Client GUI dependencies on Pi..."

    sudo apt-get update
    sudo apt-get install -y libopencv-dev python3-opencv
    sudo apt-get install -y python3-pil python3-tk

    echo ""
    echo "[CLIENT] Complete. To run client:"
    echo "  cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Client"
    echo "  sudo python Main.py"
    exit 0
fi

# -----------------------------------------------------------------------------
# ARM CALIBRATION: Rotate servos to 90° for arm assembly (Step 24 in manual)
# -----------------------------------------------------------------------------
if [ "$1" == "--arm-calibration" ]; then
    echo ""
    echo "[ARM] Starting servo calibration for arm assembly..."
    echo ""
    echo "IMPORTANT: This rotates servos to 90 degrees."
    echo "Install arm parts WHILE this is running, then press Ctrl+C when done."
    echo ""

    cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server

    # For V1.0 PCB, must start pigpiod first
    echo "Starting pigpiod daemon..."
    sudo killall pigpiod 2>/dev/null || true
    sudo pigpiod
    sleep 1

    echo ""
    echo "Running servo.py - servos will move to calibration position..."
    echo "Press Ctrl+C when arm assembly is complete."
    echo ""

    sudo python servo.py

    exit 0
fi

# -----------------------------------------------------------------------------
# RECOMMENDED: Setup systemd service for headless auto-start
# -----------------------------------------------------------------------------
if [ "$1" == "--setup-systemd" ]; then
    echo ""
    echo "[SYSTEMD] Setting up headless auto-start service..."
    echo ""
    echo "This method works on headless Pi (no desktop required)."
    echo ""

    # Enable pigpiod service (required for V1.0 PCB)
    sudo systemctl enable pigpiod
    sudo systemctl start pigpiod

    # Copy service file
    sudo cp ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server/freenove-tank.service /etc/systemd/system/

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable freenove-tank.service

    echo ""
    echo "[SYSTEMD] Complete! Server will auto-start on boot."
    echo ""
    echo "Manage the service with:"
    echo "  sudo systemctl start freenove-tank    # Start now"
    echo "  sudo systemctl stop freenove-tank     # Stop"
    echo "  sudo systemctl restart freenove-tank  # Restart"
    echo "  sudo systemctl status freenove-tank   # Check status"
    echo "  sudo journalctl -u freenove-tank -f   # View logs"
    echo ""
    echo "To disable auto-start:"
    echo "  sudo systemctl disable freenove-tank"
    echo ""
    echo "Start the service now with: sudo systemctl start freenove-tank"
    exit 0
fi

# -----------------------------------------------------------------------------
# OPTIONAL: Setup Auto-Start on Boot (Desktop mode - requires display)
# -----------------------------------------------------------------------------
if [ "$1" == "--setup-autostart" ]; then
    echo ""
    echo "[AUTOSTART] Setting up desktop auto-start (requires display)..."
    echo ""
    echo "NOTE: For headless Pi, use --setup-systemd instead!"
    echo ""

    # Create start.sh with pigpiod for V1.0 PCB
    cat > ~/start.sh << STARTSH
#!/bin/sh
cd "$HOME/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
pwd
sleep 10
# V1.0 PCB requires pigpiod daemon
sudo pigpiod
sleep 1
sudo python main.py
STARTSH

    sudo chmod 777 ~/start.sh

    # Create autostart directory
    mkdir -p ~/.config/autostart/

    # Create start.desktop
    cat > ~/.config/autostart/start.desktop << DESKTOP
[Desktop Entry]
Type=Application
Name=start
NoDisplay=true
Exec=$HOME/start.sh
DESKTOP

    sudo chmod +x ~/.config/autostart/start.desktop

    echo "[AUTOSTART] Complete. Server will start automatically on boot."
    echo ""
    echo "To disable auto-start, delete these files:"
    echo "  rm ~/start.sh"
    echo "  rm ~/.config/autostart/start.desktop"
    echo ""
    echo "Reboot now with: sudo reboot"
    exit 0
fi

# -----------------------------------------------------------------------------
# PHASE 2: Post-Reboot Setup
# -----------------------------------------------------------------------------
if [ "$1" == "--post-reboot" ]; then
    echo ""
    echo "[PHASE 2] Post-reboot configuration..."

    cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server

    # For V1.0 PCB on non-Pi5, MUST start pigpiod daemon
    echo "Starting pigpiod daemon (required for V1.0 PCB)..."
    sudo killall pigpiod 2>/dev/null || true
    sudo pigpiod
    sleep 1

    echo ""
    echo "=============================================="
    echo "READY FOR TESTING"
    echo "=============================================="
    echo ""
    echo "IMPORTANT: Turn ON both S1 and S2 switches on PCB!"
    echo ""
    echo "Test each module (Ctrl+C to exit each):"
    echo ""
    echo "  cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
    echo ""
    echo "  # First time LED test will prompt for PCB version - enter: 1"
    echo "  sudo python test.py Led"
    echo ""
    echo "  # If wrong PCB version entered, reconfigure with:"
    echo "  sudo python parameter.py"
    echo ""
    echo "  sudo python test.py Motor      # Car moves fwd/back/left/right"
    echo "  sudo python test.py Servo      # Arm opens/closes"
    echo "  sudo python test.py Ultrasonic # Distance readings (HC-SR04)"
    echo "  sudo python test.py Lidar      # Distance readings (TF-Mini S via USB)"
    echo "  sudo python test.py Infrared   # Line sensor readings"
    echo "  sudo python test.py camera     # Saves image.jpg after 5s"
    echo ""
    echo "  # Standalone modes (no client needed):"
    echo "  sudo python car.py Sonic       # Ultrasonic obstacle avoidance"
    echo "  sudo python car.py Infrared    # Line tracking mode"
    echo ""
    echo "=============================================="
    echo "TO START SERVER WITH GAMEPAD"
    echo "=============================================="
    echo ""
    echo "  sudo killall pigpiod 2>/dev/null; sudo pigpiod"
    echo "  cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
    echo "  sudo python main.py"
    echo ""
    echo "Plug USB dongle in BEFORE starting server!"
    echo ""
    echo "=============================================="
    echo "AUTO-START OPTIONS"
    echo "=============================================="
    echo ""
    echo "RECOMMENDED - Headless auto-start (works without display):"
    echo "  bash PI_SETUP_COMMANDS.sh --setup-systemd"
    echo ""
    echo "ALTERNATIVE - Desktop auto-start (requires display):"
    echo "  bash PI_SETUP_COMMANDS.sh --setup-autostart"
    echo ""
    echo "=============================================="
    echo "OTHER OPTIONS"
    echo "=============================================="
    echo ""
    echo "Install Client GUI on Pi (to control from Pi desktop):"
    echo "  bash PI_SETUP_COMMANDS.sh --install-client"
    echo ""
    echo "Enable VNC for remote desktop (optional):"
    echo "  sudo raspi-config"
    echo "  -> Interface Options -> VNC -> Yes"
    echo ""
    exit 0
fi

# -----------------------------------------------------------------------------
# PHASE 1: Clone Repository and Install Dependencies
# -----------------------------------------------------------------------------
echo ""
echo "[PHASE 1] Cloning repository..."

cd ~
if [ -d "Freenove_Tank_Robot_Kit_for_Raspberry_Pi" ]; then
    echo "Repository already exists. Pulling latest changes..."
    cd Freenove_Tank_Robot_Kit_for_Raspberry_Pi
    git pull
    cd ~
else
    git clone https://github.com/JanNoszczyk/Freenove_Tank_Robot_Kit_for_Raspberry_Pi.git
fi

sudo chmod 755 -R ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi

echo "[PHASE 1] Clone complete."

echo ""
echo "[PHASE 1] Installing dependencies..."
echo ""
echo ">>> This will prompt for camera type. Enter: ov5647"
echo ">>> For Pi 3B it will also set dtparam=audio=off in config.txt"
echo ""

cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code
sudo python setup.py

echo ""
echo "[PHASE 1] Complete."

echo ""
echo "=============================================="
echo "PHASE 1 COMPLETE - REBOOT REQUIRED"
echo "=============================================="
echo ""
echo "Run: sudo reboot"
echo ""
echo "After reboot, run this script again with --post-reboot flag:"
echo "  bash ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/PI_SETUP_COMMANDS.sh --post-reboot"
echo ""
