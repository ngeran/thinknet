/**
 * =============================================================================
 * FILE LOCATION: frontend/src/components/ImageUploads.jsx
 * DESCRIPTION:   Production Image Upload Component with Storage Validation
 * VERSION:       2.1.7 - Fixed Storage Validation Null Check
 * AUTHOR:        nikos
 * DATE:          2025-11-27
 * =============================================================================
 *
 * OVERVIEW:
 * This component provides a complete file upload workflow for Juniper devices
 * with integrated storage validation.
 *
 * FIX IN VERSION 2.1.7:
 * - Added `|| 0` safety check to `storageCheck.required_mb` and `available_mb`.
 *   The backend sometimes returns `null` for `required_mb` (e.g. during specific
 *   validation passes), which was causing the React app to crash with
 *   "Cannot read properties of null (reading 'toFixed')".
 *
 * =============================================================================
 */

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, HardDrive, Upload, CheckCircle2, XCircle,
  AlertCircle, Terminal, FileText, FileCheck,
  Server, CloudUpload
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

// Shared Form Components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

// Custom Hooks and Services
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
// UPDATED: Import both processLogMessage (for display) and extractLogPayload (for state logic)
import { processLogMessage, extractLogPayload } from '@/lib/logProcessor'; 

// Live Log Viewer Component
import LiveLogViewer from '@/components/realTimeProgress/LiveLogViewer';

// =============================================================================
// SECTION 2: CONFIGURATION CONSTANTS
// =============================================================================

// API Gateway URL from environment variables (set in docker-compose.yml)
const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// Debounce delay for automatic storage validation (milliseconds)
const VALIDATION_DEBOUNCE_DELAY = 2000;

// Step definitions for progress tracking
const UPLOAD_STEPS = {
  FILE_SELECTION: 1,
  DEVICE_CONFIG: 2,
  STORAGE_VALIDATION: 3,
  UPLOAD: 4,
  COMPLETE: 5
};

// =============================================================================
// SECTION 3: COMPONENT DEFINITION
// =============================================================================

