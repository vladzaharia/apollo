function Write-ApolloLog {
    <#
    .SYNOPSIS
        Writes log messages with Apollo context integration.

    .DESCRIPTION
        Enhanced logging function that provides comprehensive logging with multiple output targets,
        log rotation, and Apollo context integration. Supports different log levels and formats.

    .PARAMETER Message
        The message to log. This parameter accepts pipeline input.

    .PARAMETER Level
        The log level. Valid values are DEBUG, INFO, WARN, ERROR, FATAL.
        Default is INFO.

    .PARAMETER Category
        Optional category for the log entry to help with log organization.

    .PARAMETER LogFile
        Optional custom log file path. If not specified, uses the configured default.

    .PARAMETER NoConsole
        Suppress console output even if configured to display console messages.

    .PARAMETER NoFile
        Suppress file output even if configured to write to log files.

    .PARAMETER PassThru
        Return the formatted log message as output.

    .INPUTS
        [String] Log message can be piped to this function.

    .OUTPUTS
        [String] When PassThru is specified, returns the formatted log message.

    .EXAMPLE
        Write-ApolloLog -Message "Game process started successfully" -Level "INFO"

    .EXAMPLE
        Write-ApolloLog -Message "Failed to terminate process" -Level "ERROR" -Category "ProcessCleanup"

    .EXAMPLE
        "Multiple", "Log", "Messages" | Write-ApolloLog -Level "DEBUG"

    .EXAMPLE
        $logMessage = Write-ApolloLog -Message "Important event" -Level "WARN" -PassThru
        Send-EmailAlert -Message $logMessage

    .NOTES
        Log levels hierarchy (from lowest to highest):
        DEBUG < INFO < WARN < ERROR < FATAL
        
        Only messages at or above the configured log level will be output.
        
        The function automatically includes Apollo context information when available,
        including app name, status, and client information.
        
        Log rotation is automatically handled based on configuration settings.

    .LINK
        Get-ApolloContext
        Get-ApolloConfiguration
    #>
    
    [CmdletBinding()]
    [OutputType([String])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [AllowEmptyString()]
        [string]$Message,
        
        [Parameter()]
        [ValidateSet('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')]
        [string]$Level = 'INFO',
        
        [Parameter()]
        [ValidateLength(0, 50)]
        [ValidateScript({
            if ($_ -and $_.Length -gt 0) {
                $validation = Test-SecurityValidation -InputString $_ -ValidationLevel 'Basic'
                if (-not $validation.IsValid) {
                    throw "Category validation failed: $($validation.SecurityWarnings -join '; ')"
                }
            }
            return $true
        })]
        [string]$Category = '',
        
        [Parameter()]
        [ValidateScript({
            if ($_ -and -not (Test-Path (Split-Path $_ -Parent) -PathType Container)) {
                throw "Log file directory does not exist: $(Split-Path $_ -Parent)"
            }
            return $true
        })]
        [string]$LogFile = '',
        
        [Parameter()]
        [switch]$NoConsole,
        
        [Parameter()]
        [switch]$NoFile,
        
        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose "Initializing Apollo logging with level: $Level"
    }

    process {
        try {
            # Call internal logging function
            Write-ApolloLogInternal -Message $Message -Level $Level -Category $Category -LogFile $LogFile -NoConsole:$NoConsole -NoFile:$NoFile
            
            # Return formatted message if PassThru is requested
            if ($PassThru) {
                $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                $categoryInfo = if ($Category) { " [$Category]" } else { "" }
                return "[$timestamp] [$Level]$categoryInfo $Message"
            }
        }
        catch {
            # Fallback error handling
            $errorMessage = "Apollo logging failed: $($_.Exception.Message)"
            Write-Warning $errorMessage
            
            if ($PassThru) {
                return $errorMessage
            }
        }
    }

    end {
        Write-Verbose "Apollo logging completed"
    }
}
