/**
 * =============================================================================
 * WARNINGS COLUMN COMPONENT
 * =============================================================================
 *
 * Displays warning-level validation issues
 *
 * @module components/review/WarningsColumn
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { PRE_CHECK_ICONS } from '../constants/icons';

/**
 * Warnings Column Component
 *
 * Displays all warning-level validation issues with:
 * - Check name and icon
 * - Warning message
 * - Optional note/recommendation
 *
 * @param {Object} props
 * @param {Array} props.warningChecks - Array of warning check results
 * @param {string} props.warningChecks[].check_name - Name of the check
 * @param {string} props.warningChecks[].message - Warning message
 * @param {string} props.warningChecks[].recommendation - Optional recommendation
 */
export default function WarningsColumn({ warningChecks }) {
  return (
    <Card className={warningChecks.length > 0 ? "border-orange-200 bg-orange-50/50" : "border-gray-200"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          Warnings
          <Badge variant="secondary" className="ml-auto">
            {warningChecks.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          {warningChecks.length > 0
            ? 'Review before proceeding'
            : 'No warnings detected'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {warningChecks.length > 0 ? (
          warningChecks.map((result, index) => {
            const IconComponent = PRE_CHECK_ICONS[result.check_name] || AlertTriangle;
            return (
              <div
                key={index}
                className="bg-white rounded-lg p-4 border border-orange-200 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <IconComponent className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">
                      {result.check_name}
                    </h4>
                    <p className="text-xs text-gray-700 mb-2">
                      {result.message}
                    </p>
                    {/* Note box */}
                    {result.recommendation && (
                      <div className="bg-orange-50 border-l-2 border-orange-400 p-2 mt-2">
                        <p className="text-xs text-orange-800">
                          <span className="font-semibold">Note: </span>
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
          /* Empty state - no warnings */
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No warnings to review</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
