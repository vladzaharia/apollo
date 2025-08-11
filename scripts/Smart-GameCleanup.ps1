# Smart-GameCleanup.ps1
# Unified script for intelligent game process management
# Handles both tracking (prep) and cleanup (undo) operations
# Uses Apollo environment variables for enhanced context awareness

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("track", "cleanup")]
    [string]$Action,

    [string]$GameName,
    [string[]]$FallbackProcesses = @(),
    [int]$TrackingDurationSeconds = 60,
    [int]$GraceTimeoutSeconds = 10,
    [switch]$Verbose,
    [string]$LogFile = ""
)

$ScriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$TrackingScript = Join-Path $ScriptDir "Start-ProcessTracking.ps1"
$CleanupScript = Join-Path $ScriptDir "Stop-TrackedProcesses.ps1"

# Set up log file path
if (-not $LogFile) {
    $LogsDir = Join-Path $ScriptDir "logs"
    if (-not (Test-Path $LogsDir)) {
        New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    }
    $LogFile = Join-Path $LogsDir "Smart-GameCleanup.log"
}

# Log rotation function
function Rotate-LogFile {
    param([string]$LogPath)

    if (Test-Path $LogPath) {
        $logInfo = Get-Item $LogPath
        # Rotate if log file is larger than 10MB
        if ($logInfo.Length -gt 10MB) {
            $rotatedLog = $LogPath -replace '\.log$', "_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
            try {
                Move-Item -Path $LogPath -Destination $rotatedLog -Force
                # Keep only the last 5 rotated logs
                $rotatedLogs = Get-ChildItem -Path (Split-Path $LogPath) -Filter "*_*.log" | Sort-Object LastWriteTime -Descending
                if ($rotatedLogs.Count -gt 5) {
                    $rotatedLogs[5..($rotatedLogs.Count-1)] | Remove-Item -Force
                }
            } catch {
                # If rotation fails, continue silently
            }
        }
    }
}

function Get-ApolloContext {
    # Get Apollo environment variables for enhanced context
    $context = @{
        AppName = $env:APOLLO_APP_NAME
        AppUUID = $env:APOLLO_APP_UUID
        AppStatus = $env:APOLLO_APP_STATUS
        ClientName = $env:APOLLO_CLIENT_NAME
        ClientUUID = $env:APOLLO_CLIENT_UUID
        ClientWidth = $env:APOLLO_CLIENT_WIDTH
        ClientHeight = $env:APOLLO_CLIENT_HEIGHT
        ClientFPS = $env:APOLLO_CLIENT_FPS
    }

    return $context
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $apolloContext = Get-ApolloContext
    $contextInfo = ""
    if ($apolloContext.AppName) {
        $contextInfo = " [App: $($apolloContext.AppName)] [Status: $($apolloContext.AppStatus)]"
    }

    $logMessage = "[$timestamp] [$Level]$contextInfo Smart-GameCleanup: $Message"

    # Always write to log file
    try {
        Add-Content -Path $LogFile -Value $logMessage -Encoding UTF8
    } catch {
        # If log file write fails, continue silently to avoid breaking game launches
    }

    # Write to console if verbose or error
    if ($Verbose -or $Level -eq "ERROR") {
        Write-Host $logMessage
    }
}

function Start-GameTracking {
    param([string]$GameName, [int]$Duration)
    
    Write-Log "Starting process tracking for: $GameName"
    
    if (-not (Test-Path $TrackingScript)) {
        Write-Log "Tracking script not found: $TrackingScript" "ERROR"
        return $false
    }
    
    try {
        $params = @{
            GameName = $GameName
            TrackingDurationSeconds = $Duration
            LogFile = $LogFile
        }

        if ($Verbose) { $params.Verbose = $true }

        & $TrackingScript @params
        Write-Log "Process tracking completed for: $GameName"
        return $true
    } catch {
        Write-Log "Error during process tracking: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Stop-GameProcesses {
    param([string]$GameName, [string[]]$Fallbacks, [int]$GraceTimeout)
    
    Write-Log "Starting intelligent cleanup for: $GameName"
    
    if (-not (Test-Path $CleanupScript)) {
        Write-Log "Cleanup script not found: $CleanupScript" "ERROR"
        return $false
    }
    
    try {
        $params = @{
            GameName = $GameName
            GraceTimeoutSeconds = $GraceTimeout
            LogFile = $LogFile
        }

        if ($Fallbacks -and $Fallbacks.Count -gt 0) {
            $params.FallbackProcesses = $Fallbacks
        }

        if ($Verbose) { $params.Verbose = $true }

        & $CleanupScript @params
        Write-Log "Intelligent cleanup completed for: $GameName"
        return $true
    } catch {
        Write-Log "Error during cleanup: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# Main execution
# Rotate log file if needed
Rotate-LogFile -LogPath $LogFile

$apolloContext = Get-ApolloContext

# Use Apollo app name if GameName not provided or if Apollo context is available
if (-not $GameName -and $apolloContext.AppName) {
    $GameName = $apolloContext.AppName
    Write-Log "Using Apollo app name: $GameName"
} elseif (-not $GameName) {
    Write-Log "No game name provided and no Apollo context available" "ERROR"
    exit 1
}

Write-Log "Smart Game Cleanup - Action: $Action, Game: $GameName"
if ($apolloContext.AppName) {
    Write-Log "Apollo Context - App: $($apolloContext.AppName), Status: $($apolloContext.AppStatus), Client: $($apolloContext.ClientName)"
}

switch ($Action) {
    "track" {
        Write-Log "Initiating process tracking phase"
        $success = Start-GameTracking -GameName $GameName -Duration $TrackingDurationSeconds
        if ($success) {
            Write-Log "Process tracking phase completed successfully"
            exit 0
        } else {
            Write-Log "Process tracking phase failed" "ERROR"
            exit 1
        }
    }
    
    "cleanup" {
        Write-Log "Initiating intelligent cleanup phase"
        $success = Stop-GameProcesses -GameName $GameName -Fallbacks $FallbackProcesses -GraceTimeout $GraceTimeoutSeconds
        if ($success) {
            Write-Log "Intelligent cleanup phase completed successfully"
            exit 0
        } else {
            Write-Log "Intelligent cleanup phase failed" "ERROR"
            exit 1
        }
    }
    
    default {
        Write-Log "Invalid action specified: $Action" "ERROR"
        exit 1
    }
}
