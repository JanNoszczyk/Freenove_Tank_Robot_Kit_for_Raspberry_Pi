#!/bin/bash
# =============================================================================
# Freenove Tank Robot - Complete Pi Setup Script
# Hardware: Raspberry Pi 3B | PCB Version: V1.0 | Camera: OV5647
# =============================================================================
# Run this script on your Raspberry Pi after SSH login
# Usage: bash PI_SETUP_COMMANDS.sh
# =============================================================================

set -e  # Exit on error

echo "=============================================="
echo "Freenove Tank Robot Setup (Pi 3B, PCB V1.0)"
echo "=============================================="

# -----------------------------------------------------------------------------
# PHASE 1: Clone Repository (from your fork)
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

echo "[PHASE 1] Complete."

# -----------------------------------------------------------------------------
# PHASE 2: Install Dependencies
# -----------------------------------------------------------------------------
echo ""
echo "[PHASE 2] Installing dependencies..."
echo ""
echo ">>> This will prompt for camera type. Enter: ov5647"
echo ">>> For Pi 3B it will also set dtparam=audio=off in config.txt"
echo ""

cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code
sudo python setup.py

echo "[PHASE 2] Complete."

# -----------------------------------------------------------------------------
# PHASE 3: Reboot Notice
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "PHASE 2 COMPLETE - REBOOT REQUIRED"
echo "=============================================="
echo ""
echo "Run: sudo reboot"
echo ""
echo "After reboot, run this script again with --post-reboot flag:"
echo "  bash PI_SETUP_COMMANDS.sh --post-reboot"
echo ""

if [ "$1" != "--post-reboot" ]; then
    exit 0
fi

# -----------------------------------------------------------------------------
# PHASE 4: Post-Reboot - Configure PCB Version & Test
# -----------------------------------------------------------------------------
echo ""
echo "[PHASE 4] Post-reboot configuration..."

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
echo "Test each module (Ctrl+C to exit each):"
echo ""
echo "  cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
echo ""
echo "  # First time LED test will prompt for PCB version - enter: 1"
echo "  sudo python test.py Led"
echo ""
echo "  sudo python test.py Motor      # Car moves fwd/back/left/right"
echo "  sudo python test.py Servo      # Arm opens/closes"
echo "  sudo python test.py Ultrasonic # Distance readings"
echo "  sudo python test.py Infrared   # Line sensor readings"
echo "  sudo python test.py camera     # Saves image.jpg after 5s"
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
echo "OPTIONAL: AUTO-START SERVER ON BOOT"
echo "=============================================="
echo ""
echo "Run: bash PI_SETUP_COMMANDS.sh --setup-autostart"
echo ""

if [ "$1" != "--setup-autostart" ]; then
    exit 0
fi

# -----------------------------------------------------------------------------
# OPTIONAL: Setup Auto-Start on Boot
# -----------------------------------------------------------------------------
echo ""
echo "[AUTOSTART] Setting up server auto-start..."

# Create start.sh
cat > ~/start.sh << 'STARTSH'
#!/bin/sh
cd "/home/pi/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
pwd
sleep 10
# V1.0 PCB requires pigpiod
sudo pigpiod
sleep 1
sudo python main.py
STARTSH

sudo chmod 777 ~/start.sh

# Create autostart directory
mkdir -p ~/.config/autostart/

# Create start.desktop
cat > ~/.config/autostart/start.desktop << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=start
NoDisplay=true
Exec=/home/pi/start.sh
DESKTOP

sudo chmod +x ~/.config/autostart/start.desktop

echo "[AUTOSTART] Complete. Server will start automatically on boot."
echo ""
echo "To disable auto-start, delete these files:"
echo "  rm ~/start.sh"
echo "  rm ~/.config/autostart/start.desktop"
echo ""
echo "Reboot now with: sudo reboot"
