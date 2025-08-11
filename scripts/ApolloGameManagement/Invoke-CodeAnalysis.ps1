#Requires -Version 7.2
#Requires -Modules PSScriptAnalyzer

<#
.SYNOPSIS
    Code quality analysis for Apollo Game Management module using PSScriptAnalyzer.

.DESCRIPTION
    Comprehensive code analysis following 2025 PowerShell best practices.
    Analyzes all PowerShell files for security, performance, and style issues.

.PARAMETER Path
    Path to analyze. Defaults to current module directory.

.PARAMETER Severity
    Minimum severity level to report: Error, Warning, Information.

.PARAMETER OutputFormat
    Output format: Console, Json, Xml, Csv.

.PARAMETER OutputPath
    Path for analysis output files.

.PARAMETER Fix
    Automatically fix issues that can be corrected.

.PARAMETER ExcludeRules
    Rules to exclude from analysis.

.EXAMPLE
    .\Invoke-CodeAnalysis.ps1

.EXAMPLE
    .\Invoke-CodeAnalysis.ps1 -Severity Error -OutputFormat Json -OutputPath .\AnalysisResults

.EXAMPLE
    .\Invoke-CodeAnalysis.ps1 -Fix

.NOTES
    Requires PSScriptAnalyzer module and PowerShell 7.2+.
    Uses PSScriptAnalyzerSettings.psd1 for configuration.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$Path = $PSScriptRoot,
    
    [Parameter()]
    [ValidateSet('Error', 'Warning', 'Information')]
    [string]$Severity = 'Warning',
    
    [Parameter()]
    [ValidateSet('Console', 'Json', 'Xml', 'Csv')]
    [string]$OutputFormat = 'Console',
    
    [Parameter()]
    [string]$OutputPath = '.\AnalysisResults',
    
    [Parameter()]
    [switch]$Fix,
    
    [Parameter()]
    [string[]]$ExcludeRules = @(),
    
    [Parameter()]
    [switch]$PassThru
)

begin {
    Write-Host "Apollo Game Management Code Analysis" -ForegroundColor Cyan
    Write-Host "===================================" -ForegroundColor Cyan
    
    # Ensure PSScriptAnalyzer is available
    if (-not (Get-Module PSScriptAnalyzer -ListAvailable)) {
        Write-Warning "PSScriptAnalyzer not found. Installing..."
        Install-Module PSScriptAnalyzer -Force -Scope CurrentUser
    }
    Import-Module PSScriptAnalyzer -Force
    
    # Create output directory if needed
    if ($OutputFormat -ne 'Console' -and -not (Test-Path $OutputPath)) {
        New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
        Write-Host "Created output directory: $OutputPath" -ForegroundColor Green
    }
    
    # Get settings file
    $settingsFile = Join-Path $PSScriptRoot 'PSScriptAnalyzerSettings.psd1'
    if (-not (Test-Path $settingsFile)) {
        Write-Warning "Settings file not found: $settingsFile"
        $settingsFile = $null
    }
}

