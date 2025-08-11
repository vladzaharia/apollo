function Get-IntelligentProcessesInternal {
    <#
    .SYNOPSIS
        Internal function to intelligently detect game-related processes.

    .DESCRIPTION
        Uses pattern matching and heuristics to identify processes that are likely
        related to the specified game, even without prior tracking data.

    .PARAMETER GameName
        Name of the game to detect processes for.

    .OUTPUTS
        [string[]] Array of process names that appear to be related to the game

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
        Write-ApolloLogInternal -Message "Starting intelligent process detection for: $GameName" -Level "DEBUG" -Category "ProcessDetection"
        
        # Get all currently running processes
        $allProcesses = Get-Process | Where-Object { $_.ProcessName -and $_.ProcessName.Length -gt 0 }
        
        # Create search patterns based on game name
        $gameNameClean = $GameName -replace '[^\w\s]', '' -replace '\s+', ' '
        $gameWords = $gameNameClean -split '\s+' | Where-Object { $_.Length -gt 2 }
        
        $detectedProcesses = @()
        
        foreach ($process in $allProcesses) {
            $processName = $process.ProcessName
            $isGameRelated = $false
            
            # Pattern 1: Direct name match (case insensitive)
            if ($processName -like "*$($gameNameClean -replace '\s', '*')*") {
                $isGameRelated = $true
                Write-ApolloLogInternal -Message "Direct match: $processName" -Level "DEBUG" -Category "ProcessDetection"
            }
            
            # Pattern 2: Individual word matches
            if (-not $isGameRelated) {
                foreach ($word in $gameWords) {
                    if ($processName -like "*$word*") {
                        $isGameRelated = $true
                        Write-ApolloLogInternal -Message "Word match ($word): $processName" -Level "DEBUG" -Category "ProcessDetection"
                        break
                    }
                }
            }
            
            # Pattern 3: Common game executable patterns
            if (-not $isGameRelated) {
                $gameExecutablePatterns = @(
                    "*game*.exe",
                    "*launcher*.exe", 
                    "*client*.exe",
                    "*-Win64-Shipping.exe",
                    "*-Win32-Shipping.exe",
                    "*_game.exe",
                    "*Game.exe"
                )
                
                foreach ($pattern in $gameExecutablePatterns) {
                    if ($processName -like $pattern) {
                        # Additional check: see if any game words are in the process path or window title
                        try {
                            $processPath = $process.Path
                            $hasGameWord = $false
                            
                            foreach ($word in $gameWords) {
                                if ($processPath -like "*$word*") {
                                    $hasGameWord = $true
                                    break
                                }
                            }
                            
                            if ($hasGameWord) {
                                $isGameRelated = $true
                                Write-ApolloLogInternal -Message "Executable pattern match: $processName" -Level "DEBUG" -Category "ProcessDetection"
                                break
                            }
                        }
                        catch {
                            # Can't access process path, skip this check
                        }
                    }
                }
            }
            
            # Pattern 4: Steam/Epic/Other launcher child processes
            if (-not $isGameRelated) {
                try {
                    # Check if this process was started recently (within last 5 minutes)
                    $processAge = (Get-Date) - $process.StartTime
                    if ($processAge.TotalMinutes -le 5) {
                        # Check if parent process is a known game launcher
                        $parentProcess = Get-WmiObject -Class Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction SilentlyContinue
                        if ($parentProcess) {
                            $parentName = (Get-Process -Id $parentProcess.ParentProcessId -ErrorAction SilentlyContinue).ProcessName
                            $launcherPatterns = @("steam", "epicgameslauncher", "origin", "uplay", "battlenet", "gog")
                            
                            foreach ($launcher in $launcherPatterns) {
                                if ($parentName -like "*$launcher*") {
                                    # Check if process name contains any game words
                                    foreach ($word in $gameWords) {
                                        if ($processName -like "*$word*") {
                                            $isGameRelated = $true
                                            Write-ApolloLogInternal -Message "Launcher child match: $processName (parent: $parentName)" -Level "DEBUG" -Category "ProcessDetection"
                                            break
                                        }
                                    }
                                    if ($isGameRelated) { break }
                                }
                            }
                        }
                    }
                }
                catch {
                    # WMI or process access failed, skip this check
                }
            }
            
            if ($isGameRelated) {
                $detectedProcesses += $processName
            }
        }
        
        # Remove duplicates and common system processes
        $detectedProcesses = $detectedProcesses | Sort-Object -Unique
        $systemProcesses = @("explorer", "winlogon", "csrss", "smss", "services", "lsass", "svchost", "dwm", "conhost")
        $detectedProcesses = $detectedProcesses | Where-Object { $_ -notin $systemProcesses }
        
        Write-ApolloLogInternal -Message "Intelligent detection found $($detectedProcesses.Count) processes: $($detectedProcesses -join ', ')" -Level "INFO" -Category "ProcessDetection"
        
        return $detectedProcesses
    }
    catch {
        Write-ApolloLogInternal -Message "Error in intelligent process detection: $($_.Exception.Message)" -Level "ERROR" -Category "ProcessDetection"
        return @()
    }
}
