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

    .PARAMETER TrackingFile
        Path to the tracking data file.

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
        [string]$TrackingFile,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config,
        
        [Parameter()]
        [switch]$Force
    )

    try {
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
        
        # Load existing tracking data
        $allTrackingData = @()
        if (Test-Path $TrackingFile) {
            try {
                $existingData = Get-Content $TrackingFile -Raw | ConvertFrom-Json
                if ($existingData -is [array]) {
                    $allTrackingData = $existingData
                }
                else {
                    $allTrackingData = @($existingData)
                }
            }
            catch {
                Write-ApolloLogInternal -Message "Warning: Could not read existing tracking data: $($_.Exception.Message)" -Level "WARN" -Category "ProcessTracking"
            }
        }
        
        # Remove existing entry for this game if Force is specified
        if ($Force) {
            $allTrackingData = $allTrackingData | Where-Object { $_.GameName -ne $GameName }
        }
        
        # Add new tracking data
        $allTrackingData += $trackingData
        
        # Keep only the configured number of entries
        $maxEntries = $Config.tracking.maxTrackingEntries
        if ($allTrackingData.Count -gt $maxEntries) {
            $allTrackingData = $allTrackingData | Sort-Object Timestamp -Descending | Select-Object -First $maxEntries
        }
        
        # Save updated tracking data
        $allTrackingData | ConvertTo-Json -Depth 10 | Set-Content $TrackingFile -Encoding UTF8
        Write-ApolloLogInternal -Message "Tracking data saved for $GameName" -Level "INFO" -Category "ProcessTracking"
        
        return $trackingData
    }
    catch {
        Write-ApolloLogInternal -Message "Error saving tracking data: $($_.Exception.Message)" -Level "ERROR" -Category "ProcessTracking"
        throw
    }
}
