function Get-TrackedProcessesInternal {
    <#
    .SYNOPSIS
        Internal function to retrieve tracked processes for a specific game.

    .DESCRIPTION
        Loads tracking data from file and returns the game-related processes
        that were identified during the tracking phase.

    .PARAMETER GameName
        Name of the game to retrieve tracked processes for.

    .PARAMETER TrackingFile
        Path to the tracking data file.

    .OUTPUTS
        [string[]] Array of process names that were tracked for the game

    .NOTES
        This is an internal function and should not be called directly.
    #>
    
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)]
        [string]$GameName,
        
        [Parameter(Mandatory)]
        [string]$TrackingFile
    )

    try {
        if (-not (Test-Path $TrackingFile)) {
            Write-ApolloLogInternal -Message "No tracking file found, creating on-the-fly tracking data" -Level "INFO" -Category "ProcessCleanup"

            # Create tracking data dynamically by detecting current processes
            $currentProcesses = Get-IntelligentProcessesInternal -GameName $GameName

            if ($currentProcesses -and $currentProcesses.Count -gt 0) {
                # Create tracking directory if it doesn't exist
                $trackingDir = Split-Path $TrackingFile -Parent
                if (-not (Test-Path $trackingDir)) {
                    New-Item -Path $trackingDir -ItemType Directory -Force | Out-Null
                    Write-ApolloLogInternal -Message "Created tracking directory: $trackingDir" -Level "INFO" -Category "ProcessCleanup"
                }

                # Create tracking data structure
                $trackingData = [PSCustomObject]@{
                    GameName = $GameName
                    Timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
                    ProcessSnapshot = @{
                        BeforeGame = @()
                        AfterGame = $currentProcesses | ForEach-Object {
                            [PSCustomObject]@{
                                ProcessName = $_
                                ProcessId = (Get-Process -Name $_ -ErrorAction SilentlyContinue | Select-Object -First 1).Id
                                StartTime = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
                            }
                        }
                    }
                    TrackedProcesses = $currentProcesses
                }

                # Save the tracking data
                $trackingData | ConvertTo-Json -Depth 10 | Set-Content $TrackingFile -Encoding UTF8
                Write-ApolloLogInternal -Message "Created on-the-fly tracking file with $($currentProcesses.Count) processes" -Level "INFO" -Category "ProcessCleanup"

                return $currentProcesses
            }
            else {
                Write-ApolloLogInternal -Message "No processes detected for on-the-fly tracking" -Level "DEBUG" -Category "ProcessCleanup"
                return @()
            }
        }
        
        # Load tracking data
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
            Write-ApolloLogInternal -Message "Found tracking data for $GameName from $($gameTrackingData.Timestamp)" -Level "INFO" -Category "ProcessCleanup"
            
            # Return game-related processes sorted by priority
            $processes = $gameTrackingData.GameRelatedProcesses | 
                Sort-Object Priority | 
                ForEach-Object { $_.ProcessName }
            
            Write-ApolloLogInternal -Message "Tracked processes: $($processes -join ', ')" -Level "INFO" -Category "ProcessCleanup"
            return $processes
        }
        else {
            Write-ApolloLogInternal -Message "No tracking data found for game: $GameName" -Level "DEBUG" -Category "ProcessCleanup"
            return @()
        }
    }
    catch {
        Write-ApolloLogInternal -Message "Error reading tracking data: $($_.Exception.Message)" -Level "ERROR" -Category "ProcessCleanup"
        return @()
    }
}

