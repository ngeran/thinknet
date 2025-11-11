/**
 * =============================================================================
 * CONFIGURATION TAB COMPONENT - MODERN REDESIGN
 * =============================================================================
 *
 * Device configuration and image selection interface
 *
 * VERSION: 3.0.0 - Modern UI Redesign
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-10
 *
 * UPDATES:
 * - Modern black & white design with improved contrast
 * - Space-efficient compact layout
 * - Enhanced visual hierarchy
 * - Streamlined validation feedback
 *
 * @module components/tabs/ConfigurationTab
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, Shield, ArrowRight, Loader2, AlertTriangle, Image, Server, Lock, Package } from 'lucide-react';
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';
import PreCheckSelector from '@/shared/PreCheckSelector';

/**
 * Configuration Tab Component
 *
 * First step in the upgrade workflow where users:
 * - Select software image
 * - Configure device credentials
 * - Specify target device
 * - Select pre-check validations to run
 * - Initiate pre-check validation
 *
 * @param {Object} props
 * @param {Object} props.upgradeParams - Current upgrade parameters
 * @param {Function} props.onParamChange - Callback when parameters change
 * @param {Function} props.onStartPreCheck - Callback to start pre-check
 * @param {boolean} props.isFormValid - Whether form is valid
 * @param {boolean} props.isRunning - Whether operation is running
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {Array<string>} props.selectedPreChecks - Selected pre-check IDs
 * @param {Function} props.onPreCheckSelectionChange - Callback when pre-check selection changes
 */
export default function ConfigurationTab({
  upgradeParams,
  onParamChange,
  onStartPreCheck,
  isFormValid,
  isRunning,
  isConnected,
  selectedPreChecks,
  onPreCheckSelectionChange,
}) {

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const hasPreChecksSelected = selectedPreChecks && selectedPreChecks.length > 0;
  const canStartPreCheck = isFormValid && hasPreChecksSelected && !isRunning && isConnected;

  // ===========================================================================
  // STATUS INDICATORS
  // ===========================================================================

  const configStatus = [
    {
      icon: Image,
      label: 'Image',
      value: upgradeParams.image_filename,
      isValid: !!upgradeParams.image_filename,
    },
    {
      icon: Package,
      label: 'Version',
      value: upgradeParams.target_version,
      isValid: !!upgradeParams.target_version,
    },
    {
      icon: Server,
      label: 'Device',
      value: upgradeParams.hostname || (upgradeParams.inventory_file ? 'Inventory' : null),
      isValid: !!(upgradeParams.hostname || upgradeParams.inventory_file),
    },
    {
      icon: Lock,
      label: 'Auth',
      value: upgradeParams.username ? '••••••' : null,
      isValid: !!(upgradeParams.username && upgradeParams.password),
    },
    {
      icon: Shield,
      label: 'Pre-Checks',
      value: hasPreChecksSelected ? `${selectedPreChecks.length} selected` : null,
      isValid: hasPreChecksSelected,
    },
  ];

  const validCount = configStatus.filter(s => s.isValid).length;
  const totalCount = configStatus.length;
  const isFullyConfigured = canStartPreCheck;

  return (
    <div className="space-y-4 max-w-7xl">

      {/* ====================================================================
          PROGRESS HEADER
          ==================================================================== */}
      <div className="bg-gradient-to-r from-gray-900 to-black text-white rounded-xl p-6 shadow-lg border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Configuration</h2>
            <p className="text-gray-400 text-sm mt-1">
              Set up your upgrade parameters and validation checks
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{validCount}/{totalCount}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">Complete</div>
          </div>
        </div>

        {/* Mini Status Grid */}
        <div className="grid grid-cols-5 gap-3">
          {configStatus.map((status, idx) => {
            const Icon = status.icon;
            return (
              <div
                key={idx}
                className={`relative overflow-hidden rounded-lg p-3 transition-all ${status.isValid
                    ? 'bg-white/10 border border-white/20'
                    : 'bg-white/5 border border-white/10'
                  }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${status.isValid ? 'text-white' : 'text-gray-500'}`} />
                  {status.isValid && (
                    <CheckCircle className="h-3 w-3 text-green-400 ml-auto" />
                  )}
                </div>
                <div className={`text-xs font-medium ${status.isValid ? 'text-white' : 'text-gray-500'}`}>
                  {status.label}
                </div>
                {status.value && (
                  <div className="text-xs text-gray-400 truncate mt-1">
                    {status.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ====================================================================
          MAIN CONFIGURATION FORMS
          ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Image Selection - Compact */}
        <div className="lg:col-span-1">
          <SelectImageRelease
            parameters={upgradeParams}
            onParamChange={onParamChange}
          />
        </div>

        {/* Device Configuration - Wider */}
        <div className="lg:col-span-2">
          <CodeUpgradeForm
            parameters={upgradeParams}
            onParamChange={onParamChange}
          />
        </div>
      </div>

      {/* ====================================================================
          PRE-CHECK SELECTION
          ==================================================================== */}
      <PreCheckSelector
        selectedChecks={selectedPreChecks}
        onChange={onPreCheckSelectionChange}
        disabled={isRunning}
      />

      {/* ====================================================================
          ACTION PANEL
          ==================================================================== */}
      <Card className="border-2 border-black shadow-lg">
        <CardContent className="p-6">
          {/* Connection Warning - Top Priority */}
          {!isConnected && (
            <Alert className="mb-4 border-2 border-black bg-white">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="font-bold">Connection Issue</AlertTitle>
              <AlertDescription className="text-sm">
                WebSocket disconnected. Real-time updates unavailable.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Status Section */}
            <div className="flex-1 w-full">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${isFullyConfigured ? 'bg-black' : 'bg-gray-200'}`}>
                  <Shield className={`h-6 w-6 ${isFullyConfigured ? 'text-white' : 'text-gray-600'}`} />
                </div>
                <div>
                  <h4 className="text-lg font-bold tracking-tight">
                    {isFullyConfigured ? 'Ready to Validate' : 'Configuration Required'}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {isFullyConfigured
                      ? 'All parameters configured. Start pre-check validation.'
                      : 'Complete the configuration to continue.'}
                  </p>
                </div>
              </div>

              {/* Validation Messages - Compact */}
              {!isFormValid && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Missing:</p>
                  <div className="space-y-1 text-xs text-gray-600">
                    {!upgradeParams.image_filename && <p>• Software image selection</p>}
                    {!upgradeParams.hostname && !upgradeParams.inventory_file && <p>• Device target</p>}
                    {(!upgradeParams.username || !upgradeParams.password) && <p>• Authentication credentials</p>}
                  </div>
                </div>
              )}

              {isFormValid && !hasPreChecksSelected && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-700">• Select at least one pre-check validation</p>
                </div>
              )}
            </div>

            {/* Action Button */}
            <Button
              onClick={onStartPreCheck}
              disabled={!canStartPreCheck}
              size="lg"
              className={`w-full sm:w-auto px-8 h-12 text-base font-semibold transition-all ${canStartPreCheck
                  ? 'bg-black hover:bg-gray-800 text-white shadow-lg hover:shadow-xl'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Running
                </>
              ) : (
                <>
                  Start Pre-Check
                  <ArrowRight className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
