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
echo "This will prompt for camera type. Enter: ov5647"
echo ""

cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code
sudo python setup.py

echo "[PHASE 2] Complete."

# -----------------------------------------------------------------------------
# PHASE 3: Configure PCB Version (V1.0)
# -----------------------------------------------------------------------------
echo ""
echo "[PHASE 3] Configuring PCB version..."
echo "If prompted, select: 1 (for V1.0)"
echo ""

cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server

# Check if parameter.py needs to be run (first time setup)
if [ ! -f "pcb_version.txt" ]; then
    sudo python parameter.py
fi

echo "[PHASE 3] Complete."

# -----------------------------------------------------------------------------
# PHASE 4: Reboot Required
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "SETUP COMPLETE - REBOOT REQUIRED"
echo "=============================================="
echo ""
echo "Run: sudo reboot"
echo ""
echo "After reboot, run these commands to test modules:"
echo ""
echo "  cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
echo "  sudo pigpiod"
echo "  sudo python test.py Motor"
echo "  sudo python test.py Servo"
echo "  sudo python test.py Led"
echo "  sudo python test.py Ultrasonic"
echo "  sudo python test.py Infrared"
echo "  sudo python test.py camera"
echo ""
echo "To start the server with gamepad support:"
echo ""
echo "  sudo killall pigpiod 2>/dev/null"
echo "  sudo pigpiod"
echo "  cd ~/Freenove_Tank_Robot_Kit_for_Raspberry_Pi/Code/Server"
echo "  sudo python main.py"
echo ""
echo "Plug in USB dongle BEFORE starting server for gamepad detection."
echo "=============================================="
