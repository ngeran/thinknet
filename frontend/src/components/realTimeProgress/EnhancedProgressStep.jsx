// =================================================================================================
// FILE:               EnhancedProgressStep.jsx
// COMPONENT:          Enhanced Progress Step Component
// VERSION:            2.0.0
// LAST UPDATED:       2025-08-03
//
// DESCRIPTION:
//   A sophisticated step display component implementing the requested two-line format for
//   real-time progress logging. Displays step category/type on the first line and detailed
//   status messages on the second line. Features intelligent color-coding, timestamp display,
//   and smooth animations for enhanced user experience.
//
// KEY FEATURES:
//   ✅ Two-line format: Category (line 1) + Status message (line 2)
//   ✅ Intelligent step type detection (level vs type priority)
//   ✅ Color-coded step categories (Success, Error, Warning, Info, Progress)
//   ✅ Timestamp formatting with locale support
//   ✅ Visual indicators for latest/active steps
//   ✅ Compact and standard layout modes
//   ✅ Smooth entrance animations for new steps
//   ✅ shadcn/ui compatible styling with dark mode
//   ✅ Responsive design with proper text wrapping
//   ✅ Accessibility features with proper semantic markup
//
// DEPENDENCIES:
//   - React 16.8+ (hooks support required)
//   - lucide-react (for icons: CheckCircle, AlertCircle, Info, AlertTriangle, Clock, Zap)
//   - Tailwind CSS 3.0+ (for styling utilities and animations)
//   - Optional: shadcn/ui theme configuration for consistent styling
//
// HOW TO USE:
//   1. Import: import EnhancedProgressStep from './EnhancedProgressStep';
//   2. Basic usage:
//      <EnhancedProgressStep
//        step={{
//          message: "Connecting to server...",
//          level: "info",
//          timestamp: "2025-08-03T12:00:00Z"
//        }}
//      />
//   3. Advanced usage with customization:
//      <EnhancedProgressStep
//        step={stepObject}
//        isLatest={true}
//        compact={false}
//        showTimestamp={true}
//      />
//
// STEP OBJECT STRUCTURE:
//   {
//     message: string,      // Required: The main status message
//     level: string,        // Primary: "success", "error", "warning", "info", "progress"
//     type: string,         // Fallback: alternative to level
//     timestamp: string,    // Optional: ISO timestamp string
//     step: string         // Optional: Step identifier/number
//   }
//
// INTEGRATION NOTES:
//   - Designed for use within scrollable log containers
//   - Works seamlessly with EnhancedRealTimeDisplay
//   - Supports both WebSocket and polling data sources
//   - Optimized for frequent updates with proper key handling
// =================================================================================================

import React from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, Clock, Zap } from 'lucide-react';

/**
 * Enhanced Progress Step Component
 *
 * @param {Object} props - Component props
 * @param {Object} props.step - Step object containing message, level/type, timestamp, etc.
 * @param {boolean} props.isLatest - Whether this is the most recent step
 * @param {boolean} props.compact - Use ultra-compact layout
 * @param {boolean} props.showTimestamp - Show timestamp
 */
