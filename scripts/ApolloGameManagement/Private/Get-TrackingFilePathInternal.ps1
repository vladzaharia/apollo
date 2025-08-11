function Get-TrackingFilePathInternal {
    <#
    .SYNOPSIS
        Internal function to get the tracking file path for a specific game.

    .DESCRIPTION
        Generates the full path to the tracking file for a specific game based on
        the configured tracking directory and game name. Creates a sanitized filename
        from the game name to ensure filesystem compatibility.

    .PARAMETER GameName
        The name of the game to get the tracking file path for.

    .PARAMETER Config
        Configuration object containing tracking settings.

    .OUTPUTS
        [string] The full path to the tracking file for the specified game

    .EXAMPLE
        $config = Get-ApolloConfigurationInternal
        $trackingFile = Get-TrackingFilePathInternal -GameName "Cyberpunk 2077" -Config $config

    .NOTES
        This function sanitizes the game name to create a valid filename by:
        - Removing invalid filesystem characters
        - Replacing spaces with underscores
        - Limiting length to prevent path issues

        The resulting filename format is: {sanitized-game-name}.json
    #>

    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$GameName,

        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    try {
        # Get tracking directory from config
        $trackingDir = [Environment]::ExpandEnvironmentVariables($Config.tracking.trackingDirectory)

        # Sanitize game name for filesystem
        $sanitizedGameName = $GameName -replace '[<>:"/\\|?*]', '' -replace '\s+', '_'

        # Limit filename length to prevent path issues
        if ($sanitizedGameName.Length -gt 100) {
            $sanitizedGameName = $sanitizedGameName.Substring(0, 100)
        }

        # Build filename with extension
        $fileName = "$sanitizedGameName$($Config.tracking.fileExtension)"

        # Return full path
        $fullPath = Join-Path $trackingDir $fileName

        Write-Verbose "Generated tracking file path: $fullPath"
        return $fullPath
    }
    catch {
        Write-Error "Failed to generate tracking file path for game '$GameName': $($_.Exception.Message)"
        throw
    }
}

function Remove-GameTrackingFileInternal {
    <#
    .SYNOPSIS
        Internal function to remove the tracking file for a specific game.

    .DESCRIPTION
        Removes the tracking file for a specific game as part of cleanup operations.
        This allows multiple games to run simultaneously without interfering with
        each other's tracking data.

    .PARAMETER GameName
        The name of the game whose tracking file should be removed.

    .PARAMETER Config
        Configuration object containing tracking settings.

    .PARAMETER Force
        Force removal even if the file is in use or protected.

    .OUTPUTS
        [bool] True if the file was successfully removed or didn't exist, False otherwise

    .EXAMPLE
        $config = Get-ApolloConfigurationInternal
        $removed = Remove-GameTrackingFileInternal -GameName "Cyberpunk 2077" -Config $config

    .NOTES
        This function is called during cleanup to ensure tracking files don't accumulate.
        It's safe to call even if the tracking file doesn't exist.
    #>

    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$GameName,

        [Parameter(Mandatory)]
        [PSCustomObject]$Config,

        [Parameter()]
        [switch]$Force
    )

    try {
        # Get the tracking file path
        $trackingFile = Get-TrackingFilePathInternal -GameName $GameName -Config $Config

        # Check if file exists
        if (-not (Test-Path $trackingFile)) {
            Write-Verbose "Tracking file does not exist: $trackingFile"
            return $true
        }

        if ($PSCmdlet.ShouldProcess($trackingFile, "Remove tracking file")) {
            # Remove the tracking file
            Remove-Item -Path $trackingFile -Force:$Force -ErrorAction Stop
            Write-ApolloLogInternal -Message "Removed tracking file for game: $GameName" -Level "INFO" -Category "ProcessTracking"
            return $true
        }

        return $false
    }
    catch {
        Write-ApolloLogInternal -Message "Failed to remove tracking file for game '$GameName': $($_.Exception.Message)" -Level "WARN" -Category "ProcessTracking"
        return $false
    }
}

function Get-AllTrackingFilesInternal {
    <#
    .SYNOPSIS
        Internal function to get all tracking files in the tracking directory.

    .DESCRIPTION
        Returns a list of all tracking files in the configured tracking directory.
        Useful for cleanup operations and maintenance tasks.

    .PARAMETER Config
        Configuration object containing tracking settings.

    .OUTPUTS
        [System.IO.FileInfo[]] Array of tracking files

    .EXAMPLE
        $config = Get-ApolloConfigurationInternal
        $trackingFiles = Get-AllTrackingFilesInternal -Config $config

    .NOTES
        This function only returns files with the configured tracking file extension.
    #>

    [CmdletBinding()]
    [OutputType([System.IO.FileInfo[]])]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    try {
        # Get tracking directory from config
        $trackingDir = [Environment]::ExpandEnvironmentVariables($Config.tracking.trackingDirectory)

        # Check if directory exists
        if (-not (Test-Path $trackingDir)) {
            Write-Verbose "Tracking directory does not exist: $trackingDir"
            return @()
        }

        # Get all tracking files
        $pattern = "*$($Config.tracking.fileExtension)"
        $trackingFiles = Get-ChildItem -Path $trackingDir -Filter $pattern -File

        Write-Verbose "Found $($trackingFiles.Count) tracking files in $trackingDir"
        return $trackingFiles
    }
    catch {
        Write-Error "Failed to get tracking files: $($_.Exception.Message)"
        return @()
    }
}
