function Clear-ApolloTrackingFiles {
    <#
    .SYNOPSIS
        Clears Apollo game tracking files for maintenance and cleanup.

    .DESCRIPTION
        Removes tracking files from the Apollo tracking directory. This function can be used
        to clean up old tracking files, remove files for specific games, or clear all
        tracking files for maintenance purposes.

    .PARAMETER GameName
        Name of a specific game whose tracking file should be removed. If not specified,
        all tracking files will be processed based on other parameters.

    .PARAMETER OlderThanDays
        Remove tracking files older than the specified number of days. Default is 7 days.

    .PARAMETER All
        Remove all tracking files regardless of age.

    .PARAMETER Force
        Force removal without confirmation prompts.

    .PARAMETER PassThru
        Return information about the cleanup operation.

    .OUTPUTS
        [PSCustomObject] When PassThru is specified, returns cleanup results including:
        - FilesFound: Number of tracking files found
        - FilesRemoved: Number of files successfully removed
        - FilesSkipped: Number of files skipped
        - Success: Boolean indicating if operation completed successfully

    .EXAMPLE
        Clear-ApolloTrackingFiles -GameName "Cyberpunk 2077"
        Removes the tracking file for Cyberpunk 2077.

    .EXAMPLE
        Clear-ApolloTrackingFiles -OlderThanDays 3
        Removes tracking files older than 3 days.

    .EXAMPLE
        Clear-ApolloTrackingFiles -All -Force
        Removes all tracking files without confirmation.

    .EXAMPLE
        $result = Clear-ApolloTrackingFiles -OlderThanDays 7 -PassThru
        Write-Host "Removed $($result.FilesRemoved) tracking files"

    .NOTES
        This function is useful for maintenance and preventing tracking files from
        accumulating over time. It respects the configured tracking directory and
        only processes files with the configured tracking file extension.
        
        Requires appropriate permissions to delete files in the tracking directory.

    .LINK
        Start-ApolloGameTracking
        Stop-ApolloGameProcesses
        Get-ApolloConfiguration
    #>
    
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSCustomObject])]
    param(
        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [string]$GameName = '',
        
        [Parameter()]
        [ValidateRange(0, 365)]
        [int]$OlderThanDays = 7,
        
        [Parameter()]
        [switch]$All,
        
        [Parameter()]
        [switch]$Force,
        
        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose "Initializing Apollo tracking file cleanup"
        
        # Check for elevated privileges if Force is specified
        if ($Force -and -not (Test-IsElevated)) {
            Write-Warning "Running without elevated privileges. Some files may not be removable."
        }
    }

    process {
        try {
            # Get configuration
            $config = Get-ApolloConfiguration
            
            # Initialize results
            $filesFound = 0
            $filesRemoved = 0
            $filesSkipped = 0
            $filesToProcess = @()
            
            if ($GameName) {
                # Remove specific game tracking file
                Write-ApolloLog -Message "Clearing tracking file for specific game: $GameName" -Level "INFO" -Category "TrackingCleanup"
                
                $trackingFile = Get-TrackingFilePathInternal -GameName $GameName -Config $config
                if (Test-Path $trackingFile) {
                    $filesToProcess = @(Get-Item $trackingFile)
                    $filesFound = 1
                }
                else {
                    Write-ApolloLog -Message "No tracking file found for game: $GameName" -Level "INFO" -Category "TrackingCleanup"
                }
            }
            else {
                # Get all tracking files
                Write-ApolloLog -Message "Scanning for tracking files to clean up" -Level "INFO" -Category "TrackingCleanup"
                
                $allTrackingFiles = Get-AllTrackingFilesInternal -Config $config
                $filesFound = $allTrackingFiles.Count
                
                if ($All) {
                    Write-ApolloLog -Message "Clearing all $filesFound tracking files" -Level "INFO" -Category "TrackingCleanup"
                    $filesToProcess = $allTrackingFiles
                }
                else {
                    # Filter by age
                    $cutoffDate = (Get-Date).AddDays(-$OlderThanDays)
                    $filesToProcess = $allTrackingFiles | Where-Object { $_.LastWriteTime -lt $cutoffDate }
                    
                    Write-ApolloLog -Message "Found $($filesToProcess.Count) tracking files older than $OlderThanDays days" -Level "INFO" -Category "TrackingCleanup"
                }
            }
            
            # Process files for removal
            if ($filesToProcess.Count -gt 0) {
                $confirmMessage = if ($GameName) {
                    "Remove tracking file for game '$GameName'"
                } elseif ($All) {
                    "Remove all $($filesToProcess.Count) tracking files"
                } else {
                    "Remove $($filesToProcess.Count) tracking files older than $OlderThanDays days"
                }
                
                if ($PSCmdlet.ShouldProcess($confirmMessage, "Clear tracking files")) {
                    foreach ($file in $filesToProcess) {
                        try {
                            Remove-Item -Path $file.FullName -Force:$Force -ErrorAction Stop
                            $filesRemoved++
                            Write-ApolloLog -Message "Removed tracking file: $($file.Name)" -Level "INFO" -Category "TrackingCleanup"
                        }
                        catch {
                            $filesSkipped++
                            Write-ApolloLog -Message "Failed to remove tracking file '$($file.Name)': $($_.Exception.Message)" -Level "WARN" -Category "TrackingCleanup"
                        }
                    }
                }
                else {
                    $filesSkipped = $filesToProcess.Count
                    Write-ApolloLog -Message "Tracking file cleanup cancelled by user" -Level "INFO" -Category "TrackingCleanup"
                }
            }
            else {
                Write-ApolloLog -Message "No tracking files found matching the specified criteria" -Level "INFO" -Category "TrackingCleanup"
            }
            
            Write-ApolloLog -Message "Tracking file cleanup completed. Found: $filesFound, Removed: $filesRemoved, Skipped: $filesSkipped" -Level "INFO" -Category "TrackingCleanup"
            
            # Return results if requested
            if ($PassThru) {
                return [PSCustomObject]@{
                    FilesFound = $filesFound
                    FilesRemoved = $filesRemoved
                    FilesSkipped = $filesSkipped
                    Success = ($filesSkipped -eq 0)
                    Timestamp = Get-Date
                }
            }
        }
        catch {
            $errorMessage = "Failed to clear Apollo tracking files: $($_.Exception.Message)"
            Write-ApolloLog -Message $errorMessage -Level "ERROR" -Category "TrackingCleanup"
            
            if ($PassThru) {
                return [PSCustomObject]@{
                    FilesFound = $filesFound
                    FilesRemoved = $filesRemoved
                    FilesSkipped = $filesSkipped
                    Success = $false
                    Error = $_.Exception.Message
                    Timestamp = Get-Date
                }
            }
            
            Write-Error $errorMessage -ErrorAction Stop
        }
    }
}
