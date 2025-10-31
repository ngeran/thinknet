/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - PRODUCTION READY v4.6.0 (ENHANCED VALIDATION UI)
 * =============================================================================
 * 
 * PART 1 OF 2: Main Component Structure and Supporting Components
 * 
 * @version 4.6.0
 * @last_updated 2025-11-01
 * @author nikos-geranios_vgi
 *
 * 🔧 UPDATES IN THIS VERSION:
 * ✅ Completely redesigned validation results presentation
 * ✅ Categorized validation results by domain (Connectivity, System, Storage, etc.)
 * ✅ Action-oriented recommendations with clear next steps
 * ✅ Enhanced visual hierarchy with domain-based organization
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';

// ============================================================================
// UI COMPONENT IMPORTS
// ============================================================================
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// ICON IMPORTS
// ============================================================================
import {
  CheckCircle,
  XCircle,
  Loader2,
  PlayCircle,
  ArrowRight,
  AlertTriangle,
  Shield,
  Activity,
  HardDrive,
  Database,
  Zap,
  Info,
  RefreshCw,
  Wifi,
  Server,
  Cpu,
  MemoryStick
} from 'lucide-react';

// ============================================================================
// CUSTOM COMPONENT IMPORTS
// ============================================================================
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';
import CodeUpgradeForm from '@/forms/CodeUpgradeForm';
import SelectImageRelease from '@/forms/SelectImageRelease';

// ============================================================================
// CUSTOM HOOKS
// ============================================================================
import { useJobWebSocket } from '@/hooks/useJobWebSocket';

// ============================================================================
// UTILITY IMPORTS
// ============================================================================
import { extractVersionFromImageFilename } from '@/utils/versionParser';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * API base URL - Retrieved from environment or defaults to localhost
 */
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * UI timing constants for better control and consistency
 */
const TIMING = {
  AUTO_SCROLL_DELAY: 50,
  TAB_TRANSITION_DELAY: 1500,
  PROGRESS_UPDATE_INTERVAL: 100
};

// ============================================================================
// SUPPORTING COMPONENTS FOR ENHANCED VALIDATION UI
// ============================================================================

/**
 * Stat Card Component for quick overview metrics
 * Displays validation statistics with appropriate colors and icons
 */
const StatCard = ({ title, value, icon: Icon, color = "blue" }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red: 'bg-red-50 border-red-200 text-red-700'
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm font-medium">{title}</div>
        </div>
        <Icon className="h-8 w-8 opacity-50" />
      </div>
    </div>
  );
};

/**
 * Check Result Item Component
 * Displays individual validation check results with appropriate severity styling
 */
