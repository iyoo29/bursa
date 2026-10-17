---
trigger: always_on
---

# AIRA Workspace Rules

## Agent Permissions

This workspace uses auto-approval for safe development operations.
The agent should proceed without asking for confirmation on:
- Running terminal commands within the workspace
- Creating and editing files within the workspace  
- Reading files and searching the web
- Running build/test commands
- Installing dependencies via pip/npm

The agent should still ask for confirmation on:
- Deleting important files outside the workspace
- Running system-level commands (registry, services, shutdown)
- Operations that modify system configuration
- Running commands with elevated privileges

## Project Context

This is the AIRA (AI Remote Agent) project workspace.
The project uses:
- PlatformIO for ESP32-S3 firmware
- Python/FastAPI for the server
- C#/.NET or Python for Windows Host Helper
- HTML/CSS/JS for the web interface
