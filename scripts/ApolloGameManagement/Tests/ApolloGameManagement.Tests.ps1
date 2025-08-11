#Requires -Modules Pester

<#
.SYNOPSIS
    Comprehensive Pester v5 tests for Apollo Game Management module.

.DESCRIPTION
    Unit and integration tests following 2025 PowerShell testing best practices.
    Tests all public functions, security validation, error handling, and configuration management.

.NOTES
    Requires Pester v5.0+ for modern testing features.
    Run with: Invoke-Pester -Path .\ApolloGameManagement.Tests.ps1
#>

BeforeAll {
    # Import the module under test
    $ModulePath = Join-Path $PSScriptRoot '..' 'ApolloGameManagement.psm1'
    Import-Module $ModulePath -Force
    
    # Mock external dependencies
    Mock Get-Process { 
        return @(
            [PSCustomObject]@{ ProcessName = 'notepad'; Id = 1234; StartTime = (Get-Date).AddMinutes(-5) }
            [PSCustomObject]@{ ProcessName = 'explorer'; Id = 5678; StartTime = (Get-Date).AddHours(-1) }
        )
    }
    
    Mock Stop-Process { return $true }
    Mock Start-Sleep { return $null }
    
    # Test data
    $script:TestGameName = 'TestGame2077'
    $script:TestTrackingFile = Join-Path $env:TEMP 'apollo-test-tracking.json'
    $script:TestProcesses = @('testgame.exe', 'launcher.exe')
}

AfterAll {
    # Cleanup test files
    if (Test-Path $script:TestTrackingFile) {
        Remove-Item $script:TestTrackingFile -Force -ErrorAction SilentlyContinue
    }
    
    # Remove module
    Remove-Module ApolloGameManagement -Force -ErrorAction SilentlyContinue
}

Describe 'ApolloGameManagement Module' -Tag 'Unit' {
    Context 'Module Import' {
        It 'Should import successfully' {
            Get-Module ApolloGameManagement | Should -Not -BeNullOrEmpty
        }
        
        It 'Should export expected functions' {
            $expectedFunctions = @(
                'Get-ApolloContext',
                'Write-ApolloLog',
                'Start-ApolloGameTracking',
                'Stop-ApolloGameProcesses',
                'Get-ApolloConfiguration'
            )
            
            $exportedFunctions = (Get-Module ApolloGameManagement).ExportedFunctions.Keys
            foreach ($function in $expectedFunctions) {
                $exportedFunctions | Should -Contain $function
            }
        }
    }
}

Describe 'Get-ApolloConfiguration' -Tag 'Unit' {
    Context 'Configuration Retrieval' {
        It 'Should return configuration object' {
            $config = Get-ApolloConfiguration
            $config | Should -Not -BeNullOrEmpty
            $config.PSObject.TypeNames[0] | Should -Be 'System.Management.Automation.PSCustomObject'
        }
        
        It 'Should have required configuration sections' {
            $config = Get-ApolloConfiguration
            $requiredSections = @('tracking', 'cleanup', 'logging', 'gamePatterns', 'security', 'performance', 'apollo', 'paths')
            
            foreach ($section in $requiredSections) {
                $config.PSObject.Properties.Name | Should -Contain $section
            }
        }
        
        It 'Should return specific section when requested' {
            $trackingConfig = Get-ApolloConfiguration -Section 'tracking'
            $trackingConfig | Should -Not -BeNullOrEmpty
            $trackingConfig.PSObject.Properties.Name | Should -Contain 'defaultDurationSeconds'
        }
        
        It 'Should throw error for invalid section' {
            { Get-ApolloConfiguration -Section 'InvalidSection' } | Should -Throw
        }
    }
}

Describe 'Get-ApolloContext' -Tag 'Unit' {
    Context 'Apollo Environment Detection' {
        BeforeEach {
            # Clear Apollo environment variables
            $env:APOLLO_APP_NAME = $null
            $env:APOLLO_APP_UUID = $null
            $env:APOLLO_CLIENT_NAME = $null
        }
        
        It 'Should return context object' {
            $context = Get-ApolloContext
            $context | Should -Not -BeNullOrEmpty
            $context.PSObject.TypeNames[0] | Should -Be 'System.Management.Automation.PSCustomObject'
        }
        
        It 'Should detect non-Apollo environment' {
            $context = Get-ApolloContext
            $context.IsApolloEnvironment | Should -Be $false
        }
        
        It 'Should detect Apollo environment when variables are set' {
            $env:APOLLO_APP_NAME = 'TestApp'
            $env:APOLLO_CLIENT_NAME = 'TestClient'
            
            $context = Get-ApolloContext
            $context.IsApolloEnvironment | Should -Be $true
            $context.AppName | Should -Be 'TestApp'
            $context.ClientName | Should -Be 'TestClient'
        }
        
        It 'Should have timestamp property' {
            $context = Get-ApolloContext
            $context.Timestamp | Should -BeOfType [DateTime]
        }
    }
}

Describe 'Write-ApolloLog' -Tag 'Unit' {
    Context 'Logging Functionality' {
        It 'Should accept log message' {
            { Write-ApolloLog -Message 'Test message' } | Should -Not -Throw
        }
        
        It 'Should validate log levels' {
            $validLevels = @('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')
            foreach ($level in $validLevels) {
                { Write-ApolloLog -Message 'Test' -Level $level } | Should -Not -Throw
            }
        }
        
        It 'Should reject invalid log levels' {
            { Write-ApolloLog -Message 'Test' -Level 'INVALID' } | Should -Throw
        }
        
        It 'Should return formatted message with PassThru' {
            $result = Write-ApolloLog -Message 'Test message' -Level 'INFO' -PassThru
            $result | Should -Match '\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[INFO\] Test message'
        }
        
        It 'Should accept pipeline input' {
            { 'Test1', 'Test2' | Write-ApolloLog -Level 'DEBUG' } | Should -Not -Throw
        }
    }
}