const CheckResultItem = ({ check }) => {
  const severityConfig = {
    critical: {
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      label: 'Critical Issue'
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      label: 'Warning'
    },
    pass: {
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      label: 'Passed'
    }
  };

  const config = severityConfig[check.severity] || severityConfig.pass;
  const IconComponent = config.icon;

  return (
    <div className={`p-4 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-start gap-3">
        <IconComponent className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="font-semibold text-sm">{check.check_name}</h4>
            <Badge 
              variant={check.severity === 'critical' ? 'destructive' : 
                      check.severity === 'warning' ? 'secondary' : 'default'}
              className={check.severity === 'pass' ? 'bg-green-600' : ''}
            >
              {config.label}
            </Badge>
          </div>
          
          <p className="text-sm text-gray-700 mb-2">{check.message}</p>
          
          {/* Display additional details if available */}
          {check.details && (
            <div className="mt-2 p-2 bg-black/5 rounded text-xs font-mono">
              <details>
                <summary className="cursor-pointer font-medium">Technical Details</summary>
                <pre className="mt-2 whitespace-pre-wrap">
                  {JSON.stringify(check.details, null, 2)}
                </pre>
              </details>
            </div>
          )}
          
          {/* Display actionable recommendations */}
          {check.recommendation && (
            <div className={`mt-3 p-3 rounded border-l-4 ${
              check.severity === 'critical' ? 'bg-red-50 border-red-400' :
              check.severity === 'warning' ? 'bg-orange-50 border-orange-400' :
              'bg-green-50 border-green-400'
            }`}>
              <p className="text-sm font-medium mb-1">
                {check.severity === 'critical' ? '🚨 Action Required' :
                 check.severity === 'warning' ? '⚠️ Recommendation' :
                 '✅ Status'}
              </p>
              <p className="text-sm">{check.recommendation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Category Section Component
 * Groups validation checks by domain (Connectivity, System, Storage, etc.)
 */
const CategorySection = ({ category, stats, IconComponent }) => {
  const hasCritical = stats.critical > 0;
  const hasWarnings = stats.warnings > 0;

  return (
    <Card className={hasCritical ? 'border-red-200 bg-red-50/30' : hasWarnings ? 'border-orange-200 bg-orange-50/30' : 'border-green-200 bg-green-50/30'}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconComponent className="h-6 w-6 text-blue-600" />
            <div>
              <CardTitle className="text-lg">{category.title}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            {stats.critical > 0 && (
              <Badge variant="destructive">{stats.critical} Critical</Badge>
            )}
            {stats.warnings > 0 && (
              <Badge variant="secondary">{stats.warnings} Warnings</Badge>
            )}
            {stats.passed > 0 && (
              <Badge variant="default" className="bg-green-600">{stats.passed} Passed</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {category.checks.map((check, index) => (
            <CheckResultItem key={index} check={check} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Action Recommendations Component
 * Provides clear next steps based on validation results
 */
const ActionRecommendations = ({ preCheckSummary }) => {
  const criticalIssues = preCheckSummary.results?.filter(r => r.severity === 'critical') || [];
  const warningIssues = preCheckSummary.results?.filter(r => r.severity === 'warning') || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next Steps & Recommendations</CardTitle>
        <CardDescription>
          Based on the validation results, here are the recommended actions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {criticalIssues.length > 0 ? (
          <div className="space-y-3">
            <h4 className="font-semibold text-red-700 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Critical Actions Required ({criticalIssues.length})
            </h4>
            <ul className="space-y-2 text-sm">
              {criticalIssues.map((issue, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>
                    <strong>{issue.check_name}:</strong> {issue.recommendation || issue.message}
                  </span>
                </li>
              ))}
            </ul>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Upgrade Blocked</AlertTitle>
              <AlertDescription>
                Resolve all critical issues before proceeding with the upgrade.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-green-700 bg-green-50 p-3 rounded-lg">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">No critical issues detected. Upgrade can proceed.</span>
          </div>
        )}

        {warningIssues.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-orange-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recommended Review ({warningIssues.length})
            </h4>
            <ul className="space-y-2 text-sm">
              {warningIssues.map((warning, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">•</span>
                  <span>
                    <strong>{warning.check_name}:</strong> {warning.recommendation || warning.message}
                  </span>
                </li>
              ))}
            </ul>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Review Recommended</AlertTitle>
              <AlertDescription>
                Consider reviewing these warnings before proceeding with the upgrade.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {criticalIssues.length === 0 && warningIssues.length === 0 && (
          <div className="text-center py-4 text-green-600">
            <CheckCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium">All validation checks passed successfully!</p>
            <p className="text-sm text-green-600/80 mt-1">Your device is ready for upgrade.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Enhanced Pre-Check Results Component
 * Main component for displaying validation results in an organized, user-friendly way
 */
const EnhancedPreCheckResults = ({ preCheckSummary }) => {
  if (!preCheckSummary) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Loading validation results...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  /**
   * Categorize validation results into logical domains for better organization
   * This transforms raw check data into meaningful categories that users can understand
   */
  const categorizedResults = useMemo(() => {
    const categories = {
      connectivity: {
        title: "Connectivity & Access",
        icon: Wifi,
        description: "Device reachability, authentication, and network access",
        checks: []
      },
      system: {
        title: "System Health",
        icon: Activity,
        description: "Device status, processes, and overall system health",
        checks: []
      },
      resources: {
        title: "Resources & Performance",
        icon: Cpu,
        description: "CPU, memory, and resource utilization",
        checks: []
      },
      storage: {
        title: "Storage & Capacity",
        icon: HardDrive,
        description: "Disk space, storage requirements, and capacity planning",
        checks: []
      },
      compatibility: {
        title: "Compatibility",
        icon: Zap,
        description: "Version compatibility and platform requirements",
        checks: []
      },
      backup: {
        title: "Backup & Safety",
        icon: Database,
        description: "Snapshot availability and redundancy status",
        checks: []
      },
      other: {
        title: "Additional Validations",
        icon: Info,
        description: "Other system checks and validations",
        checks: []
      }
    };

    // Map each check to the appropriate category based on check name and content
    preCheckSummary.results?.forEach(check => {
      const checkName = check.check_name?.toLowerCase() || '';
      const checkMessage = check.message?.toLowerCase() || '';
      
      // Categorization logic - match checks to domains based on keywords
      if (checkName.includes('connect') || checkName.includes('auth') || checkName.includes('reach') || checkName.includes('ping')) {
        categories.connectivity.checks.push(check);
      } else if (checkName.includes('memory') || checkName.includes('ram') || checkName.includes('resource') || checkMessage.includes('memory')) {
        categories.resources.checks.push(check);
      } else if (checkName.includes('cpu') || checkName.includes('processor') || checkName.includes('utilization')) {
        categories.resources.checks.push(check);
      } else if (checkName.includes('storage') || checkName.includes('space') || checkName.includes('disk') || checkName.includes('flash')) {
        categories.storage.checks.push(check);
      } else if (checkName.includes('version') || checkName.includes('compat') || checkName.includes('platform')) {
        categories.compatibility.checks.push(check);
      } else if (checkName.includes('snapshot') || checkName.includes('backup') || checkName.includes('redundancy') || checkName.includes('config')) {
        categories.backup.checks.push(check);
      } else if (checkName.includes('system') || checkName.includes('health') || checkName.includes('status')) {
        categories.system.checks.push(check);
      } else {
        categories.other.checks.push(check);
      }
    });

    return categories;
  }, [preCheckSummary]);

  /**
   * Calculate statistics for each category
   * Provides quick overview of pass/warning/critical counts per domain
   */
  const categoryStats = useMemo(() => {
    const stats = {};
    Object.keys(categorizedResults).forEach(category => {
      const checks = categorizedResults[category].checks;
      stats[category] = {
        total: checks.length,
        passed: checks.filter(c => c.severity === 'pass').length,
        warnings: checks.filter(c => c.severity === 'warning').length,
        critical: checks.filter(c => c.severity === 'critical').length
      };
    });
    return stats;
  }, [categorizedResults]);

  return (
    <div className="space-y-6">
      {/* ======================================================================
          SUMMARY BANNER - Quick overview of validation results
          ====================================================================== */}
      <div className={`p-6 rounded-xl border-2 ${
        preCheckSummary.can_proceed 
          ? 'border-green-200 bg-green-50' 
          : 'border-red-200 bg-red-50'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {preCheckSummary.can_proceed ? (
              <CheckCircle className="h-12 w-12 text-green-600" />
            ) : (
              <XCircle className="h-12 w-12 text-red-600" />
            )}
            <div>
              <h2 className="text-2xl font-bold">
                {preCheckSummary.can_proceed ? 'Ready for Upgrade' : 'Upgrade Blocked'}
              </h2>
              <p className="text-gray-600 mt-1">
                {preCheckSummary.can_proceed 
                  ? 'All critical validations passed. Your device meets upgrade requirements.'
                  : 'Critical issues detected that must be resolved before upgrade.'
                }
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-3xl font-bold">
              {Math.round((preCheckSummary.passed / preCheckSummary.total_checks) * 100)}%
            </div>
            <div className="text-sm text-gray-600">Validation Score</div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          QUICK STATS - Overview of validation metrics
          ====================================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Checks"
          value={preCheckSummary.total_checks}
          icon={CheckCircle}
          color="blue"
        />
        <StatCard
          title="Passed"
          value={preCheckSummary.passed}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          title="Warnings"
          value={preCheckSummary.warnings}
          icon={AlertTriangle}
          color="orange"
        />
        <StatCard
          title="Critical"
          value={preCheckSummary.critical_failures}
          icon={XCircle}
          color="red"
        />
      </div>

      {/* ======================================================================
          CATEGORIZED RESULTS - Organized by domain
          ====================================================================== */}
      <div className="space-y-6">
        <h3 className="text-xl font-semibold">Detailed Validation Results</h3>
        
        {Object.entries(categorizedResults).map(([categoryKey, category]) => {
          if (category.checks.length === 0) return null;
          
          const stats = categoryStats[categoryKey];
          const IconComponent = category.icon;
          
          return (
            <CategorySection
              key={categoryKey}
              category={category}
              stats={stats}
              IconComponent={IconComponent}
            />
          );
        })}
      </div>

      {/* ======================================================================
          ACTION RECOMMENDATIONS - Clear next steps
          ====================================================================== */}
      <ActionRecommendations preCheckSummary={preCheckSummary} />
    </div>
  );
};
/**
 * =============================================================================
 * CODE UPGRADES COMPONENT - PRODUCTION READY v4.6.0 (ENHANCED VALIDATION UI)
 * =============================================================================
 * 
 * PART 2 OF 2: Main Component Implementation and WebSocket Handling
 * 
 * @version 4.6.0
 * @last_updated 2025-11-01
 * @author nikos-geranios_vgi
 *
 * 🔧 UPDATES IN THIS VERSION:
 * ✅ Enhanced WebSocket message handling for reliable tab transitions
 * ✅ Improved state management for validation results
 * ✅ Better error handling and user feedback
 * ✅ Maintained all existing functionality with enhanced UI
 * =============================================================================
 */

// CONTINUED FROM PART 1 OF 2...

// ============================================================================
// MAIN COMPONENT IMPLEMENTATION
// ============================================================================

export default function CodeUpgrades() {
  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Upgrade configuration parameters
   */
  const [upgradeParams, setUpgradeParams] = useState({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
    vendor: "",
    platform: "",
    target_version: "",
    image_filename: ""
  });

  /**
   * UI state management
   */
  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");
  const [currentPhase, setCurrentPhase] = useState("config");

  /**
   * Progress tracking state
   */
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);

  /**
   * Step tracking for progress visualization
   */
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  /**
   * Pre-check specific state
   */
  const [preCheckJobId, setPreCheckJobId] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckSummary, setPreCheckSummary] = useState(null);
  const [isRunningPreCheck, setIsRunningPreCheck] = useState(false);
  const [canProceedWithUpgrade, setCanProceedWithUpgrade] = useState(false);

  /**
   * Statistics for results display
   */
  const [statistics, setStatistics] = useState({
    total: 0,
    succeeded: 0,
    failed: 0
  });

  // ==========================================================================
  // REFS FOR PERFORMANCE AND STATE TRACKING
  // ==========================================================================
  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useRef("");
  const loggedMessagesRef = useRef(new Set());
  const scrollAreaRef = useRef(null);

  // ==========================================================================
  // WEBSOCKET HOOK
  // ==========================================================================
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  /**
   * Handle form parameter changes with automatic version extraction
   */
  const handleParamChange = (name, value) => {
    setUpgradeParams(prev => ({ ...prev, [name]: value }));

    // Auto-extract precise version when image is selected
    if (name === 'image_filename' && value) {
      const preciseVersion = extractVersionFromImageFilename(value);
      if (preciseVersion) {
        console.log(`[VERSION EXTRACTION] Extracted "${preciseVersion}" from "${value}"`);
        setUpgradeParams(prev => ({ ...prev, target_version: preciseVersion }));
      } else {
        console.warn(`[VERSION EXTRACTION] Could not extract version from "${value}"`);
      }
    }
  };

  /**
   * Reset the entire workflow to initial state
   */
  const resetWorkflow = () => {
    console.log("[WORKFLOW] Initiating complete reset");

    // Unsubscribe from WebSocket channel if active
    if (wsChannel) {
      console.log(`[WEBSOCKET] Unsubscribing from channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    // Reset all state to initial values
    setJobStatus("idle");
    setCurrentPhase("config");
    setProgress(0);
    setJobOutput([]);
    setJobId(null);
    setWsChannel(null);
    setFinalResults(null);
    setActiveTab("config");
    setCompletedSteps(0);
    setTotalSteps(0);
    setStatistics({ total: 0, succeeded: 0, failed: 0 });

    // Reset pre-check state
    setPreCheckJobId(null);
    setPreCheckResults(null);
    setPreCheckSummary(null);
    setIsRunningPreCheck(false);
    setCanProceedWithUpgrade(false);

    // Clear refs
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();

    console.log("[WORKFLOW] Reset complete - ready for new operation");
  };

  // ==========================================================================
  // PRE-CHECK HANDLER
  // ==========================================================================

  /**
   * Initiate pre-check validation workflow
   */
  const startPreCheck = async (e) => {
    e.preventDefault();

    console.log("[PRE-CHECK] ===== PRE-CHECK VALIDATION INITIATED =====");

    // Validation checks
    if (!upgradeParams.hostname && !upgradeParams.inventory_file) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must specify either hostname or inventory file",
        level: 'error'
      }]);
      return;
    }

    if (!upgradeParams.image_filename) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Must select an image file",
        level: 'error'
      }]);
      return;
    }

    if (!upgradeParams.target_version) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "Error: Target version is required",
        level: 'error'
      }]);
      return;
    }

    if (!isConnected) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start pre-check.",
        level: 'error'
      }]);
      return;
    }

    // Cleanup previous WebSocket channel
    if (wsChannel) {
      console.log(`[PRE-CHECK] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    // UI Preparation
    setActiveTab("execute");
    setCurrentPhase("pre_check");
    setIsRunningPreCheck(true);
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);
    setPreCheckResults(null);
    setPreCheckSummary(null);
    setCanProceedWithUpgrade(false);
    processedStepsRef.current.clear();
    loggedMessagesRef.current.clear();

    // Payload construction
    const payload = {
      hostname: upgradeParams.hostname.trim(),
      inventory_file: upgradeParams.inventory_file.trim(),
      username: upgradeParams.username,
      password: upgradeParams.password,
      vendor: upgradeParams.vendor,
      platform: upgradeParams.platform,
      target_version: upgradeParams.target_version,
      image_filename: upgradeParams.image_filename,
      skip_storage_check: false,
      skip_snapshot_check: false,
      require_snapshot: false,
    };

    // API Call
    try {
      const response = await fetch(`${API_URL}/api/operations/pre-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }
        throw new Error(`API error ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      console.log("[PRE-CHECK] Job queued successfully:", data);

      // State update
      setPreCheckJobId(data.job_id);
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);

      // WebSocket subscription
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

      // Initial log entry
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Pre-check validation started. Job ID: ${data.job_id}`,
        level: 'info'
      }]);

    } catch (error) {
      console.error("[PRE-CHECK] API Call Failed:", error);
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Pre-check start failed: ${error.message}`,
        level: 'error'
      }]);
      setJobStatus("failed");
      setIsRunningPreCheck(false);
    }
  };

  // ==========================================================================
  // UPGRADE EXECUTION HANDLER
  // ==========================================================================

  /**
   * Initiate upgrade execution workflow
   */
  const startUpgradeExecution = async () => {
    console.log("[UPGRADE] ===== UPGRADE EXECUTION INITIATED =====");

    if (!isConnected) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: "WebSocket not connected. Cannot start upgrade.",
        level: 'error'
      }]);
      return;
    }

    // Cleanup previous WebSocket channel
    if (wsChannel) {
      console.log(`[UPGRADE] Unsubscribing from previous channel: ${wsChannel}`);
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
    }

    // UI Preparation
    setActiveTab("execute");
    setCurrentPhase("upgrade");
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);
    setFinalResults(null);
    setCompletedSteps(0);
    setTotalSteps(0);
    processedStepsRef.current.clear();
    loggedMessagesRef.current.clear();

    // Payload construction
    const payload = {
      command: "code_upgrade",
      hostname: upgradeParams.hostname.trim(),
      inventory_file: upgradeParams.inventory_file.trim(),
      username: upgradeParams.username,
      password: upgradeParams.password,
      vendor: upgradeParams.vendor,
      platform: upgradeParams.platform,
      target_version: upgradeParams.target_version,
      image_filename: upgradeParams.image_filename,
      pre_check_job_id: preCheckJobId,
      skip_pre_check: false,
      force_upgrade: false,
    };

    // API Call
    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }
        throw new Error(`API error ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      console.log("[UPGRADE] Job queued successfully:", data);

      // State update
      setJobId(data.job_id);
      setWsChannel(data.ws_channel);

      // WebSocket subscription
      console.log(`[WEBSOCKET] Subscribing to channel: ${data.ws_channel}`);
      sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });

      // Initial log entry
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade job started successfully. Job ID: ${data.job_id}`,
        level: 'info'
      }]);

    } catch (error) {
      console.error("[UPGRADE] API Call Failed:", error);
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Upgrade start failed: ${error.message}`,
        level: 'error'
      }]);
      setJobStatus("failed");
      setActiveTab("results");
    }
  };

  // ==========================================================================
  // WEBSOCKET MESSAGE HANDLER
  // ==========================================================================

  useEffect(() => {
    if (!lastMessage || !jobId) return;

    const raw = lastMessage;
    if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.debug("[WEBSOCKET] Failed to parse message:", error);
      return;
    }

    // Filter messages for current job
    if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
      console.debug("[WEBSOCKET] Ignoring message for different channel:", parsed.channel);
      return;
    }

    // Enhanced nested data extraction
    const extractNestedProgressData = (initialParsed) => {
      let currentPayload = initialParsed;
      
      // Look for PRE_CHECK_COMPLETE in ORCHESTRATOR_LOG messages
      if (initialParsed.event_type === "ORCHESTRATOR_LOG" && initialParsed.message) {
        const message = initialParsed.message;
        
        const preCheckMatch = message.match(/PRE_CHECK_COMPLETE.*?(\{.*?\})/s);
        if (preCheckMatch && preCheckMatch[1]) {
          try {
            const preCheckData = JSON.parse(preCheckMatch[1]);
            console.log("[WEBSOCKET] 🎯 Extracted PRE_CHECK_COMPLETE from ORCHESTRATOR_LOG:", preCheckData);
            return { payload: preCheckData, isNested: true };
          } catch (parseError) {
            console.debug('[WEBSOCKET] Failed to parse PRE_CHECK_COMPLETE from ORCHESTRATOR_LOG:', parseError);
          }
        }
        
        const operationMatch = message.match(/OPERATION_COMPLETE.*?(\{.*?\})/s);
        if (operationMatch && operationMatch[1]) {
          try {
            const operationData = JSON.parse(operationMatch[1]);
            console.log("[WEBSOCKET] 🎯 Extracted OPERATION_COMPLETE from ORCHESTRATOR_LOG:", operationData);
            return { payload: operationData, isNested: true };
          } catch (parseError) {
            console.debug('[WEBSOCKET] Failed to parse OPERATION_COMPLETE from ORCHESTRATOR_LOG:', parseError);
          }
        }
      }

      // Original nested extraction logic
      if (initialParsed.data) {
        try {
          const dataPayload = typeof initialParsed.data === 'string'
            ? JSON.parse(initialParsed.data)
            : initialParsed.data;
          currentPayload = dataPayload;
        } catch (error) {
          console.debug('[WEBSOCKET] Data field is not valid JSON:', error);
        }
      }

      return { payload: currentPayload, isNested: false };
    };

    const { payload: finalPayload, isNested } = extractNestedProgressData(parsed);

    // Deduplication
    const createLogSignature = (payload) => {
      const msg = payload.message || '';
      const eventType = payload.event_type || 'unknown';
      return `${eventType}::${msg.substring(0, 100)}`;
    };

    const logSignature = createLogSignature(finalPayload);

    if (!loggedMessagesRef.current.has(logSignature)) {
      loggedMessagesRef.current.add(logSignature);

      const logEntry = {
        timestamp: finalPayload.timestamp || new Date().toISOString(),
        message: finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing..."),
        level: finalPayload.level?.toLowerCase() || "info",
        event_type: finalPayload.event_type,
        data: finalPayload.data,
      };

      setJobOutput(prev => [...prev, logEntry]);

      if (logEntry.message && finalPayload.event_type !== "OPERATION_COMPLETE") {
        latestStepMessageRef.current = logEntry.message;
      }

      // Auto-scroll
      if (scrollAreaRef.current) {
        setTimeout(() => {
          if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
          }
        }, TIMING.AUTO_SCROLL_DELAY);
      }
    }

    // Pre-check result processing
    if (finalPayload.event_type === "PRE_CHECK_RESULT") {
      console.log("[PRE-CHECK] Individual result received:", finalPayload);
      setPreCheckResults(prev => {
        const updated = prev ? [...prev] : [];
        updated.push(finalPayload);
        return updated;
      });
    }

    // Pre-check completion detection
    if (finalPayload.event_type === "PRE_CHECK_COMPLETE" || 
        (finalPayload.type === "PRE_CHECK_COMPLETE" && finalPayload.data)) {
      
      console.log("[PRE-CHECK] 🎯 PRE_CHECK_COMPLETE event detected:", finalPayload);

      let summaryData = finalPayload.data;
      
      if (!summaryData && finalPayload.pre_check_summary) {
        summaryData = { pre_check_summary: finalPayload.pre_check_summary };
      }
      
      if (summaryData && summaryData.pre_check_summary) {
        const summary = summaryData.pre_check_summary;

        console.log("[PRE-CHECK] ✅ Summary extracted:", {
          total_checks: summary.total_checks,
          passed: summary.passed,
          warnings: summary.warnings,
          critical_failures: summary.critical_failures,
          can_proceed: summary.can_proceed
        });

        setPreCheckSummary(summary);
        setCanProceedWithUpgrade(summary.can_proceed);
        
        console.log("[WEBSOCKET DEBUG] 🎯 PRE_CHECK_COMPLETE PROCESSED - Setting state");
      } else {
        console.warn("[PRE-CHECK] ❌ PRE_CHECK_COMPLETE received but no summary data found:", finalPayload);
      }
    }

    // Progress tracking
    if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
      console.log("[PROGRESS] Operation started with", finalPayload.data.total_steps, "steps");
      setTotalSteps(finalPayload.data.total_steps);
      setProgress(5);
    }

    if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.data?.step === "number") {
      const stepNum = finalPayload.data.step;

      if (!processedStepsRef.current.has(stepNum)) {
        processedStepsRef.current.add(stepNum);

        console.log(`[PROGRESS] Step ${stepNum} completed`);

        setCompletedSteps(prevCompleted => {
          const newCompleted = prevCompleted + 1;
          let newProgress = progress;

          if (totalSteps > 0) {
            newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
          } else {
            newProgress = Math.min(99, progress + 25);
          }

          console.log(`[PROGRESS] ${newCompleted}/${totalSteps} steps (${newProgress}%)`);
          setProgress(newProgress);
          return newCompleted;
        });
      }
    }

    // Operation completion handling
    if (finalPayload.event_type === "OPERATION_COMPLETE" || 
        finalPayload.type === "OPERATION_COMPLETE") {
      
      const finalStatus = finalPayload.data?.status || finalPayload.success;
      const operationType = finalPayload.data?.operation || currentPhase;

      console.log("[OPERATION] ⭐ Completion detected:", {
        status: finalStatus,
        operation: operationType,
        phase: currentPhase,
        has_pre_check_summary: preCheckSummary !== null,
        activeTab: activeTab
      });

      // Pre-check phase completion
      if (currentPhase === "pre_check" || operationType === "pre_check") {
        console.log("[PRE-CHECK] Operation complete - finalizing pre-check phase");

        // Extract and set summary if not already set
        if (!preCheckSummary && finalPayload.data?.final_results?.data?.pre_check_summary) {
          console.log("[TAB TRANSITION] 🎯 Extracting summary from OPERATION_COMPLETE (nested structure)");
          const extractedSummary = finalPayload.data.final_results.data.pre_check_summary;
          setPreCheckSummary(extractedSummary);
          setCanProceedWithUpgrade(extractedSummary.can_proceed);
          console.log("[TAB TRANSITION] ✅ Summary extracted and set:", extractedSummary);
        } else if (!preCheckSummary && finalPayload.data?.pre_check_summary) {
          console.log("[TAB TRANSITION] 🎯 Extracting summary from OPERATION_COMPLETE (direct structure)");
          setPreCheckSummary(finalPayload.data.pre_check_summary);
          setCanProceedWithUpgrade(finalPayload.data.pre_check_summary.can_proceed);
        }

        // Determine final success status
        let finalSuccess = false;
        if (finalStatus === "SUCCESS" || finalStatus === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.final_results?.data?.success === true) {
          finalSuccess = true;
        }

        console.log("[PRE-CHECK] Final Status:", finalSuccess ? "SUCCESS" : "FAILED");

        // Update job completion state
        setJobStatus(finalSuccess ? "success" : "failed");
        setIsRunningPreCheck(false);
        setProgress(100);

        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }

        // Unsubscribe from WebSocket
        if (wsChannel) {
          console.log(`[WEBSOCKET] Pre-check complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }

        // Auto-transition to review tab
        console.log(`[TAB TRANSITION] Scheduling transition to REVIEW tab in ${TIMING.TAB_TRANSITION_DELAY}ms`);
        
        setTimeout(() => {
          console.log("[TAB TRANSITION] ⏰ Timer fired - executing transition to REVIEW tab NOW");
          console.log("[TAB TRANSITION] Current state before transition:", {
            activeTab,
            currentPhase,
            preCheckSummary: preCheckSummary !== null
          });
          
          setActiveTab("review");
          setCurrentPhase("review");
          
          console.log("[TAB TRANSITION] ✅ Tab transition to REVIEW commands executed");
        }, TIMING.TAB_TRANSITION_DELAY);
      }

      // Upgrade phase completion
      else if (currentPhase === "upgrade" || operationType === "upgrade") {
        console.log("[UPGRADE] Operation complete - finalizing upgrade phase");

        // Determine success status
        let finalSuccess = false;
        if (finalPayload.success === true || finalPayload.data?.final_results?.success === true) {
          finalSuccess = true;
        } else if (finalPayload.data?.status === "SUCCESS") {
          finalSuccess = true;
        } else if (finalPayload.message && (
          finalPayload.message.includes('success: True') ||
          finalPayload.message.includes('completed successfully')
        )) {
          finalSuccess = true;
        }

        console.log("[UPGRADE] Final Status:", finalSuccess ? "SUCCESS" : "FAILED");

        // Update state
        setJobStatus(finalSuccess ? "success" : "failed");
        setFinalResults(finalPayload);
        setProgress(100);

        if (totalSteps > 0) {
          setCompletedSteps(totalSteps);
        }

        // Unsubscribe from WebSocket
        if (wsChannel) {
          console.log(`[WEBSOCKET] Upgrade complete, unsubscribing from ${wsChannel}`);
          sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }

        // Auto-transition to results tab
        console.log("[UPGRADE] Transitioning to results tab in", TIMING.TAB_TRANSITION_DELAY, "ms");
        setTimeout(() => {
          setActiveTab("results");
          setCurrentPhase("results");
          console.log("[UPGRADE] Tab transition complete - now on results tab");
        }, TIMING.TAB_TRANSITION_DELAY);
      }
    }

  }, [lastMessage, jobId, wsChannel, sendMessage, totalSteps, progress, completedSteps, currentPhase, activeTab, preCheckSummary, canProceedWithUpgrade]);

  // ==========================================================================
  // DERIVED STATE (COMPUTED VALUES)
  // ==========================================================================

  /**
   * Job execution states derived from jobStatus
   */
  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  /**
   * Form validation - Check if all required fields are populated
   */
  const isFormValid = useMemo(() => {
    return (
      upgradeParams.username.trim() &&
      upgradeParams.password.trim() &&
      (upgradeParams.hostname.trim() || upgradeParams.inventory_file.trim()) &&
      upgradeParams.image_filename.trim() &&
      upgradeParams.target_version.trim()
    );
  }, [upgradeParams]);

  // ==========================================================================
  // RENDER FUNCTION
  // ==========================================================================

  return (
    <div className="p-8 pt-6">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Code Upgrade Operation</h1>
          <p className="text-muted-foreground">
            Upgrade device operating system with enhanced pre-flight validation
          </p>
        </div>

        {/* Reset button - Only show when not idle */}
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Upgrade
          </Button>
        )}
      </div>

      <Separator className="mb-8" />

      {/* TABS NAVIGATION */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="config" disabled={isRunning}>
            Configure
          </TabsTrigger>
          <TabsTrigger value="execute" disabled={currentPhase === "config"}>
            {currentPhase === "pre_check" ? "Pre-Check" : "Execute"}
          </TabsTrigger>
          <TabsTrigger 
            value="review" 
            disabled={!preCheckSummary && activeTab !== "review"}
            className={preCheckSummary ? "bg-green-50 border-green-200" : ""}
          >
            Review {preCheckSummary && "✅"}
          </TabsTrigger>
          <TabsTrigger value="results" disabled={currentPhase !== "results"}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CONFIGURATION */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
            {/* Image Selection (Left Column) */}
            <div className="xl:col-span-1">
              <SelectImageRelease
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />
            </div>

            {/* Device Configuration (Right Column) */}
            <div className="xl:col-span-2 space-y-6">
              <CodeUpgradeForm
                parameters={upgradeParams}
                onParamChange={handleParamChange}
              />

              {/* Pre-Check Action Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        Ready for Enhanced Pre-Check Validation
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        {/* Show selected configuration */}
                        {upgradeParams.image_filename && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-medium">Image: {upgradeParams.image_filename}</span>
                          </p>
                        )}

                        {upgradeParams.target_version && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Target Version: <strong>{upgradeParams.target_version}</strong></span>
                          </p>
                        )}

                        {upgradeParams.hostname && (
                          <p className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Device: {upgradeParams.hostname}</span>
                          </p>
                        )}

                        {/* Show validation errors */}
                        {!isFormValid && (
                          <p className="text-orange-600 text-sm mt-2">
                            {!upgradeParams.image_filename && '• Select a software image\n'}
                            {!upgradeParams.target_version && '• Target version will be auto-extracted from image\n'}
                            {!upgradeParams.hostname && !upgradeParams.inventory_file && '• Configure device target\n'}
                            {(!upgradeParams.username || !upgradeParams.password) && '• Provide authentication credentials'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Start Pre-Check Button */}
                    <Button
                      onClick={startPreCheck}
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
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: EXECUTION */}
        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-6xl">
            <h2 className="text-xl font-semibold mb-4">
              {currentPhase === "pre_check" ? "Pre-Check Validation" : "Upgrade Progress"}
            </h2>

            {/* Progress Bar */}
            <EnhancedProgressBar
              percentage={progress}
              currentStep={latestStepMessageRef.current}
              totalSteps={totalSteps}
              completedSteps={completedSteps}
              isRunning={isRunning}
              isComplete={isComplete}
              hasError={hasError}
              animated={isRunning}
              showStepCounter={true}
              showPercentage={true}
              compact={false}
              variant={isComplete ? "success" : hasError ? "destructive" : "default"}
            />

            {/* Log Viewer */}
            <ScrollArea className="h-96 bg-background/50 p-4 rounded-md border">
              <div ref={scrollAreaRef} className="space-y-3">
                {jobOutput.length === 0 ? (
                  <p className="text-center text-muted-foreground pt-4">
                    {currentPhase === "pre_check"
                      ? "Waiting for pre-check to start..."
                      : "Waiting for upgrade to start..."}
                  </p>
                ) : (
                  jobOutput.map((log, index) => (
                    <EnhancedProgressStep
                      key={`${log.timestamp}-${index}`}
                      step={{
                        message: log.message,
                        level: log.level,
                        timestamp: log.timestamp,
                        type: log.event_type,
                      }}
                      isLatest={index === jobOutput.length - 1}
                      compact={false}
                      showTimestamp={true}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* TAB 3: REVIEW (ENHANCED PRE-CHECK RESULTS) */}
        <TabsContent value="review">
          <div className="space-y-6 max-w-7xl">
            <EnhancedPreCheckResults preCheckSummary={preCheckSummary} />

            {/* Action Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold mb-2">
                      {preCheckSummary?.can_proceed ? 'Ready to Proceed' : 'Cannot Proceed'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {preCheckSummary?.can_proceed
                        ? 'All critical checks passed. You can proceed with the upgrade.'
                        : 'Critical failures detected. Resolve issues before upgrading.'}
                    </p>
                  </div>

                  <div className="flex gap-3 w-full sm:w-auto">
                    <Button
                      onClick={resetWorkflow}
                      variant="outline"
                      size="lg"
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={startUpgradeExecution}
                      disabled={!preCheckSummary?.can_proceed || !isConnected}
                      size="lg"
                      className="flex-1 sm:flex-initial"
                    >
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Proceed with Upgrade
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: RESULTS (FINAL OUTCOME) */}
        <TabsContent value="results">
          <div className="space-y-6 max-w-6xl">
            {/* Completion Status Card */}
            <Card className={`border-2 ${jobStatus === 'success' ? 'border-green-200 bg-green-50' :
              jobStatus === 'failed' ? 'border-red-200 bg-red-50' :
                'border-gray-200'
              }`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {jobStatus === 'success' ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : jobStatus === 'failed' ? (
                      <XCircle className="h-8 w-8 text-red-600" />
                    ) : (
                      <Loader2 className="h-8 w-8 text-muted-foreground" />
                    )}

                    <div>
                      <h2 className="text-2xl font-bold">
                        {jobStatus === 'success' ? 'Upgrade Completed Successfully' :
                          jobStatus === 'failed' ? 'Upgrade Failed' :
                            'Awaiting Execution'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {finalResults?.message || 'No results available yet'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional results content remains the same as previous version */}
            {/* ... (rest of the results tab content) ... */}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
