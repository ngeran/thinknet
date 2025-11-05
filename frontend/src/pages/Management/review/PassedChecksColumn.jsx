/**
 * =============================================================================
 * PASSED CHECKS COLUMN COMPONENT
 * =============================================================================
 *
 * Displays successfully passed validation checks.
 *
 * @module components/review/PassedChecksColumn
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle } from 'lucide-react';
import { PRE_CHECK_ICONS } from '../constants/icons';

/**
 * Passed Checks Column Component
 *
 * Displays all successfully passed validation checks with:
 * - Check name and icon
 * - Success message
 * - Checkmark indicator
 *
 * @param {Object} props
 * @param {Array} props.passedChecks - Array of passed check results
 * @param {string} props.passedChecks[].check_name - Name of the check
 * @param {string} props.passedChecks[].message - Success message
 */
export default function PassedChecksColumn({ passedChecks }) {
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle className="h-5 w-5 text-green-600" />
          Passed Checks
          <Badge variant="default" className="ml-auto bg-green-600">
            {passedChecks.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          All validations successful
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        <ScrollArea className="h-[400px] pr-4">
          {passedChecks.map((result, index) => {
            const IconComponent = PRE_CHECK_ICONS[result.check_name] || CheckCircle;
            return (
              <div
                key={index}
                className="bg-white rounded-lg p-3 border border-green-200 shadow-sm mb-2"
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">
                      {result.check_name}
                    </h4>
                    <p className="text-xs text-gray-600 truncate">
                      {result.message}
                    </p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                </div>
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
