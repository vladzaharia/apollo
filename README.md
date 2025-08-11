# Apollo Game Management - Streamlined System

A streamlined Apollo game management system focused on core process detection and cleanup functionality.

## 🚀 Overview

This system has been upgraded to use Apollo's global prep commands instead of individual per-app configurations, making it much cleaner and easier to maintain.

## 📁 Structure

```
apollo/
├── apollo.conf                    # Apollo configuration with global prep commands
├── apps.json                      # Streamlined app definitions (no individual prep-cmd)
├── scripts/
│   ├── ApolloGameManagement/       # Core PowerShell module
│   └── Smart-GameCleanup.ps1      # Main orchestrator script
└── src/                           # Apollo sync tools
```

## 🔧 How It Works

### Per-Game Tracking System
The system now uses individual tracking files for each game, allowing multiple games to run simultaneously:

- **Tracking Directory**: `%LOCALAPPDATA%\Apollo\Tracking\`
- **File Format**: `{sanitized-game-name}.json`
- **Automatic Cleanup**: Files are removed after successful game cleanup
- **Concurrent Support**: Multiple games can be tracked independently

### Tracking File Management
- `Clear-ApolloTrackingFiles`: Clean up old or specific tracking files
- Automatic file rotation and cleanup based on configuration
- Safe filename generation from game names

### Global Prep Commands
The system now uses Apollo's `global_prep_cmd` configuration in `apollo.conf`:

```conf
global_prep_cmd = [
  {
    "do": "powershell.exe -ExecutionPolicy Bypass -File \"C:\\Tools\\apollo\\scripts\\Smart-GameCleanup.ps1\" -Action track",
    "undo": "powershell.exe -ExecutionPolicy Bypass -File \"C:\\Tools\\apollo\\scripts\\Smart-GameCleanup.ps1\" -Action cleanup",
    "elevated": true
  }
]
```

### Process Management
- **Track Phase**: When any game starts, the global "do" command runs `Smart-GameCleanup.ps1 -Action track`
- **Cleanup Phase**: When any game stops, the global "undo" command runs `Smart-GameCleanup.ps1 -Action cleanup`
- **Intelligent Detection**: The system automatically detects game processes and cleans them up appropriately
- **Per-Game Tracking**: Each game gets its own tracking file in `%LOCALAPPDATA%\Apollo\Tracking\` for concurrent game support
- **Automatic Cleanup**: Tracking files are automatically removed after successful game cleanup

### App Configuration
All apps in `apps.json` now use the simplified format:
```json
{
  "name": "Game Name",
  "detached": ["steam://rungameid/12345"],
  "exclude-global-prep-cmd": false,
  "auto-detach": true,
  "exit-timeout": 5
}
```

## 🎮 Benefits

- **Simplified Configuration**: No more individual prep-cmd entries for each game
- **Consistent Behavior**: All games use the same proven process management logic
- **Easy Maintenance**: Changes to process management only need to be made in one place
- **Reduced Complexity**: Removed unused testing, migration, and wrapper components

## 🔧 Configuration

To use this system:

1. **Apollo Configuration**: Ensure Apollo loads the `apollo.conf` file with global prep commands
2. **Apps Configuration**: All apps in `apps.json` automatically use global prep commands
3. **Exclusions**: Set `"exclude-global-prep-cmd": true` for any app that shouldn't use global commands

## 📋 Core Components

### Smart-GameCleanup.ps1
Main orchestrator script that handles both tracking and cleanup phases.

### ApolloGameManagement Module
PowerShell module providing:
- Process tracking and detection
- Intelligent cleanup algorithms
- Apollo environment integration
- Comprehensive logging
- Configuration management


## 🔍 Troubleshooting

If games aren't being tracked or cleaned up properly:

1. **Check Apollo Configuration**: Ensure `apollo.conf` is loaded by Apollo
2. **Verify Global Commands**: Check Apollo logs for global prep command execution
3. **Test Manually**: Run `Smart-GameCleanup.ps1` directly to test functionality
4. **Check Permissions**: Ensure scripts run with elevated privileges

For detailed logging, check the Apollo logs and the ApolloGameManagement module logs.

## Apollo Sync Tool

The `src/` directory contains a TypeScript/Node.js tool for synchronizing local Apollo app configurations with a remote Apollo server via API. This tool remains unchanged and can be used to sync the streamlined app configurations.