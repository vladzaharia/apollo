#Requires -Version 5.1

<#
.SYNOPSIS
    Apollo Game Management PowerShell Module

.DESCRIPTION
    This module provides intelligent game process management for Apollo streaming environment.
    It includes process tracking, cleanup, configuration management, and Apollo context integration.

.NOTES
    Name: ApolloGameManagement
    Author: Apollo Game Management System
    Version: 1.0.0
    PowerShell: 5.1+
#>

# Get public and private function definition files
$PublicFunctions = @(Get-ChildItem -Path $PSScriptRoot\Public\*.ps1 -ErrorAction SilentlyContinue)
$PrivateFunctions = @(Get-ChildItem -Path $PSScriptRoot\Private\*.ps1 -ErrorAction SilentlyContinue)

# Import all functions
foreach ($import in @($PublicFunctions + $PrivateFunctions)) {
    try {
        . $import.FullName
    }
    catch {
        Write-Error -Message "Failed to import function $($import.FullName): $($_.Exception.Message)"
    }
}

# Export public functions
Export-ModuleMember -Function $PublicFunctions.BaseName

# Module variables
$script:ModuleRoot = $PSScriptRoot
$script:ConfigPath = Join-Path $PSScriptRoot 'Config'
$script:DefaultConfigFile = Join-Path $script:ConfigPath 'default-config.json'

# Initialize module
try {
    # Load default configuration if available
    if (Test-Path $script:DefaultConfigFile) {
        $script:DefaultConfig = Get-Content $script:DefaultConfigFile -Raw | ConvertFrom-Json
    }
    else {
        Write-Warning "Default configuration file not found: $script:DefaultConfigFile"
    }
}
catch {
    Write-Warning "Failed to load module configuration: $($_.Exception.Message)"
}

# Module cleanup
$MyInvocation.MyCommand.ScriptBlock.Module.OnRemove = {
    # Cleanup any module-level resources if needed
    Remove-Variable -Name 'ModuleRoot', 'ConfigPath', 'DefaultConfigFile', 'DefaultConfig' -Scope Script -ErrorAction SilentlyContinue
}
