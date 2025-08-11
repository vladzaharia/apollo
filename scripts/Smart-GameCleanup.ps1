#Requires -Version 7.2

<#
.SYNOPSIS
    Apollo Game Management - Intelligent process tracking and cleanup orchestrator.

.DESCRIPTION
    Unified script for intelligent game process management in Apollo streaming environment.
    Handles both tracking (prep) and cleanup (undo) operations using the ApolloGameManagement module.

    This script serves as the main entry point for Apollo game process management,
    providing a simplified interface to the comprehensive functionality in the module.

.PARAMETER Action
    Specifies the action to perform:
    - "track": Start process tracking for game launch (prep command)
    - "cleanup": Stop game processes intelligently (undo command)

.PARAMETER GameName
    Name of the game to track or clean up. If not specified, attempts to use Apollo environment context.

.PARAMETER FallbackProcesses
    Array of process names to use as fallback if no tracked or detected processes are found during cleanup.

.PARAMETER TrackingDurationSeconds
    Duration in seconds to monitor for new processes during tracking. Default is from configuration.

.PARAMETER GraceTimeoutSeconds
    Time to wait for graceful process termination before force killing during cleanup. Default is from configuration.

.PARAMETER Force
    For cleanup: Skip graceful termination and immediately force kill processes.
    For tracking: Overwrite existing tracking data for the same game.

.PARAMETER WhatIf
    Show what would be done without actually performing the action.

.PARAMETER PassThru
    Return operation results as output.

.EXAMPLE
    .\Smart-GameCleanup.ps1 -Action track -GameName "Cyberpunk 2077"

.EXAMPLE
    .\Smart-GameCleanup.ps1 -Action cleanup -GameName "Elden Ring"

.EXAMPLE
    .\Smart-GameCleanup.ps1 -Action cleanup -FallbackProcesses @("game.exe", "launcher.exe")

.NOTES
    Requires the ApolloGameManagement PowerShell module.
    Requires elevated privileges for comprehensive process management.

    Version: 2.0.0
    Author: Apollo Game Management System
    PowerShell: 7.2+

.LINK
    Start-ApolloGameTracking
    Stop-ApolloGameProcesses
    Get-ApolloContext
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
[OutputType([PSCustomObject])]
param(
    [Parameter(Mandatory)]
    [ValidateSet("track", "cleanup")]
    [string]$Action,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [ValidateLength(1, 255)]
    [ValidateScript({
        # Import the module to access security functions
        if (-not (Get-Command Test-SecurityValidation -ErrorAction SilentlyContinue)) {
            Import-Module "$PSScriptRoot\ApolloGameManagement\ApolloGameManagement.psm1" -Force
        }
        $validation = Test-SecurityValidation -InputString $_ -ValidationLevel 'Standard'
        if (-not $validation.IsValid) {
            throw "Game name validation failed: $($validation.SecurityWarnings -join '; ')"
        }
        return $true
    })]
    [string]$GameName = '',

    [Parameter()]
    [ValidateScript({
        foreach ($process in $_) {
            if (-not (Get-Command Test-SecurityValidation -ErrorAction SilentlyContinue)) {
                Import-Module "$PSScriptRoot\ApolloGameManagement\ApolloGameManagement.psm1" -Force
            }
            $validation = Test-SecurityValidation -ProcessName $process -ValidationLevel 'Standard'
            if (-not $validation.IsValid) {
                throw "Fallback process '$process' validation failed: $($validation.SecurityWarnings -join '; ')"
            }
        }
        return $true
    })]
    [string[]]$FallbackProcesses = @(),

    [Parameter()]
    [ValidateRange(10, 300)]
    [int]$TrackingDurationSeconds = 0,

    [Parameter()]
    [ValidateRange(1, 60)]
    [int]$GraceTimeoutSeconds = 0,

    [Parameter()]
    [switch]$Force,

    [Parameter()]
    [switch]$PassThru
)

# Script initialization
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$ModulePath = Join-Path $ScriptDir "ApolloGameManagement"

# Import the ApolloGameManagement module
try {
    if (Get-Module -Name "ApolloGameManagement" -ListAvailable -ErrorAction SilentlyContinue) {
        Import-Module "ApolloGameManagement" -Force
    }
    elseif (Test-Path $ModulePath) {
        Import-Module $ModulePath -Force
    }
    else {
        throw "ApolloGameManagement module not found. Please ensure the module is installed or available in the script directory."
    }

    Write-Verbose "Successfully imported ApolloGameManagement module"
}
catch {
    Write-Error "Failed to import ApolloGameManagement module: $($_.Exception.Message)" -ErrorAction Stop
}

