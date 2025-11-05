/**
 * =============================================================================
 * DEBUG PANEL COMPONENT
 * =============================================================================
 *
 * Developer troubleshooting tools for state and WebSocket debugging
 *
 * @module components/debug/DebugPanel
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bug, Terminal, Eye, ArrowRight, Activity } from 'lucide-react';
 
/**
 * Debug Panel Component
 *
 * Provides debugging utilities for troubleshooting:
 * - State inspection
 * - WebSocket connection status
 * - Force state changes for testing
 * - Real-time state display
 *
 * @param {Object} props
 * @param {Object} props.state - Current application state
 * @param {Function} props.onLogState - Callback to log current state
 * @param {Function} props.onForceReview - Callback to force review tab
 * @param {Function} props.onNavigateReview - Callback to navigate to review
 * @param {Function} props.onCheckWebSocket - Callback to check WebSocket status
 */
export default function DebugPanel({
  state,
  onLogState,
  onForceReview,
  onNavigateReview,
  onCheckWebSocket,
}) {
  const {
    preCheckSummary,
    isConnected,
    activeTab,
    currentPhase,
    jobStatus,
    canProceedWithUpgrade,
    jobId,
    wsChannel,
  } = state;
 
  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Bug className="h-4 w-4" />
          Debug Panel
        </CardTitle>
        <CardDescription>
          Troubleshooting tools for WebSocket and state issues
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Debug Action Buttons */}
        <div className="flex gap-2 flex-wrap mb-4">
          <Button
            onClick={onLogState}
            variant="outline"
            size="sm"
          >
            <Terminal className="h-3 w-3 mr-1" />
            Log Current State
          </Button>
          <Button
            onClick={onForceReview}
            variant="outline"
            size="sm"
          >
            <Eye className="h-3 w-3 mr-1" />
            Force Review Tab
          </Button>
          <Button
            onClick={onNavigateReview}
            variant="outline"
            size="sm"
            disabled={!preCheckSummary}
          >
            <ArrowRight className="h-3 w-3 mr-1" />
            Go to Review Tab
          </Button>
          <Button
            onClick={onCheckWebSocket}
            variant="outline"
            size="sm"
          >
            <Activity className="h-3 w-3 mr-1" />
            Check WebSocket
          </Button>
        </div>
 
        {/* Real-time State Display */}
        <div className="grid grid-cols-2 gap-2 text-xs text-yellow-800 bg-yellow-100 p-3 rounded">
          <div>
            <strong>Pre-check Summary:</strong>{' '}
            <span className={preCheckSummary ? "text-green-700 font-semibold" : "text-red-700"}>
              {preCheckSummary ? "✅ SET" : "❌ NULL"}
            </span>
          </div>
          <div>
            <strong>WebSocket:</strong>{' '}
            <span className={isConnected ? "text-green-700 font-semibold" : "text-red-700"}>
              {isConnected ? "✅ Connected" : "❌ Disconnected"}
            </span>
          </div>
          <div>
            <strong>Current Tab:</strong> {activeTab}
          </div>
          <div>
            <strong>Current Phase:</strong> {currentPhase}
          </div>
          <div>
            <strong>Job Status:</strong> {jobStatus}
          </div>
          <div>
            <strong>Can Proceed:</strong>{' '}
            <span className={canProceedWithUpgrade ? "text-green-700" : "text-gray-600"}>
              {canProceedWithUpgrade ? "✅ Yes" : "⏸️ No"}
            </span>
          </div>
          <div>
            <strong>Job ID:</strong>{' '}
            <span className="font-mono text-xs">
              {jobId ? jobId.substring(0, 8) + '...' : 'None'}
            </span>
          </div>
          <div>
            <strong>Channel:</strong>{' '}
            <span className="font-mono text-xs">
              {wsChannel ? wsChannel.substring(0, 12) + '...' : 'None'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}