Describe 'Start-ApolloGameTracking' -Tag 'Unit' {
    Context 'Process Tracking' {
        BeforeEach {
            # Clean up any existing tracking files
            if (Test-Path $script:TestTrackingFile) {
                Remove-Item $script:TestTrackingFile -Force
            }
        }
        
        It 'Should require game name or Apollo context' {
            { Start-ApolloGameTracking -GameName '' } | Should -Throw
        }
        
        It 'Should validate game name input' {
            { Start-ApolloGameTracking -GameName 'Valid Game Name' -TrackingDurationSeconds 10 } | Should -Not -Throw
        }
        
        It 'Should reject invalid characters in game name' {
            { Start-ApolloGameTracking -GameName 'Game<>Name' } | Should -Throw
        }
        
        It 'Should validate tracking duration range' {
            { Start-ApolloGameTracking -GameName $script:TestGameName -TrackingDurationSeconds 5 } | Should -Throw
            { Start-ApolloGameTracking -GameName $script:TestGameName -TrackingDurationSeconds 350 } | Should -Throw
        }
        
        It 'Should return tracking results with PassThru' {
            Mock Start-Sleep { return $null }
            Mock Get-ProcessSnapshotInternal { return @() }
            Mock Save-TrackingDataInternal { return @{} }
            
            $result = Start-ApolloGameTracking -GameName $script:TestGameName -TrackingDurationSeconds 10 -PassThru
            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -Be $true
            $result.GameName | Should -Be $script:TestGameName
        }
    }
}

Describe 'Stop-ApolloGameProcesses' -Tag 'Unit' {
    Context 'Process Cleanup' {
        It 'Should validate game name input' {
            { Stop-ApolloGameProcesses -GameName 'Valid Game Name' } | Should -Not -Throw
        }
        
        It 'Should reject invalid characters in game name' {
            { Stop-ApolloGameProcesses -GameName 'Game<>Name' } | Should -Throw
        }
        
        It 'Should validate fallback processes' {
            { Stop-ApolloGameProcesses -GameName $script:TestGameName -FallbackProcesses @('valid.exe', 'another.exe') } | Should -Not -Throw
        }
        
        It 'Should reject invalid process names' {
            { Stop-ApolloGameProcesses -GameName $script:TestGameName -FallbackProcesses @('invalid<>process') } | Should -Throw
        }
        
        It 'Should validate grace timeout range' {
            { Stop-ApolloGameProcesses -GameName $script:TestGameName -GraceTimeoutSeconds 0 } | Should -Throw
            { Stop-ApolloGameProcesses -GameName $script:TestGameName -GraceTimeoutSeconds 65 } | Should -Throw
        }
    }
}

Describe 'Security Validation' -Tag 'Security' {
    Context 'Input Sanitization' {
        It 'Should validate secure input strings' {
            $validation = Test-SecurityValidation -InputString 'ValidGameName' -ValidationLevel 'Standard'
            $validation.IsValid | Should -Be $true
        }
        
        It 'Should detect injection patterns' {
            $validation = Test-SecurityValidation -InputString 'Game; rm -rf /' -ValidationLevel 'Strict'
            $validation.IsValid | Should -Be $false
            $validation.SecurityWarnings | Should -Contain 'Potential injection pattern detected in input'
        }
        
        It 'Should validate file paths' {
            $validation = Test-SecurityValidation -FilePath 'C:\ValidPath\file.exe' -ValidationLevel 'Standard'
            $validation.IsValid | Should -Be $true
        }
        
        It 'Should reject directory traversal' {
            $validation = Test-SecurityValidation -FilePath '..\..\..\windows\system32\cmd.exe' -ValidationLevel 'Standard'
            $validation.IsValid | Should -Be $false
        }
        
        It 'Should validate process names' {
            $validation = Test-SecurityValidation -ProcessName 'validprocess.exe' -ValidationLevel 'Standard'
            $validation.IsValid | Should -Be $true
        }
        
        It 'Should reject system process names' {
            $validation = Test-SecurityValidation -ProcessName 'system' -ValidationLevel 'Standard'
            $validation.IsValid | Should -Be $false
        }
    }
}

Describe 'Error Handling' -Tag 'ErrorHandling' {
    Context 'Structured Error Handling' {
        It 'Should handle successful operations' {
            $result = Invoke-ErrorHandling -ScriptBlock { return 'Success' } -ErrorCategory 'General'
            $result.Success | Should -Be $true
            $result.Result | Should -Be 'Success'
        }
        
        It 'Should handle errors gracefully' {
            $result = Invoke-ErrorHandling -ScriptBlock { throw 'Test error' } -ErrorCategory 'General' -SuppressErrors
            $result.Success | Should -Be $false
            $result.Error | Should -Be 'Test error'
        }
        
        It 'Should retry on retryable errors' {
            $script:attemptCount = 0
            $result = Invoke-ErrorHandling -ScriptBlock { 
                $script:attemptCount++
                if ($script:attemptCount -lt 3) { throw 'Access is denied' }
                return 'Success after retry'
            } -ErrorCategory 'ProcessManagement' -RetryCount 3 -RetryDelay 1
            
            $result.Success | Should -Be $true
            $result.RetryAttempts | Should -Be 2
        }
    }
}
