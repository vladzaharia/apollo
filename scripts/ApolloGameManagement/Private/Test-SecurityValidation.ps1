function Test-SecurityValidation {
    <#
    .SYNOPSIS
        Comprehensive security validation for Apollo Game Management.

    .DESCRIPTION
        Provides centralized security validation including input sanitization,
        path validation, process name validation, and security policy enforcement.

    .PARAMETER InputString
        String input to validate and sanitize.

    .PARAMETER FilePath
        File path to validate for security compliance.

    .PARAMETER ProcessName
        Process name to validate against security policies.

    .PARAMETER ValidationLevel
        Security validation level: Basic, Standard, Strict.

    .OUTPUTS
        [PSCustomObject] Validation result with IsValid, SanitizedValue, and SecurityWarnings.

    .EXAMPLE
        Test-SecurityValidation -InputString "game.exe" -ValidationLevel "Standard"

    .NOTES
        This is an internal security function following 2025 PowerShell security best practices.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter()]
        [AllowEmptyString()]
        [string]$InputString = '',
        
        [Parameter()]
        [string]$FilePath = '',
        
        [Parameter()]
        [string]$ProcessName = '',
        
        [Parameter()]
        [ValidateSet('Basic', 'Standard', 'Strict')]
        [string]$ValidationLevel = 'Standard'
    )

    begin {
        Write-Verbose "Starting security validation with level: $ValidationLevel"
        
        # Get security configuration
        try {
            $config = Get-ApolloConfigurationInternal
            $securityConfig = $config.security
        }
        catch {
            Write-Warning "Failed to load security configuration, using defaults"
            $securityConfig = @{
                enableInputSanitization = $true
                maxProcessNameLength = 255
                allowedFileExtensions = @('.exe', '.com', '.bat', '.cmd')
                validateProcessPaths = $true
            }
        }
    }

    process {
        $result = [PSCustomObject]@{
            IsValid = $true
            SanitizedValue = ''
            SecurityWarnings = @()
            ValidationLevel = $ValidationLevel
        }

        try {
            # Input string validation
            if ($InputString) {
                $result.SanitizedValue = Invoke-InputSanitization -InputString $InputString -Config $securityConfig
                
                # Check for potential injection attempts
                if (Test-InjectionPatterns -InputString $InputString) {
                    $result.SecurityWarnings += "Potential injection pattern detected in input"
                    if ($ValidationLevel -eq 'Strict') {
                        $result.IsValid = $false
                    }
                }
            }

            # File path validation
            if ($FilePath) {
                $pathValidation = Test-SecureFilePath -FilePath $FilePath -Config $securityConfig
                if (-not $pathValidation.IsValid) {
                    $result.IsValid = $false
                    $result.SecurityWarnings += $pathValidation.Warnings
                }
            }

            # Process name validation
            if ($ProcessName) {
                $processValidation = Test-SecureProcessName -ProcessName $ProcessName -Config $securityConfig
                if (-not $processValidation.IsValid) {
                    $result.IsValid = $false
                    $result.SecurityWarnings += $processValidation.Warnings
                }
            }

            return $result
        }
        catch {
            Write-Error "Security validation failed: $($_.Exception.Message)"
            $result.IsValid = $false
            $result.SecurityWarnings += "Security validation exception: $($_.Exception.Message)"
            return $result
        }
    }
}

function Invoke-InputSanitization {
    <#
    .SYNOPSIS
        Sanitizes input strings according to security policies.
    #>
    
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [string]$InputString,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    if (-not $Config.enableInputSanitization) {
        return $InputString
    }

    # Remove null bytes and control characters
    $sanitized = $InputString -replace '[\x00-\x1F\x7F]', ''
    
    # Remove potentially dangerous characters for file operations
    $sanitized = $sanitized -replace '[<>:"|?*]', ''
    
    # Trim whitespace
    $sanitized = $sanitized.Trim()
    
    # Limit length
    if ($sanitized.Length -gt $Config.maxProcessNameLength) {
        $sanitized = $sanitized.Substring(0, $Config.maxProcessNameLength)
    }

    return $sanitized
}

function Test-InjectionPatterns {
    <#
    .SYNOPSIS
        Tests for common injection patterns in input strings.
    #>
    
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$InputString
    )

    # Common injection patterns
    $injectionPatterns = @(
        '[\x00-\x1F]',          # Control characters
        '\.\.[\\/]',            # Directory traversal
        '^[A-Z]:\\',            # Absolute paths
        '[\$`]',                # PowerShell injection
        '&[;&|]',               # Command chaining
        'eval\s*\(',            # Code evaluation
        'invoke\s*\(',          # PowerShell invoke
        'iex\s*\(',             # Invoke-Expression
        'start\s*\(',           # Start-Process
        'new-object\s*',        # Object creation
        'add-type\s*'           # Type addition
    )

    foreach ($pattern in $injectionPatterns) {
        if ($InputString -match $pattern) {
            Write-Verbose "Injection pattern detected: $pattern"
            return $true
        }
    }

    return $false
}

function Test-SecureFilePath {
    <#
    .SYNOPSIS
        Validates file paths for security compliance.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    $result = [PSCustomObject]@{
        IsValid = $true
        Warnings = @()
    }

    # Check for directory traversal
    if ($FilePath -match '\.\.[\\/]') {
        $result.IsValid = $false
        $result.Warnings += "Directory traversal detected in path"
    }

    # Check for absolute paths outside allowed directories
    if ($FilePath -match '^[A-Z]:\\' -and $FilePath -notmatch '^[A-Z]:\\(Program Files|Windows|Users)') {
        $result.Warnings += "Absolute path outside standard directories"
    }

    # Validate file extension if specified
    if ($Config.allowedFileExtensions -and $Config.allowedFileExtensions.Count -gt 0) {
        $extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
        if ($extension -and $extension -notin $Config.allowedFileExtensions) {
            $result.IsValid = $false
            $result.Warnings += "File extension '$extension' not in allowed list"
        }
    }

    return $result
}

function Test-SecureProcessName {
    <#
    .SYNOPSIS
        Validates process names for security compliance.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [string]$ProcessName,
        
        [Parameter(Mandatory)]
        [PSCustomObject]$Config
    )

    $result = [PSCustomObject]@{
        IsValid = $true
        Warnings = @()
    }

    # Check length
    if ($ProcessName.Length -gt $Config.maxProcessNameLength) {
        $result.IsValid = $false
        $result.Warnings += "Process name exceeds maximum length of $($Config.maxProcessNameLength)"
    }

    # Check for invalid characters
    if ($ProcessName -match '[<>:"|?*\\\/]') {
        $result.IsValid = $false
        $result.Warnings += "Process name contains invalid characters"
    }

    # Check for system process names (protection)
    $systemProcesses = @('system', 'idle', 'csrss', 'winlogon', 'services', 'lsass', 'svchost')
    if ($ProcessName.ToLower() -in $systemProcesses) {
        $result.IsValid = $false
        $result.Warnings += "Process name matches protected system process"
    }

    return $result
}

function Test-IsElevated {
    <#
    .SYNOPSIS
        Tests if the current PowerShell session is running with elevated privileges.
    #>
    
    [CmdletBinding()]
    [OutputType([bool])]
    param()

    try {
        $currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        Write-Warning "Failed to check elevation status: $($_.Exception.Message)"
        return $false
    }
}
