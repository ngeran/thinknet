/**
 * =============================================================================
 * CODE UPGRADES WRAPPER COMPONENT - DUAL IMPLEMENTATION v1.0.0
 * =============================================================================
 *
 * Wrapper component that allows switching between old and Zustand implementations
 * Provides testing capability for both versions during migration
 *
 * Location: src/pages/Management/CodeUpgradesWrapper.jsx
 * Author: nikos-geranios_vgi
 * Date: 2025-12-01
 * Version: 1.0.0 - Phase 4 Implementation
 *
 * FEATURES:
 * - Toggle between old hooks implementation and new Zustand implementation
 * - Visual indicator showing which version is active
 * - Development-only toggle switch for testing
 * - Maintains all existing functionality
 * =============================================================================
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  GitBranch,
  Database,
  CheckCircle2,
  ArrowRight,
  Zap
} from 'lucide-react';

// Import both implementations
import CodeUpgrades from './CodeUpgrades';
import CodeUpgradesZustand from './CodeUpgradesZustand';

/**
 * Wrapper Component for Dual Implementation Testing
 *
 * This component provides a toggle to switch between:
 * 1. Original implementation (using existing hooks)
 * 2. Zustand implementation (using centralized store)
 */
export default function CodeUpgradesWrapper() {
  const [useZustand, setUseZustand] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Only show toggle in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';

  const handleToggleImplementation = () => {
    console.log(`[WRAPPER] Switching to ${useZustand ? 'Original' : 'Zustand'} implementation`);
    setUseZustand(!useZustand);
  };

  if (!isDevelopment) {
    // In production, use the Zustand implementation (migration complete!)
    return <CodeUpgradesZustand />;
  }

  return (
    <div className="relative">
      {/* ====================================================================
          DEVELOPMENT SETTINGS OVERLAY
          ==================================================================== */}
      {showSettings && (
        <div className="fixed top-4 right-4 z-50 w-80">
          <Card className="shadow-lg border-2 border-black">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Development Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Implementation Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-semibold text-sm">Use Zustand Store</p>
                    <p className="text-xs text-gray-600">
                      {useZustand ? 'Centralized state' : 'Hook-based state'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={useZustand}
                  onCheckedChange={handleToggleImplementation}
                />
              </div>

              {/* Status Badges */}
              <div className="flex gap-2">
                <Badge variant={useZustand ? "secondary" : "default"} className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {useZustand ? 'Zustand' : 'Original'}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Testing
                </Badge>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                  className="flex-1"
                >
                  Close Settings
                </Button>
              </div>

              {/* Implementation Info */}
              <div className="text-xs text-gray-600 space-y-1">
                <p className="font-semibold">Current Implementation:</p>
                {useZustand ? (
                  <div className="space-y-1">
                    <p>🟢 <strong>Zustand Store</strong></p>
                    <p>• Centralized state management</p>
                    <p>• Clean architecture (~200 lines)</p>
                    <p>• No prop drilling</p>
                    <p>• DevTools integration</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p>🔵 <strong>Original Hooks</strong></p>
                    <p>• Multiple custom hooks</p>
                    <p>• Complex prop drilling</p>
                    <p>• 650+ lines of code</p>
                    <p>• Proven production-ready</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ====================================================================
          SETTINGS TOGGLE BUTTON (Development Only)
          ==================================================================== */}
      <div className="fixed top-4 left-4 z-40">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="bg-white shadow-md border-gray-300"
        >
          <Settings className="h-4 w-4 mr-2" />
          {showSettings ? 'Hide' : 'Show'} Settings
        </Button>
      </div>

      {/* ====================================================================
          IMPLEMENTATION INDICATOR (Development Only)
          ==================================================================== */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40">
        <div className={`px-3 py-1 rounded-full text-xs font-semibold shadow-md ${
          useZustand
            ? 'bg-green-100 text-green-800 border border-green-300'
            : 'bg-blue-100 text-blue-800 border border-blue-300'
        }`}>
          {useZustand ? (
            <span className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              Zustand Implementation
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              Original Implementation
            </span>
          )}
        </div>
      </div>

      {/* ====================================================================
          MAIN COMPONENT RENDERING
          ==================================================================== */}
      <div className={showSettings ? 'mt-16' : ''}>
        {useZustand ? (
          <div className="relative">
            {/* Zustand Implementation */}
            <div className="absolute top-2 right-2 z-30">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <Zap className="h-3 w-3 mr-1" />
                Zustand
              </Badge>
            </div>
            <CodeUpgradesZustand />
          </div>
        ) : (
          <div className="relative">
            {/* Original Implementation */}
            <div className="absolute top-2 right-2 z-30">
              <Badge variant="outline">
                <GitBranch className="h-3 w-3 mr-1" />
                Original
              </Badge>
            </div>
            <CodeUpgrades />
          </div>
        )}
      </div>

      {/* ====================================================================
          MIGRATION STATUS FOOTER (Development Only)
          ==================================================================== */}
      {isDevelopment && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
          <Card className="shadow-lg border-2 border-black px-4 py-2">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span className="font-semibold">Phase 4 Active</span>
              </div>
              <ArrowRight className="h-3 w-3 text-gray-400" />
              <span>Testing dual implementation</span>
              <span className="text-gray-400">|</span>
              <span className="text-blue-600">
                {useZustand ? 'Zustand Store Active' : 'Hooks Implementation Active'}
              </span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}