function Get-IntelligentProcessesInternal {
    <#
    .SYNOPSIS
        Internal function to intelligently detect game-related processes.

    .DESCRIPTION
        Uses pattern matching and heuristics to identify running processes
        that are likely related to the specified game.

    .PARAMETER GameName
        Name of the game to detect processes for.

    .OUTPUTS
        [string[]] Array of detected process names

    .NOTES
        This is an internal function and should not be called directly.
    #>
    
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)]
        [string]$GameName
    )

    try {
        Write-ApolloLogInternal -Message "Using intelligent detection for: $GameName" -Level "INFO" -Category "ProcessCleanup"
        
        # Get current running processes
        $runningProcesses = Get-ProcessSnapshotInternal -UseCache:$true
        
        # Filter to non-system processes only
        $candidateProcesses = $runningProcesses | Where-Object { -not $_.IsSystemProcess }
        
        $detectedProcesses = @()
        
        # Test each candidate process
        foreach ($process in $candidateProcesses) {
            $isGameRelated = Test-GameRelatedProcessInternal -ProcessName $process.ProcessName -GameName $GameName -ProcessPath $process.ExecutablePath -WindowTitle $process.MainWindowTitle
            
            if ($isGameRelated) {
                $detectedProcesses += $process.ProcessName
                Write-ApolloLogInternal -Message "Detected game process: $($process.ProcessName)" -Level "INFO" -Category "ProcessCleanup"
            }
        }
        
        # Get configuration for additional patterns
        $config = Get-ApolloConfigurationInternal
        $gamePatterns = $config.gamePatterns
        
        # Add common game-related processes if they're running
        $commonGameProcesses = $gamePatterns.antiCheatProcesses + $gamePatterns.supportProcesses
        
        foreach ($commonProcess in $commonGameProcesses) {
            $matchingProcesses = $candidateProcesses | Where-Object { $_.ProcessName -like "*$commonProcess*" }
            if ($matchingProcesses) {
                foreach ($match in $matchingProcesses) {
                    if ($match.ProcessName -notin $detectedProcesses) {
                        $detectedProcesses += $match.ProcessName
                        Write-ApolloLogInternal -Message "Detected common game process: $($match.ProcessName)" -Level "INFO" -Category "ProcessCleanup"
                    }
                }
            }
        }
        
        return $detectedProcesses | Select-Object -Unique
    }
    catch {
        Write-ApolloLogInternal -Message "Error during intelligent process detection: $($_.Exception.Message)" -Level "ERROR" -Category "ProcessCleanup"
        return @()
    }
}

function Invoke-ProcessCleanup {
    <#
    .SYNOPSIS
        Internal function to perform the actual process cleanup.

    .DESCRIPTION
        Handles the graceful and forceful termination of processes with proper
        error handling and reporting.

    .PARAMETER ProcessNames
        Array of process names to terminate.

    .PARAMETER GraceTimeoutSeconds
        Time to wait for graceful termination.

    .PARAMETER Force
        Skip graceful termination.

    .PARAMETER Config
        Configuration object.

    .OUTPUTS
        [PSCustomObject] Cleanup results

    .NOTES
        This is an internal function and should not be called directly.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [string[]]$ProcessNames,
        
        [Parameter(Mandatory)]
        [int]$GraceTimeoutSeconds,
        
        [Parameter()]
        [switch]$Force,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    try {
        $result = [PSCustomObject]@{
            ProcessesClosed = 0
            ProcessesKilled = 0
            Success = $false
            RemainingProcesses = @()
        }
        
        if (-not $ProcessNames -or $ProcessNames.Count -eq 0) {
            Write-ApolloLogInternal -Message "No processes to clean up" -Level "INFO" -Category "ProcessCleanup"
            $result.Success = $true
            return $result
        }
        
        # Skip graceful close if Force is specified
        if (-not $Force) {
            # Attempt graceful close first
            $gracefulResult = Close-ProcessesGracefully -ProcessNames $ProcessNames -GraceTimeoutSeconds $GraceTimeoutSeconds -Config $Config
            $result.ProcessesClosed = $gracefulResult.ProcessesClosed
            
            if ($gracefulResult.AllClosed) {
                Write-ApolloLogInternal -Message "Successfully closed all processes gracefully" -Level "INFO" -Category "ProcessCleanup"
                $result.Success = $true
                return $result
            }
            
            # Get remaining processes for force kill
            $remainingProcesses = $gracefulResult.RemainingProcesses
        }
        else {
            $remainingProcesses = $ProcessNames
        }
        
        # Force kill remaining processes
        if ($remainingProcesses -and $remainingProcesses.Count -gt 0) {
            Write-ApolloLogInternal -Message "Graceful close failed or skipped, force killing remaining processes" -Level "INFO" -Category "ProcessCleanup"
            $forceResult = Kill-ProcessesForce -ProcessNames $remainingProcesses -Config $Config
            $result.ProcessesKilled = $forceResult.ProcessesKilled
            $result.RemainingProcesses = $forceResult.RemainingProcesses
        }
        
        # Final verification
        Start-Sleep -Seconds 2
        $finalRemaining = @()
        foreach ($processName in $ProcessNames) {
            $cleanName = $processName -replace '\.exe$', ''
            $remaining = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
            if ($remaining) {
                $finalRemaining += $remaining.ProcessName
            }
        }
        
        $result.RemainingProcesses = $finalRemaining
        $result.Success = ($finalRemaining.Count -eq 0)
        
        if ($finalRemaining.Count -gt 0) {
            Write-ApolloLogInternal -Message "Warning: Some processes may still be running: $($finalRemaining -join ', ')" -Level "WARN" -Category "ProcessCleanup"
        }
        else {
            Write-ApolloLogInternal -Message "All processes successfully cleaned up" -Level "INFO" -Category "ProcessCleanup"
        }
        
        return $result
    }
    catch {
        Write-ApolloLogInternal -Message "Error during process cleanup: $($_.Exception.Message)" -Level "ERROR" -Category "ProcessCleanup"
        throw
    }
}

