#!/bin/bash

# Apollo/Sunshine App Sync Tool - First-Time Setup Script
# This script helps you set up the tool for the first time

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_color() {
    printf "${1}${2}${NC}\n"
}

print_color $BLUE "Apollo/Sunshine App Sync Tool - Setup"
print_color $BLUE "======================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_color $RED "Error: Node.js is not installed."
    print_color $YELLOW "Please install Node.js 16 or higher from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_color $RED "Error: Node.js version $NODE_VERSION is too old."
    print_color $YELLOW "Please install Node.js 16 or higher from https://nodejs.org/"
    exit 1
fi

print_color $GREEN "✓ Node.js $(node --version) detected"

# Install dependencies
print_color $BLUE "Installing dependencies..."
npm install

# Copy example files if they don't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_color $GREEN "✓ Created .env from .env.example"
        print_color $YELLOW "⚠ Please edit .env with your Apollo/Sunshine server details"
    else
        print_color $RED "Error: .env.example not found"
        exit 1
    fi
else
    print_color $YELLOW "⚠ .env already exists, skipping"
fi

if [ ! -f "apps.json" ]; then
    if [ -f "apps.json.example" ]; then
        cp apps.json.example apps.json
        print_color $GREEN "✓ Created apps.json from apps.json.example"
        print_color $YELLOW "⚠ Please edit apps.json with your actual game library"
    else
        print_color $RED "Error: apps.json.example not found"
        exit 1
    fi
else
    print_color $YELLOW "⚠ apps.json already exists, skipping"
fi

# Build the project
print_color $BLUE "Building TypeScript project..."
npm run build

print_color $GREEN "Setup completed successfully!"
print_color $BLUE ""
print_color $BLUE "Next steps:"
print_color $BLUE "1. Edit .env with your Apollo/Sunshine server details"
print_color $BLUE "2. Edit apps.json with your actual game library"
print_color $BLUE "3. Test connection: ./sync-apps.sh --test-connection"
print_color $BLUE "4. Preview changes: ./sync-apps.sh --dry-run --verbose"
print_color $BLUE "5. Apply changes: ./sync-apps.sh"
