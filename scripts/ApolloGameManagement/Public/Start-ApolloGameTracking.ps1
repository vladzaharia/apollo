function Start-ApolloGameTracking {
    <#
    .SYNOPSIS
        Starts intelligent process tracking for Apollo game launches.

    .DESCRIPTION
        Monitors and tracks all processes that start during a game launch period.
        This information is used later for intelligent cleanup when the game exits.
        The function captures detailed process information and identifies game-related processes.

    .PARAMETER GameName
        The name of the game to track. If not specified, attempts to use Apollo environment context.

    .PARAMETER TrackingDurationSeconds
        Duration in seconds to monitor for new processes. Default is from configuration.

    .PARAMETER TrackingFile
        Custom path for the tracking data file. If not specified, uses configuration default.

    .PARAMETER Force
        Overwrite existing tracking data for the same game.

    .PARAMETER PassThru
        Return tracking results as output.

    .OUTPUTS
        [PSCustomObject] When PassThru is specified, returns tracking results including:
        - GameName: Name of the tracked game
        - TrackingDuration: Duration of tracking in seconds
        - NewProcessCount: Number of new processes detected
        - GameRelatedProcessCount: Number of game-related processes identified
        - NewProcesses: Array of new process objects
        - Success: Boolean indicating if tracking completed successfully

    .EXAMPLE
        Start-ApolloGameTracking -GameName "Cyberpunk 2077"

    .EXAMPLE
        Start-ApolloGameTracking -GameName "Elden Ring" -TrackingDurationSeconds 90

    .EXAMPLE
        $result = Start-ApolloGameTracking -GameName "Halo Infinite" -PassThru
        Write-Host "Tracked $($result.NewProcessCount) new processes"

    .EXAMPLE
        # Use Apollo context automatically
        Start-ApolloGameTracking

    .NOTES
        This function should be called as a "prep" command in Apollo before launching a game.
        It captures a baseline of running processes, waits for the specified duration,
        then identifies new processes that started during the game launch.
        
        The tracking data is saved to a JSON file for later use by Stop-ApolloGameProcesses.
        
        Requires elevated privileges for comprehensive process monitoring.

    .LINK
        Stop-ApolloGameProcesses
        Get-ApolloContext
        Write-ApolloLog
    #>
    
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSCustomObject])]
    param(
        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [ValidateLength(1, 255)]
        [ValidateScript({
            $validation = Test-SecurityValidation -InputString $_ -ValidationLevel 'Standard'
            if (-not $validation.IsValid) {
                throw "Game name validation failed: $($validation.SecurityWarnings -join '; ')"
            }
            return $true
        })]
        [string]$GameName = '',
        
        [Parameter()]
        [ValidateRange(10, 300)]
        [int]$TrackingDurationSeconds = 0,
        
        [Parameter()]
        [ValidateScript({
            if ([string]::IsNullOrWhiteSpace($_)) {
                throw "Tracking file path cannot be empty"
            }
            # Enhanced security validation for file paths
            $validation = Test-SecurityValidation -FilePath $_ -ValidationLevel 'Standard'
            if (-not $validation.IsValid) {
                throw "Tracking file path validation failed: $($validation.SecurityWarnings -join '; ')"
            }
            # Ensure parent directory exists or can be created
            $parentDir = Split-Path $_ -Parent
            if ($parentDir -and -not (Test-Path $parentDir)) {
                try {
                    New-Item -ItemType Directory -Path $parentDir -Force -WhatIf | Out-Null
                } catch {
                    throw "Cannot create tracking file directory: $parentDir"
                }
            }
            return $true
        })]
        [string]$TrackingFile = '',
        
        [Parameter()]
        [switch]$Force,
        
        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose "Initializing Apollo game process tracking"
        
        # Check for elevated privileges
        if (-not (Test-IsElevated)) {
            Write-Warning "Running without elevated privileges. Process tracking may be limited."
        }
    }

    process {
        $result = Invoke-ErrorHandling -ScriptBlock {
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
            
            # Resolve tracking duration
            if ($TrackingDurationSeconds -eq 0) {
                $TrackingDurationSeconds = $config.tracking.defaultDurationSeconds
            }
            
            # Resolve tracking file path
            if (-not $TrackingFile) {
                $TrackingFile = [Environment]::ExpandEnvironmentVariables($config.tracking.trackingFilePath)
            }
            
            # Ensure tracking directory exists
            $trackingDir = Split-Path $TrackingFile -Parent
            if (-not (Test-Path $trackingDir)) {
                if ($PSCmdlet.ShouldProcess($trackingDir, "Create tracking directory")) {
                    New-Item -ItemType Directory -Path $trackingDir -Force | Out-Null
                    Write-ApolloLog -Message "Created tracking directory: $trackingDir" -Level "INFO"
                }
            }
            
            Write-ApolloLog -Message "Starting process tracking for: $GameName" -Level "INFO" -Category "ProcessTracking"
            Write-ApolloLog -Message "Tracking duration: $TrackingDurationSeconds seconds" -Level "INFO" -Category "ProcessTracking"
            
            if ($PSCmdlet.ShouldProcess($GameName, "Start process tracking")) {
                # Take initial process snapshot
                Write-ApolloLog -Message "Taking initial process snapshot..." -Level "INFO" -Category "ProcessTracking"
                $initialProcesses = Get-ProcessSnapshotInternal -UseCache:$false
                
                Write-ApolloLog -Message "Initial process count: $($initialProcesses.Count)" -Level "INFO" -Category "ProcessTracking"
                
                # Wait for the specified tracking duration
                Write-ApolloLog -Message "Monitoring new processes for $TrackingDurationSeconds seconds..." -Level "INFO" -Category "ProcessTracking"
                Start-Sleep -Seconds $TrackingDurationSeconds
                
                # Take final process snapshot
                Write-ApolloLog -Message "Taking final process snapshot..." -Level "INFO" -Category "ProcessTracking"
                $finalProcesses = Get-ProcessSnapshotInternal -UseCache:$false
                
                # Identify new processes
                $newProcesses = $finalProcesses | Where-Object {
                    $finalProcess = $_
                    -not ($initialProcesses | Where-Object { $_.ProcessId -eq $finalProcess.ProcessId })
                }
                
                Write-ApolloLog -Message "Found $($newProcesses.Count) new processes during tracking period" -Level "INFO" -Category "ProcessTracking"
                
                # Analyze new processes for game relation
                $gameRelatedProcesses = @()
                foreach ($process in $newProcesses) {
                    $isGameRelated = Test-GameRelatedProcessInternal -ProcessName $process.ProcessName -GameName $GameName -ProcessPath $process.ExecutablePath -WindowTitle $process.MainWindowTitle
                    $process.IsGameRelated = $isGameRelated
                    $process.Priority = Get-ProcessPriorityInternal -ProcessName $process.ProcessName -GameName $GameName
                    
                    if ($isGameRelated) {
                        $gameRelatedProcesses += $process
                        Write-ApolloLog -Message "Game-related process detected: $($process.ProcessName) (PID: $($process.ProcessId))" -Level "INFO" -Category "ProcessTracking"
                    }
                    else {
                        Write-ApolloLog -Message "System process detected: $($process.ProcessName) (PID: $($process.ProcessId))" -Level "DEBUG" -Category "ProcessTracking"
                    }
                }
                
                # Save tracking data
                $trackingData = Save-TrackingDataInternal -GameName $GameName -InitialProcesses $initialProcesses -FinalProcesses $finalProcesses -NewProcesses $newProcesses -TrackingFile $TrackingFile -Config $config -Force:$Force
                
                Write-ApolloLog -Message "Process tracking completed successfully for: $GameName" -Level "INFO" -Category "ProcessTracking"
                Write-ApolloLog -Message "Game-related processes identified: $($gameRelatedProcesses.Count)" -Level "INFO" -Category "ProcessTracking"
                
                # Return tracking results
                return [PSCustomObject]@{
                    GameName = $GameName
                    TrackingDuration = $TrackingDurationSeconds
                    NewProcessCount = $newProcesses.Count
                    GameRelatedProcessCount = $gameRelatedProcesses.Count
                    NewProcesses = $newProcesses
                    GameRelatedProcesses = $gameRelatedProcesses
                    TrackingFile = $TrackingFile
                    Success = $true
                    Timestamp = Get-Date
                }
            }
        } -ErrorCategory 'ProcessManagement' -RetryCount 1 -SuppressErrors:$PassThru

        # Handle the structured result
        if ($result.Success) {
            Write-Verbose "Process tracking completed successfully"
            if ($PassThru) {
                return $result.Result
            }
        } else {
            $errorMessage = "Failed to start Apollo game tracking: $($result.Error)"
            if ($PassThru) {
                return [PSCustomObject]@{
                    GameName = $GameName
                    Success = $false
                    Error = $result.Error
                    ErrorDetails = $result.ErrorDetails
                    Timestamp = Get-Date
                }
            } else {
                Write-Error $errorMessage -ErrorAction Stop
            }
        }
    }

    end {
        Write-Verbose "Apollo game process tracking completed"
    }
}

function Test-IsElevated {
    <#
    .SYNOPSIS
        Tests if the current PowerShell session is running with elevated privileges.
    #>
    
    [CmdletBinding()]
    [OutputType([bool])]
    param()

    try {
        $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
        return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        Write-Warning "Failed to check elevation status: $($_.Exception.Message)"
        return $false
    }
}


