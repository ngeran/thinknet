/**
 * =============================================================================
 * CONFIGURATION TAB COMPONENT - MODERN REDESIGN v4.1.0
 * =============================================================================
 *
 * Device configuration, image selection, and upgrade options interface
 *
 * VERSION: 4.1.0 - Space-Efficient Responsive Design
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-20
 *
 * ENHANCEMENTS v4.1.0 (2025-11-20):
 * - Optimized for space efficiency and low-resolution screens
 * - Four-square grid layout with perfect alignment
 * - Responsive grid layouts that adapt to screen size
 * - Reduced padding and margins for better space utilization
 * - Enhanced mobile and tablet support
 * - Maintained visual hierarchy with tighter spacing
 *
 * @module components/tabs/ConfigurationTab
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle,
  Shield,
  ArrowRight,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Image,
  Server,
  Lock,
  Package,
  Settings,
  Zap
} from 'lucide-react';
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';
import PreCheckSelector from '@/shared/PreCheckSelector';

// Zustand Store Integration (Direct Store Access)
import { useCodeUpgradeStore } from '@/lib/codeUpgradeStore';
import { useCodeUpgradeWorkflow } from '@/hooks/useCodeUpgradeWorkflow';

/**
 * Configuration Tab Component - ZUSTAND VERSION
 *
 * First step in the upgrade workflow where users:
 * - Select software image
 * - Configure device credentials
 * - Specify target device
 * - Configure upgrade options
 * - Select pre-check validations to run
 * - Initiate pre-check validation
 *
 * Uses Zustand store directly - no props needed!
 */
