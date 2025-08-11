function Invoke-ErrorHandling {
    <#
    .SYNOPSIS
        Modern error handling framework for Apollo Game Management.

    .DESCRIPTION
        Provides structured error handling with proper logging, error categorization,
        and recovery mechanisms following PowerShell 7+ best practices.

    .PARAMETER ScriptBlock
        The script block to execute with error handling.

    .PARAMETER ErrorCategory
        Category of operation for error context.

    .PARAMETER RetryCount
        Number of retry attempts for transient errors.

    .PARAMETER RetryDelay
        Delay between retry attempts in seconds.

    .PARAMETER SuppressErrors
        Suppress non-terminating errors and return structured result.

    .OUTPUTS
        [PSCustomObject] Structured result with Success, Result, Error, and Metadata.

    .EXAMPLE
        $result = Invoke-ErrorHandling -ScriptBlock { Get-Process "nonexistent" } -ErrorCategory "ProcessQuery"

    .NOTES
        Implements 2025 PowerShell error handling best practices with structured responses.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,
        
        [Parameter()]
        [ValidateSet('ProcessManagement', 'FileOperation', 'Configuration', 'Security', 'Network', 'General')]
        [string]$ErrorCategory = 'General',
        
        [Parameter()]
        [ValidateRange(0, 5)]
        [int]$RetryCount = 0,
        
        [Parameter()]
        [ValidateRange(1, 30)]
        [int]$RetryDelay = 2,
        
        [Parameter()]
        [switch]$SuppressErrors
    )

    begin {
        Write-Verbose "Starting error handling for category: $ErrorCategory"
        
        # Initialize result structure
        $result = [PSCustomObject]@{
            Success = $false
            Result = $null
            Error = $null
            ErrorDetails = $null
            Category = $ErrorCategory
            Timestamp = Get-Date
            RetryAttempts = 0
            ExecutionTime = $null
        }
    }

    process {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $attempt = 0
        
        do {
            $attempt++
            $result.RetryAttempts = $attempt - 1
            
            try {
                Write-Verbose "Executing script block (attempt $attempt)"
                
                # Set appropriate error action preference
                $originalErrorActionPreference = $ErrorActionPreference
                if ($SuppressErrors) {
                    $ErrorActionPreference = 'SilentlyContinue'
                } else {
                    $ErrorActionPreference = 'Stop'
                }
                
                # Execute the script block
                $executionResult = & $ScriptBlock
                
                # Restore original error action preference
                $ErrorActionPreference = $originalErrorActionPreference
                
                # Success - populate result
                $result.Success = $true
                $result.Result = $executionResult
                $result.ExecutionTime = $stopwatch.Elapsed
                
                Write-Verbose "Script block executed successfully"
                return $result
            }
            catch {
                # Restore original error action preference
                $ErrorActionPreference = $originalErrorActionPreference
                
                $errorInfo = Get-StructuredErrorInfo -ErrorRecord $_ -Category $ErrorCategory
                $result.Error = $errorInfo.Message
                $result.ErrorDetails = $errorInfo
                
                Write-Verbose "Error occurred: $($errorInfo.Message)"
                
                # Determine if this is a retryable error
                $isRetryable = Test-RetryableError -ErrorRecord $_ -Category $ErrorCategory
                
                if ($isRetryable -and $attempt -le $RetryCount) {
                    Write-Verbose "Retryable error detected, waiting $RetryDelay seconds before retry"
                    Start-Sleep -Seconds $RetryDelay
                    continue
                } else {
                    # Final failure
                    $result.ExecutionTime = $stopwatch.Elapsed
                    
                    # Log the error
                    Write-ApolloLogInternal -Message "Operation failed: $($errorInfo.Message)" -Level "ERROR" -Category $ErrorCategory
                    
                    if (-not $SuppressErrors) {
                        throw $_
                    }
                    
                    return $result
                }
            }
        } while ($attempt -le $RetryCount)
        
        # Should not reach here, but safety net
        $result.ExecutionTime = $stopwatch.Elapsed
        return $result
    }
}