export default function ImageUploads({
  // Optional props for external state management
  parameters: externalParameters,
  onParamChange: externalOnParamChange,
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  onUpload,
  isRunning = false,
  isUploading: externalIsUploading,
  uploadProgress: externalUploadProgress
}) {

  // ===========================================================================
  // SECTION 4: STATE MANAGEMENT
  // ===========================================================================

  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '',
    username: '',
    password: ''
  });

  // Storage validation state
  const [checkJobId, setCheckJobId] = useState(null);
  const [storageCheck, setStorageCheck] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageCheckError, setStorageCheckError] = useState(null);

  // Upload state
  const [uploadJobId, setUploadJobId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Terminal logs state
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);
  const terminalEndRef = useRef(null);

  // UI state for step tracking
  const [currentStep, setCurrentStep] = useState(UPLOAD_STEPS.FILE_SELECTION);

  // ===========================================================================
  // SECTION 5: PROPS RESOLUTION
  // ===========================================================================

  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploadingResolved = externalIsUploading !== undefined ? externalIsUploading : isUploading;
  const uploadProgressResolved = externalUploadProgress !== undefined ? externalUploadProgress : uploadProgress;

  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // ===========================================================================
  // SECTION 6: STEP MANAGEMENT
  // ===========================================================================

  useEffect(() => {
    // Update current step based on state
    if (uploadComplete) {
      setCurrentStep(UPLOAD_STEPS.COMPLETE);
    } else if (isUploadingResolved) {
      setCurrentStep(UPLOAD_STEPS.UPLOAD);
    } else if (storageCheck && storageCheck.has_sufficient_space) {
      setCurrentStep(UPLOAD_STEPS.STORAGE_VALIDATION);
    } else if (parameters.hostname && parameters.username && parameters.password) {
      setCurrentStep(UPLOAD_STEPS.DEVICE_CONFIG);
    } else if (selectedFile) {
      setCurrentStep(UPLOAD_STEPS.FILE_SELECTION);
    }
  }, [selectedFile, parameters, storageCheck, isUploadingResolved, uploadComplete]);

  // ===========================================================================
  // SECTION 7: WEBSOCKET INTEGRATION
  // ===========================================================================

  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // ===========================================================================
  // SECTION 8: WEBSOCKET MESSAGE PROCESSING
  // ===========================================================================

  useEffect(() => {
    if (!lastMessage) return;

    try {
      // FIX: Use the robust logProcessor utility for canonical payload extraction.
      const eventData = extractLogPayload(lastMessage);

      // Process the log for display
      const processedLog = processLogMessage(eventData);
      setTerminalLogs(prev => [...prev, processedLog]);

      const eventType = eventData.event_type;
      const eventPayloadData = eventData.data;

      // VALIDATION MESSAGE HANDLING
      if (checkJobId && eventType === 'PRE_CHECK_COMPLETE') {
        const validationData = eventPayloadData;

        if (validationData && typeof validationData.validation_passed === 'boolean') {
          const validationPassed = validationData.validation_passed;
          const validationMessage = eventData.message || validationData.message;

          setStorageCheck({
            has_sufficient_space: validationPassed,
            message: validationMessage,
            required_mb: validationData.required_mb,
            available_mb: validationData.available_mb,
            best_filesystem: validationData.best_filesystem,
            recommendations: validationData.recommendations || []
          });

          setIsCheckingStorage(false);
          setStorageCheckError(validationPassed ? null : validationMessage);

          if (!validationPassed) {
             setTerminalLogs(prev => [...prev, {
              id: `validation_failed_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'ERROR',
              message: `❌ ${validationMessage}`,
              isTechnical: false,
              originalEvent: eventData
            }]);
          } else {
             setTerminalLogs(prev => [...prev, {
              id: `validation_passed_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'SUCCESS',
              message: '✅ Storage validation passed - Ready to upload',
              isTechnical: false,
              originalEvent: eventData
            }]);
          }
        }
      }

      // UPLOAD MESSAGE HANDLING
      if (uploadJobId) {
        if (eventType === 'PROGRESS_UPDATE' && eventPayloadData && eventPayloadData.progress !== undefined) {
          setUploadProgress(eventPayloadData.progress);
        }

        if (eventType === 'OPERATION_COMPLETE') {
          setIsUploading(false);
          const success = eventPayloadData?.success !== false && eventPayloadData?.status !== 'FAILED';

          if (success) {
            setUploadProgress(100);
            setUploadError(null);
            setUploadComplete(true);
            setTerminalLogs(prev => [...prev, {
              id: `upload_success_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'SUCCESS',
              message: '✅ File uploaded successfully',
              isTechnical: false,
              originalEvent: eventData
            }]);
          } else {
            const errorMsg = eventData.message || eventPayloadData?.error || 'Upload failed';
            setUploadError(errorMsg);
            setTerminalLogs(prev => [...prev, {
              id: `upload_failed_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'ERROR',
              message: `❌ ${errorMsg}`,
              isTechnical: false,
              originalEvent: eventData
            }]);
          }
        }
      }

    } catch (err) {
      console.error('Error processing WebSocket message:', err);
      setTerminalLogs(prev => [...prev, {
        id: `parse_error_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: `Failed to process message: ${err.message}`,
        isTechnical: true,
        originalEvent: { error: err.message, raw: lastMessage }
      }]);
    }
  }, [lastMessage, checkJobId, uploadJobId]);

  // ===========================================================================
  // SECTION 9: AUTO-SCROLL TERMINAL
  // ===========================================================================

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // ===========================================================================
  // SECTION 10: STORAGE VALIDATION FUNCTION
  // ===========================================================================

  const startStorageCheck = async () => {
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) return;

    // Reset state
    setIsCheckingStorage(true);
    setStorageCheckError(null);
    setStorageCheck(null);
    setTerminalLogs([{
      id: 'validation_start',
      type: 'INFO',
      message: `🔍 Validating storage on ${parameters.hostname}...`,
      timestamp: new Date().toLocaleTimeString(),
      isTechnical: false
    }]);

    try {
      const payload = {
        hostname: parameters.hostname,
        username: parameters.username,
        password: parameters.password,
        tests: ["test_storage_check"],
        mode: "check",
        tag: "snap",
        file_size: selectedFile.size
      };

      const response = await fetch(`${API_BASE}/api/operations/validation/execute-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Validation request failed: ${errorText}`);
      }

      const data = await response.json();
      const { job_id, ws_channel } = data;
      setCheckJobId(job_id);

      if (ws_channel && isConnected) {
        sendMessage({
          type: 'SUBSCRIBE',
          channel: ws_channel
        });
      } else {
        throw new Error('WebSocket not connected - cannot receive validation results');
      }

    } catch (error) {
      setStorageCheckError(error.message);
      setIsCheckingStorage(false);
      setTerminalLogs(prev => [...prev, {
        id: 'validation_error',
        type: 'ERROR',
        message: `Validation failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isTechnical: false
      }]);
    }
  };

  // ===========================================================================
  // SECTION 11: AUTOMATIC VALIDATION TRIGGER (DEBOUNCED)
  // ===========================================================================

  useEffect(() => {
    const isReady = selectedFile &&
                    parameters.hostname &&
                    parameters.username &&
                    parameters.password;

    if (isReady && !isCheckingStorage && !storageCheck) {
      const timer = setTimeout(() => {
        startStorageCheck();
      }, VALIDATION_DEBOUNCE_DELAY);

      return () => clearTimeout(timer);
    } else if (!isReady) {
      setStorageCheck(null);
      setStorageCheckError(null);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);

  // ===========================================================================
  // SECTION 12: FILE UPLOAD FUNCTION
  // ===========================================================================

  const handleUpload = async () => {
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) return;

    // Reset upload state
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadComplete(false);
    setTerminalLogs(prev => [...prev, {
      id: 'upload_start',
      type: 'INFO',
      message: `📤 Starting upload of ${selectedFile.name} to ${parameters.hostname}...`,
      timestamp: new Date().toLocaleTimeString(),
      isTechnical: false
    }]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('hostname', parameters.hostname);
      formData.append('username', parameters.username);
      formData.append('password', parameters.password);
      formData.append('protocol', 'scp');
      formData.append('scriptId', `image_upload_${Date.now()}`);
      formData.append('wsClientId', 'web_client');
      formData.append('remote_filename', selectedFile.name);

      const response = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload request failed: ${errorText}`);
      }

      const data = await response.json();
      const { job_id, ws_channel } = data;
      setUploadJobId(job_id);

      if (ws_channel && isConnected) {
        sendMessage({
          type: 'SUBSCRIBE',
          channel: ws_channel
        });
      }

    } catch (error) {
      setUploadError(error.message);
      setIsUploading(false);
      setTerminalLogs(prev => [...prev, {
        id: 'upload_error',
        type: 'ERROR',
        message: `Upload failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isTechnical: false
      }]);
    }
  };

  // ===========================================================================
  // SECTION 13: RESET FUNCTION
  // ===========================================================================

  const handleReset = () => {
    setInternalSelectedFile(null);
    setInternalParameters({ hostname: '', username: '', password: '' });
    setStorageCheck(null);
    setStorageCheckError(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadComplete(false);
    setTerminalLogs([]);
    setCurrentStep(UPLOAD_STEPS.FILE_SELECTION);
  };

  // ===========================================================================
  // SECTION 14: UI HELPER FUNCTIONS
  // ===========================================================================

  const getStorageStatusIcon = () => {
    if (isCheckingStorage) return <Loader2 className="h-5 w-5 animate-spin text-gray-600" />;
    if (storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) return <XCircle className="h-5 w-5 text-red-600" />;
    if (storageCheck && storageCheck.has_sufficient_space) return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    return <HardDrive className="h-5 w-5 text-gray-400" />;
  };

  const getStorageStatusText = () => {
    if (isCheckingStorage) return 'Validating storage...';
    if (storageCheckError) return 'Validation failed';
    if (storageCheck && !storageCheck.has_sufficient_space) return 'Insufficient space';
    if (storageCheck && storageCheck.has_sufficient_space) return 'Storage validated';
    return 'Pending validation';
  };

  const getStorageStatusColor = () => {
    if (isCheckingStorage) return 'border-gray-400 bg-gray-50';
    if (storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) return 'border-red-200 bg-red-50';
    if (storageCheck && storageCheck.has_sufficient_space) return 'border-green-200 bg-green-50';
    return 'border-gray-200 bg-gray-50';
  };

  const canUpload = () => {
    return selectedFile &&
           parameters.hostname &&
           parameters.username &&
           parameters.password &&
           storageCheck &&
           storageCheck.has_sufficient_space &&
           !isCheckingStorage &&
           !isUploadingResolved;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // ===========================================================================
  // SECTION 15: RENDER UI - NEW 2X2 GRID LAYOUT
  // ===========================================================================

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">

      {/* PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <CloudUpload className="h-8 w-8 text-gray-900" />
            Image Upload Workflow
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload firmware images and configuration files to Juniper devices with pre-validation.
          </p>
        </div>

        {/* WebSocket Connection Status & Global Status */}
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? "success" : "destructive"} className="text-sm">
            {isConnected ? '🟢 WS Connected' : '🔴 WS Disconnected'}
          </Badge>
          {uploadComplete && (
            <Badge variant="success" className="text-sm">
              ✅ Upload Complete
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* PROGRESS INDICATOR */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {[
              { step: UPLOAD_STEPS.FILE_SELECTION, label: '1. Select File', icon: FileCheck },
              { step: UPLOAD_STEPS.DEVICE_CONFIG, label: '2. Device Config', icon: Server },
              { step: UPLOAD_STEPS.STORAGE_VALIDATION, label: '3. Storage Check', icon: HardDrive },
              { step: UPLOAD_STEPS.UPLOAD, label: '4. Upload', icon: Upload },
              { step: UPLOAD_STEPS.COMPLETE, label: '5. Complete', icon: CheckCircle2 }
            ].map(({ step, label, icon: Icon }, index) => (
              <React.Fragment key={step}>
                <div className={`flex flex-col items-center w-1/5 text-center ${currentStep >= step ? 'text-gray-900' : 'text-gray-400'}`}>
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    currentStep >= step 
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : 'border-gray-300 bg-white'
                  }`}>
                    {currentStep > step ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className="text-xs font-medium mt-2 hidden sm:block">{label}</span>
                  <span className="text-xs font-medium mt-2 block sm:hidden">{label.split('.')[0]}</span>
                  {currentStep === step && (
                    <div className="w-2 h-2 bg-gray-900 rounded-full mt-1" />
                  )}
                </div>
                {index < 4 && (
                  <div className={`flex-1 h-1 mx-2 sm:mx-4 ${
                    currentStep > step ? 'bg-gray-900' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* NEW MAIN CONTENT GRID: 2x2 Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* GRID ITEM 1 (TOP-LEFT): STEP 1: FILE SELECTION */}
        <Card className={currentStep >= UPLOAD_STEPS.FILE_SELECTION ? 'border-gray-900 shadow-lg' : 'border-gray-200'}>
          <CardHeader className="pb-4 bg-gray-50/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck className="h-5 w-5 text-gray-900" />
              1. Select File
              {selectedFile && (
                <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">
                  {formatFileSize(selectedFile.size)}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Choose the firmware image or configuration file to upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <FileSelection
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              isRunning={isRunning || isUploadingResolved}
            />
            
            {selectedFile && (
              <div className="p-3 bg-gray-100/70 rounded-lg border border-gray-300 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate flex-1 flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-gray-900" />
                    {selectedFile.name}
                  </span>
                  <span className="text-gray-800 font-semibold ml-2">{formatFileSize(selectedFile.size)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GRID ITEM 2 (TOP-RIGHT): STEP 2: DEVICE CONFIGURATION */}
        <Card className={currentStep >= UPLOAD_STEPS.DEVICE_CONFIG ? 'border-gray-900 shadow-lg' : 'border-gray-200'}>
          <CardHeader className="pb-4 bg-gray-50/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-gray-900" />
              2. Device Configuration
              {parameters.hostname && parameters.username && parameters.password && (
                <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">
                  Target: {parameters.hostname}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Enter target device details and authentication credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <DeviceTargetSelector
              parameters={parameters}
              onParamChange={setParameters}
            />
            <Separator />
            <DeviceAuthFields
              parameters={parameters}
              onParamChange={setParameters}
            />
          </CardContent>
        </Card>
        
        {/* GRID ITEM 3 (BOTTOM-LEFT): LIVE EXECUTION LOG - White Card, Black Log */}
        <Card className="border-gray-200">
          <CardHeader className="pb-4 bg-gray-50/50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
                <Terminal className="h-5 w-5 text-gray-900" />
                Live Execution Log
              </CardTitle>
              <Badge variant={terminalLogs.length > 0 ? "outline" : "secondary"} className="bg-gray-100 text-gray-700 border-gray-300">
                {terminalLogs.length} events
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Log Controls - Adjusted for light background theme */}
            <div className="flex items-center gap-2 mb-4 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
                className={`text-xs ${showTechnicalLogs ? 'text-white bg-gray-900 hover:bg-black' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                {showTechnicalLogs ? '🔧 Debug Mode: ON' : '🔧 Debug Mode: OFF'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTerminalLogs([])}
                disabled={terminalLogs.length === 0}
                className="text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                Clear Logs
              </Button>
            </div>
            
            {/* Log Viewer - isDarkTheme=true keeps the log area black */}
            <LiveLogViewer
              logs={terminalLogs}
              isConnected={isConnected}
              height="h-[350px]"
              showTechnical={showTechnicalLogs}
              isDarkTheme={true}
            />
          </CardContent>
        </Card>

        {/* GRID ITEM 4 (BOTTOM-RIGHT): STEP 3 & 4: VALIDATION/UPLOAD */}
        <Card className={currentStep >= UPLOAD_STEPS.STORAGE_VALIDATION ? 'border-gray-900 shadow-lg' : 'border-gray-200'}>
          <CardHeader className="pb-4 bg-gray-50/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5 text-gray-900" />
              3. Storage Check & 4. Upload Action
            </CardTitle>
            <CardDescription>
              Automatic validation is triggered once all fields are complete. Proceed to upload when ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            
            {/* STORAGE VALIDATION STATUS */}
            <div className={`p-4 rounded-xl border-2 ${getStorageStatusColor()} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="text-base font-bold flex items-center gap-2">
                  {getStorageStatusIcon()}
                  {getStorageStatusText()}
                </span>
                {isCheckingStorage && (
                  <Badge variant="outline" className="text-gray-600">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Checking...
                  </Badge>
                )}
              </div>

              {storageCheck && (
                <div>
                  {storageCheck.has_sufficient_space ? (
                    <div className="p-3 bg-green-100 rounded text-sm text-green-800 border border-green-300">
                        <div className="font-semibold mb-1">✅ Sufficient Space Found</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="font-medium">Required Space:</span>
                          {/* FIX: Handle null required_mb */}
                          <span className="font-mono text-right">{(storageCheck.required_mb || 0).toFixed(2)} MB</span>
                          <span className="font-medium">Available Space:</span>
                          {/* FIX: Handle null available_mb */}
                          <span className="font-mono text-green-700 font-bold text-right">
                            {(storageCheck.available_mb || 0).toFixed(2)} MB
                          </span>
                        </div>
                    </div>
                  ) : (
                    <Alert className="bg-red-50 border-red-200">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        <div className="font-medium mb-1">❌ Insufficient Storage</div>
                        <p className="text-sm whitespace-pre-wrap">{storageCheck.message}</p>
                        {storageCheck.recommendations && storageCheck.recommendations.length > 0 && (
                          <div className="mt-2 text-xs space-y-1">
                            <div className="font-semibold">Recommendations:</div>
                            {storageCheck.recommendations.map((rec, idx) => (
                              <div key={idx} className="flex items-start gap-1">
                                <span className="text-red-600 mt-0.5">•</span>
                                <span>{rec}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {storageCheckError && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <span className="font-medium">Validation Failed:</span> {storageCheckError}
                  </AlertDescription>
                </Alert>
              )}

              {(storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) && (
                <Button
                  onClick={startStorageCheck}
                  disabled={isCheckingStorage}
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                >
                  {isCheckingStorage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rechecking...
                    </>
                  ) : (
                    'Retry Validation'
                  )}
                </Button>
              )}
            </div>

            <Separator />

            {/* UPLOAD BUTTON AND PROGRESS */}
            <div className="space-y-4">
              {!uploadComplete ? (
                <>
                  <Button
                    onClick={handleUpload}
                    disabled={!canUpload()}
                    className="w-full transition-all duration-300 bg-gray-900 hover:bg-black"
                    size="lg"
                  >
                    {isUploadingResolved ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Uploading... {(uploadProgressResolved || 0).toFixed(0)}%
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-5 w-5" />
                        Start Upload
                      </>
                    )}
                  </Button>

                  {isUploadingResolved && (
                    <div className="space-y-2">
                      <Progress value={uploadProgressResolved} className="w-full h-3" />
                      <p className="text-sm text-center text-gray-600">
                        Transferring... {(uploadProgressResolved || 0).toFixed(1)}% complete
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 font-medium">
                      ✅ Upload completed successfully!
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={handleReset}
                    variant="default"
                    className="w-full bg-gray-900 hover:bg-black"
                  >
                    Upload Another File
                  </Button>
                </div>
              )}

              {uploadError && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <span className="font-medium">Upload Error:</span> {uploadError}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
