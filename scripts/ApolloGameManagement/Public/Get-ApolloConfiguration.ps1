function Get-ApolloConfiguration {
    <#
    .SYNOPSIS
        Retrieves Apollo Game Management configuration.

    .DESCRIPTION
        Loads and returns the merged configuration from multiple sources including
        default settings, system configuration, user configuration, and environment variables.
        Configuration is loaded in hierarchical order with environment variables having highest priority.

    .PARAMETER Section
        Optional parameter to retrieve only a specific configuration section.
        Valid sections: tracking, cleanup, logging, gamePatterns, security, performance, apollo, paths

    .PARAMETER Refresh
        Force refresh of the configuration cache.

    .OUTPUTS
        [PSCustomObject] Complete configuration object or specified section

    .EXAMPLE
        $config = Get-ApolloConfiguration
        Write-Host "Log Level: $($config.logging.logLevel)"

    .EXAMPLE
        $trackingConfig = Get-ApolloConfiguration -Section "tracking"
        Write-Host "Default tracking duration: $($trackingConfig.defaultDurationSeconds) seconds"

    .EXAMPLE
        $config = Get-ApolloConfiguration -Refresh
        # Forces reload of configuration from all sources

    .NOTES
        Configuration hierarchy (highest priority first):
        1. Environment variables (APOLLO_*)
        2. User configuration file (%LOCALAPPDATA%\Apollo\Config\apollo-config.json)
        3. System configuration file (%PROGRAMDATA%\Apollo\Config\apollo-config.json)
        4. Default configuration (module default)

        Environment variables that override configuration:
        - APOLLO_LOG_LEVEL: Override logging.logLevel
        - APOLLO_TRACKING_DURATION: Override tracking.defaultDurationSeconds
        - APOLLO_GRACE_TIMEOUT: Override cleanup.graceTimeoutSeconds
        - APOLLO_TEMP_DIR: Override paths.tempDirectory
        - APOLLO_LOG_DIR: Override logging.logDirectory
        - APOLLO_CONFIG_PATH: Custom configuration file path

    .LINK
        Get-ApolloContext
    #>

    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter()]
        [ValidateSet('tracking', 'cleanup', 'logging', 'gamePatterns', 'security', 'performance', 'apollo', 'paths')]
        [string]$Section = '',

        [Parameter()]
        [switch]$Refresh
    )

    begin {
        Write-Verbose "Retrieving Apollo configuration"
        if ($Section) {
            Write-Verbose "Requesting specific section: $Section"
        }
        if ($Refresh) {
            Write-Verbose "Forcing configuration refresh"
        }
    }

    process {
        try {
            # Get full configuration
            $config = Get-ApolloConfigurationInternal

            # Return specific section if requested
            if ($Section) {
                if ($config.PSObject.Properties.Name -contains $Section) {
                    Write-Verbose "Returning configuration section: $Section"
                    return $config.$Section
                }
                else {
                    Write-Error "Configuration section '$Section' not found. Available sections: $($config.PSObject.Properties.Name -join ', ')" -ErrorAction Stop
                }
            }

            # Return full configuration
            Write-Verbose "Returning complete configuration"
            return $config
        }
        catch {
            Write-Error "Failed to retrieve Apollo configuration: $($_.Exception.Message)" -ErrorAction Stop
        }
    }

    end {
        Write-Verbose "Configuration retrieval completed"
    }
}
