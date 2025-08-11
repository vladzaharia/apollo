#Requires -Version 7.2
#Requires -Modules Pester

<#
.SYNOPSIS
    Test runner for Apollo Game Management module using Pester v5.

.DESCRIPTION
    Comprehensive test runner that executes unit tests, integration tests, and generates
    code coverage reports following 2025 PowerShell testing best practices.

.PARAMETER TestType
    Type of tests to run: Unit, Integration, Security, Performance, All.

.PARAMETER CodeCoverage
    Generate code coverage report.

.PARAMETER OutputFormat
    Output format for test results: NUnitXml, JUnitXml, Console.

.PARAMETER OutputPath
    Path for test result output files.

.EXAMPLE
    .\Invoke-Tests.ps1 -TestType Unit -CodeCoverage

.EXAMPLE
    .\Invoke-Tests.ps1 -TestType All -OutputFormat NUnitXml -OutputPath .\TestResults

.NOTES
    Requires Pester v5.0+ and PowerShell 7.2+.
    Automatically installs Pester if not available.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('Unit', 'Integration', 'Security', 'Performance', 'ErrorHandling', 'All')]
    [string]$TestType = 'All',
    
    [Parameter()]
    [switch]$CodeCoverage,
    
    [Parameter()]
    [ValidateSet('NUnitXml', 'JUnitXml', 'Console')]
    [string]$OutputFormat = 'Console',
    
    [Parameter()]
    [string]$OutputPath = '.\TestResults',
    
    [Parameter()]
    [switch]$PassThru
)

begin {
    Write-Host "Apollo Game Management Test Runner" -ForegroundColor Cyan
    Write-Host "=================================" -ForegroundColor Cyan
    
    # Ensure Pester v5 is available
    $pesterModule = Get-Module Pester -ListAvailable | Where-Object { $_.Version -ge '5.0.0' } | Select-Object -First 1
    if (-not $pesterModule) {
        Write-Warning "Pester v5.0+ not found. Installing..."
        Install-Module Pester -MinimumVersion 5.0.0 -Force -Scope CurrentUser
        Import-Module Pester -Force
    } else {
        Import-Module Pester -Force
    }
    
    # Create output directory if needed
    if ($OutputFormat -ne 'Console' -and -not (Test-Path $OutputPath)) {
        New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
        Write-Host "Created output directory: $OutputPath" -ForegroundColor Green
    }
    
    # Get test file path
    $testPath = Join-Path $PSScriptRoot 'ApolloGameManagement.Tests.ps1'
    if (-not (Test-Path $testPath)) {
        throw "Test file not found: $testPath"
    }
}

