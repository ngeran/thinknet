import React, { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Info, 
  ChevronDown 
} from 'lucide-react';

export default function LiveLogViewer({ 
  logs = [], 
  isConnected = false, 
  height = "h-96",
  title = "Live Execution Log",
  showTechnical = false 
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);
  const visibleLogs = logs.filter(log => showTechnical || !log.isTechnical);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [visibleLogs, autoScroll]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isAtBottom = scrollHeight - scrollTop === clientHeight;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="border rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-black flex flex-col">
      {/* HEADER */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="outline" className={`text-xs ${isConnected ? 'text-green-600 border-green-200' : 'text-red-600 border-red-200'}`}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </Badge>
        </div>
        {showTechnical && (
           <Badge variant="secondary" className="text-[10px] px-1 h-5 bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
             DEBUG MODE
           </Badge>
        )}
      </div>

      {/* LOG AREA */}
      <ScrollArea className={`${height} w-full`} ref={scrollRef} onScrollCapture={handleScroll}>
        <div className="p-4 space-y-1.5 font-mono text-xs">
          {visibleLogs.length === 0 ? (
            <div className="text-center text-gray-400 py-10 italic">
              Waiting for logs...
            </div>
          ) : (
            visibleLogs.map((log) => (
              <LogLine key={log.id} log={log} />
            ))
          )}
          <div id="log-end" />
        </div>
      </ScrollArea>

      {/* SCROLL BTN */}
      {!autoScroll && (
        <button 
          onClick={() => setAutoScroll(true)}
          className="absolute bottom-4 right-4 bg-black dark:bg-white text-white dark:text-black p-1.5 rounded-full shadow-lg hover:opacity-80 transition-opacity z-10"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function LogLine({ log }) {
  const getIcon = () => {
    switch (log.type) {
      case 'SUCCESS':       return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
      case 'ERROR':         return <AlertCircle className="w-3.5 h-3.5 text-red-600" />;
      case 'STEP_PROGRESS': return <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin-slow" />;
      default:              return <Info className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const getStyle = () => {
    if (log.isTechnical) return "text-gray-400 dark:text-gray-600";
    
    if (log.type === 'ERROR') 
      return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-1 rounded";
    
    // UPDATED: Text is Black (Gray-900), Icon handles the Green color
    if (log.type === 'SUCCESS') 
      return "text-gray-900 dark:text-gray-100 font-medium";
    
    if (log.type === 'STEP_PROGRESS') 
      return "text-blue-600 dark:text-blue-400 font-semibold mt-2 mb-1";
    
    return "text-gray-700 dark:text-gray-300";
  };

  return (
    <div className={`flex gap-2 items-start break-all ${getStyle()}`}>
      <span className="flex-shrink-0 mt-0.5 opacity-50 text-[10px]">{log.timestamp}</span>
      <span className="flex-shrink-0 mt-0.5">{getIcon()}</span>
      <span>{log.message}</span>
    </div>
  );
}
