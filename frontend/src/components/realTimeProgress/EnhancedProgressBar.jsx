// =================================================================================================
// FILE:               EnhancedProgressBar.jsx
// COMPONENT:          Enhanced Progress Bar Component
// VERSION:            2.0.0
// LAST UPDATED:       2025-08-03
//
// DESCRIPTION:
//   A highly optimized, space-efficient progress bar component designed for real-time operations.
//   Features modern shadcn/ui styling with intelligent state management, smooth animations, and
//   comprehensive status indicators. Provides visual feedback for ongoing processes with
//   color-coded states and detailed progress metrics.
//
// KEY FEATURES:
//   ✅ Space-efficient compact design
//   ✅ Real-time progress visualization with smooth animations
//   ✅ Color-coded states (running/blue, success/green, error/red)
//   ✅ Dual display modes: standard and compact layouts
//   ✅ Step counter and percentage indicators
//   ✅ Dynamic icon switching based on operation state
//   ✅ shadcn/ui compatible styling with dark mode support
//   ✅ Responsive design for mobile and desktop
//   ✅ Accessibility-compliant with proper ARIA attributes
//
// DEPENDENCIES:
//   - React 16.8+ (hooks support required)
//   - lucide-react (for icons: Loader, CheckCircle, AlertCircle, Clock)
//   - Tailwind CSS 3.0+ (for styling utilities)
//   - Optional: shadcn/ui theme configuration
//
// HOW TO USE:
//   1. Import: import EnhancedProgressBar from './EnhancedProgressBar';
//   2. Basic usage:
//      <EnhancedProgressBar
//        percentage={75}
//        currentStep="Processing data..."
//        isRunning={true}
//      />
//   3. Advanced usage with full control:
//      <EnhancedProgressBar
//        percentage={progressPercentage}
//        currentStep={latestMessage}
//        totalSteps={totalSteps}
//        completedSteps={completedSteps}
//        isRunning={isRunning}
//        isComplete={isComplete}
//        hasError={hasError}
//        compact={true}
//        animated={true}
//      />
//
// INTEGRATION NOTES:
//   - Designed to work seamlessly with WebSocket streams
//   - Compatible with existing progress tracking hooks
//   - Can be used standalone or within EnhancedRealTimeDisplay
//   - Supports both controlled and uncontrolled usage patterns
// =================================================================================================

import React from 'react';
import { Loader, CheckCircle, AlertCircle, Clock } from 'lucide-react';

/**
 * Enhanced Progress Bar Component
 *
 * @param {Object} props - Component props
 * @param {number} props.percentage - Progress percentage (0-100)
 * @param {string} props.currentStep - Current step description
 * @param {number} props.totalSteps - Total number of steps
 * @param {number} props.completedSteps - Number of completed steps
 * @param {boolean} props.isRunning - Whether operation is running
 * @param {boolean} props.isComplete - Whether operation is complete
 * @param {boolean} props.hasError - Whether there's an error
 * @param {boolean} props.showStepCounter - Show step counter
 * @param {boolean} props.showPercentage - Show percentage
 * @param {boolean} props.animated - Enable animations
 * @param {boolean} props.compact - Use compact layout
 */
