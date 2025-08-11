@{
    # PSScriptAnalyzer configuration for Apollo Game Management module
    # Following 2025 PowerShell best practices and security standards
    
    # Include default rules
    IncludeDefaultRules = $true
    
    # Severity levels to include
    Severity = @('Error', 'Warning', 'Information')
    
    # Specific rules to include
    IncludeRules = @(
        # Security rules
        'PSAvoidUsingPlainTextForPassword',
        'PSAvoidUsingConvertToSecureStringWithPlainText',
        'PSAvoidUsingUsernameAndPasswordParams',
        'PSAvoidUsingInvokeExpression',
        'PSAvoidGlobalVars',
        'PSUseDeclaredVarsMoreThanAssignments',
        
        # Performance rules
        'PSAvoidUsingCmdletAliases',
        'PSAvoidUsingWMICmdlets',
        'PSUseCompatibleCmdlets',
        'PSUseCompatibleSyntax',
        
        # Best practices
        'PSUseApprovedVerbs',
        'PSUseSingularNouns',
        'PSUseConsistentIndentation',
        'PSUseConsistentWhitespace',
        'PSUseCorrectCasing',
        'PSUseCmdletCorrectly',
        'PSUseShouldProcessForStateChangingFunctions',
        'PSUsePSCredentialType',
        'PSUseOutputTypeCorrectly',
        'PSUseSupportsShouldProcess',
        
        # Error handling
        'PSAvoidUsingEmptyCatchBlock',
        'PSAvoidUsingErrorActionAndWarningAction',
        'PSUseProcessBlockForPipelineCommand',
        
        # Documentation
        'PSProvideCommentHelp',
        'PSReviewUnusedParameter',
        'PSUseBOMForUnicodeEncodedFile',
        
        # Code structure
        'PSAvoidDefaultValueForMandatoryParameter',
        'PSAvoidDefaultValueSwitchParameter',
        'PSMisleadingBacktick',
        'PSMissingModuleManifestField',
        'PSReservedCmdletChar',
        'PSReservedParams',
        'PSUseIdenticalMandatoryParametersForDSC',
        'PSUseIdenticalParametersForDSC'
    )
    
    # Rules to exclude (if any specific rules need to be disabled)
    ExcludeRules = @(
        # Exclude rules that may not apply to this specific module
        # Add rules here if needed
    )
    
    # Custom rule configurations
    Rules = @{
        # Consistent indentation (4 spaces)
        PSUseConsistentIndentation = @{
            Enable = $true
            Kind = 'space'
            IndentationSize = 4
            PipelineIndentation = 'IncreaseIndentationForFirstPipeline'
        }
        
        # Consistent whitespace
        PSUseConsistentWhitespace = @{
            Enable = $true
            CheckInnerBrace = $true
            CheckOpenBrace = $true
            CheckOpenParen = $true
            CheckOperator = $true
            CheckPipe = $true
            CheckSeparator = $true
            CheckParameter = $false
        }
        
        # Correct casing
        PSUseCorrectCasing = @{
            Enable = $true
        }
        
        # Compatible cmdlets for cross-platform support
        PSUseCompatibleCmdlets = @{
            Enable = $true
            TargetProfiles = @(
                'win-8_x64_10.0.17763.0_6.1.3_x64_4.0.30319.42000_core',
                'win-8_x64_10.0.17763.0_7.0.0_x64_3.1.2_core',
                'win-8_x64_10.0.17763.0_7.1.0_x64_3.1.2_core',
                'win-8_x64_10.0.17763.0_7.2.0_x64_3.1.2_core'
            )
        }
        
        # Compatible syntax for PowerShell 7+
        PSUseCompatibleSyntax = @{
            Enable = $true
            TargetVersions = @('7.0', '7.1', '7.2')
        }
        
        # Avoid using cmdlet aliases
        PSAvoidUsingCmdletAliases = @{
            Enable = $true
            Whitelist = @()  # No aliases allowed
        }
        
        # Provide comment help
        PSProvideCommentHelp = @{
            Enable = $true
            ExportedOnly = $true
            BlockComment = $true
            VSCodeSnippetCorrection = $true
            Placement = 'before'
        }
        
        # Use ShouldProcess for state-changing functions
        PSUseShouldProcessForStateChangingFunctions = @{
            Enable = $true
        }
        
        # Review unused parameters
        PSReviewUnusedParameter = @{
            Enable = $true
            CommandsToTraverse = @(
                'Invoke-Expression',
                'Invoke-Command',
                'Invoke-RestMethod',
                'Invoke-WebRequest'
            )
        }
        
        # Avoid global variables
        PSAvoidGlobalVars = @{
            Enable = $true
        }
        
        # Use declared variables more than assignments
        PSUseDeclaredVarsMoreThanAssignments = @{
            Enable = $true
        }
        
        # Avoid using Invoke-Expression
        PSAvoidUsingInvokeExpression = @{
            Enable = $true
        }
        
        # Avoid empty catch blocks
        PSAvoidUsingEmptyCatchBlock = @{
            Enable = $true
        }
        
        # Use process block for pipeline commands
        PSUseProcessBlockForPipelineCommand = @{
            Enable = $true
        }
        
        # Use output type correctly
        PSUseOutputTypeCorrectly = @{
            Enable = $true
        }
        
        # Use PSCredential type
        PSUsePSCredentialType = @{
            Enable = $true
        }
        
        # Avoid using WMI cmdlets (use CIM instead)
        PSAvoidUsingWMICmdlets = @{
            Enable = $true
        }
        
        # Use approved verbs
        PSUseApprovedVerbs = @{
            Enable = $true
        }
        
        # Use singular nouns
        PSUseSingularNouns = @{
            Enable = $true
        }
        
        # Missing module manifest fields
        PSMissingModuleManifestField = @{
            Enable = $true
        }
        
        # Reserved cmdlet characters
        PSReservedCmdletChar = @{
            Enable = $true
        }
        
        # Reserved parameters
        PSReservedParams = @{
            Enable = $true
        }
        
        # Misleading backtick
        PSMisleadingBacktick = @{
            Enable = $true
        }
        
        # Avoid default values for mandatory parameters
        PSAvoidDefaultValueForMandatoryParameter = @{
            Enable = $true
        }
        
        # Avoid default value switch parameters
        PSAvoidDefaultValueSwitchParameter = @{
            Enable = $true
        }
        
        # Security rules
        PSAvoidUsingPlainTextForPassword = @{
            Enable = $true
        }
        
        PSAvoidUsingConvertToSecureStringWithPlainText = @{
            Enable = $true
        }
        
        PSAvoidUsingUsernameAndPasswordParams = @{
            Enable = $true
        }
    }
    
    # Custom severity overrides
    CustomRulePath = @()
    
    # Recurse into subdirectories
    Recurse = $true
    
    # Include/Exclude file patterns
    IncludePattern = @('*.ps1', '*.psm1', '*.psd1')
    ExcludePattern = @('*.Tests.ps1')
}