function Get-StructuredErrorInfo {
    <#
    .SYNOPSIS
        Extracts structured information from PowerShell error records.
    #>
    
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [System.Management.Automation.ErrorRecord]$ErrorRecord,
        
        [Parameter()]
        [string]$Category = 'General'
    )

    try {
        $errorInfo = [PSCustomObject]@{
            Message = $ErrorRecord.Exception.Message
            FullyQualifiedErrorId = $ErrorRecord.FullyQualifiedErrorId
            CategoryInfo = $ErrorRecord.CategoryInfo.ToString()
            ScriptStackTrace = $ErrorRecord.ScriptStackTrace
            InvocationInfo = @{
                ScriptName = $ErrorRecord.InvocationInfo.ScriptName
                Line = $ErrorRecord.InvocationInfo.ScriptLineNumber
                Column = $ErrorRecord.InvocationInfo.OffsetInLine
                Command = $ErrorRecord.InvocationInfo.MyCommand.Name
            }
            Exception = @{
                Type = $ErrorRecord.Exception.GetType().FullName
                HResult = $ErrorRecord.Exception.HResult
                InnerException = if ($ErrorRecord.Exception.InnerException) { 
                    $ErrorRecord.Exception.InnerException.Message 
                } else { 
                    $null 
                }
            }
            Category = $Category
            Timestamp = Get-Date
            Severity = Get-ErrorSeverity -ErrorRecord $ErrorRecord
        }

        return $errorInfo
    }
    catch {
        # Fallback error info if structured extraction fails
        return [PSCustomObject]@{
            Message = "Error processing error record: $($_.Exception.Message)"
            Category = $Category
            Timestamp = Get-Date
            Severity = 'High'
        }
    }
}

function Test-RetryableError {
    <#
    .SYNOPSIS
        Determines if an error is retryable based on error type and category.
    #>
    
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [System.Management.Automation.ErrorRecord]$ErrorRecord,
        
        [Parameter()]
        [string]$Category = 'General'
    )

    # Define retryable error patterns
    $retryablePatterns = @{
        'ProcessManagement' = @(
            'Access is denied',
            'The process cannot access the file',
            'The system cannot find the file specified',
            'Insufficient system resources'
        )
        'FileOperation' = @(
            'The process cannot access the file',
            'Access to the path .* is denied',
            'The file is being used by another process',
            'Insufficient disk space'
        )
        'Network' = @(
            'The network path was not found',
            'A network error occurred',
            'The operation timed out',
            'Connection refused'
        )
        'General' = @(
            'Insufficient system resources',
            'The operation timed out'
        )
    }

    $errorMessage = $ErrorRecord.Exception.Message
    $patterns = $retryablePatterns[$Category] + $retryablePatterns['General']

    foreach ($pattern in $patterns) {
        if ($errorMessage -match $pattern) {
            Write-Verbose "Retryable error pattern matched: $pattern"
            return $true
        }
    }

    # Check for specific exception types that are typically retryable
    $retryableExceptionTypes = @(
        'System.IO.IOException',
        'System.UnauthorizedAccessException',
        'System.TimeoutException',
        'System.Net.NetworkInformation.PingException'
    )

    $exceptionType = $ErrorRecord.Exception.GetType().FullName
    if ($exceptionType -in $retryableExceptionTypes) {
        Write-Verbose "Retryable exception type: $exceptionType"
        return $true
    }

    return $false
}

function Get-ErrorSeverity {
    <#
    .SYNOPSIS
        Determines error severity based on error characteristics.
    #>
    
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [System.Management.Automation.ErrorRecord]$ErrorRecord
    )

    $exceptionType = $ErrorRecord.Exception.GetType().FullName
    $errorMessage = $ErrorRecord.Exception.Message

    # Critical errors
    $criticalPatterns = @(
        'OutOfMemoryException',
        'StackOverflowException',
        'AccessViolationException',
        'System.Security.SecurityException'
    )

    foreach ($pattern in $criticalPatterns) {
        if ($exceptionType -like "*$pattern*" -or $errorMessage -match $pattern) {
            return 'Critical'
        }
    }

    # High severity errors
    $highSeverityPatterns = @(
        'UnauthorizedAccessException',
        'DirectoryNotFoundException',
        'FileNotFoundException',
        'ArgumentException'
    )

    foreach ($pattern in $highSeverityPatterns) {
        if ($exceptionType -like "*$pattern*" -or $errorMessage -match $pattern) {
            return 'High'
        }
    }

    # Medium severity (default for most errors)
    return 'Medium'
}

function Write-StructuredError {
    <#
    .SYNOPSIS
        Writes structured error information to logs and output.
    #>
    
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$ErrorInfo,
        
        [Parameter()]
        [switch]$ThrowError
    )

    # Create detailed error message
    $detailedMessage = @"
Error Category: $($ErrorInfo.Category)
Severity: $($ErrorInfo.Severity)
Message: $($ErrorInfo.Message)
Command: $($ErrorInfo.InvocationInfo.Command)
Script: $($ErrorInfo.InvocationInfo.ScriptName)
Line: $($ErrorInfo.InvocationInfo.Line)
Exception Type: $($ErrorInfo.Exception.Type)
"@

    # Log the error
    Write-ApolloLogInternal -Message $detailedMessage -Level "ERROR" -Category $ErrorInfo.Category

    if ($ThrowError) {
        throw $ErrorInfo.Message
    }
}