# Check for elevated privileges
try {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    $isElevated = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isElevated) {
        Write-Warning "Running without elevated privileges. Process management may be limited."
        Write-ApolloLog -Message "Script running without elevated privileges" -Level "WARN" -Category "Initialization"
    }
    else {
        Write-Verbose "Running with elevated privileges"
        Write-ApolloLog -Message "Script running with elevated privileges" -Level "INFO" -Category "Initialization"
    }
}
catch {
    Write-Warning "Failed to check elevation status: $($_.Exception.Message)"
}

# Main execution
try {
    # Get Apollo context for logging
    $apolloContext = Get-ApolloContext

    # Resolve game name if not provided
    if (-not $GameName -and $apolloContext.IsApolloEnvironment -and $apolloContext.AppName) {
        $GameName = $apolloContext.AppName
        Write-ApolloLog -Message "Using Apollo app name: $GameName" -Level "INFO" -Category "Orchestrator"
    }
    elseif (-not $GameName) {
        throw "No game name provided and no Apollo context available"
    }

    Write-ApolloLog -Message "Smart Game Cleanup - Action: $Action, Game: $GameName" -Level "INFO" -Category "Orchestrator"

    if ($apolloContext.IsApolloEnvironment) {
        Write-ApolloLog -Message "Apollo Context - App: $($apolloContext.AppName), Status: $($apolloContext.AppStatus), Client: $($apolloContext.ClientName)" -Level "INFO" -Category "Orchestrator"
    }

    # Execute the requested action
    switch ($Action) {
        "track" {
            Write-ApolloLog -Message "Initiating background process tracking phase" -Level "INFO" -Category "Orchestrator"

            if ($PSCmdlet.ShouldProcess($GameName, "Start background process tracking")) {
                # Start tracking in background job to avoid blocking game launch
                $scriptBlock = {
                    param($GameName, $TrackingDurationSeconds, $Force, $ModulePath)

                    # Import the module in the background job
                    Import-Module $ModulePath -Force

                    $params = @{
                        GameName = $GameName
                        PassThru = $true
                    }

                    if ($TrackingDurationSeconds -gt 0) { $params.TrackingDurationSeconds = $TrackingDurationSeconds }
                    if ($Force) { $params.Force = $true }

                    Start-ApolloGameTracking @params
                }

                $jobParams = @{
                    GameName = $GameName
                    TrackingDurationSeconds = if ($TrackingDurationSeconds -gt 0) { $TrackingDurationSeconds } else { 0 }
                    Force = $Force.IsPresent
                    ModulePath = $ModulePath
                }

                $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList @($jobParams.GameName, $jobParams.TrackingDurationSeconds, $jobParams.Force, $jobParams.ModulePath)

                Write-ApolloLog -Message "Background process tracking started (Job ID: $($job.Id))" -Level "INFO" -Category "Orchestrator"
                Write-ApolloLog -Message "Process tracking phase initiated successfully - game launch can proceed" -Level "INFO" -Category "Orchestrator"

                if ($PassThru) {
                    return [PSCustomObject]@{
                        Success = $true
                        JobId = $job.Id
                        Message = "Background tracking started"
                    }
                }
            }
        }

        "cleanup" {
            Write-ApolloLog -Message "Initiating intelligent cleanup phase" -Level "INFO" -Category "Orchestrator"

            if ($PSCmdlet.ShouldProcess($GameName, "Stop game processes")) {
                $params = @{
                    GameName = $GameName
                    PassThru = $PassThru
                }

                if ($FallbackProcesses -and $FallbackProcesses.Count -gt 0) { $params.FallbackProcesses = $FallbackProcesses }
                if ($GraceTimeoutSeconds -gt 0) { $params.GraceTimeoutSeconds = $GraceTimeoutSeconds }
                if ($Force) { $params.Force = $true }

                $result = Stop-ApolloGameProcesses @params

                if ($result -and -not $result.Success) {
                    throw "Process cleanup failed: $($result.Error)"
                }

                Write-ApolloLog -Message "Intelligent cleanup phase completed successfully" -Level "INFO" -Category "Orchestrator"

                if ($PassThru) {
                    return $result
                }
            }
        }

        default {
            throw "Invalid action specified: $Action"
        }
    }

    Write-ApolloLog -Message "Smart Game Cleanup completed successfully" -Level "INFO" -Category "Orchestrator"
}
catch {
    $errorMessage = "Smart Game Cleanup failed: $($_.Exception.Message)"
    Write-ApolloLog -Message $errorMessage -Level "ERROR" -Category "Orchestrator"
    Write-Error $errorMessage -ErrorAction Stop
}
