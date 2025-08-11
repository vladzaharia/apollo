function Get-ApolloConfigurationInternal {
    <#
    .SYNOPSIS
        Internal function to retrieve Apollo configuration.

    .DESCRIPTION
        Loads and merges configuration from multiple sources:
        1. Default configuration (module)
        2. System configuration
        3. User configuration
        4. Environment variables

    .OUTPUTS
        [PSCustomObject] Merged configuration object

    .EXAMPLE
        $config = Get-ApolloConfigurationInternal

    .NOTES
        This is an internal function and should not be called directly.
        Configuration hierarchy (highest priority first):
        1. Environment variables
        2. User configuration file
        3. System configuration file
        4. Default configuration
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param()

    try {
        # Start with default configuration
        $config = $script:DefaultConfig.PSObject.Copy()

        # Define configuration file paths
        $systemConfigPath = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Apollo\Config\apollo-config.json'
        $userConfigPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Apollo\Config\apollo-config.json'
        
        # Check for custom config path from environment
        $customConfigPath = [Environment]::GetEnvironmentVariable('APOLLO_CONFIG_PATH')
        
        # Load system configuration if it exists
        if (Test-Path $systemConfigPath) {
            try {
                $systemConfig = Get-Content $systemConfigPath -Raw | ConvertFrom-Json
                $config = Merge-Configuration -BaseConfig $config -OverrideConfig $systemConfig
                Write-Verbose "Loaded system configuration from: $systemConfigPath"
            }
            catch {
                Write-Warning "Failed to load system configuration from $systemConfigPath`: $($_.Exception.Message)"
            }
        }

        # Load user configuration if it exists
        if (Test-Path $userConfigPath) {
            try {
                $userConfig = Get-Content $userConfigPath -Raw | ConvertFrom-Json
                $config = Merge-Configuration -BaseConfig $config -OverrideConfig $userConfig
                Write-Verbose "Loaded user configuration from: $userConfigPath"
            }
            catch {
                Write-Warning "Failed to load user configuration from $userConfigPath`: $($_.Exception.Message)"
            }
        }

        # Load custom configuration if specified
        if ($customConfigPath -and (Test-Path $customConfigPath)) {
            try {
                $customConfig = Get-Content $customConfigPath -Raw | ConvertFrom-Json
                $config = Merge-Configuration -BaseConfig $config -OverrideConfig $customConfig
                Write-Verbose "Loaded custom configuration from: $customConfigPath"
            }
            catch {
                Write-Warning "Failed to load custom configuration from $customConfigPath`: $($_.Exception.Message)"
            }
        }

        # Apply environment variable overrides
        $config = Apply-EnvironmentOverrides -Config $config

        # Expand environment variables in paths
        $config = Expand-ConfigurationPaths -Config $config

        return $config
    }
    catch {
        Write-Error "Failed to load Apollo configuration: $($_.Exception.Message)"
        throw
    }
}

function Merge-Configuration {
    <#
    .SYNOPSIS
        Merges two configuration objects.

    .PARAMETER BaseConfig
        The base configuration object.

    .PARAMETER OverrideConfig
        The configuration object to merge into the base.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$BaseConfig,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$OverrideConfig
    )

    $merged = $BaseConfig.PSObject.Copy()
    
    foreach ($property in $OverrideConfig.PSObject.Properties) {
        if ($merged.PSObject.Properties.Name -contains $property.Name) {
            if ($property.Value -is [PSCustomObject] -and $merged.$($property.Name) -is [PSCustomObject]) {
                # Recursively merge nested objects
                $merged.$($property.Name) = Merge-Configuration -BaseConfig $merged.$($property.Name) -OverrideConfig $property.Value
            }
            else {
                # Override the value
                $merged.$($property.Name) = $property.Value
            }
        }
        else {
            # Add new property
            $merged | Add-Member -MemberType NoteProperty -Name $property.Name -Value $property.Value
        }
    }
    
    return $merged
}

function Apply-EnvironmentOverrides {
    <#
    .SYNOPSIS
        Applies environment variable overrides to configuration.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    # Define environment variable mappings
    $envMappings = @{
        'APOLLO_LOG_LEVEL' = 'logging.logLevel'
        'APOLLO_TRACKING_DURATION' = 'tracking.defaultDurationSeconds'
        'APOLLO_GRACE_TIMEOUT' = 'cleanup.graceTimeoutSeconds'
        'APOLLO_TEMP_DIR' = 'paths.tempDirectory'
        'APOLLO_LOG_DIR' = 'logging.logDirectory'
    }

    foreach ($envVar in $envMappings.Keys) {
        $envValue = [Environment]::GetEnvironmentVariable($envVar)
        if (-not [string]::IsNullOrWhiteSpace($envValue)) {
            $configPath = $envMappings[$envVar].Split('.')
            Set-ConfigurationValue -Config $Config -Path $configPath -Value $envValue
            Write-Verbose "Applied environment override: $envVar = $envValue"
        }
    }

    return $Config
}

function Set-ConfigurationValue {
    <#
    .SYNOPSIS
        Sets a nested configuration value using a path array.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Config,
        
        [Parameter(Mandatory)]
        [string[]]$Path,
        
        [Parameter(Mandatory)]
        $Value
    )

    $current = $Config
    for ($i = 0; $i -lt $Path.Length - 1; $i++) {
        if (-not $current.PSObject.Properties.Name -contains $Path[$i]) {
            $current | Add-Member -MemberType NoteProperty -Name $Path[$i] -Value ([PSCustomObject]@{})
        }
        $current = $current.$($Path[$i])
    }
    
    $finalProperty = $Path[-1]
    if ($current.PSObject.Properties.Name -contains $finalProperty) {
        $current.$finalProperty = $Value
    }
    else {
        $current | Add-Member -MemberType NoteProperty -Name $finalProperty -Value $Value
    }
}

function Expand-ConfigurationPaths {
    <#
    .SYNOPSIS
        Expands environment variables in configuration paths.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    # Expand paths in the paths section
    if ($Config.paths) {
        foreach ($pathProperty in $Config.paths.PSObject.Properties) {
            if ($pathProperty.Value -is [string]) {
                $Config.paths.$($pathProperty.Name) = [Environment]::ExpandEnvironmentVariables($pathProperty.Value)
            }
        }
    }

    # Expand specific path properties
    if ($Config.tracking.trackingFilePath) {
        $Config.tracking.trackingFilePath = [Environment]::ExpandEnvironmentVariables($Config.tracking.trackingFilePath)
    }
    
    if ($Config.logging.logDirectory) {
        $Config.logging.logDirectory = [Environment]::ExpandEnvironmentVariables($Config.logging.logDirectory)
    }

    return $Config
}
