function Get-ProcessSnapshotInternal {
    <#
    .SYNOPSIS
        Internal function to capture a snapshot of running processes.

    .DESCRIPTION
        Captures detailed information about running processes, filtering out system processes
        and providing enhanced metadata for game-related process detection.

    .PARAMETER IncludeSystemProcesses
        Include system processes in the snapshot.

    .PARAMETER UseCache
        Use cached process information if available and recent.

    .OUTPUTS
        [Array] Array of process objects with enhanced metadata

    .EXAMPLE
        $snapshot = Get-ProcessSnapshotInternal

    .EXAMPLE
        $snapshot = Get-ProcessSnapshotInternal -IncludeSystemProcesses

    .NOTES
        This is an internal function and should not be called directly.
        Uses Get-CimInstance instead of deprecated Get-WmiObject for better performance.
    #>

    [CmdletBinding()]
    [OutputType([Array])]
    param(
        [Parameter()]
        [switch]$IncludeSystemProcesses,

        [Parameter()]
        [switch]$UseCache
    )

    try {
        # Get configuration
        $config = Get-ApolloConfigurationInternal
        $perfConfig = $config.performance

        # Check cache if enabled
        if ($UseCache -and $perfConfig.enableProcessCaching) {
            $cachedSnapshot = Get-CachedProcessSnapshot -Config $perfConfig
            if ($cachedSnapshot) {
                Write-Verbose "Using cached process snapshot"
                return $cachedSnapshot
            }
        }

        Write-Verbose "Capturing new process snapshot"

        # Get processes using modern CIM cmdlets for better performance
        $processes = Get-CimInstance -ClassName Win32_Process -Property ProcessId, Name, ExecutablePath, CreationDate, ParentProcessId, CommandLine

        # Convert to enhanced process objects
        $enhancedProcesses = @()

        foreach ($process in $processes) {
            try {
                # Get additional process information
                $processInfo = Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue

                if ($processInfo) {
                    $enhancedProcess = [PSCustomObject]@{
                        ProcessName = $process.Name -replace '\.exe$', ''
                        ProcessId = $process.ProcessId
                        ParentProcessId = $process.ParentProcessId
                        ExecutablePath = $process.ExecutablePath
                        CommandLine = $process.CommandLine
                        StartTime = $process.CreationDate
                        MainWindowTitle = $processInfo.MainWindowTitle
                        MainWindowHandle = $processInfo.MainWindowHandle
                        HasMainWindow = $processInfo.MainWindowHandle -ne [System.IntPtr]::Zero
                        WorkingSet = $processInfo.WorkingSet64
                        VirtualMemory = $processInfo.VirtualMemorySize64
                        ProcessorTime = $processInfo.TotalProcessorTime
                        IsSystemProcess = Test-SystemProcess -ProcessName $process.Name
                        IsGameRelated = $false  # Will be determined by calling function
                        Priority = 0  # Will be set by calling function
                        Timestamp = Get-Date
                    }

                    # Apply filtering
                    if ($IncludeSystemProcesses -or -not $enhancedProcess.IsSystemProcess) {
                        $enhancedProcesses += $enhancedProcess
                    }
                }
            }
            catch {
                Write-Verbose "Failed to get enhanced information for process $($process.ProcessId): $($_.Exception.Message)"
                # Continue with basic information
                $basicProcess = [PSCustomObject]@{
                    ProcessName = $process.Name -replace '\.exe$', ''
                    ProcessId = $process.ProcessId
                    ParentProcessId = $process.ParentProcessId
                    ExecutablePath = $process.ExecutablePath
                    CommandLine = $process.CommandLine
                    StartTime = $process.CreationDate
                    MainWindowTitle = ""
                    MainWindowHandle = [System.IntPtr]::Zero
                    HasMainWindow = $false
                    WorkingSet = 0
                    VirtualMemory = 0
                    ProcessorTime = [TimeSpan]::Zero
                    IsSystemProcess = Test-SystemProcess -ProcessName $process.Name
                    IsGameRelated = $false
                    Priority = 0
                    Timestamp = Get-Date
                }

                if ($IncludeSystemProcesses -or -not $basicProcess.IsSystemProcess) {
                    $enhancedProcesses += $basicProcess
                }
            }
        }

        # Cache the snapshot if caching is enabled
        if ($perfConfig.enableProcessCaching) {
            Set-CachedProcessSnapshot -Snapshot $enhancedProcesses -Config $perfConfig
        }

        Write-Verbose "Captured $($enhancedProcesses.Count) processes in snapshot"
        return $enhancedProcesses
    }
    catch {
        Write-Error "Failed to capture process snapshot: $($_.Exception.Message)"
        throw
    }
}

function Test-SystemProcess {
    <#
    .SYNOPSIS
        Tests if a process is a system process that should be excluded.
    #>

    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$ProcessName
    )

    # Get excluded processes from configuration
    $config = Get-ApolloConfigurationInternal
    $excludedProcesses = $config.cleanup.excludedProcesses

    # Clean process name
    $cleanName = $ProcessName -replace '\.exe$', ''

    # Check against excluded list (case-insensitive)
    foreach ($excluded in $excludedProcesses) {
        if ($cleanName -like $excluded) {
            return $true
        }
    }

    # Additional system process patterns
    $systemPatterns = @(
        'System*',
        'Idle*',
        'Registry*',
        'smss*',
        'csrss*',
        'wininit*',
        'winlogon*',
        'services*',
        'lsass*',
        'lsm*',
        'svchost*',
        'spoolsv*',
        'taskhost*',
        'taskhostw*',
        'dwm*',
        'explorer*'
    )

    foreach ($pattern in $systemPatterns) {
        if ($cleanName -like $pattern) {
            return $true
        }
    }

    return $false
}

# Process caching functions
$script:ProcessCache = @{
    Snapshot = $null
    Timestamp = [DateTime]::MinValue
}

function Get-CachedProcessSnapshot {
    <#
    .SYNOPSIS
        Retrieves cached process snapshot if available and recent.
    #>

    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    $cacheTimeout = [TimeSpan]::FromSeconds($Config.processCacheTimeoutSeconds)
    $now = Get-Date

    if ($script:ProcessCache.Snapshot -and
        ($now - $script:ProcessCache.Timestamp) -lt $cacheTimeout) {
        return $script:ProcessCache.Snapshot
    }

    return $null
}

function Set-CachedProcessSnapshot {
    <#
    .SYNOPSIS
        Caches a process snapshot.
    #>

    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Array]$Snapshot
    )

    $script:ProcessCache.Snapshot = $Snapshot
    $script:ProcessCache.Timestamp = Get-Date
}
