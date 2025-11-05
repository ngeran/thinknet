/**
 * =============================================================================
 * CONFIGURATION TAB COMPONENT
 * =============================================================================
 *
 * Device configuration and image selection interface
 *
 * @module components/tabs/ConfigurationTab
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, Shield, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';
import DebugPanel from '../debug/DebugPanel';
import WebSocketInspector from '../debug/WebSocketInspector';
 
/**
 * Configuration Tab Component
 *
 * First step in the upgrade workflow where users:
 * - Select software image
 * - Configure device credentials
 * - Specify target device
 * - Initiate pre-check validation
 *
 * @param {Object} props
 * @param {Object} props.upgradeParams - Current upgrade parameters
 * @param {Function} props.onParamChange - Callback when parameters change
 * @param {Function} props.onStartPreCheck - Callback to start pre-check
 * @param {boolean} props.isFormValid - Whether form is valid
 * @param {boolean} props.isRunning - Whether operation is running
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {Object} props.debugState - State for debug panel
 * @param {Object} props.debugHandlers - Handlers for debug panel
 * @param {Array} props.jobOutput - Job output for WebSocket inspector
 */
export default function ConfigurationTab({
  upgradeParams,
  onParamChange,
  onStartPreCheck,
  isFormValid,
  isRunning,
  isConnected,
  debugState,
  debugHandlers,
  jobOutput,
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
 
      {/* ====================================================================
          LEFT COLUMN: IMAGE SELECTION
          ==================================================================== */}
      <div className="xl:col-span-1">
        <SelectImageRelease
          parameters={upgradeParams}
          onParamChange={onParamChange}
        />
      </div>
 
      {/* ====================================================================
          RIGHT COLUMN: DEVICE CONFIGURATION & ACTIONS
          ==================================================================== */}
      <div className="xl:col-span-2 space-y-6">
 
        {/* Device Configuration Form */}
        <CodeUpgradeForm
          parameters={upgradeParams}
          onParamChange={onParamChange}
        />
 
        {/* ==================================================================
            PRE-CHECK ACTION CARD
            ================================================================== */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
 
              {/* Status Information */}
              <div className="flex-1">
                <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Ready for Pre-Check Validation
                </h4>
 
                <div className="space-y-1 text-sm text-gray-600">
                  {/* Display configured parameters */}
                  {upgradeParams.image_filename && (
                    <p className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium">
                        Image: {upgradeParams.image_filename}
                      </span>
                    </p>
                  )}
 
                  {upgradeParams.target_version && (
                    <p className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>
                        Target Version: <strong>{upgradeParams.target_version}</strong>
                      </span>
                    </p>
                  )}
 
                  {upgradeParams.hostname && (
                    <p className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Device: {upgradeParams.hostname}</span>
                    </p>
                  )}
 
                  {/* Validation errors - show what's missing */}
                  {!isFormValid && (
                    <div className="text-orange-600 text-sm mt-2 space-y-1">
                      {!upgradeParams.image_filename && (
                        <p>• Select a software image</p>
                      )}
                      {!upgradeParams.target_version && (
                        <p>• Target version will be auto-extracted from image</p>
                      )}
                      {!upgradeParams.hostname && !upgradeParams.inventory_file && (
                        <p>• Configure device target</p>
                      )}
                      {(!upgradeParams.username || !upgradeParams.password) && (
                        <p>• Provide authentication credentials</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
 
              {/* Start Pre-Check Button */}
              <Button
                onClick={onStartPreCheck}
                disabled={!isFormValid || isRunning || !isConnected}
                size="lg"
                className="w-full sm:w-auto"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Running...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Start Pre-Check
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
 
            {/* WebSocket Connection Warning */}
            {!isConnected && (
              <Alert className="mt-4" variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>WebSocket Disconnected</AlertTitle>
                <AlertDescription>
                  Real-time progress updates are unavailable. Please check your connection.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
 
        {/* ==================================================================
            DEBUG PANEL
            ================================================================== */}
        <DebugPanel
          state={debugState}
          onLogState={debugHandlers.onLogState}
          onForceReview={debugHandlers.onForceReview}
          onNavigateReview={debugHandlers.onNavigateReview}
          onCheckWebSocket={debugHandlers.onCheckWebSocket}
        />
 
        {/* ==================================================================
            WEBSOCKET MESSAGE INSPECTOR
            ================================================================== */}
        <WebSocketInspector jobOutput={jobOutput} />
 
      </div>
    </div>
  );
}