function Close-ProcessesGracefully {
    <#
    .SYNOPSIS
        Attempts to close processes gracefully using CloseMainWindow.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$ProcessNames,
        
        [Parameter(Mandatory)]
        [int]$GraceTimeoutSeconds,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    $result = [PSCustomObject]@{
        ProcessesClosed = 0
        AllClosed = $false
        RemainingProcesses = @()
    }
    
    Write-ApolloLogInternal -Message "Attempting graceful close for: $($ProcessNames -join ', ')" -Level "INFO" -Category "ProcessCleanup"
    
    $totalProcesses = 0
    $closedCount = 0
    
    foreach ($processName in $ProcessNames) {
        $cleanName = $processName -replace '\.exe$', ''
        $processes = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
        
        if ($processes) {
            $totalProcesses += $processes.Count
            foreach ($process in $processes) {
                try {
                    if ($process.MainWindowHandle -ne [System.IntPtr]::Zero) {
                        Write-ApolloLogInternal -Message "Closing window for PID $($process.Id): $($process.ProcessName)" -Level "DEBUG" -Category "ProcessCleanup"
                        $process.CloseMainWindow() | Out-Null
                        $closedCount++
                    }
                    else {
                        Write-ApolloLogInternal -Message "No main window for PID $($process.Id): $($process.ProcessName)" -Level "DEBUG" -Category "ProcessCleanup"
                    }
                }
                catch {
                    Write-ApolloLogInternal -Message "Failed to close window for PID $($process.Id): $($_.Exception.Message)" -Level "WARN" -Category "ProcessCleanup"
                }
            }
        }
    }
    
    $result.ProcessesClosed = $closedCount
    
    if ($closedCount -gt 0) {
        Write-ApolloLogInternal -Message "Sent close signal to $closedCount window(s). Waiting $GraceTimeoutSeconds seconds..." -Level "INFO" -Category "ProcessCleanup"
        Start-Sleep -Seconds $GraceTimeoutSeconds
        
        # Check which processes are still running
        $remainingProcesses = @()
        foreach ($processName in $ProcessNames) {
            $cleanName = $processName -replace '\.exe$', ''
            $remaining = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
            if ($remaining) {
                $remainingProcesses += $processName
            }
        }
        
        $result.RemainingProcesses = $remainingProcesses
        $result.AllClosed = ($remainingProcesses.Count -eq 0)
    }
    else {
        $result.AllClosed = ($totalProcesses -eq 0)
        $result.RemainingProcesses = if ($totalProcesses -gt 0) { $ProcessNames } else { @() }
    }
    
    return $result
}

function Kill-ProcessesForce {
    <#
    .SYNOPSIS
        Force kills processes and their child processes.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$ProcessNames,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    $result = [PSCustomObject]@{
        ProcessesKilled = 0
        RemainingProcesses = @()
    }
    
    Write-ApolloLogInternal -Message "Force killing processes: $($ProcessNames -join ', ')" -Level "INFO" -Category "ProcessCleanup"
    
    foreach ($processName in $ProcessNames) {
        $cleanName = $processName -replace '\.exe$', ''
        $processes = Get-Process -Name $cleanName -ErrorAction SilentlyContinue
        
        foreach ($process in $processes) {
            try {
                Write-ApolloLogInternal -Message "Killing process PID $($process.Id): $($process.ProcessName)" -Level "DEBUG" -Category "ProcessCleanup"
                
                # Kill child processes first using CIM instead of WMI
                $childProcesses = Get-CimInstance -ClassName Win32_Process | 
                    Where-Object { $_.ParentProcessId -eq $process.Id }
                
                foreach ($child in $childProcesses) {
                    try {
                        Write-ApolloLogInternal -Message "Killing child process PID $($child.ProcessId): $($child.Name)" -Level "DEBUG" -Category "ProcessCleanup"
                        Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
                    }
                    catch {
                        Write-ApolloLogInternal -Message "Failed to kill child process $($child.ProcessId): $($_.Exception.Message)" -Level "WARN" -Category "ProcessCleanup"
                    }
                }
                
                # Kill the main process
                Stop-Process -Id $process.Id -Force
                $result.ProcessesKilled++
                Write-ApolloLogInternal -Message "Successfully killed PID $($process.Id)" -Level "DEBUG" -Category "ProcessCleanup"
                
            }
            catch {
                Write-ApolloLogInternal -Message "Failed to kill process PID $($process.Id): $($_.Exception.Message)" -Level "ERROR" -Category "ProcessCleanup"
                $result.RemainingProcesses += $processName
            }
        }
    }
    
    return $result
}
