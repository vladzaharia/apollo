function Get-ApolloContext {
    <#
    .SYNOPSIS
        Retrieves Apollo environment context information.

    .DESCRIPTION
        Gets Apollo environment variables and returns them as a structured object.
        This function provides access to Apollo streaming context including app information,
        client details, and streaming parameters.

    .OUTPUTS
        [PSCustomObject] Apollo context information containing:
        - AppName: Name of the current Apollo application
        - AppUUID: Unique identifier for the Apollo application
        - AppStatus: Current status of the Apollo application
        - ClientName: Name of the connected client
        - ClientUUID: Unique identifier for the client
        - ClientWidth: Client display width
        - ClientHeight: Client display height
        - ClientFPS: Client target FPS
        - IsApolloEnvironment: Boolean indicating if running in Apollo environment
        - Timestamp: When the context was retrieved

    .EXAMPLE
        $context = Get-ApolloContext
        if ($context.IsApolloEnvironment) {
            Write-Host "Running Apollo app: $($context.AppName)"
            Write-Host "Client: $($context.ClientName) ($($context.ClientWidth)x$($context.ClientHeight))"
        }

    .EXAMPLE
        $context = Get-ApolloContext
        Write-Host "App Status: $($context.AppStatus)"

    .NOTES
        This function reads Apollo environment variables to determine the current context.
        If no Apollo environment variables are found, IsApolloEnvironment will be false.

        Environment variables read:
        - APOLLO_APP_NAME
        - APOLLO_APP_UUID
        - APOLLO_APP_STATUS
        - APOLLO_CLIENT_NAME
        - APOLLO_CLIENT_UUID
        - APOLLO_CLIENT_WIDTH
        - APOLLO_CLIENT_HEIGHT
        - APOLLO_CLIENT_FPS

    .LINK
        Write-ApolloLog
        Get-ApolloConfiguration
    #>

    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param()

    begin {
        Write-Verbose "Retrieving Apollo context information"
    }

    process {
        try {
            return Get-ApolloContextInternal
        }
        catch {
            Write-Error "Failed to retrieve Apollo context: $($_.Exception.Message)" -ErrorAction Stop
        }
    }

    end {
        Write-Verbose "Apollo context retrieval completed"
    }
}
