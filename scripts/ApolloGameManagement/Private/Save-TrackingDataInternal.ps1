function Save-TrackingDataInternal {
    <#
    .SYNOPSIS
        Internal function to save process tracking data to file.

    .DESCRIPTION
        Saves process tracking data to a JSON file with proper data management,
        including handling existing data, rotation, and cleanup.

    .PARAMETER GameName
        Name of the game being tracked.

    .PARAMETER InitialProcesses
        Array of processes from the initial snapshot.

    .PARAMETER FinalProcesses
        Array of processes from the final snapshot.

    .PARAMETER NewProcesses
        Array of new processes detected during tracking.

    .PARAMETER Config
        Configuration object.

    .PARAMETER Force
        Overwrite existing tracking data for the same game.

    .OUTPUTS
        [PSCustomObject] The saved tracking data object

    .NOTES
        This is an internal function and should not be called directly.
    #>

    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [string]$GameName,

        [Parameter(Mandatory)]
        [Array]$InitialProcesses,

        [Parameter(Mandatory)]
        [Array]$FinalProcesses,

        [Parameter(Mandatory)]
        [Array]$NewProcesses,

        [Parameter(Mandatory)]
        [PSCustomObject]$Config,

        [Parameter()]
        [switch]$Force
    )

    try {
        # Get the tracking file path for this specific game
        $TrackingFile = Get-TrackingFilePathInternal -GameName $GameName -Config $Config

        # Ensure tracking directory exists
        $trackingDir = Split-Path $TrackingFile -Parent
        if (-not (Test-Path $trackingDir)) {
            New-Item -ItemType Directory -Path $trackingDir -Force | Out-Null
            Write-ApolloLogInternal -Message "Created tracking directory: $trackingDir" -Level "INFO" -Category "ProcessTracking"
        }

        # Build tracking data object
        $trackingData = [PSCustomObject]@{
            GameName = $GameName
            Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            TrackingDuration = $Config.tracking.defaultDurationSeconds
            InitialProcessCount = $InitialProcesses.Count
            FinalProcessCount = $FinalProcesses.Count
            NewProcessCount = $NewProcesses.Count
            NewProcesses = $NewProcesses | ForEach-Object {
                [PSCustomObject]@{
                    ProcessName = $_.ProcessName
                    ProcessId = $_.ProcessId
                    StartTime = $_.StartTime
                    ExecutablePath = $_.ExecutablePath
                    MainWindowTitle = $_.MainWindowTitle
                    IsGameRelated = $_.IsGameRelated
                    Priority = $_.Priority
                }
            }
            GameRelatedProcesses = ($NewProcesses | Where-Object { $_.IsGameRelated }) | ForEach-Object {
                [PSCustomObject]@{
                    ProcessName = $_.ProcessName
                    ProcessId = $_.ProcessId
                    ExecutablePath = $_.ExecutablePath
                    Priority = $_.Priority
                }
            }
        }

        # For per-game files, we simply overwrite the existing file (if Force is specified) or create a new one
        if (Test-Path $TrackingFile -and -not $Force) {
            Write-ApolloLogInternal -Message "Tracking file already exists for $GameName. Use -Force to overwrite." -Level "WARN" -Category "ProcessTracking"
            # Load existing data and return it instead of overwriting
            try {
                $existingData = Get-Content $TrackingFile -Raw | ConvertFrom-Json
                Write-ApolloLogInternal -Message "Returning existing tracking data for $GameName" -Level "INFO" -Category "ProcessTracking"
                return $existingData
            }
            catch {
                Write-ApolloLogInternal -Message "Warning: Could not read existing tracking data, creating new: $($_.Exception.Message)" -Level "WARN" -Category "ProcessTracking"
            }
        }

        # Save tracking data to the game-specific file
        $trackingData | ConvertTo-Json -Depth 10 | Set-Content $TrackingFile -Encoding UTF8
        Write-ApolloLogInternal -Message "Tracking data saved for $GameName to: $TrackingFile" -Level "INFO" -Category "ProcessTracking"

        return $trackingData
    }
    catch {
        Write-ApolloLogInternal -Message "Error saving tracking data: $($_.Exception.Message)" -Level "ERROR" -Category "ProcessTracking"
        throw
    }
}
