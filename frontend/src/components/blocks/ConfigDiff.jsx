import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileDiff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A reusable component to display Juniper/Unified configuration diffs.
 * 
 * @param {string} diff - The raw diff string (usually from PyEZ cu.diff())
 * @param {boolean} isOpen - Whether the diff viewer is visible
 * @param {function} onClose - Callback to close the viewer
 */
export default function ConfigDiff({ diff, isOpen, onClose }) {
  if (!isOpen || !diff) return null;

  // Parse diff lines for coloring
  const lines = diff.split('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FileDiff className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Configuration Changes</CardTitle>
              <p className="text-xs text-muted-foreground">Review changes before committing</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        
        <CardContent className="p-0 flex-1 overflow-hidden bg-slate-950 text-slate-50 font-mono text-xs">
          <ScrollArea className="h-full max-h-[60vh] p-4">
            {lines.length === 0 ? (
              <div className="text-gray-500 italic">No configuration changes detected.</div>
            ) : (
              lines.map((line, idx) => {
                // Juniper diff formatting logic
                let className = "whitespace-pre-wrap py-0.5 px-1 ";
                if (line.startsWith('+')) className += "bg-green-900/30 text-green-400";
                else if (line.startsWith('-')) className += "bg-red-900/30 text-red-400";
                else if (line.startsWith('[')) className += "text-cyan-400 font-bold mt-2 block"; // Stanza headers
                else className += "text-gray-400";

                return (
                  <div key={idx} className={className}>
                    {line}
                  </div>
                );
              })
            )}
          </ScrollArea>
        </CardContent>
        
        <div className="p-4 border-t bg-gray-50 dark:bg-gray-900 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close Review</Button>
        </div>
      </Card>
    </div>
  );
}
