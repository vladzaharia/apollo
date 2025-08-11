function Write-ApolloLogInternal {
    <#
    .SYNOPSIS
        Internal enhanced logging function for Apollo Game Management.

    .DESCRIPTION
        Provides comprehensive logging with multiple output targets, log rotation,
        and Apollo context integration. Supports different log levels and formats.

    .PARAMETER Message
        The message to log.

    .PARAMETER Level
        The log level (DEBUG, INFO, WARN, ERROR, FATAL).

    .PARAMETER Category
        Optional category for the log entry.

    .PARAMETER LogFile
        Optional custom log file path. If not specified, uses configuration default.

    .PARAMETER NoConsole
        Suppress console output even if configured.

    .PARAMETER NoFile
        Suppress file output even if configured.

    .EXAMPLE
        Write-ApolloLogInternal -Message "Game process started" -Level "INFO"

    .EXAMPLE
        Write-ApolloLogInternal -Message "Failed to kill process" -Level "ERROR" -Category "ProcessCleanup"

    .NOTES
        This is an internal function and should not be called directly.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        
        [Parameter()]
        [ValidateSet('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')]
        [string]$Level = 'INFO',
        
        [Parameter()]
        [string]$Category = '',
        
        [Parameter()]
        [string]$LogFile = '',
        
        [Parameter()]
        [switch]$NoConsole,
        
        [Parameter()]
        [switch]$NoFile
    )

    try {
        # Get configuration
        $config = Get-ApolloConfigurationInternal
        $logConfig = $config.logging

        # Check if logging is enabled for this level
        $logLevels = @('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')
        $configuredLevel = $logConfig.logLevel
        $configuredLevelIndex = $logLevels.IndexOf($configuredLevel)
        $currentLevelIndex = $logLevels.IndexOf($Level)
        
        if ($currentLevelIndex -lt $configuredLevelIndex) {
            return # Skip logging for levels below configured threshold
        }

        # Get Apollo context
        $apolloContext = Get-ApolloContextInternal
        
        # Build timestamp
        $timestamp = Get-Date -Format $logConfig.timestampFormat
        
        # Build context information
        $contextInfo = ""
        if ($apolloContext.IsApolloEnvironment) {
            $contextParts = @()
            if ($apolloContext.AppName) { $contextParts += "App: $($apolloContext.AppName)" }
            if ($apolloContext.AppStatus) { $contextParts += "Status: $($apolloContext.AppStatus)" }
            if ($apolloContext.ClientName) { $contextParts += "Client: $($apolloContext.ClientName)" }
            
            if ($contextParts.Count -gt 0) {
                $contextInfo = " [$($contextParts -join '] [')]"
            }
        }
        
        # Build category information
        $categoryInfo = if ($Category) { " [$Category]" } else { "" }
        
        # Build final log message
        $logMessage = "[$timestamp] [$Level]$contextInfo$categoryInfo $Message"
        
        # Console output
        if (-not $NoConsole -and $logConfig.enableConsoleOutput) {
            Write-ConsoleLog -Message $logMessage -Level $Level
        }
        
        # File output
        if (-not $NoFile -and $logConfig.enableFileOutput) {
            $targetLogFile = if ($LogFile) { $LogFile } else { Get-LogFilePath -Config $logConfig }
            Write-FileLog -Message $logMessage -LogFile $targetLogFile -Config $logConfig
        }
    }
    catch {
        # Fallback logging to prevent breaking the calling script
        try {
            $fallbackMessage = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] [ERROR] ApolloLog: Failed to write log entry: $($_.Exception.Message)"
            Write-Warning $fallbackMessage
            
            # Try to write to a fallback log file
            $fallbackLogFile = Join-Path ([System.IO.Path]::GetTempPath()) "apollo-fallback.log"
            Add-Content -Path $fallbackLogFile -Value $fallbackMessage -Encoding UTF8 -ErrorAction SilentlyContinue
        }
        catch {
            # Ultimate fallback - just continue silently to avoid breaking game launches
        }
    }
}

function Write-ConsoleLog {
    <#
    .SYNOPSIS
        Writes log message to console with appropriate colors.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        
        [Parameter(Mandatory)]
        [string]$Level
    )

    $color = switch ($Level) {
        'DEBUG' { 'Gray' }
        'INFO' { 'White' }
        'WARN' { 'Yellow' }
        'ERROR' { 'Red' }
        'FATAL' { 'Magenta' }
        default { 'White' }
    }
    
    Write-Host $Message -ForegroundColor $color
}

function Write-FileLog {
    <#
    .SYNOPSIS
        Writes log message to file with rotation support.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        
        [Parameter(Mandatory)]
        [string]$LogFile,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    try {
        # Ensure log directory exists
        $logDir = Split-Path $LogFile -Parent
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        
        # Check for log rotation
        if ($Config.logRotationEnabled -and (Test-Path $LogFile)) {
            $logInfo = Get-Item $LogFile
            $maxSizeBytes = $Config.maxLogSizeMB * 1MB
            
            if ($logInfo.Length -gt $maxSizeBytes) {
                Rotate-LogFile -LogFile $LogFile -Config $Config
            }
        }
        
        # Write log entry
        Add-Content -Path $LogFile -Value $Message -Encoding UTF8
    }
    catch {
        Write-Warning "Failed to write to log file $LogFile`: $($_.Exception.Message)"
    }
}

function Rotate-LogFile {
    <#
    .SYNOPSIS
        Rotates log file when it exceeds size limit.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LogFile,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    try {
        $logDir = Split-Path $LogFile -Parent
        $logName = [System.IO.Path]::GetFileNameWithoutExtension($LogFile)
        $logExt = [System.IO.Path]::GetExtension($LogFile)
        
        # Create rotated log filename
        $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
        $rotatedLogFile = Join-Path $logDir "$logName`_$timestamp$logExt"
        
        # Move current log to rotated name
        Move-Item -Path $LogFile -Destination $rotatedLogFile -Force
        
        # Clean up old rotated logs
        $rotatedLogs = Get-ChildItem -Path $logDir -Filter "$logName`_*$logExt" | 
                      Sort-Object LastWriteTime -Descending
        
        if ($rotatedLogs.Count -gt $Config.maxLogFiles) {
            $logsToDelete = $rotatedLogs | Select-Object -Skip $Config.maxLogFiles
            $logsToDelete | Remove-Item -Force -ErrorAction SilentlyContinue
        }
    }
    catch {
        Write-Warning "Failed to rotate log file: $($_.Exception.Message)"
    }
}

function Get-LogFilePath {
    <#
    .SYNOPSIS
        Gets the appropriate log file path based on configuration.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    $logDir = $Config.logDirectory
    $logFileName = "ApolloGameManagement.log"
    
    return Join-Path $logDir $logFileName
}
