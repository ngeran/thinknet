/**
 * =============================================================================
 * WEBSOCKET MESSAGE INSPECTOR COMPONENT
 * =============================================================================
 *
 * Real-time WebSocket message monitoring tool
 *
 * @module components/debug/WebSocketInspector
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
 
/**
 * WebSocket Inspector Component
 *
 * Displays real-time WebSocket messages for debugging
 * Shows last 20 messages with event type detection
 *
 * @param {Object} props
 * @param {Array} props.jobOutput - Array of job output messages
 */
export default function WebSocketInspector({ jobOutput }) {
  const rawMessages = jobOutput
    .filter(log => log.event_type === 'RAW_WEBSOCKET')
    .slice(-20);
 
  return (
    <Card className="border-purple-200 bg-purple-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              WebSocket Message Inspector
            </CardTitle>
            <CardDescription>
              Real-time WebSocket message monitoring (last 20 messages)
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {jobOutput.filter(log => log.event_type === 'RAW_WEBSOCKET').length} messages
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-1">
            {rawMessages.map((log, idx) => (
              <div
                key={idx}
                className="text-xs font-mono bg-white p-2 rounded border border-purple-100 hover:border-purple-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-purple-600 font-semibold">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {log.data?.full_message?.length || 0} chars
                  </Badge>
                </div>
                <div className="text-gray-700 break-all text-xs leading-relaxed">
                  {log.message}
                </div>
                {/* Show if message contains critical events */}
                {log.data?.full_message && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {log.data.full_message.includes('PRE_CHECK_EVENT') && (
                      <Badge className="text-xs bg-green-100 text-green-800">
                        PRE_CHECK_EVENT
                      </Badge>
                    )}
                    {log.data.full_message.includes('PRE_CHECK_COMPLETE') && (
                      <Badge className="text-xs bg-blue-100 text-blue-800">
                        PRE_CHECK_COMPLETE
                      </Badge>
                    )}
                    {log.data.full_message.includes('OPERATION_COMPLETE') && (
                      <Badge className="text-xs bg-purple-100 text-purple-800">
                        OPERATION_COMPLETE
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
 
            {/* Empty state */}
            {rawMessages.length === 0 && (
              <div className="text-center py-8 text-purple-400">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No WebSocket messages yet</p>
                <p className="text-xs mt-1">Start a pre-check to see real-time messages</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}