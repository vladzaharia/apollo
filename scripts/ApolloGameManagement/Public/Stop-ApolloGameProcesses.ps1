function Stop-ApolloGameProcesses {
    <#
    .SYNOPSIS
        Stops game-related processes using intelligent detection and tracking data.

    .DESCRIPTION
        Performs intelligent cleanup of game-related processes using a tiered approach:
        1. Tracked processes from previous Start-ApolloGameTracking call
        2. Intelligent detection based on game name patterns
        3. Manual fallback process list
        
        Uses graceful termination first, then force termination if necessary.

    .PARAMETER GameName
        The name of the game whose processes should be stopped. If not specified, 
        attempts to use Apollo environment context.

    .PARAMETER FallbackProcesses
        Array of process names to use as fallback if no tracked or detected processes are found.



    .PARAMETER GraceTimeoutSeconds
        Time to wait for graceful process termination before force killing. Default is from configuration.

    .PARAMETER Force
        Skip graceful termination and immediately force kill processes.

    .PARAMETER WhatIf
        Show what processes would be terminated without actually stopping them.

    .PARAMETER PassThru
        Return cleanup results as output.

    .OUTPUTS
        [PSCustomObject] When PassThru is specified, returns cleanup results including:
        - GameName: Name of the game processed
        - ProcessesFound: Number of processes found for cleanup
        - ProcessesClosed: Number of processes successfully closed
        - ProcessesKilled: Number of processes force killed
        - Success: Boolean indicating if cleanup completed successfully
        - Method: Which detection method was used (Tracked, Intelligent, Fallback)

    .EXAMPLE
        Stop-ApolloGameProcesses -GameName "Cyberpunk 2077"

    .EXAMPLE
        Stop-ApolloGameProcesses -GameName "Elden Ring" -GraceTimeoutSeconds 15

    .EXAMPLE
        $result = Stop-ApolloGameProcesses -GameName "Halo Infinite" -PassThru
        Write-Host "Cleanup method: $($result.Method)"

    .EXAMPLE
        # Use Apollo context automatically
        Stop-ApolloGameProcesses

    .EXAMPLE
        # Use fallback processes if detection fails
        Stop-ApolloGameProcesses -GameName "Custom Game" -FallbackProcesses @("game.exe", "launcher.exe")

    .NOTES
        This function should be called as an "undo" command in Apollo after a game exits.
        It attempts to clean up only game-related processes while preserving system processes
        and game launchers (Steam, Epic, etc.) unless they are specifically game-related.
        
        Requires elevated privileges for comprehensive process termination.

    .LINK
        Start-ApolloGameTracking
        Get-ApolloContext
        Write-ApolloLog
    #>
    
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    [OutputType([PSCustomObject])]
    param(
        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [string]$GameName = '',
        
        [Parameter()]
        [string[]]$FallbackProcesses = @(),
        

        
        [Parameter()]
        [ValidateRange(1, 60)]
        [int]$GraceTimeoutSeconds = 0,
        
        [Parameter()]
        [switch]$Force,
        
        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose "Initializing Apollo game process cleanup"
        
        # Check for elevated privileges
        if (-not (Test-IsElevated)) {
            Write-Warning "Running without elevated privileges. Process cleanup may be limited."
        }
    }

    process {
        try {
            # Get configuration
            $config = Get-ApolloConfiguration
            
            # Resolve game name
            if (-not $GameName) {
                $apolloContext = Get-ApolloContext
                if ($apolloContext.IsApolloEnvironment -and $apolloContext.AppName) {
                    $GameName = $apolloContext.AppName
                    Write-ApolloLog -Message "Using Apollo app name: $GameName" -Level "INFO"
                }
                else {
                    throw "No game name provided and no Apollo context available"
                }
            }
            
            # Resolve grace timeout
            if ($GraceTimeoutSeconds -eq 0) {
                $GraceTimeoutSeconds = $config.cleanup.graceTimeoutSeconds
            }
            

            
            Write-ApolloLog -Message "Starting intelligent process cleanup for: $GameName" -Level "INFO" -Category "ProcessCleanup"
            
            # Initialize results
            $processesToClose = @()
            $detectionMethod = ""
            
            # Tier 1: Use tracked processes
            $trackedProcesses = Get-TrackedProcessesInternal -GameName $GameName -Config $config
            
            if ($trackedProcesses -and $trackedProcesses.Count -gt 0) {
                Write-ApolloLog -Message "Using tracked processes (Tier 1)" -Level "INFO" -Category "ProcessCleanup"
                $processesToClose = $trackedProcesses
                $detectionMethod = "Tracked"
            }
            else {
                # Tier 2: Intelligent detection
                Write-ApolloLog -Message "No tracked processes found, using intelligent detection (Tier 2)" -Level "INFO" -Category "ProcessCleanup"
                $detectedProcesses = Get-IntelligentProcessesInternal -GameName $GameName
                
                if ($detectedProcesses -and $detectedProcesses.Count -gt 0) {
                    $processesToClose = $detectedProcesses
                    $detectionMethod = "Intelligent"
                }
                else {
                    # Tier 3: Fallback to manual process list
                    Write-ApolloLog -Message "No processes detected, using fallback list (Tier 3)" -Level "INFO" -Category "ProcessCleanup"
                    if ($FallbackProcesses -and $FallbackProcesses.Count -gt 0) {
                        $processesToClose = $FallbackProcesses
                        $detectionMethod = "Fallback"
                    }
                    else {
                        Write-ApolloLog -Message "No fallback processes provided, cleanup complete" -Level "WARN" -Category "ProcessCleanup"
                        
                        if ($PassThru) {
                            return [PSCustomObject]@{
                                GameName = $GameName
                                ProcessesFound = 0
                                ProcessesClosed = 0
                                ProcessesKilled = 0
                                Success = $true
                                Method = "None"
                                Message = "No processes found to clean up"
                                Timestamp = Get-Date
                            }
                        }
                        return
                    }
                }
            }
            
            Write-ApolloLog -Message "Final process list for cleanup ($detectionMethod): $($processesToClose -join ', ')" -Level "INFO" -Category "ProcessCleanup"
            
            if ($PSCmdlet.ShouldProcess("$($processesToClose.Count) processes for game '$GameName'", "Stop processes")) {
                # Perform cleanup
                $cleanupResult = Invoke-ProcessCleanup -ProcessNames $processesToClose -GraceTimeoutSeconds $GraceTimeoutSeconds -Force:$Force -Config $config
                
                Write-ApolloLog -Message "Process cleanup completed for: $GameName" -Level "INFO" -Category "ProcessCleanup"
                Write-ApolloLog -Message "Processes closed gracefully: $($cleanupResult.ProcessesClosed)" -Level "INFO" -Category "ProcessCleanup"
                Write-ApolloLog -Message "Processes force killed: $($cleanupResult.ProcessesKilled)" -Level "INFO" -Category "ProcessCleanup"

                # Clean up tracking file if cleanup was successful and cleanup on exit is enabled
                if ($cleanupResult.Success -and $config.tracking.enableCleanupOnExit) {
                    $removed = Remove-GameTrackingFileInternal -GameName $GameName -Config $config
                    if ($removed) {
                        Write-ApolloLog -Message "Cleaned up tracking file for: $GameName" -Level "INFO" -Category "ProcessCleanup"
                    }
                }
                
                # Return results if requested
                if ($PassThru) {
                    return [PSCustomObject]@{
                        GameName = $GameName
                        ProcessesFound = $processesToClose.Count
                        ProcessesClosed = $cleanupResult.ProcessesClosed
                        ProcessesKilled = $cleanupResult.ProcessesKilled
                        Success = $cleanupResult.Success
                        Method = $detectionMethod
                        RemainingProcesses = $cleanupResult.RemainingProcesses
                        Timestamp = Get-Date
                    }
                }
            }
        }
        catch {
            $errorMessage = "Failed to stop Apollo game processes: $($_.Exception.Message)"
            Write-ApolloLog -Message $errorMessage -Level "ERROR" -Category "ProcessCleanup"
            
            if ($PassThru) {
                return [PSCustomObject]@{
                    GameName = $GameName
                    Success = $false
                    Error = $_.Exception.Message
                    Timestamp = Get-Date
                }
            }
            
            Write-Error $errorMessage -ErrorAction Stop
        }
    }

    end {
        Write-Verbose "Apollo game process cleanup completed"
    }
}
