# AIRA Architecture

## System Overview

```
                    USER
                     │
                     ▼
              WEB / BROWSER
                     │
                     ▼
                AIRA SERVER
              ┌──────────────┐
              │ API          │
              │ WebSocket    │
              │ AI Agent     │
              │ AI Provider  │
              │ Sessions     │
              │ Auth         │
              └──────┬───────┘
                     │
                  Internet
                     │
                     ▼
            WINDOWS HOST HELPER
              ┌──────────────┐
              │ Screenshot   │
              │ Device Link  │
              │ Session      │
              └──────┬───────┘
                     │
                     │ USB / local
                     ▼
             LILYGO T-DONGLE S3
              ┌──────────────┐
              │ ESP32-S3     │
              │ Wi-Fi        │
              │ WebSocket    │
              │ USB HID      │
              │ LCD          │
              │ Button       │
              │ RGB LED      │
              └──────┬───────┘
                     │
                     │ USB HID
                     ▼
                 WINDOWS PC
```

## Components

### 1. AIRA Server
- **Technology**: Python, FastAPI, WebSocket
- **Role**: Central orchestrator — manages sessions, AI agent, device communication
- **Database**: SQLite (V1), PostgreSQL (future)

### 2. Windows Host Helper
- **Technology**: C# / .NET (or Python for V1)
- **Role**: Screenshot capture, bridge between server and local PC
- **Distribution**: Portable executable

### 3. T-Dongle S3 Firmware
- **Technology**: C/C++, PlatformIO, Arduino framework
- **Role**: USB HID executor (keyboard + mouse), Wi-Fi connectivity
- **Hardware**: LILYGO T-Dongle S3 (ESP32-S3)

### 4. Web Interface
- **Technology**: HTML/CSS/JS (simple for V1)
- **Role**: User interface for task input, monitoring, emergency stop

## Agent Loop

```
User Task → Screenshot → AI Analyze → Plan Action → 
Send to T-Dongle → Execute HID → Wait → 
New Screenshot → AI Verify → Next Action or Complete
```

## Security Layers
1. Device authentication (device ID + token)
2. Session authentication
3. Action validation & allowlist
4. Emergency stop mechanism
5. API keys via environment variables
