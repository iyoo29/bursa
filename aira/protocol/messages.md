# AIRA Protocol Messages

## Overview
All messages between AIRA components use JSON format over WebSocket.

## Message Types

### 1. device_status
Sent by T-Dongle to server to report device status.
```json
{
  "type": "device_status",
  "device_id": "aira-td-XXXX",
  "status": "connected",
  "firmware_version": "1.0.0",
  "wifi_rssi": -45,
  "uptime": 12345,
  "timestamp": 1696200000
}
```

### 2. heartbeat
Sent periodically to maintain connection.
```json
{
  "type": "heartbeat",
  "device_id": "aira-td-XXXX",
  "timestamp": 1696200000
}
```

### 3. screenshot_request
Sent by server to Host Helper to request a screenshot.
```json
{
  "type": "screenshot_request",
  "session_id": "session-001",
  "quality": 80,
  "format": "jpeg",
  "timestamp": 1696200000
}
```

### 4. screenshot_response
Sent by Host Helper to server with screenshot data.
```json
{
  "type": "screenshot_response",
  "session_id": "session-001",
  "image_base64": "<base64 encoded image>",
  "width": 1920,
  "height": 1080,
  "format": "jpeg",
  "timestamp": 1696200000
}
```

### 5. action
Sent by server to T-Dongle to execute HID action.
```json
{
  "type": "action",
  "action_id": "act-001",
  "session_id": "session-001",
  "action": "mouse_move",
  "params": {
    "x": 500,
    "y": 300
  },
  "timestamp": 1696200000
}
```

#### Action Types

##### mouse_move
```json
{"action": "mouse_move", "params": {"x": 500, "y": 300}}
```

##### click
```json
{"action": "click", "params": {"button": "left", "x": 500, "y": 300}}
```

##### double_click
```json
{"action": "double_click", "params": {"button": "left", "x": 500, "y": 300}}
```

##### right_click
```json
{"action": "right_click", "params": {"x": 500, "y": 300}}
```

##### scroll
```json
{"action": "scroll", "params": {"amount": -3}}
```

##### key_press
```json
{"action": "key_press", "params": {"key": "ENTER"}}
```

##### key_combination
```json
{"action": "key_combination", "params": {"keys": ["CTRL", "C"]}}
```

##### type_text
```json
{"action": "type_text", "params": {"text": "Hello World"}}
```

### 6. action_result
Sent by T-Dongle to server after executing action.
```json
{
  "type": "action_result",
  "action_id": "act-001",
  "device_id": "aira-td-XXXX",
  "status": "completed",
  "error": null,
  "timestamp": 1696200000
}
```

### 7. session_start
Sent by server to initiate a new agent session.
```json
{
  "type": "session_start",
  "session_id": "session-001",
  "device_id": "aira-td-XXXX",
  "task": "Open Chrome and search for ESP32-S3",
  "ai_provider": "gemini",
  "timestamp": 1696200000
}
```

### 8. session_stop
Sent to stop the current session.
```json
{
  "type": "session_stop",
  "session_id": "session-001",
  "reason": "task_complete",
  "timestamp": 1696200000
}
```

### 9. emergency_stop
Sent to immediately halt all operations.
```json
{
  "type": "emergency_stop",
  "session_id": "session-001",
  "device_id": "aira-td-XXXX",
  "reason": "user_triggered",
  "timestamp": 1696200000
}
```

### 10. error
Sent when an error occurs.
```json
{
  "type": "error",
  "source": "device",
  "device_id": "aira-td-XXXX",
  "error_code": "WIFI_DISCONNECTED",
  "message": "Wi-Fi connection lost",
  "timestamp": 1696200000
}
```

## Error Codes

| Code | Description |
|------|-------------|
| WIFI_DISCONNECTED | Wi-Fi connection lost |
| WS_DISCONNECTED | WebSocket connection lost |
| HID_ERROR | USB HID error |
| ACTION_TIMEOUT | Action execution timed out |
| ACTION_INVALID | Invalid action format |
| AUTH_FAILED | Authentication failed |
| SESSION_EXPIRED | Session has expired |
| DEVICE_NOT_FOUND | Device not found |
| SCREENSHOT_FAILED | Screenshot capture failed |
| AI_ERROR | AI provider error |
