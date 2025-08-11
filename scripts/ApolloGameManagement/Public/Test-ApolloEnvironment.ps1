function Test-ApolloEnvironment {
    <#
    .SYNOPSIS
        Tests the Apollo environment and module configuration.

    .DESCRIPTION
        Performs comprehensive validation of the Apollo environment including:
        - Module installation and configuration
        - Environment variables
        - File system permissions
        - Required dependencies
        - Configuration validity

    .PARAMETER Detailed
        Return detailed test results for each component.

    .PARAMETER Fix
        Attempt to fix common issues automatically.

    .OUTPUTS
        [PSCustomObject] Test results including overall status and component details

    .EXAMPLE
        Test-ApolloEnvironment

    .EXAMPLE
        $results = Test-ApolloEnvironment -Detailed
        $results.ComponentTests | Where-Object { -not $_.Passed }

    .EXAMPLE
        Test-ApolloEnvironment -Fix

    .NOTES
        This function helps diagnose and resolve common Apollo environment issues.
        Use the -Fix parameter to automatically resolve detected problems.

    .LINK
        Get-ApolloConfiguration
        Initialize-ApolloEnvironment
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter()]
        [switch]$Detailed,
        
        [Parameter()]
        [switch]$Fix
    )

    begin {
        Write-Verbose "Starting Apollo environment validation"
    }

    process {
        try {
            $testResults = [PSCustomObject]@{
                OverallStatus = $false
                TestTimestamp = Get-Date
                ComponentTests = @()
                IssuesFound = @()
                IssuesFixed = @()
            }

            # Test 1: Module availability
            $moduleTest = Test-ModuleAvailability
            $testResults.ComponentTests += $moduleTest
            if (-not $moduleTest.Passed -and $Fix) {
                $fixResult = Fix-ModuleIssues
                if ($fixResult.Success) {
                    $testResults.IssuesFixed += "Module installation"
                    $moduleTest.Passed = $true
                }
            }

            # Test 2: Configuration validity
            $configTest = Test-ConfigurationValidity
            $testResults.ComponentTests += $configTest
            if (-not $configTest.Passed -and $Fix) {
                $fixResult = Fix-ConfigurationIssues
                if ($fixResult.Success) {
                    $testResults.IssuesFixed += "Configuration"
                    $configTest.Passed = $true
                }
            }

            # Test 3: File system permissions
            $permissionTest = Test-FileSystemPermissions
            $testResults.ComponentTests += $permissionTest
            if (-not $permissionTest.Passed) {
                $testResults.IssuesFound += "File system permissions"
            }

            # Test 4: Apollo environment variables
            $envTest = Test-ApolloEnvironmentVariables
            $testResults.ComponentTests += $envTest

            # Test 5: Process management capabilities
            $processTest = Test-ProcessManagementCapabilities
            $testResults.ComponentTests += $processTest
            if (-not $processTest.Passed) {
                $testResults.IssuesFound += "Process management capabilities"
            }

            # Test 6: Dependencies
            $dependencyTest = Test-Dependencies
            $testResults.ComponentTests += $dependencyTest
            if (-not $dependencyTest.Passed) {
                $testResults.IssuesFound += "Missing dependencies"
            }

            # Calculate overall status
            $passedTests = ($testResults.ComponentTests | Where-Object { $_.Passed }).Count
            $totalTests = $testResults.ComponentTests.Count
            $testResults.OverallStatus = ($passedTests -eq $totalTests)

            # Log results
            Write-ApolloLog -Message "Environment test completed: $passedTests/$totalTests tests passed" -Level "INFO" -Category "EnvironmentTest"
            
            if ($testResults.IssuesFound.Count -gt 0) {
                Write-ApolloLog -Message "Issues found: $($testResults.IssuesFound -join ', ')" -Level "WARN" -Category "EnvironmentTest"
            }
            
            if ($testResults.IssuesFixed.Count -gt 0) {
                Write-ApolloLog -Message "Issues fixed: $($testResults.IssuesFixed -join ', ')" -Level "INFO" -Category "EnvironmentTest"
            }

            # Return appropriate level of detail
            if ($Detailed) {
                return $testResults
            }
            else {
                return [PSCustomObject]@{
                    OverallStatus = $testResults.OverallStatus
                    TestsPassed = $passedTests
                    TotalTests = $totalTests
                    IssuesFound = $testResults.IssuesFound.Count
                    IssuesFixed = $testResults.IssuesFixed.Count
                    TestTimestamp = $testResults.TestTimestamp
                }
            }
        }
        catch {
            Write-Error "Failed to test Apollo environment: $($_.Exception.Message)" -ErrorAction Stop
        }
    }

    end {
        Write-Verbose "Apollo environment validation completed"
    }
}

function Test-ModuleAvailability {
    [CmdletBinding()]
    param()

    try {
        $module = Get-Module -Name "ApolloGameManagement" -ListAvailable
        $isLoaded = Get-Module -Name "ApolloGameManagement"
        
        return [PSCustomObject]@{
            Component = "Module Availability"
            Passed = ($module -and $isLoaded)
            Details = if ($module) { "Module found and loaded" } else { "Module not found or not loaded" }
            Timestamp = Get-Date
        }
    }
    catch {
        return [PSCustomObject]@{
            Component = "Module Availability"
            Passed = $false
            Details = "Error checking module: $($_.Exception.Message)"
            Timestamp = Get-Date
        }
    }
}