process {
    try {
        # Configure Pester
        $pesterConfig = New-PesterConfiguration
        
        # Set test discovery
        $pesterConfig.Run.Path = $testPath
        $pesterConfig.Run.PassThru = $true
        
        # Configure test filtering by tags
        if ($TestType -ne 'All') {
            $pesterConfig.Filter.Tag = $TestType
        }
        
        # Configure output
        $pesterConfig.Output.Verbosity = 'Detailed'
        
        # Configure test results output
        if ($OutputFormat -ne 'Console') {
            $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $outputFile = Join-Path $OutputPath "TestResults-$timestamp.$($OutputFormat.ToLower())"
            
            switch ($OutputFormat) {
                'NUnitXml' {
                    $pesterConfig.TestResult.Enabled = $true
                    $pesterConfig.TestResult.OutputFormat = 'NUnitXml'
                    $pesterConfig.TestResult.OutputPath = $outputFile
                }
                'JUnitXml' {
                    $pesterConfig.TestResult.Enabled = $true
                    $pesterConfig.TestResult.OutputFormat = 'JUnitXml'
                    $pesterConfig.TestResult.OutputPath = $outputFile
                }
            }
        }
        
        # Configure code coverage
        if ($CodeCoverage) {
            $modulePath = Join-Path $PSScriptRoot '..' 'ApolloGameManagement.psm1'
            $publicFunctions = Get-ChildItem (Join-Path $PSScriptRoot '..' 'Public' '*.ps1')
            $privateFunctions = Get-ChildItem (Join-Path $PSScriptRoot '..' 'Private' '*.ps1')
            
            $coveragePaths = @($modulePath) + $publicFunctions.FullName + $privateFunctions.FullName
            
            $pesterConfig.CodeCoverage.Enabled = $true
            $pesterConfig.CodeCoverage.Path = $coveragePaths
            $pesterConfig.CodeCoverage.OutputFormat = 'JaCoCo'
            $pesterConfig.CodeCoverage.OutputPath = Join-Path $OutputPath "CodeCoverage-$(Get-Date -Format 'yyyyMMdd-HHmmss').xml"
        }
        
        Write-Host "Running tests with configuration:" -ForegroundColor Yellow
        Write-Host "  Test Type: $TestType" -ForegroundColor Gray
        Write-Host "  Output Format: $OutputFormat" -ForegroundColor Gray
        Write-Host "  Code Coverage: $($CodeCoverage.IsPresent)" -ForegroundColor Gray
        Write-Host ""
        
        # Run tests
        $testResult = Invoke-Pester -Configuration $pesterConfig
        
        # Display results summary
        Write-Host ""
        Write-Host "Test Results Summary" -ForegroundColor Cyan
        Write-Host "===================" -ForegroundColor Cyan
        Write-Host "Total Tests: $($testResult.TotalCount)" -ForegroundColor White
        Write-Host "Passed: $($testResult.PassedCount)" -ForegroundColor Green
        Write-Host "Failed: $($testResult.FailedCount)" -ForegroundColor Red
        Write-Host "Skipped: $($testResult.SkippedCount)" -ForegroundColor Yellow
        Write-Host "Duration: $($testResult.Duration)" -ForegroundColor White
        
        # Display code coverage if enabled
        if ($CodeCoverage -and $testResult.CodeCoverage) {
            $coverage = $testResult.CodeCoverage
            $coveragePercent = [math]::Round(($coverage.NumberOfCommandsExecuted / $coverage.NumberOfCommandsAnalyzed) * 100, 2)
            
            Write-Host ""
            Write-Host "Code Coverage Summary" -ForegroundColor Cyan
            Write-Host "====================" -ForegroundColor Cyan
            Write-Host "Commands Analyzed: $($coverage.NumberOfCommandsAnalyzed)" -ForegroundColor White
            Write-Host "Commands Executed: $($coverage.NumberOfCommandsExecuted)" -ForegroundColor White
            Write-Host "Coverage Percentage: $coveragePercent%" -ForegroundColor $(if ($coveragePercent -ge 80) { 'Green' } elseif ($coveragePercent -ge 60) { 'Yellow' } else { 'Red' })
            
            # Show missed commands if coverage is low
            if ($coveragePercent -lt 80 -and $coverage.MissedCommands) {
                Write-Host ""
                Write-Host "Missed Commands (showing first 10):" -ForegroundColor Yellow
                $coverage.MissedCommands | Select-Object -First 10 | ForEach-Object {
                    Write-Host "  $($_.File):$($_.Line) - $($_.Command)" -ForegroundColor Gray
                }
            }
        }
        
        # Output file locations
        if ($OutputFormat -ne 'Console') {
            Write-Host ""
            Write-Host "Output Files:" -ForegroundColor Cyan
            Write-Host "  Test Results: $outputFile" -ForegroundColor Gray
            if ($CodeCoverage) {
                Write-Host "  Code Coverage: $($pesterConfig.CodeCoverage.OutputPath)" -ForegroundColor Gray
            }
        }
        
        # Return result if requested
        if ($PassThru) {
            return $testResult
        }
        
        # Exit with appropriate code
        if ($testResult.FailedCount -gt 0) {
            Write-Host ""
            Write-Host "Tests failed! Check the output above for details." -ForegroundColor Red
            exit 1
        } else {
            Write-Host ""
            Write-Host "All tests passed successfully!" -ForegroundColor Green
            exit 0
        }
    }
    catch {
        Write-Error "Test execution failed: $($_.Exception.Message)"
        if ($PassThru) {
            return $null
        }
        exit 1
    }
}

end {
    Write-Host ""
    Write-Host "Test execution completed." -ForegroundColor Cyan
}