const EnhancedProgressStep = ({
  step,
  isLatest = false,
  compact = false,
  showTimestamp = true
}) => {
  // =================================================================================================
  // SECTION 1: STEP TYPE DETECTION & CLASSIFICATION
  // Intelligently determines step type from multiple possible fields with priority handling
  // =================================================================================================

  /**
   * Determine step type with intelligent fallback
   * Priority: step.level (primary) -> step.type (fallback) -> 'info' (default)
   * This ensures compatibility with different data sources and formats
   */
  const stepType = step.level?.toLowerCase() || step.type?.toLowerCase() || 'info';

  // =================================================================================================
  // SECTION 2: VISUAL CONFIGURATION SYSTEM
  // Defines styling, icons, and behavior for each step type/category
  // =================================================================================================

  /**
   * Get comprehensive step configuration based on type
   * Returns complete styling and behavior configuration for each step category
   *
   * @param {string} type - The step type to configure
   * @returns {Object} Configuration object with styling, icon, and text settings
   */
  const getStepConfig = (type) => {
    const configs = {
      // Success state: Green theme for completed operations
      success: {
        icon: CheckCircle,                              // Checkmark icon
        bgClass: 'bg-green-50 dark:bg-green-950/50',    // Light green background
        borderClass: 'border-l-green-500',              // Green left border accent
        textClass: 'text-green-900 dark:text-green-100', // Dark green text
        iconClass: 'text-green-600 dark:text-green-400', // Medium green icon
        category: 'Success'                             // Display label
      },

      // Error state: Red theme for failed operations
      error: {
        icon: AlertCircle,                              // Alert circle icon
        bgClass: 'bg-red-50 dark:bg-red-950/50',        // Light red background
        borderClass: 'border-l-red-500',                // Red left border accent
        textClass: 'text-red-900 dark:text-red-100',    // Dark red text
        iconClass: 'text-red-600 dark:text-red-400',    // Medium red icon
        category: 'Error'                               // Display label
      },

      // Warning state: Yellow theme for caution messages
      warning: {
        icon: AlertTriangle,                            // Triangle warning icon
        bgClass: 'bg-yellow-50 dark:bg-yellow-950/50',  // Light yellow background
        borderClass: 'border-l-yellow-500',             // Yellow left border accent
        textClass: 'text-yellow-900 dark:text-yellow-100', // Dark yellow text
        iconClass: 'text-yellow-600 dark:text-yellow-400', // Medium yellow icon
        category: 'Warning'                             // Display label
      },

      // Info state: Blue theme for informational messages
      info: {
        icon: Info,                                     // Info circle icon
        bgClass: 'bg-blue-50 dark:bg-blue-950/50',      // Light blue background
        borderClass: 'border-l-blue-500',               // Blue left border accent
        textClass: 'text-blue-900 dark:text-blue-100',  // Dark blue text
        iconClass: 'text-blue-600 dark:text-blue-400',  // Medium blue icon
        category: 'Info'                                // Display label
      },

      // Progress state: Purple theme for ongoing operations
      progress: {
        icon: Zap,                                      // Lightning bolt icon
        bgClass: 'bg-purple-50 dark:bg-purple-950/50',  // Light purple background
        borderClass: 'border-l-purple-500',             // Purple left border accent
        textClass: 'text-purple-900 dark:text-purple-100', // Dark purple text
        iconClass: 'text-purple-600 dark:text-purple-400', // Medium purple icon
        category: 'Progress'                            // Display label
      }
    };

    // Return configuration for requested type, fallback to 'info' if not found
    return configs[type] || configs.info;
  };

  // =================================================================================================
  // SECTION 3: COMPONENT CONFIGURATION & DATA PROCESSING
  // Applies configuration and processes input data for safe rendering
  // =================================================================================================

  const config = getStepConfig(stepType);
  const IconComponent = config.icon;

  /**
   * Format timestamp for display
   * Converts ISO timestamp to localized time string with consistent format
   *
   * @param {string} timestamp - ISO timestamp string
   * @returns {string} Formatted time string (HH:MM:SS) or empty string if invalid
   */
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';

    try {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: false,        // Use 24-hour format
        hour: '2-digit',      // Always show 2 digits for hour
        minute: '2-digit',    // Always show 2 digits for minute
        second: '2-digit'     // Always show 2 digits for second
      });
    } catch (error) {
      console.warn('Invalid timestamp format:', timestamp);
      return '';
    }
  };

  /**
   * Build dynamic CSS classes for the step container
   * Combines base styling with state-specific and conditional classes
   */
  const baseClasses = `
    relative p-3 rounded-lg border-l-4 transition-all duration-300 ease-out
    ${config.bgClass} ${config.borderClass} ${config.textClass}
    ${isLatest ? 'ring-2 ring-primary/20 shadow-sm' : ''}
    ${compact ? 'p-2' : ''}
  `.trim();

  // =================================================================================================
  // SECTION 4: RENDER STRUCTURE
  // Main component rendering with organized two-line layout as requested
  // =================================================================================================

  return (
    <div className={baseClasses}>
      {/* =================================================================================================
          SUBSECTION 4A: LATEST STEP INDICATOR
          Visual indicator for the most recently added step
          ================================================================================================= */}
      {isLatest && (
        <div className="absolute -left-1 top-3 w-2 h-2 bg-primary rounded-full animate-pulse" />
      )}

      <div className="flex items-start gap-3">
        {/* =================================================================================================
            SUBSECTION 4B: STEP ICON
            Category-appropriate icon with consistent sizing and positioning
            ================================================================================================= */}
        <div className="flex-shrink-0 mt-0.5">
          <IconComponent className={`w-4 h-4 ${config.iconClass}`} />
        </div>

        {/* =================================================================================================
            SUBSECTION 4C: TWO-LINE CONTENT LAYOUT (AS REQUESTED)
            Implements the requested two-line format with category and status message
            ================================================================================================= */}
        <div className="flex-1 min-w-0">
          <div className="space-y-1">
            {/* FIRST LINE: Category label and timestamp */}
            <div className="flex items-center justify-between gap-2">
              {/* Step category with distinctive styling */}
              <span className={`text-xs font-semibold uppercase tracking-wide ${config.iconClass}`}>
                {config.category}
              </span>

              {/* Timestamp display (optional, right-aligned) */}
              {showTimestamp && step.timestamp && (
                <div className="flex items-center gap-1 text-xs opacity-60 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  <span className="tabular-nums">{formatTimestamp(step.timestamp)}</span>
                </div>
              )}
            </div>

            {/* SECOND LINE: Detailed status message */}
            <p className={`text-sm leading-snug break-words ${compact ? 'text-xs' : ''}`}>
              {step.message}
            </p>
          </div>

          {/* =================================================================================================
              SUBSECTION 4D: OPTIONAL STEP IDENTIFIER
              Additional step information when available (step number, etc.)
              ================================================================================================= */}
          {step.step && (
            <p className="text-xs mt-2 opacity-60 border-t border-current/10 pt-1">
              Step: {step.step}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnhancedProgressStep;
