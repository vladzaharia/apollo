function Test-GameRelatedProcessInternal {
    <#
    .SYNOPSIS
        Internal function to test if a process is related to a specific game.

    .DESCRIPTION
        Uses intelligent pattern matching to determine if a process is related to a game.
        Considers game name variations, common game patterns, and process metadata.

    .PARAMETER ProcessName
        The name of the process to test.

    .PARAMETER GameName
        The name of the game to test against.

    .PARAMETER ProcessPath
        Optional path to the process executable for additional context.

    .PARAMETER WindowTitle
        Optional window title for additional context.

    .OUTPUTS
        [bool] True if the process is likely game-related, false otherwise.

    .EXAMPLE
        Test-GameRelatedProcessInternal -ProcessName "Cyberpunk2077" -GameName "Cyberpunk 2077"

    .NOTES
        This is an internal function and should not be called directly.
        Uses configurable patterns for better accuracy and maintainability.
    #>

    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$ProcessName,

        [Parameter(Mandatory)]
        [string]$GameName,

        [Parameter()]
        [string]$ProcessPath = '',

        [Parameter()]
        [string]$WindowTitle = ''
    )

    try {
        # Get configuration
        $config = Get-ApolloConfigurationInternal
        $gamePatterns = $config.gamePatterns

        # Clean inputs
        $cleanProcessName = ($ProcessName -replace '\.exe$', '').ToLower()
        $cleanGameName = $GameName.ToLower()

        # Generate game name variations
        $gameKeywords = Get-GameNameVariations -GameName $cleanGameName

        Write-Verbose "Testing process '$ProcessName' against game '$GameName'"
        Write-Verbose "Game keywords: $($gameKeywords -join ', ')"

        # Test 1: Direct game name matching
        foreach ($keyword in $gameKeywords) {
            if ($cleanProcessName -like "*$keyword*") {
                Write-Verbose "Match found: Process name contains game keyword '$keyword'"
                return $true
            }
        }

        # Test 2: Window title matching (if available)
        if ($WindowTitle) {
            $cleanWindowTitle = $WindowTitle.ToLower()
            foreach ($keyword in $gameKeywords) {
                if ($cleanWindowTitle -like "*$keyword*") {
                    Write-Verbose "Match found: Window title contains game keyword '$keyword'"
                    return $true
                }
            }
        }

        # Test 3: Process path matching (if available)
        if ($ProcessPath) {
            $cleanProcessPath = $ProcessPath.ToLower()
            foreach ($keyword in $gameKeywords) {
                if ($cleanProcessPath -like "*$keyword*") {
                    Write-Verbose "Match found: Process path contains game keyword '$keyword'"
                    return $true
                }
            }
        }

        # Test 4: Common game-related process patterns
        $isGameRelated = Test-CommonGamePatterns -ProcessName $cleanProcessName -GamePatterns $gamePatterns
        if ($isGameRelated) {
            Write-Verbose "Match found: Process matches common game patterns"
            return $true
        }

        # Test 5: Launcher-specific patterns
        $isLauncherRelated = Test-LauncherPatterns -ProcessName $cleanProcessName -GamePatterns $gamePatterns
        if ($isLauncherRelated) {
            Write-Verbose "Match found: Process matches launcher patterns"
            return $true
        }

        Write-Verbose "No match found for process '$ProcessName'"
        return $false
    }
    catch {
        Write-Warning "Error testing game-related process: $($_.Exception.Message)"
        return $false
    }
}

function Get-GameNameVariations {
    <#
    .SYNOPSIS
        Generates variations of a game name for pattern matching.
    #>

    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)]
        [string]$GameName
    )

    $variations = @()

    # Original name
    $variations += $GameName

    # Remove spaces
    $variations += $GameName -replace '\s+', ''

    # Replace spaces with common separators
    $variations += $GameName -replace '\s+', '-'
    $variations += $GameName -replace '\s+', '_'
    $variations += $GameName -replace '\s+', '.'

    # Individual words (if longer than 2 characters)
    $words = $GameName -split '\s+' | Where-Object { $_.Length -gt 2 }
    $variations += $words

    # First and last words
    if ($words.Count -gt 1) {
        $variations += $words[0]
        $variations += $words[-1]
    }

    # Remove common words and articles
    $commonWords = @('the', 'a', 'an', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by')
    $filteredWords = $words | Where-Object { $_ -notin $commonWords }
    $variations += $filteredWords

    # Remove duplicates and filter by length
    $variations = $variations | Where-Object { $_.Length -gt 2 } | Sort-Object -Unique

    return $variations
}

function Test-CommonGamePatterns {
    <#
    .SYNOPSIS
        Tests process name against common game-related patterns.
    #>

    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$ProcessName,

        [Parameter(Mandatory)]
        [PSCustomObject]$GamePatterns
    )

    # Test against anti-cheat processes
    foreach ($pattern in $GamePatterns.antiCheatProcesses) {
        if ($ProcessName -like "*$pattern*") {
            return $true
        }
    }

    # Test against game engines
    foreach ($pattern in $GamePatterns.gameEngines) {
        if ($ProcessName -like "*$pattern*") {
            return $true
        }
    }

    # Test against support processes
    foreach ($pattern in $GamePatterns.supportProcesses) {
        if ($ProcessName -like "*$pattern*") {
            return $true
        }
    }

    return $false
}

function Test-LauncherPatterns {
    <#
    .SYNOPSIS
        Tests process name against game launcher patterns.
    #>

    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$ProcessName,

        [Parameter(Mandatory)]
        [PSCustomObject]$GamePatterns
    )

    foreach ($pattern in $GamePatterns.commonLaunchers) {
        if ($ProcessName -like "*$pattern*") {
            return $true
        }
    }

    return $false
}

function Get-ProcessPriorityInternal {
    <#
    .SYNOPSIS
        Internal function to determine process cleanup priority.

    .DESCRIPTION
        Assigns priority values to processes for cleanup ordering.
        Lower numbers indicate higher priority (cleaned up first).

    .PARAMETER ProcessName
        The name of the process.

    .PARAMETER GameName
        The name of the game for context.

    .OUTPUTS
        [int] Priority value (1-4, where 1 is highest priority)

    .EXAMPLE
        $priority = Get-ProcessPriorityInternal -ProcessName "Cyberpunk2077" -GameName "Cyberpunk 2077"
    #>

    [CmdletBinding()]
    [OutputType([int])]
    param(
        [Parameter(Mandatory)]
        [string]$ProcessName,

        [Parameter(Mandatory)]
        [string]$GameName
    )

    $cleanProcessName = ($ProcessName -replace '\.exe$', '').ToLower()
    $gameKeywords = Get-GameNameVariations -GameName $GameName.ToLower()

    # Priority 1: Main game executable (highest priority)
    foreach ($keyword in $gameKeywords) {
        if ($cleanProcessName -like "*$keyword*") {
            return 1
        }
    }

    # Priority 2: Launchers and clients
    if ($cleanProcessName -match '(launcher|client)') {
        return 2
    }

    # Priority 3: Anti-cheat and support processes
    if ($cleanProcessName -match '(anticheat|eac|battleye|crash|reporter|updater)') {
        return 3
    }

    # Priority 4: Everything else (lowest priority)
    return 4
}
