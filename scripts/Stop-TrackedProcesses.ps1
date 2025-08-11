# Stop-TrackedProcesses.ps1
# Intelligent game process cleanup using tracking data and fallback methods
# Tiered approach: Tracked processes -> Intelligent detection -> Manual fallback
# Uses Apollo environment variables for enhanced context awareness

param(
    [string]$GameName,
    [string[]]$FallbackProcesses = @(),
    [string]$TrackingFile = "C:\Tools\apollo\temp\process-tracking.json",
    [int]$GraceTimeoutSeconds = 10,
    [switch]$Verbose,
    [string]$LogFile = ""
)

# Set up log file path if not provided
if (-not $LogFile) {
    $ScriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
    $LogsDir = Join-Path $ScriptDir "logs"
    if (-not (Test-Path $LogsDir)) {
        New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    }
    $LogFile = Join-Path $LogsDir "Smart-GameCleanup.log"
}

function Get-ApolloContext {
    # Get Apollo environment variables for enhanced context
    return @{
        AppName = $env:APOLLO_APP_NAME
        AppUUID = $env:APOLLO_APP_UUID
        AppStatus = $env:APOLLO_APP_STATUS
        ClientName = $env:APOLLO_CLIENT_NAME
        ClientUUID = $env:APOLLO_CLIENT_UUID
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $apolloContext = Get-ApolloContext
    $contextInfo = ""
    if ($apolloContext.AppName) {
        $contextInfo = " [App: $($apolloContext.AppName)] [Status: $($apolloContext.AppStatus)]"
    }

    $logMessage = "[$timestamp] [$Level]$contextInfo ProcessCleanup: $Message"

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

function Get-TrackedProcesses {
    param([string]$GameName)
    
    if (-not (Test-Path $TrackingFile)) {
        Write-Log "No tracking file found at: $TrackingFile"
        return @()
    }
    
    try {
        $trackingData = Get-Content $TrackingFile -Raw | ConvertFrom-Json
        
        # Handle both single object and array
        if ($trackingData -isnot [array]) {
            $trackingData = @($trackingData)
        }
        
        # Find the most recent tracking data for this game
        $gameTrackingData = $trackingData | 
            Where-Object { $_.GameName -eq $GameName } | 
            Sort-Object Timestamp -Descending | 
            Select-Object -First 1
        
        if ($gameTrackingData) {
            Write-Log "Found tracking data for $GameName from $($gameTrackingData.Timestamp)"
            
            # Return game-related processes sorted by priority
            $processes = $gameTrackingData.GameRelatedProcesses | 
                Sort-Object Priority | 
                ForEach-Object { $_.ProcessName }
            
            Write-Log "Tracked processes: $($processes -join ', ')"
            return $processes
        } else {
            Write-Log "No tracking data found for game: $GameName"
            return @()
        }
    } catch {
        Write-Log "Error reading tracking data: $($_.Exception.Message)" "ERROR"
        return @()
    }
}

function Get-IntelligentProcesses {
    param([string]$GameName)
    
    Write-Log "Using intelligent detection for: $GameName"
    
    # Generate potential process names based on game name
    $gameKeywords = @(
        $GameName,
        $GameName.Replace(' ', ''),
        $GameName.Replace(' ', '-'),
        $GameName.Replace(' ', '_'),
        $GameName.Split(' ')[0],
        $GameName.Split(' ')[-1]
    ) | Where-Object { $_.Length -gt 2 }
    
    $detectedProcesses = @()
    
    # Search for running processes that match game patterns
    $runningProcesses = Get-Process | Where-Object { 
        $_.ProcessName -notmatch '^(System|Idle|csrss|winlogon|services|lsass|svchost)$' 
    }
    
    foreach ($process in $runningProcesses) {
        foreach ($keyword in $gameKeywords) {
            if ($process.ProcessName -like "*$keyword*" -or 
                $process.MainWindowTitle -like "*$keyword*") {
                $detectedProcesses += $process.ProcessName
                Write-Log "Detected game process: $($process.ProcessName)"
                break
            }
        }
    }
    
    # Add common game-related processes if they're running
    $commonGameProcesses = @(
        'EasyAntiCheat', 'BEService', 'BattlEye', 'crashreporter', 'UE4-Win64-Shipping', 
        'Unity', 'launcher', 'updater'
    )
    
    foreach ($commonProcess in $commonGameProcesses) {
        $matchingProcesses = Get-Process -Name "*$commonProcess*" -ErrorAction SilentlyContinue
        if ($matchingProcesses) {
            $detectedProcesses += $matchingProcesses.ProcessName
            Write-Log "Detected common game process: $($matchingProcesses.ProcessName -join ', ')"
        }
    }
    
    return $detectedProcesses | Select-Object -Unique
}

function Close-ProcessGracefully {
    param([string[]]$ProcessNames)
    
    if (-not $ProcessNames -or $ProcessNames.Count -eq 0) {
        Write-Log "No processes to close"
        return $true
    }
    
    Write-Log "Attempting graceful close for: $($ProcessNames -join ', ')"
    
    $closedCount = 0
    $totalProcesses = 0
    
    foreach ($processName in $ProcessNames) {
        $cleanName = $processName -replace '\.exe$', ''
        $processes = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
        
        if ($processes) {
            $totalProcesses += $processes.Count
            foreach ($process in $processes) {
                try {
                    if ($process.MainWindowHandle -ne [System.IntPtr]::Zero) {
                        Write-Log "Closing window for PID $($process.Id): $($process.ProcessName)"
                        $process.CloseMainWindow() | Out-Null
                        $closedCount++
                    } else {
                        Write-Log "No main window for PID $($process.Id): $($process.ProcessName)"
                    }
                } catch {
                    Write-Log "Failed to close window for PID $($process.Id): $($_.Exception.Message)" "ERROR"
                }
            }
        }
    }
    
    if ($closedCount -gt 0) {
        Write-Log "Sent close signal to $closedCount window(s). Waiting $GraceTimeoutSeconds seconds..."
        Start-Sleep -Seconds $GraceTimeoutSeconds
        
        # Check if any processes are still running
        $remainingProcesses = 0
        foreach ($processName in $ProcessNames) {
            $cleanName = $processName -replace '\.exe$', ''
            $remaining = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
            if ($remaining) {
                $remainingProcesses += $remaining.Count
            }
        }
        
        return ($remainingProcesses -eq 0)
    }
    
    return ($totalProcesses -eq 0)
}

function Kill-ProcessTree {
    param([string[]]$ProcessNames)
    
    if (-not $ProcessNames -or $ProcessNames.Count -eq 0) {
        Write-Log "No processes to kill"
        return
    }
    
    Write-Log "Force killing processes: $($ProcessNames -join ', ')"
    
    foreach ($processName in $ProcessNames) {
        $cleanName = $processName -replace '\.exe$', ''
        $processes = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
        
        foreach ($process in $processes) {
            try {
                Write-Log "Killing process PID $($process.Id): $($process.ProcessName)"
                
                # Kill child processes first
                $childProcesses = Get-WmiObject -Class Win32_Process | 
                    Where-Object { $_.ParentProcessId -eq $process.Id }
                
                foreach ($child in $childProcesses) {
                    try {
                        Write-Log "Killing child process PID $($child.ProcessId): $($child.Name)"
                        Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
                    } catch {
                        Write-Log "Failed to kill child process $($child.ProcessId): $($_.Exception.Message)" "ERROR"
                    }
                }
                
                # Kill the main process
                Stop-Process -Id $process.Id -Force
                Write-Log "Successfully killed PID $($process.Id)"
                
            } catch {
                Write-Log "Failed to kill process PID $($process.Id): $($_.Exception.Message)" "ERROR"
            }
        }
    }
}

# Main execution
$apolloContext = Get-ApolloContext

# Use Apollo app name if GameName not provided
if (-not $GameName -and $apolloContext.AppName) {
    $GameName = $apolloContext.AppName
    Write-Log "Using Apollo app name: $GameName"
} elseif (-not $GameName) {
    Write-Log "No game name provided and no Apollo context available" "ERROR"
    exit 1
}

Write-Log "Starting intelligent process cleanup for: $GameName" "INFO"
if ($apolloContext.AppName) {
    Write-Log "Apollo Context - App: $($apolloContext.AppName), Status: $($apolloContext.AppStatus), Client: $($apolloContext.ClientName)"
}

# Tier 1: Use tracked processes
$trackedProcesses = Get-TrackedProcesses -GameName $GameName
$processesToClose = @()

if ($trackedProcesses -and $trackedProcesses.Count -gt 0) {
    Write-Log "Using tracked processes (Tier 1)"
    $processesToClose = $trackedProcesses
} else {
    # Tier 2: Intelligent detection
    Write-Log "No tracked processes found, using intelligent detection (Tier 2)"
    $detectedProcesses = Get-IntelligentProcesses -GameName $GameName
    
    if ($detectedProcesses -and $detectedProcesses.Count -gt 0) {
        $processesToClose = $detectedProcesses
    } else {
        # Tier 3: Fallback to manual process list
        Write-Log "No processes detected, using fallback list (Tier 3)"
        if ($FallbackProcesses -and $FallbackProcesses.Count -gt 0) {
            $processesToClose = $FallbackProcesses
        } else {
            Write-Log "No fallback processes provided, cleanup complete" "WARN"
            return
        }
    }
}

Write-Log "Final process list for cleanup: $($processesToClose -join ', ')"

# Attempt graceful close first
$gracefullyClosed = Close-ProcessGracefully -ProcessNames $processesToClose

if ($gracefullyClosed) {
    Write-Log "Successfully closed all processes gracefully" "INFO"
} else {
    # Force kill remaining processes
    Write-Log "Graceful close failed, force killing remaining processes" "INFO"
    Kill-ProcessTree -ProcessNames $processesToClose
}

# Final verification
Start-Sleep -Seconds 2
$remainingProcesses = @()
foreach ($processName in $processesToClose) {
    $cleanName = $processName -replace '\.exe$', ''
    $remaining = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
    if ($remaining) {
        $remainingProcesses += $remaining.ProcessName
    }
}

if ($remainingProcesses.Count -gt 0) {
    Write-Log "Warning: Some processes may still be running: $($remainingProcesses -join ', ')" "ERROR"
} else {
    Write-Log "All processes successfully cleaned up for: $GameName" "INFO"
}

Write-Log "Intelligent process cleanup completed" "INFO"
