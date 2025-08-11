function Get-ApolloContextInternal {
    <#
    .SYNOPSIS
        Internal function to retrieve Apollo environment context.

    .DESCRIPTION
        Retrieves Apollo environment variables and returns them as a structured object.
        This is an internal function used by other module functions.

    .OUTPUTS
        [PSCustomObject] Apollo context information

    .EXAMPLE
        $context = Get-ApolloContextInternal
        Write-Host "App: $($context.AppName)"

    .NOTES
        This is an internal function and should not be called directly.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param()

    try {
        # Get configuration for environment variable names
        $config = Get-ApolloConfigurationInternal
        $envVars = $config.apollo.environmentVariables

        # Build context object
        $context = [PSCustomObject]@{
            AppName = [Environment]::GetEnvironmentVariable($envVars.appName)
            AppUUID = [Environment]::GetEnvironmentVariable($envVars.appUUID)
            AppStatus = [Environment]::GetEnvironmentVariable($envVars.appStatus)
            ClientName = [Environment]::GetEnvironmentVariable($envVars.clientName)
            ClientUUID = [Environment]::GetEnvironmentVariable($envVars.clientUUID)
            ClientWidth = [Environment]::GetEnvironmentVariable($envVars.clientWidth)
            ClientHeight = [Environment]::GetEnvironmentVariable($envVars.clientHeight)
            ClientFPS = [Environment]::GetEnvironmentVariable($envVars.clientFPS)
            IsApolloEnvironment = $false
            Timestamp = Get-Date
        }

        # Determine if we're in an Apollo environment
        $context.IsApolloEnvironment = -not [string]::IsNullOrWhiteSpace($context.AppName)

        # Convert numeric values
        if ($context.ClientWidth) {
            try { $context.ClientWidth = [int]$context.ClientWidth } catch { $context.ClientWidth = $null }
        }
        if ($context.ClientHeight) {
            try { $context.ClientHeight = [int]$context.ClientHeight } catch { $context.ClientHeight = $null }
        }
        if ($context.ClientFPS) {
            try { $context.ClientFPS = [int]$context.ClientFPS } catch { $context.ClientFPS = $null }
        }

        return $context
    }
    catch {
        Write-Warning "Failed to retrieve Apollo context: $($_.Exception.Message)"
        
        # Return empty context on error
        return [PSCustomObject]@{
            AppName = $null
            AppUUID = $null
            AppStatus = $null
            ClientName = $null
            ClientUUID = $null
            ClientWidth = $null
            ClientHeight = $null
            ClientFPS = $null
            IsApolloEnvironment = $false
            Timestamp = Get-Date
        }
    }
}