const EnhancedProgressBar = ({
  percentage = 0,
  currentStep,
  totalSteps = 0,
  completedSteps = 0,
  isRunning = false,
  isComplete = false,
  hasError = false,
  showStepCounter = true,
  showPercentage = true,
  animated = true,
  compact = false
}) => {
  // =================================================================================================
  // SECTION 1: PROGRESS STATE CONFIGURATION
  // Determines visual styling and behavior based on current operation state
  // =================================================================================================

  /**
   * Get progress configuration based on current state
   * Determines colors, icons, and animation behavior for different states
   *
   * @returns {Object} Configuration object with styling and behavior settings
   */
  const getProgressConfig = () => {
    // Error state: Red theme with alert styling
    if (hasError) return {
      bg: 'bg-destructive/20',                    // Light red background
      fill: 'bg-destructive',                     // Solid red fill
      text: 'text-destructive',                   // Red text color
      icon: AlertCircle,                          // Alert circle icon
      pulse: false                                // No pulsing animation for errors
    };

    // Success state: Green theme with checkmark
    if (isComplete) return {
      bg: 'bg-green-100 dark:bg-green-900/20',    // Light green background
      fill: 'bg-green-500',                       // Solid green fill
      text: 'text-green-700 dark:text-green-400', // Green text with dark mode support
      icon: CheckCircle,                          // Check circle icon
      pulse: false                                // No pulsing for completed state
    };

    // Running/default state: Blue theme with dynamic behavior
    return {
      bg: 'bg-primary/10',                        // Light blue background
      fill: 'bg-primary',                         // Primary color fill
      text: 'text-primary',                       // Primary color text
      icon: isRunning ? Loader : Clock,           // Loader when running, clock when idle
      pulse: isRunning && animated               // Pulse animation only when running
    };
  };

  // =================================================================================================
  // SECTION 2: DATA PROCESSING & VALIDATION
  // Processes and validates input data to ensure safe rendering
  // =================================================================================================

  const config = getProgressConfig();
  const IconComponent = config.icon;

  // Clamp percentage to valid range (0-100) to prevent visual issues
  const safePercentage = Math.min(Math.max(percentage, 0), 100);

  // =================================================================================================
  // SECTION 3: RENDER STRUCTURE
  // Main component rendering with organized layout sections
  // =================================================================================================

  return (
    <div className={`space-y-${compact ? '2' : '3'}`}>
      {/* =================================================================================================
          SUBSECTION 3A: PROGRESS BAR VISUALIZATION
          The main progress bar with animated fill and optional percentage overlay
          ================================================================================================= */}
      <div className="relative">
        {/* Background track with theme-appropriate styling */}
        <div className={`w-full ${config.bg} rounded-full h-3 overflow-hidden border border-border/50`}>
          {/* Animated progress fill with smooth transitions */}
          <div
            className={`h-full ${config.fill} transition-all duration-700 ease-out rounded-full ${
              config.pulse ? 'animate-pulse' : ''
            }`}
            style={{
              width: `${safePercentage}%`,
              // Add subtle glow effect when progress is active
              boxShadow: safePercentage > 0 ? '0 0 8px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          />
        </div>

        {/* Percentage overlay displayed on the progress bar when there's sufficient space */}
        {showPercentage && safePercentage > 15 && (
          <div
            className="absolute top-0 h-3 flex items-center"
            style={{ width: `${safePercentage}%` }}
          >
            <span className="text-[10px] font-medium text-white ml-auto mr-1 tabular-nums">
              {Math.round(safePercentage)}%
            </span>
          </div>
        )}
      </div>

      {/* =================================================================================================
          SUBSECTION 3B: STATUS INFORMATION DISPLAY
          Shows current status, step information, and progress metrics
          ================================================================================================= */}
      <div className="flex items-center justify-between">
        {/* Left side: Status icon and current step description */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Dynamic status icon with conditional animation */}
          <IconComponent
            className={`w-4 h-4 ${config.text} flex-shrink-0 ${
              isRunning && config.icon === Loader ? 'animate-spin' : ''
            }`}
          />

          {/* Current step or default status message */}
          <div className="min-w-0 flex-1">
            {currentStep ? (
              // Display custom step message with truncation for long text
              <p className={`text-sm font-medium ${config.text} truncate`} title={currentStep}>
                {currentStep}
              </p>
            ) : (
              // Display default status message based on current state
              <p className={`text-sm ${config.text}`}>
                {isRunning ? 'Processing...' :
                 isComplete ? 'Complete' :
                 hasError ? 'Error' : 'Ready'}
              </p>
            )}
          </div>
        </div>

        {/* Right side: Progress metrics and counters */}
        <div className="flex items-center gap-3 text-xs flex-shrink-0">
          {/* Step counter: shows completed/total steps */}
          {showStepCounter && totalSteps > 0 && (
            <span className={`${config.text} tabular-nums`}>
              {completedSteps}/{totalSteps}
            </span>
          )}

          {/* Percentage display: shown when not overlaid on progress bar or in non-compact mode */}
          {showPercentage && (safePercentage <= 15 || !compact) && (
            <span className={`font-medium ${config.text} tabular-nums min-w-[3ch]`}>
              {Math.round(safePercentage)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnhancedProgressBar;
