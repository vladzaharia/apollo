# Apollo/Sunshine App Sync Tool

This tool synchronizes your local `apps.json` configuration with your Apollo/Sunshine server via the API. It compares the local configuration with the server configuration and updates any differences.

## Prerequisites

- Node.js 16 or higher
- npm
- A running Apollo/Sunshine server with API access

## First-Time Setup

### Automated Setup (Recommended)

Run the setup script to automatically configure everything:

```bash
./setup.sh
```

This will:
- Install dependencies
- Copy example configuration files
- Build the project
- Show you next steps

### Manual Setup

If you prefer to set up manually:

1. **Copy example configuration files**:
   ```bash
   cp .env.example .env
   cp apps.json.example apps.json
   ```

2. **Edit `.env`** with your Apollo/Sunshine server details:
   ```bash
   # Update these values in .env
   APOLLO_ENDPOINT=https://your-server-ip:47990/
   APOLLO_USERNAME=your_username
   APOLLO_PASSWORD=your_password
   ```

3. **Edit `apps.json`** with your actual game library:
   - Replace example entries with your Steam games, Epic games, etc.
   - Use the provided examples as templates for different launcher types

4. **Install dependencies and build**:
   ```bash
   npm install
   npm run build
   ```

5. **Test your setup**:
   ```bash
   ./sync-apps.sh --test-connection
   ```

## Setup

1. **Environment Configuration**: Create a `.env` file with your server credentials:
   ```bash
   APOLLO_ENDPOINT=https://192.168.5.60:47990/
   APOLLO_USERNAME=your_username
   APOLLO_PASSWORD=your_password
   ```

2. **Install Dependencies**: The script will automatically install dependencies when first run, or you can install manually:
   ```bash
   npm install
   ```

## Usage

### Quick Start (Shell Script)

The easiest way to use the tool is with the shell script wrapper:

```bash
# Test connection to Sunshine API
./sync-apps.sh --test-connection

# Dry run - see what would be changed without applying
./sync-apps.sh --dry-run --verbose

# Apply changes to server
./sync-apps.sh
```

### Direct Node.js Usage

You can also use the npm scripts directly:

```bash
# Dry run with verbose output
npm run sync:verbose

# Dry run only
npm run sync:dry

# Apply changes
npm run sync
```

### Command Line Options

- `--test-connection` / `-t`: Test connection to Sunshine API only
- `--dry-run` / `-d`: Show what changes would be made without actually applying them
- `--verbose` / `-v`: Show detailed output including apps that don't need changes
- `--help` / `-h`: Show help information

## How It Works

1. **Loads Configuration**: Reads your local `apps.json` and fetches the current server configuration via API
2. **Matches Apps**: Uses fuzzy name matching to find corresponding apps between local and server configurations
3. **Compares Settings**: Compares the key configuration fields that should be synchronized:
   - `cmd` - Command to run the application
   - `detached` - Detached commands (like Steam URIs)
   - `elevated` - Whether to run with elevated privileges
   - `auto-detach` - Auto-detach setting
   - `wait-all` - Wait for all processes
   - `exit-timeout` - Exit timeout value
   - `exclude-global-prep-cmd` - Exclude global prep commands
   - `output` - Log output path
   - `prep-cmd` - Preparation commands
4. **Preserves Server Data**: Keeps all server-specific fields like UUIDs, image paths, and other metadata
5. **Updates via API**: Uses the Sunshine API to apply changes

## Output

The tool provides colored output showing:
- **Green**: Successful operations or unchanged apps
- **Yellow**: Changes detected or dry-run operations
- **Blue**: Informational messages
- **Red**: Errors
- **Magenta**: New apps not found on server

## Files

### Configuration Files
- `apps.json` - Your local app configuration (source of truth)
- `.env` - Server credentials and endpoint

### Example Files (for first-time setup)
- `.env.example` - Template for environment configuration
- `apps.json.example` - Template with sample game configurations
- `.gitignore` - Git ignore rules (excludes sensitive files)

### Tool Files
- `setup.sh` - First-time setup script (automated configuration)
- `sync-apps.sh` - Shell script wrapper for easy usage
- `src/sync-apollo-apps.ts` - Main TypeScript source code
- `dist/sync-apollo-apps.js` - Compiled JavaScript (auto-generated)

## Troubleshooting

### Authentication Issues
- Verify your `.env` file has the correct credentials
- Check that the Apollo/Sunshine server is running and accessible
- Ensure the API endpoint URL is correct (with https:// and port)

### App Matching Issues
- The tool uses fuzzy matching with 80% similarity threshold
- Apps with very different names between local and server may not match
- Check the output for "New app (not found on server)" messages

### Authentication Issues
- **Apollo uses cookie-based authentication** (not basic auth)
- The tool automatically logs in and manages session cookies
- Verify your credentials work in the Apollo web UI first
- Session cookies expire after 14 days

### SSL Certificate Issues
- **Self-signed certificates are automatically handled** - no configuration needed
- The tool disables SSL verification for self-signed certificates
- If you have SSL issues, check your endpoint URL and certificate setup

## Safety Features

- **Dry Run Mode**: Always test with `--dry-run` first
- **Preserves Server Data**: Only updates the fields that should be synced
- **Fuzzy Matching**: Handles slight name differences between configurations
- **Error Handling**: Graceful error handling with informative messages

## Example Output

```
Apollo/Sunshine App Sync Tool
========================================
Loading configuration files...
Local apps: 81, Server apps: 77

Processing: Cyberpunk 2077
  → Changes detected:
    • detached: undefined -> ["steam://rungameid/1091500"]
    • wait-all: true -> false
  [DRY RUN] Would update app via API

Summary
====================
Updated: 76
Unchanged: 0
New: 5

Run without --dry-run to apply changes
```