process {
    try {
        Write-Host "Analyzing PowerShell files in: $Path" -ForegroundColor Yellow
        Write-Host "Minimum severity level: $Severity" -ForegroundColor Yellow
        Write-Host "Output format: $OutputFormat" -ForegroundColor Yellow
        if ($Fix) {
            Write-Host "Auto-fix enabled: Yes" -ForegroundColor Yellow
        }
        Write-Host ""
        
        # Build analysis parameters
        $analysisParams = @{
            Path = $Path
            Recurse = $true
            Severity = $Severity
        }
        
        if ($settingsFile) {
            $analysisParams.Settings = $settingsFile
        }
        
        if ($ExcludeRules.Count -gt 0) {
            $analysisParams.ExcludeRule = $ExcludeRules
        }
        
        # Run analysis
        Write-Host "Running PSScriptAnalyzer..." -ForegroundColor Green
        $analysisResults = Invoke-ScriptAnalyzer @analysisParams
        
        # Filter results by severity if needed
        $filteredResults = $analysisResults | Where-Object { 
            switch ($Severity) {
                'Error' { $_.Severity -eq 'Error' }
                'Warning' { $_.Severity -in @('Error', 'Warning') }
                'Information' { $_.Severity -in @('Error', 'Warning', 'Information') }
            }
        }
        
        # Group results by severity and rule
        $groupedResults = $filteredResults | Group-Object Severity, RuleName | Sort-Object Name
        
        # Display results
        if ($filteredResults.Count -eq 0) {
            Write-Host "No issues found! Code quality is excellent." -ForegroundColor Green
        } else {
            Write-Host "Found $($filteredResults.Count) issues:" -ForegroundColor Yellow
            Write-Host ""
            
            # Summary by severity
            $severitySummary = $filteredResults | Group-Object Severity
            foreach ($group in $severitySummary) {
                $color = switch ($group.Name) {
                    'Error' { 'Red' }
                    'Warning' { 'Yellow' }
                    'Information' { 'Cyan' }
                    default { 'White' }
                }
                Write-Host "$($group.Name): $($group.Count)" -ForegroundColor $color
            }
            Write-Host ""
            
            # Detailed results for console output
            if ($OutputFormat -eq 'Console') {
                foreach ($group in $groupedResults) {
                    $severity = $group.Group[0].Severity
                    $ruleName = $group.Group[0].RuleName
                    $count = $group.Count
                    
                    $color = switch ($severity) {
                        'Error' { 'Red' }
                        'Warning' { 'Yellow' }
                        'Information' { 'Cyan' }
                        default { 'White' }
                    }
                    
                    Write-Host "[$severity] $ruleName ($count occurrences)" -ForegroundColor $color
                    
                    # Show first few occurrences
                    $group.Group | Select-Object -First 3 | ForEach-Object {
                        $relativePath = $_.ScriptName -replace [regex]::Escape($Path), '.'
                        Write-Host "  $relativePath:$($_.Line):$($_.Column) - $($_.Message)" -ForegroundColor Gray
                    }
                    
                    if ($group.Count -gt 3) {
                        Write-Host "  ... and $($group.Count - 3) more" -ForegroundColor Gray
                    }
                    Write-Host ""
                }
            }
        }
        
        # Auto-fix issues if requested
        if ($Fix -and $filteredResults.Count -gt 0) {
            Write-Host "Attempting to auto-fix issues..." -ForegroundColor Green
            
            $fixableRules = @(
                'PSUseConsistentIndentation',
                'PSUseConsistentWhitespace',
                'PSUseCorrectCasing',
                'PSAvoidUsingCmdletAliases'
            )
            
            $fixableIssues = $filteredResults | Where-Object { $_.RuleName -in $fixableRules }
            
            if ($fixableIssues.Count -gt 0) {
                Write-Host "Found $($fixableIssues.Count) fixable issues" -ForegroundColor Yellow
                
                # Group by file
                $fileGroups = $fixableIssues | Group-Object ScriptName
                
                foreach ($fileGroup in $fileGroups) {
                    $filePath = $fileGroup.Name
                    Write-Host "Fixing issues in: $filePath" -ForegroundColor Cyan
                    
                    try {
                        # Use Invoke-Formatter to fix formatting issues
                        $fixParams = @{
                            ScriptDefinition = Get-Content $filePath -Raw
                        }
                        
                        if ($settingsFile) {
                            $fixParams.Settings = $settingsFile
                        }
                        
                        $formattedCode = Invoke-Formatter @fixParams
                        Set-Content -Path $filePath -Value $formattedCode -Encoding UTF8
                        
                        Write-Host "  Fixed formatting issues" -ForegroundColor Green
                    }
                    catch {
                        Write-Warning "Failed to fix issues in $filePath`: $($_.Exception.Message)"
                    }
                }
                
                # Re-run analysis to show improvement
                Write-Host ""
                Write-Host "Re-running analysis after fixes..." -ForegroundColor Green
                $postFixResults = Invoke-ScriptAnalyzer @analysisParams
                $postFixFiltered = $postFixResults | Where-Object { 
                    switch ($Severity) {
                        'Error' { $_.Severity -eq 'Error' }
                        'Warning' { $_.Severity -in @('Error', 'Warning') }
                        'Information' { $_.Severity -in @('Error', 'Warning', 'Information') }
                    }
                }
                
                $improvement = $filteredResults.Count - $postFixFiltered.Count
                if ($improvement -gt 0) {
                    Write-Host "Fixed $improvement issues! Remaining issues: $($postFixFiltered.Count)" -ForegroundColor Green
                } else {
                    Write-Host "No automatic fixes were possible for the detected issues." -ForegroundColor Yellow
                }
                
                $filteredResults = $postFixFiltered
            } else {
                Write-Host "No auto-fixable issues found." -ForegroundColor Yellow
            }
        }
        
        # Export results if requested
        if ($OutputFormat -ne 'Console') {
            $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $outputFile = Join-Path $OutputPath "CodeAnalysis-$timestamp.$($OutputFormat.ToLower())"
            
            switch ($OutputFormat) {
                'Json' {
                    $filteredResults | ConvertTo-Json -Depth 10 | Set-Content $outputFile -Encoding UTF8
                }
                'Xml' {
                    $filteredResults | Export-Clixml $outputFile
                }
                'Csv' {
                    $filteredResults | Export-Csv $outputFile -NoTypeInformation -Encoding UTF8
                }
            }
            
            Write-Host ""
            Write-Host "Analysis results exported to: $outputFile" -ForegroundColor Green
        }
        
        # Return results if requested
        if ($PassThru) {
            return $filteredResults
        }
        
        # Exit with appropriate code
        $errorCount = ($filteredResults | Where-Object { $_.Severity -eq 'Error' }).Count
        if ($errorCount -gt 0) {
            Write-Host ""
            Write-Host "Code analysis found $errorCount error(s). Please review and fix." -ForegroundColor Red
            exit 1
        } else {
            Write-Host ""
            Write-Host "Code analysis completed successfully!" -ForegroundColor Green
            exit 0
        }
    }
    catch {
        Write-Error "Code analysis failed: $($_.Exception.Message)"
        if ($PassThru) {
            return $null
        }
        exit 1
    }
}

end {
    Write-Host ""
    Write-Host "Code analysis completed." -ForegroundColor Cyan
}
