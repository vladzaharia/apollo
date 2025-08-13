# Apollo Game Management - Modernized 2025

A modernized Apollo game management system with TypeScript tools for syncing configurations and generating frontend configs. Built with 2025 best practices including ESM modules, modern architecture, and comprehensive testing.

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
└── src/                           # Modernized TypeScript sync tools (2025)
    ├── commands/                  # CLI commands (oclif-based)
    ├── services/                  # Business logic services
    ├── models/                    # Data models and types
    ├── utils/                     # Utility functions
    └── lib/                       # Core library code
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

## 🚀 Modernized TypeScript Tools (2025)

The `src/` directory contains completely modernized TypeScript tools built with 2025 best practices for syncing Apollo configurations and generating frontend configs.

### ✨ Key Features

- **Modern Architecture**: ESM modules, dependency injection, Result types
- **Type Safety**: Comprehensive TypeScript with runtime validation (Zod)
- **CLI Interface**: Modern oclif-based commands with help and examples
- **External APIs**: SteamGridDB and IGDB integration for artwork and metadata
- **Frontend Generation**: Support for Daijisho and ES-DE configurations
- **Testing**: Comprehensive test suite with Vitest
- **Error Handling**: Robust error handling with retry logic
- **Logging**: Structured logging with pino

### 🛠️ Installation & Setup

1. **Install dependencies** (requires Node.js 18+):
```bash
corepack enable
yarn install
```

2. **Configure environment** (copy and edit `.env.example`):
```bash
cp .env.example .env
# Edit .env with your Apollo server details and API keys
```

3. **Build the project**:
```bash
yarn build
```

### 🎮 Usage

#### Sync Apps with Apollo Server
```bash
# Sync apps from apps.json to Apollo server
yarn sync

# Dry run (show changes without applying)
yarn sync:dry

# Verbose output with detailed logging
yarn sync:verbose
```

#### Generate Frontend Configurations
```bash
# Generate both Daijisho and ES-DE configs
yarn generate

# Generate only Daijisho configs
yarn build && node dist/index.js generate --frontend daijisho

# Generate with custom output directory
yarn build && node dist/index.js generate --output ./my-configs

# Skip artwork fetching (faster)
yarn build && node dist/index.js generate --no-artwork
```

### 🔧 Development

```bash
# Run in development mode
yarn dev

# Run tests
yarn test

# Run tests with coverage
yarn test:coverage

# Lint and format code
yarn lint
yarn format
```

### 📁 Modern Architecture

```
src/
├── commands/           # CLI commands (sync, generate)
├── services/          # Business logic services
│   ├── apollo/        # Apollo server integration
│   ├── external/      # SteamGridDB, IGDB APIs
│   ├── frontend/      # Daijisho, ES-DE generators
│   └── file/          # File operations
├── models/            # Data models with validation
├── utils/             # Utilities (Result types, retry, config)
└── lib/               # Core (DI container, base command)
```

### 🌐 External API Integration

- **SteamGridDB**: Automatic artwork download (covers, logos, backgrounds)
- **IGDB**: Game metadata (descriptions, genres, release dates, developers)
- **Rate Limiting**: Built-in retry logic and error handling
- **Optional**: Works without API keys (reduced functionality)

### 📱 Frontend Support

#### Daijisho
- Generates `.art` files for each game
- Creates platform configuration
- Supports artwork and metadata integration

#### ES-DE (EmulationStation Desktop Edition)
- Generates `gamelist.xml` with game metadata
- Creates system configuration
- Full artwork and metadata support

### 🧪 Testing & Quality

- **Vitest**: Modern testing framework with coverage
- **ESLint**: TypeScript-aware linting
- **Prettier**: Consistent code formatting
- **Type Safety**: Strict TypeScript configuration
- **CI Ready**: All tools configured for continuous integration

This modernized version maintains full compatibility with the existing Apollo game management system while providing a much more robust, maintainable, and feature-rich toolset for 2025 and beyond.