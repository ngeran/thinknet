/**
 * =============================================================================
 * CRITICAL ISSUES COLUMN COMPONENT
 * =============================================================================
 *
 * Displays critical validation failures that block upgrade
 *
 * @module components/review/CriticalIssuesColumn
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { XCircle, CheckCircle } from 'lucide-react';
import { PRE_CHECK_ICONS } from '../constants/icons';

/**
 * Critical Issues Column Component
 *
 * Displays all critical-level validation failures with:
 * - Check name and icon
 * - Failure message
 * - Recommended action
 *
 * @param {Object} props
 * @param {Array} props.criticalChecks - Array of critical check results
 * @param {string} props.criticalChecks[].check_name - Name of the check
 * @param {string} props.criticalChecks[].message - Failure message
 * @param {string} props.criticalChecks[].recommendation - Recommended action
 */
export default function CriticalIssuesColumn({ criticalChecks }) {
  return (
    <Card className={criticalChecks.length > 0 ? "border-red-200 bg-red-50/50" : "border-gray-200"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <XCircle className="h-5 w-5 text-red-600" />
          Critical Issues
          <Badge variant="destructive" className="ml-auto">
            {criticalChecks.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          {criticalChecks.length > 0
            ? 'Must be resolved before upgrade'
            : 'No critical issues detected'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {criticalChecks.length > 0 ? (
          criticalChecks.map((result, index) => {
            const IconComponent = PRE_CHECK_ICONS[result.check_name] || XCircle;
            return (
              <div
                key={index}
                className="bg-white rounded-lg p-4 border border-red-200 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <IconComponent className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">
                      {result.check_name}
                    </h4>
                    <p className="text-xs text-gray-700 mb-2">
                      {result.message}
                    </p>
                    {/* Recommendation box */}
                    {result.recommendation && (
                      <div className="bg-red-50 border-l-2 border-red-400 p-2 mt-2">
                        <p className="text-xs text-red-800">
                          <span className="font-semibold">Action: </span>
                          {result.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          /* Empty state - no critical issues */
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">All critical checks passed</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
