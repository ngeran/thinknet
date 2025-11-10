/**
 * =============================================================================
 * PRE-CHECK SELECTOR COMPONENT (REUSABLE)
 * =============================================================================
 *
 * Reusable checkbox group for selecting pre-upgrade validation checks.
 * Fetches available checks from backend and manages selection state.
 *
 * LOCATION: /src/shared/PreCheckSelector.jsx
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-10
 * VERSION: 1.0.0
 *
 * FEATURES:
 * - Dynamic check loading from backend API
 * - Grouped by category with visual organization
 * - Required checks are pre-selected and disabled
 * - Tooltips for user guidance
 * - Loading and error states
 * - Fully reusable across forms
 *
 * =============================================================================
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  AlertTriangle,
  Info,
  Lock,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';

// =============================================================================
// SECTION 1: MAIN COMPONENT
// =============================================================================

/**
 * PreCheckSelector Component
 *
 * @param {Object} props
 * @param {Array<string>} props.selectedChecks - Array of selected check IDs
 * @param {Function} props.onChange - Callback when selection changes (checkIds: string[])
 * @param {boolean} props.disabled - Disable all checkboxes
 * @param {string} props.className - Additional CSS classes
 */
export default function PreCheckSelector({
  selectedChecks = [],
  onChange,
  disabled = false,
  className = '',
}) {

  // ===========================================================================
  // SUBSECTION 1.1: STATE MANAGEMENT
  // ===========================================================================

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(null);
  const [groupedChecks, setGroupedChecks] = useState({});

  // ===========================================================================
  // SUBSECTION 1.2: FETCH CONFIGURATION
  // ===========================================================================

  useEffect(() => {
    fetchPreCheckConfig();
  }, []);

  /**
   * Fetch pre-check configuration from backend
   */
  const fetchPreCheckConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/pre-checks/config', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load pre-check configuration: ${response.status}`);
      }

      const data = await response.json();
      setConfig(data);

      // Group checks by category
      const grouped = groupChecksByCategory(data.checks, data.categories);
      setGroupedChecks(grouped);

      // Initialize selection with required checks and defaults
      const initialSelection = data.checks
        .filter(check => check.required || check.enabled_by_default)
        .map(check => check.id);

      if (onChange && selectedChecks.length === 0) {
        onChange(initialSelection);
      }

    } catch (err) {
      console.error('[PRE_CHECK_SELECTOR] Failed to fetch config:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Group checks by category for organized display
   */
  const groupChecksByCategory = (checks, categories) => {
    const grouped = {};

    // Sort categories by order
    const sortedCategories = Object.entries(categories || {})
      .sort(([, a], [, b]) => a.order - b.order);

    sortedCategories.forEach(([categoryId, categoryInfo]) => {
      grouped[categoryId] = {
        ...categoryInfo,
        checks: checks.filter(check => check.category === categoryId),
      };
    });

    return grouped;
  };

  // ===========================================================================
  // SUBSECTION 1.3: SELECTION HANDLERS
  // ===========================================================================

  /**
   * Handle check selection toggle
   */
  const handleCheckToggle = (checkId, isRequired) => {
    if (disabled || isRequired) return;

    const newSelection = selectedChecks.includes(checkId)
      ? selectedChecks.filter(id => id !== checkId)
      : [...selectedChecks, checkId];

    onChange(newSelection);
  };

  /**
   * Select all available checks
   */
  const handleSelectAll = () => {
    if (disabled) return;

    const allCheckIds = config.checks
      .filter(check => check.available)
      .map(check => check.id);

    onChange(allCheckIds);
  };

  /**
   * Select only required checks
   */
  const handleSelectRequired = () => {
    if (disabled) return;

    const requiredCheckIds = config.checks
      .filter(check => check.required)
      .map(check => check.id);

    onChange(requiredCheckIds);
  };

  // ===========================================================================
  // SUBSECTION 1.4: HELPER FUNCTIONS
  // ===========================================================================

  /**
   * Get severity badge styling
   */
  const getSeverityBadge = (severity) => {
    const styles = {
      critical: { variant: 'destructive', icon: XCircle },
      warning: { variant: 'outline', icon: AlertTriangle, className: 'border-yellow-500 text-yellow-700' },
      pass: { variant: 'outline', icon: CheckCircle2, className: 'border-green-500 text-green-700' },
    };

    const style = styles[severity] || styles.pass;
    const Icon = style.icon;

    return (
      <Badge variant={style.variant} className={`text-xs ${style.className || ''}`}>
        <Icon className="h-3 w-3 mr-1" />
        {severity.toUpperCase()}
      </Badge>
    );
  };

  /**
   * Calculate total estimated duration
   */
  const getTotalDuration = () => {
    if (!config) return 0;

    return config.checks
      .filter(check => selectedChecks.includes(check.id))
      .reduce((total, check) => total + check.estimated_duration_seconds, 0);
  };

  // =============================================================================
  // SECTION 2: RENDER STATES
  // =============================================================================

  // ===========================================================================
  // SUBSECTION 2.1: LOADING STATE
  // ===========================================================================

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Pre-Check Options...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ===========================================================================
  // SUBSECTION 2.2: ERROR STATE
  // ===========================================================================

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // ===========================================================================
  // SUBSECTION 2.3: MAIN RENDER
  // ===========================================================================

  const totalDuration = getTotalDuration();
  const selectedCount = selectedChecks.length;
  const totalCount = config?.checks.filter(c => c.available).length || 0;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              Pre-Check Validation Selection
            </CardTitle>
            <CardDescription>
              Choose which validation checks to run before upgrade
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">
              {selectedCount} / {totalCount} selected
            </div>
            {totalDuration > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                ~{totalDuration}s estimated
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSelectAll}
            disabled={disabled}
            className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
          >
            Select All
          </button>
          <span className="text-xs text-muted-foreground">•</span>
          <button
            onClick={handleSelectRequired}
            disabled={disabled}
            className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
          >
            Required Only
          </button>
        </div>
      </CardHeader>

      <CardContent>
        <TooltipProvider>
          <div className="space-y-6">

            {/* ============================================================
                CATEGORY GROUPS
                ============================================================ */}
            {Object.entries(groupedChecks).map(([categoryId, category]) => {
              if (category.checks.length === 0) return null;

              return (
                <div key={categoryId} className="space-y-3">
                  {/* Category Header */}
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <h4 className="font-semibold text-sm text-muted-foreground">
                      {category.display_name}
                    </h4>
                    <Badge variant="outline" className="text-xs">
                      {category.checks.length}
                    </Badge>
                  </div>

                  {/* Category Checks */}
                  <div className="space-y-2">
                    {category.checks.map(check => {
                      const isSelected = selectedChecks.includes(check.id);
                      const isDisabled = disabled || check.required || !check.available;

                      return (
                        <div
                          key={check.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-gray-50 border-gray-200'
                          } ${isDisabled ? 'opacity-60' : 'hover:border-blue-300'}`}
                        >
                          {/* Checkbox */}
                          <div className="flex items-center h-5 mt-0.5">
                            <Checkbox
                              id={check.id}
                              checked={isSelected}
                              onCheckedChange={() => handleCheckToggle(check.id, check.required)}
                              disabled={isDisabled}
                            />
                          </div>

                          {/* Check Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <label
                                htmlFor={check.id}
                                className={`text-sm font-medium cursor-pointer ${
                                  isDisabled ? 'cursor-not-allowed' : ''
                                }`}
                              >
                                {check.name}
                              </label>

                              {check.required && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Lock className="h-3 w-3 text-orange-600" />
                                  </TooltipTrigger>
                                  <TooltipContent>Required check - cannot be disabled</TooltipContent>
                                </Tooltip>
                              )}

                              {!check.available && (
                                <Badge variant="outline" className="text-xs">
                                  Coming Soon
                                </Badge>
                              )}
                            </div>

                            <p className="text-xs text-muted-foreground mb-2">
                              {check.description}
                            </p>

                            <div className="flex items-center gap-2 flex-wrap">
                              {getSeverityBadge(check.severity)}

                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                ~{check.estimated_duration_seconds}s
                              </span>

                              {check.tooltip && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Info className="h-3 w-3 text-blue-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-xs">{check.tooltip}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* ============================================================
                SUMMARY INFO
                ============================================================ */}
            {selectedCount > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>{selectedCount} validation check{selectedCount !== 1 ? 's' : ''}</strong> will be performed.
                  Estimated duration: <strong>~{totalDuration} seconds</strong>
                </AlertDescription>
              </Alert>
            )}

          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
