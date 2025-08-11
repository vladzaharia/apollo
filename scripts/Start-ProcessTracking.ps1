# Start-ProcessTracking.ps1
# Intelligent process tracking for Apollo game launches
# Tracks all processes that start during game launch for intelligent cleanup
# Uses Apollo environment variables for enhanced context awareness

param(
    [string]$GameName,
    [string]$TrackingFile = "C:\Tools\apollo\temp\process-tracking.json",
    [int]$TrackingDurationSeconds = 60,
    [switch]$Verbose,
    [string]$LogFile = ""
)

# Ensure temp directory exists
$tempDir = Split-Path $TrackingFile -Parent
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

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
        ClientWidth = $env:APOLLO_CLIENT_WIDTH
        ClientHeight = $env:APOLLO_CLIENT_HEIGHT
        ClientFPS = $env:APOLLO_CLIENT_FPS
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

    $logMessage = "[$timestamp] [$Level]$contextInfo ProcessTracking: $Message"

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

function Get-ProcessSnapshot {
    return Get-Process | Select-Object ProcessName, Id, StartTime, Path, MainWindowTitle | 
           Where-Object { $_.StartTime -and $_.ProcessName -notmatch '^(System|Idle|csrss|winlogon|services|lsass|svchost)$' }
}

function Save-TrackingData {
    param(
        [string]$GameName,
        [array]$InitialProcesses,
        [array]$FinalProcesses,
        [array]$NewProcesses
    )
    
    $trackingData = @{
        GameName = $GameName
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        TrackingDuration = $TrackingDurationSeconds
        InitialProcessCount = $InitialProcesses.Count
        FinalProcessCount = $FinalProcesses.Count
        NewProcessCount = $NewProcesses.Count
        NewProcesses = $NewProcesses | ForEach-Object {
            @{
                ProcessName = $_.ProcessName
                ProcessId = $_.Id
                StartTime = $_.StartTime
                Path = $_.Path
                MainWindowTitle = $_.MainWindowTitle
                IsGameRelated = Test-GameRelatedProcess -ProcessName $_.ProcessName -GameName $GameName
            }
        }
        GameRelatedProcesses = ($NewProcesses | Where-Object { 
            Test-GameRelatedProcess -ProcessName $_.ProcessName -GameName $GameName 
        }) | ForEach-Object {
            @{
                ProcessName = $_.ProcessName
                ProcessId = $_.Id
                Path = $_.Path
                Priority = Get-ProcessPriority -ProcessName $_.ProcessName -GameName $GameName
            }
        }
    }
    
    # Load existing tracking data
    $allTrackingData = @()
    if (Test-Path $TrackingFile) {
        try {
            $existingData = Get-Content $TrackingFile -Raw | ConvertFrom-Json
            if ($existingData -is [array]) {
                $allTrackingData = $existingData
            } else {
                $allTrackingData = @($existingData)
            }
        } catch {
            Write-Log "Warning: Could not read existing tracking data: $($_.Exception.Message)" "WARN"
        }
    }
    
    # Add new tracking data
    $allTrackingData += $trackingData
    
    # Keep only last 50 entries to prevent file bloat
    if ($allTrackingData.Count -gt 50) {
        $allTrackingData = $allTrackingData | Select-Object -Last 50
    }
    
    # Save updated tracking data
    try {
        $allTrackingData | ConvertTo-Json -Depth 10 | Set-Content $TrackingFile -Encoding UTF8
        Write-Log "Tracking data saved for $GameName"
    } catch {
        Write-Log "Error saving tracking data: $($_.Exception.Message)" "ERROR"
    }
}

function Test-GameRelatedProcess {
    param([string]$ProcessName, [string]$GameName)
    
    $gameKeywords = @(
        $GameName.Split(' '),
        $GameName.Replace(' ', ''),
        $GameName.Replace(' ', '-'),
        $GameName.Replace(' ', '_')
    ) | Where-Object { $_.Length -gt 2 }
    
    # Common game-related process patterns
    $gamePatterns = @(
        'launcher', 'game', 'client', 'engine', 'unity', 'unreal', 'steam', 'epic',
        'anticheat', 'easyanticheat', 'battleye', 'crash', 'reporter', 'updater'
    )
    
    foreach ($keyword in $gameKeywords) {
        if ($ProcessName -like "*$keyword*") { return $true }
    }
    
    foreach ($pattern in $gamePatterns) {
        if ($ProcessName -like "*$pattern*") { return $true }
    }
    
    return $false
}

function Get-ProcessPriority {
    param([string]$ProcessName, [string]$GameName)
    
    # Main game executable gets highest priority
    if ($ProcessName -like "*$($GameName.Replace(' ', ''))*" -or 
        $ProcessName -like "*$($GameName.Split(' ')[0])*") {
        return 1
    }
    
    # Launchers get medium priority
    if ($ProcessName -match '(launcher|client)') { return 2 }
    
    # Anti-cheat and support processes get lower priority
    if ($ProcessName -match '(anticheat|crash|reporter)') { return 3 }
    
    # Everything else gets lowest priority
    return 4
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

Write-Log "Starting process tracking for: $GameName" "INFO"
Write-Log "Tracking duration: $TrackingDurationSeconds seconds" "INFO"
if ($apolloContext.AppName) {
    Write-Log "Apollo Context - App: $($apolloContext.AppName), Status: $($apolloContext.AppStatus), Client: $($apolloContext.ClientName)"
}

# Take initial process snapshot
Write-Log "Taking initial process snapshot..."
$initialProcesses = Get-ProcessSnapshot

# Wait for the specified tracking duration
Write-Log "Tracking new processes for $TrackingDurationSeconds seconds..."
Start-Sleep -Seconds $TrackingDurationSeconds

# Take final process snapshot
Write-Log "Taking final process snapshot..."
$finalProcesses = Get-ProcessSnapshot

# Identify new processes
$newProcesses = $finalProcesses | Where-Object {
    $finalProcess = $_
    -not ($initialProcesses | Where-Object { $_.Id -eq $finalProcess.Id })
}

Write-Log "Found $($newProcesses.Count) new processes during tracking period"

if ($newProcesses.Count -gt 0) {
    Write-Log "New processes detected:"
    foreach ($proc in $newProcesses) {
        $isGameRelated = Test-GameRelatedProcess -ProcessName $proc.ProcessName -GameName $GameName
        $indicator = if ($isGameRelated) { "[GAME]" } else { "[SYS]" }
        Write-Log "  $indicator $($proc.ProcessName) (PID: $($proc.Id))"
    }
    
    # Save tracking data
    Save-TrackingData -GameName $GameName -InitialProcesses $initialProcesses -FinalProcesses $finalProcesses -NewProcesses $newProcesses
    
    Write-Log "Process tracking completed successfully for: $GameName" "INFO"
} else {
    Write-Log "No new processes detected during tracking period" "WARN"
}

# Return game-related processes for immediate use
$gameRelatedProcesses = $newProcesses | Where-Object { 
    Test-GameRelatedProcess -ProcessName $_.ProcessName -GameName $GameName 
}

if ($gameRelatedProcesses.Count -gt 0) {
    Write-Log "Game-related processes identified: $($gameRelatedProcesses.ProcessName -join ', ')"
    return $gameRelatedProcesses.ProcessName
} else {
    Write-Log "No game-related processes identified"
    return @()
}
