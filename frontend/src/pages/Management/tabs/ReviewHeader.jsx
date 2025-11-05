/**
 * =============================================================================
 * REVIEW HEADER COMPONENT
 * =============================================================================
 *
 * Summary header for pre-check review tab
 *
 * @module components/review/ReviewHeader
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import React from 'react';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
 
/**
 * Review Header Component
 *
 * Displays large visual summary of pre-check results:
 * - Pass/Fail status with color coding
 * - Circular progress indicator
 * - Statistics grid (total, passed, warnings, critical)
 *
 * @param {Object} props
 * @param {Object} props.summary - Pre-check summary data
 * @param {number} props.summary.total_checks - Total number of checks
 * @param {number} props.summary.passed - Number of passed checks
 * @param {number} props.summary.warnings - Number of warnings
 * @param {number} props.summary.critical_failures - Number of critical failures
 * @param {boolean} props.summary.can_proceed - Whether upgrade can proceed
 */
export default function ReviewHeader({ summary }) {
  const successPercentage = Math.round((summary.passed / summary.total_checks) * 100);
 
  return (
    <div className={`relative overflow-hidden rounded-xl border-2 p-8 ${
      summary.can_proceed
        ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50'
        : 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'
    }`}>
      <div className="relative z-10">
        <div className="flex items-start justify-between">
 
          {/* Left side: Status message */}
          <div className="flex items-start gap-4">
            {/* Status icon */}
            {summary.can_proceed ? (
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
            ) : (
              <div className="p-3 bg-red-100 rounded-full">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
            )}
 
            {/* Status text */}
            <div>
              <h2 className="text-3xl font-bold mb-2">
                {summary.can_proceed
                  ? 'Ready for Upgrade ✓'
                  : 'Cannot Proceed'}
              </h2>
              <p className="text-lg text-gray-700 max-w-2xl">
                {summary.can_proceed
                  ? 'All critical validations passed successfully. The device meets requirements for upgrade.'
                  : 'Critical issues must be resolved before upgrade can proceed safely.'}
              </p>
            </div>
          </div>
 
          {/* Right side: Circular progress indicator */}
          <div className="hidden lg:flex flex-col items-center">
            <div className="relative w-32 h-32">
              {/* Background circle */}
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-gray-200"
                />
                {/* Progress circle */}
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(summary.passed / summary.total_checks) * 351.86} 351.86`}
                  className={summary.can_proceed ? "text-green-500" : "text-red-500"}
                  strokeLinecap="round"
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">
                  {successPercentage}%
                </span>
                <span className="text-xs text-gray-600">Success</span>
              </div>
            </div>
          </div>
        </div>
 
        {/* Statistics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {/* Total checks */}
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Total Checks</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {summary.total_checks}
            </div>
          </div>
 
          {/* Passed */}
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Passed</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {summary.passed}
            </div>
          </div>
 
          {/* Warnings */}
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-gray-600">Warnings</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {summary.warnings}
            </div>
          </div>
 
          {/* Critical failures */}
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/40">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-gray-600">Critical</span>
            </div>
            <div className="text-2xl font-bold text-red-600">
              {summary.critical_failures}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}