export default function ConfigurationTab() {

  // ===========================================================================
  // ZUSTAND STORE INTEGRATION (Direct Store Access)
  // ===========================================================================

  /**
   * Direct access to Zustand store and workflow
   * No props needed - all data comes from store
   */
  const {
    deviceConfig,
    error,
    isProcessing,
    canStartPreCheck: storeCanStartPreCheck,
    updateDeviceConfig,
    clearError,
  } = useCodeUpgradeStore();

  const {
    startPreCheckExecution,
    handlePreCheckSelectionChange,
  } = useCodeUpgradeWorkflow();

  // ===========================================================================
  // EVENT HANDLERS (Store-based)
  // ===========================================================================

  const handleParamChange = (name, value) => {
    console.log(`[CONFIG_TAB] Parameter change: ${name} = ${value}`);
    updateDeviceConfig({ [name]: value });
  };

  const handleStartPreCheck = () => {
    console.log('[CONFIG_TAB] Starting pre-check execution');
    startPreCheckExecution();
  };

  // Note: using workflow's handlePreCheckSelectionChange for consistency

  // ===========================================================================
  // VALIDATION & STATE COMPUTATION (Store-based)
  // ===========================================================================

  const hasPreChecksSelected = deviceConfig.selectedPreChecks && deviceConfig.selectedPreChecks.length > 0;
  const isFormValid = !!(
    deviceConfig.username?.trim() &&
    deviceConfig.password?.trim() &&
    (deviceConfig.hostname?.trim() || deviceConfig.inventory_file?.trim()) &&
    deviceConfig.image_filename?.trim() &&
    deviceConfig.target_version?.trim()
  );

  const canStartPreCheck = isFormValid && hasPreChecksSelected && !isProcessing;

  const upgradeOptionsConfigured =
    deviceConfig.no_validate !== undefined &&
    deviceConfig.no_copy !== undefined &&
    deviceConfig.auto_reboot !== undefined;

  const hasRiskyOptions =
    deviceConfig.no_validate === true ||
    deviceConfig.auto_reboot === false;

  // ===========================================================================
  // STATUS CONFIGURATION
  // ===========================================================================

  const configStatus = [
    {
      icon: Image,
      label: 'Image',
      value: deviceConfig.image_filename,
      isValid: !!deviceConfig.image_filename,
    },
    {
      icon: Package,
      label: 'Version',
      value: deviceConfig.target_version,
      isValid: !!deviceConfig.target_version,
    },
    {
      icon: Server,
      label: 'Device',
      value: deviceConfig.hostname || (deviceConfig.inventory_file ? 'Inventory' : null),
      isValid: !!(deviceConfig.hostname || deviceConfig.inventory_file),
    },
    {
      icon: Lock,
      label: 'Auth',
      value: deviceConfig.username ? '••••••' : null,
      isValid: !!(deviceConfig.username && deviceConfig.password),
    },
    {
      icon: Settings,
      label: 'Options',
      value: upgradeOptionsConfigured ? 'Configured' : 'Default',
      isValid: upgradeOptionsConfigured,
      hasWarning: hasRiskyOptions,
    },
    {
      icon: Shield,
      label: 'Checks',
      value: hasPreChecksSelected ? `${deviceConfig.selectedPreChecks?.length || 0}` : null,
      isValid: hasPreChecksSelected,
    },
  ];

  const validCount = configStatus.filter(s => s.isValid).length;
  const totalCount = configStatus.length;
  const isFullyConfigured = canStartPreCheck;

  return (
    <div className="space-y-3 max-w-7xl mx-auto px-2 sm:px-4">

      {/* =====================================================================
          HEADER - COMPACT CONFIGURATION OVERVIEW
          ===================================================================== */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 text-white rounded-lg p-4 sm:p-5 shadow-xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Configuration</h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
              Configure upgrade parameters
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-bold">{validCount}/{totalCount}</div>
            <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">Complete</div>
          </div>
        </div>

        {/* Compact Status Indicators Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {configStatus.map((status, idx) => {
            const Icon = status.icon;
            return (
              <div
                key={idx}
                className={`relative overflow-hidden rounded-lg p-2.5 sm:p-3 transition-all ${status.isValid
                  ? 'bg-white/10 border border-white/30'
                  : 'bg-white/5 border border-white/10'
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${status.isValid ? 'text-white' : 'text-gray-500'}`} />
                  {status.isValid && !status.hasWarning && (
                    <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-400" />
                  )}
                  {status.hasWarning && (
                    <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-orange-400" />
                  )}
                </div>
                <div className={`text-[10px] sm:text-xs font-semibold ${status.isValid ? 'text-white' : 'text-gray-500'}`}>
                  {status.label}
                </div>
                {status.value && (
                  <div className="text-[9px] sm:text-[10px] text-gray-400 truncate mt-0.5">
                    {status.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          MAIN CONFIGURATION GRID - FOUR SQUARE GRID LAYOUT
          ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* SECTION 1: SOFTWARE IMAGE SELECTION */}
        <Card className="border border-gray-300 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-black">
                <Image className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-base font-bold">Software Image</CardTitle>
                <CardDescription className="text-[10px] sm:text-xs mt-0.5 hidden sm:block">
                  Select upgrade image and version
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <SelectImageRelease
              parameters={deviceConfig}
              onParamChange={handleParamChange}
            />
          </CardContent>
        </Card>

        {/* SECTION 2: TARGET DEVICE & AUTHENTICATION */}
        <Card className="border border-gray-300 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-black">
                <Server className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-base font-bold">Target & Auth</CardTitle>
                <CardDescription className="text-[10px] sm:text-xs mt-0.5 hidden sm:block">
                  Device and credentials
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <CodeUpgradeForm
              parameters={deviceConfig}
              onParamChange={handleParamChange}
            />
          </CardContent>
        </Card>

        {/* SECTION 3: UPGRADE OPTIONS */}
        <Card className="border border-gray-300 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-black">
                <Settings className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-base font-bold">Upgrade Options</CardTitle>
                <CardDescription className="text-[10px] sm:text-xs mt-0.5 hidden sm:block">
                  Configure upgrade behavior
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 space-y-2.5">

            {/* Option 1: Validate Image */}
            <div className="flex items-start space-x-2 p-2.5 sm:p-3 rounded-lg border border-gray-200 bg-white hover:border-gray-400 transition-colors">
              <Checkbox
                id="validateImage"
                checked={!deviceConfig.no_validate}
                onCheckedChange={(checked) =>
                  handleParamChange('no_validate', !checked)
                }
                disabled={isProcessing}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="validateImage"
                  className="text-xs sm:text-sm font-semibold cursor-pointer block mb-1"
                >
                  Validate Image Before Installation
                </label>
                <p className="text-[10px] sm:text-xs text-gray-600 leading-relaxed">
                  <span className="inline-flex items-center gap-0.5 text-green-700 font-semibold">
                    <CheckCircle className="h-2.5 w-2.5" /> Recommended
                  </span>
                  {' '}— Validates integrity (~2 min). Unchecking increases risk.
                </p>
              </div>
            </div>

            {/* Option 2: Skip File Copy */}
            <div className="flex items-start space-x-2 p-2.5 sm:p-3 rounded-lg border border-gray-200 bg-white hover:border-gray-400 transition-colors">
              <Checkbox
                id="skipCopy"
                checked={deviceConfig.no_copy}
                onCheckedChange={(checked) =>
                  handleParamChange('no_copy', checked)
                }
                disabled={isProcessing}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="skipCopy"
                  className="text-xs sm:text-sm font-semibold cursor-pointer block mb-1"
                >
                  Skip File Copy (Already on Device)
                </label>
                <p className="text-[10px] sm:text-xs text-gray-600 leading-relaxed">
                  Enable if image is in{' '}
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px] font-mono border border-gray-300">
                    /var/tmp/
                  </code>. Saves transfer time.
                </p>
              </div>
            </div>

            {/* Option 3: Auto Reboot */}
            <div className="flex items-start space-x-2 p-2.5 sm:p-3 rounded-lg border border-gray-200 bg-white hover:border-gray-400 transition-colors">
              <Checkbox
                id="autoReboot"
                checked={deviceConfig.auto_reboot}
                onCheckedChange={(checked) =>
                  handleParamChange('auto_reboot', checked)
                }
                disabled={isProcessing}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="autoReboot"
                  className="text-xs sm:text-sm font-semibold cursor-pointer block mb-1"
                >
                  Auto Reboot After Installation
                </label>
                <p className="text-[10px] sm:text-xs text-gray-600 leading-relaxed">
                  <span className="inline-flex items-center gap-0.5 text-green-700 font-semibold">
                    <CheckCircle className="h-2.5 w-2.5" /> Recommended
                  </span>
                  {' '}— Auto reboots (~5-10 min). Unchecking needs manual reboot.
                </p>
              </div>
            </div>

            {/* Warning Alerts - Compact */}
            {deviceConfig.no_validate && (
              <Alert className="border border-orange-300 bg-orange-50 p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                <AlertTitle className="text-orange-900 font-bold text-xs">
                  Validation Disabled
                </AlertTitle>
                <AlertDescription className="text-orange-800 text-[10px] sm:text-xs">
                  Skipping validation increases failure risk. Only disable if image is verified.
                </AlertDescription>
              </Alert>
            )}

            {!deviceConfig.auto_reboot && (
              <Alert className="border border-blue-300 bg-blue-50 p-2.5">
                <AlertCircle className="h-3.5 w-3.5 text-blue-600" />
                <AlertTitle className="text-blue-900 font-bold text-xs">
                  Manual Reboot Required
                </AlertTitle>
                <AlertDescription className="text-blue-800 text-[10px] sm:text-xs">
                  Manual reboot needed to complete upgrade. Version verification will be skipped.
                </AlertDescription>
              </Alert>
            )}

          </CardContent>
        </Card>

        {/* SECTION 4: VALIDATION CHECKS */}
        <Card className="border border-gray-300 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-black">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-base font-bold">Pre-Check Validations</CardTitle>
                <CardDescription className="text-[10px] sm:text-xs mt-0.5 hidden sm:block">
                  Select validation checks
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <PreCheckSelector
              selectedChecks={deviceConfig.selectedPreChecks || []}
              onChange={handlePreCheckSelectionChange}
              disabled={isProcessing}
            />
          </CardContent>
        </Card>
      </div>

      {/* =====================================================================
          SECTION 5: READY TO VALIDATE - COMPACT ACTION PANEL
          ===================================================================== */}
      <Card className="border-2 border-black shadow-lg">
        <CardContent className="p-3 sm:p-4">

          {/* Connection Warning - Compact */}
          {/* Note: We'll add WebSocket status later */}
          {false && (
            <Alert className="mb-3 border border-red-500 bg-red-50 p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              <AlertTitle className="font-bold text-red-900 text-xs">Connection Issue</AlertTitle>
              <AlertDescription className="text-[10px] sm:text-xs text-red-800">
                WebSocket disconnected. Check your connection.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">

            {/* Status Section - Compact */}
            <div className="flex-1 w-full min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`p-2 rounded-lg transition-all ${isFullyConfigured
                  ? 'bg-black'
                  : 'bg-gray-200'
                  }`}>
                  <Zap className={`h-5 w-5 sm:h-6 sm:w-6 ${isFullyConfigured ? 'text-white' : 'text-gray-600'
                    }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">
                    {isFullyConfigured ? 'Ready to Validate' : 'Configuration Incomplete'}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-600">
                    {isFullyConfigured
                      ? 'Start pre-check validation'
                      : 'Complete required fields'}
                  </p>
                </div>
              </div>

              {/* Validation Messages - Compact */}
              {!isFormValid && (
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                  <p className="text-xs font-bold text-gray-800 mb-1.5 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    Missing:
                  </p>
                  <div className="space-y-1 text-[10px] sm:text-xs text-gray-700">
                    {!deviceConfig.image_filename && (
                      <p className="flex items-center gap-1.5">
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        Software image
                      </p>
                    )}
                    {!deviceConfig.hostname && !deviceConfig.inventory_file && (
                      <p className="flex items-center gap-1.5">
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        Device target
                      </p>
                    )}
                    {(!deviceConfig.username || !deviceConfig.password) && (
                      <p className="flex items-center gap-1.5">
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        Credentials
                      </p>
                    )}
                  </div>
                </div>
              )}

              {isFormValid && !hasPreChecksSelected && (
                <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-200">
                  <p className="text-[10px] sm:text-xs text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Select at least one validation check
                  </p>
                </div>
              )}
            </div>

            {/* Action Button - Compact */}
            <div className="w-full sm:w-auto">
              <Button
                onClick={handleStartPreCheck}
                disabled={!canStartPreCheck}
                className={`w-full sm:w-auto px-6 sm:px-8 h-10 sm:h-12 text-sm sm:text-base font-bold transition-all ${canStartPreCheck
                  ? 'bg-black hover:bg-gray-800 text-white shadow-lg hover:shadow-xl'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
                    Running
                  </>
                ) : (
                  <>
                    Start Pre-Check
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
