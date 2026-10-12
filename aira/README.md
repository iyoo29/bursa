# AIRA — AI Remote Agent

Portable AI Agent that enables AI to control a Windows computer using a LILYGO T-Dongle S3 as a USB HID bridge.

## Overview

AIRA uses an observe-think-act-verify loop:

1. **OBSERVE** — Capture screenshot of the Windows desktop
2. **THINK** — AI analyzes the screen and plans next action
3. **ACT** — Send HID commands (mouse/keyboard) via T-Dongle S3
4. **VERIFY** — Capture new screenshot and verify the result
5. **REPEAT** — Continue until the task is complete

## Architecture

```
User → Web UI → AIRA Server → Host Helper → Screenshot
                     ↓                          ↓
                  AI Agent  ←  Screenshot  ←────┘
                     ↓
                  Action
                     ↓
              T-Dongle S3 (USB HID)
                     ↓
                Windows PC
```

## Hardware

- **LILYGO T-Dongle S3** — ESP32-S3 with USB, Wi-Fi, LCD, RGB LED, Button
- No additional hardware required

## Software Components

### Firmware (`firmware/t-dongle-s3/`)
ESP32-S3 firmware for the T-Dongle S3. Handles:
- USB HID (keyboard + mouse emulation)
- Wi-Fi connectivity
- WebSocket communication with AIRA Server
- LCD status display
- RGB LED status indicators
- Button input (emergency stop)

### AIRA Server (`server/`)
Python/FastAPI backend. Handles:
- AI Agent orchestration (observe-think-act-verify loop)
- Multi-provider AI support (OpenAI, Gemini, Anthropic)
- WebSocket communication with devices and Host Helper
- Session management
- Action validation and routing
- Authentication

### Windows Host Helper (`host-helper/windows/`)
Portable Windows application. Handles:
- Screenshot capture
- Communication with AIRA Server
- Device/session management

### Web Interface (`web/`)
Simple browser-based UI. Provides:
- Task input
- Device status monitoring
- Live screenshot view
- Start/Stop/Emergency Stop controls
- Session history

## Quick Start

### Prerequisites
- Windows 10/11
- Python 3.10+
- Node.js 18+ (for web UI)
- PlatformIO (for firmware)
- USB port for T-Dongle S3

### 1. Flash T-Dongle S3 Firmware
```bash
cd firmware/t-dongle-s3
pio run --target upload
```

### 2. Start AIRA Server
```bash
cd server
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Start Host Helper
```bash
cd host-helper/windows
python host_helper.py
```

### 4. Open Web Interface
Open `web/index.html` in your browser or navigate to `http://localhost:8000`

### 5. Use AIRA
1. Plug in T-Dongle S3 via USB
2. Wait for Wi-Fi connection and server registration
3. Enter a task in the web UI: "Open Chrome and search for ESP32-S3"
4. Click START
5. Watch AIRA work!

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# AI Provider (openai, gemini, anthropic)
AI_PROVIDER=gemini

# API Keys
OPENAI_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here

# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=8000

# Security
DEVICE_TOKEN=your-device-token
```

## Protocol

See [protocol/messages.md](protocol/messages.md) for the complete message protocol documentation.

## Project Structure

```
aira/
├── firmware/           # ESP32-S3 firmware
│   └── t-dongle-s3/    # PlatformIO project
├── host-helper/        # Windows Host Helper
│   └── windows/        # Windows-specific code
├── server/             # AIRA Server (FastAPI)
│   ├── api/            # REST API endpoints
│   ├── agent/          # AI Agent logic
│   ├── providers/      # AI provider implementations
│   ├── devices/        # Device management
│   ├── sessions/       # Session management
│   ├── security/       # Auth & validation
│   ├── storage/        # Database & storage
│   └── tests/          # Server tests
├── web/                # Web interface
├── protocol/           # Protocol documentation
├── docs/               # Project documentation
├── tests/              # Integration tests
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Testing

See [docs/testing.md](docs/testing.md) for testing procedures.

## Troubleshooting

### T-Dongle not detected
- Ensure USB cable supports data (not charge-only)
- Try different USB port
- Check Device Manager for COM port
- Hold BOOT button while plugging in for firmware flash mode

### Wi-Fi won't connect
- Check SSID and password in configuration
- Ensure 2.4GHz network (ESP32-S3 doesn't support 5GHz)
- Check router settings

### HID not working
- Ensure T-Dongle is recognized as USB HID device in Device Manager
- Try unplugging and replugging
- Reflash firmware

### Screenshot issues
- Run Host Helper as Administrator if needed
- Check display scaling settings

## License

MIT

## Contributing

This is a V1 prototype. Contributions welcome.