function Test-ConfigurationValidity {
    [CmdletBinding()]
    param()

    try {
        $config = Get-ApolloConfiguration
        $isValid = ($config -and $config.tracking -and $config.cleanup -and $config.logging)
        
        return [PSCustomObject]@{
            Component = "Configuration Validity"
            Passed = $isValid
            Details = if ($isValid) { "Configuration loaded successfully" } else { "Configuration invalid or incomplete" }
            Timestamp = Get-Date
        }
    }
    catch {
        return [PSCustomObject]@{
            Component = "Configuration Validity"
            Passed = $false
            Details = "Error loading configuration: $($_.Exception.Message)"
            Timestamp = Get-Date
        }
    }
}

function Test-FileSystemPermissions {
    [CmdletBinding()]
    param()

    try {
        $config = Get-ApolloConfiguration
        $tempDir = [Environment]::ExpandEnvironmentVariables($config.paths.tempDirectory)
        $logDir = [Environment]::ExpandEnvironmentVariables($config.logging.logDirectory)
        
        $canWriteTemp = Test-DirectoryWriteAccess -Path $tempDir
        $canWriteLog = Test-DirectoryWriteAccess -Path $logDir
        
        $passed = $canWriteTemp -and $canWriteLog
        $details = "Temp: $canWriteTemp, Log: $canWriteLog"
        
        return [PSCustomObject]@{
            Component = "File System Permissions"
            Passed = $passed
            Details = $details
            Timestamp = Get-Date
        }
    }
    catch {
        return [PSCustomObject]@{
            Component = "File System Permissions"
            Passed = $false
            Details = "Error testing permissions: $($_.Exception.Message)"
            Timestamp = Get-Date
        }
    }
}

function Test-DirectoryWriteAccess {
    [CmdletBinding()]
    param([string]$Path)

    try {
        if (-not (Test-Path $Path)) {
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
        }
        
        $testFile = Join-Path $Path "apollo-test-$(Get-Random).tmp"
        "test" | Out-File -FilePath $testFile -ErrorAction Stop
        Remove-Item -Path $testFile -Force -ErrorAction SilentlyContinue
        return $true
    }
    catch {
        return $false
    }
}

function Test-ApolloEnvironmentVariables {
    [CmdletBinding()]
    param()

    try {
        $context = Get-ApolloContext
        $hasApolloVars = $context.IsApolloEnvironment
        
        return [PSCustomObject]@{
            Component = "Apollo Environment Variables"
            Passed = $true  # This is informational, not a failure
            Details = if ($hasApolloVars) { "Apollo environment detected" } else { "No Apollo environment (normal for standalone testing)" }
            Timestamp = Get-Date
        }
    }
    catch {
        return [PSCustomObject]@{
            Component = "Apollo Environment Variables"
            Passed = $false
            Details = "Error checking environment: $($_.Exception.Message)"
            Timestamp = Get-Date
        }
    }
}

function Test-ProcessManagementCapabilities {
    [CmdletBinding()]
    param()

    try {
        # Test basic process enumeration
        $processes = Get-Process | Select-Object -First 1
        $canEnumerate = $processes -ne $null
        
        # Test CIM access (modern replacement for WMI)
        $cimProcesses = Get-CimInstance -ClassName Win32_Process | Select-Object -First 1
        $canUseCim = $cimProcesses -ne $null
        
        $passed = $canEnumerate -and $canUseCim
        $details = "Process enumeration: $canEnumerate, CIM access: $canUseCim"
        
        return [PSCustomObject]@{
            Component = "Process Management Capabilities"
            Passed = $passed
            Details = $details
            Timestamp = Get-Date
        }
    }
    catch {
        return [PSCustomObject]@{
            Component = "Process Management Capabilities"
            Passed = $false
            Details = "Error testing process management: $($_.Exception.Message)"
            Timestamp = Get-Date
        }
    }
}

function Test-Dependencies {
    [CmdletBinding()]
    param()

    try {
        # Test PowerShell version
        $psVersion = $PSVersionTable.PSVersion
        $psVersionOk = $psVersion.Major -ge 5
        
        # Test .NET Framework (for Windows PowerShell)
        $dotNetOk = $true
        if ($PSVersionTable.PSEdition -eq 'Desktop') {
            try {
                $dotNetVersion = [System.Environment]::Version
                $dotNetOk = $dotNetVersion.Major -ge 4
            }
            catch {
                $dotNetOk = $false
            }
        }
        
        $passed = $psVersionOk -and $dotNetOk
        $details = "PowerShell: $($psVersion.ToString()), .NET: $dotNetOk"
        
        return [PSCustomObject]@{
            Component = "Dependencies"
            Passed = $passed
            Details = $details
            Timestamp = Get-Date
        }
    }
    catch {
        return [PSCustomObject]@{
            Component = "Dependencies"
            Passed = $false
            Details = "Error checking dependencies: $($_.Exception.Message)"
            Timestamp = Get-Date
        }
    }
}

function Fix-ModuleIssues {
    [CmdletBinding()]
    param()

    # This would contain logic to fix module installation issues
    # For now, return a placeholder
    return [PSCustomObject]@{
        Success = $false
        Message = "Module fix not implemented"
    }
}

function Fix-ConfigurationIssues {
    [CmdletBinding()]
    param()

    # This would contain logic to fix configuration issues
    # For now, return a placeholder
    return [PSCustomObject]@{
        Success = $false
        Message = "Configuration fix not implemented"
    }
}
