/**
 * =============================================================================
 * FILE LOCATION: frontend/src/components/ImageUploads.jsx
 * DESCRIPTION:   Production Image Upload Component with Storage Validation
 * VERSION:       2.0.0 - Enhanced Storage Validation with File Size Comparison
 * AUTHOR:        nikos
 * DATE:          2025-11-26
 * =============================================================================
 *
 * OVERVIEW:
 *   This component provides a complete file upload workflow for Juniper devices
 *   with integrated storage validation. It implements a two-phase approach:
 *     Phase 1: Storage Validation (JSNAPy V2)
 *     Phase 2: File Upload (run. py via SCP)
 *
 * NEW IN VERSION 2.0.0:
 *   - Sends file size to validation endpoint for accurate space checking
 *   - Processes PRE_CHECK_COMPLETE events with validation_passed boolean
 *   - Updates UI based on actual validation results
 *   - Prevents upload when validation fails
 *   - Shows detailed error messages with recommendations
 *
 * ARCHITECTURE FLOW:
 *
 *   1. User selects file and enters credentials
 *   2. Component automatically triggers storage validation (debounced)
 *   3. POST /api/operations/validation/execute-v2 with file_size
 *   4. Subscribe to WebSocket channel for real-time updates
 *   5. Receive PRE_CHECK_COMPLETE event with validation_passed
 *   6. Update UI: Enable upload button if validation passed
 *   7. User clicks upload button
 *   8.  POST /api/files/upload with file data
 *   9. Subscribe to upload WebSocket channel
 *   10.  Show upload progress and completion status
 *
 * WEBSOCKET MESSAGE HANDLING:
 *
 *   The component listens for WebSocket messages in this format:
 *   {
 *       "channel": "ws_channel:job:jsnapy-UUID",
 *       "data": "{\"type\":\"result\",\"event_type\":\"PRE_CHECK_COMPLETE\",\"data\":{... }}"
 *   }
 *
 *   After unwrapping:
 *   {
 *       "type": "result",
 *       "event_type": "PRE_CHECK_COMPLETE",
 *       "message": "✅ Sufficient space on /var/tmp.. .",
 *       "data": {
 *           "validation_passed": true,
 *           "required_mb": 120.0,
 *           "available_mb": 5000.0,
 *           "best_filesystem": {... },
 *           "recommendations": [...]
 *       }
 *   }
 *
 * INTEGRATION POINTS:
 *   - API Endpoints: /api/operations/validation/execute-v2, /api/files/upload
 *   - WebSocket: Custom useJobWebSocket hook
 *   - Shared Components: DeviceAuthFields, DeviceTargetSelector, FileSelection
 *   - Utilities: logProcessor.js for event formatting
 *
 * =============================================================================
 */
 
// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
 
import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, HardDrive, Upload, CheckCircle2, XCircle,
  AlertCircle, Terminal, FileText
} from 'lucide-react';
 
// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { processLogMessage } from '@/lib/logProcessor';
 
// Live Log Viewer Component
import LiveLogViewer from '@/components/realTimeProgress/LiveLogViewer';
 
// =============================================================================
// SECTION 2: CONFIGURATION CONSTANTS
// =============================================================================
 
// API Gateway URL from environment variables (set in docker-compose.yml)
const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
 
// Debounce delay for automatic storage validation (milliseconds)
// After user stops typing credentials, wait this long before validating
const VALIDATION_DEBOUNCE_DELAY = 2000;
 
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
 
  // Internal state (used when props are not provided)
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
 
  // Terminal logs state
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);
  const terminalEndRef = useRef(null);
 
  // ===========================================================================
  // SECTION 5: PROPS RESOLUTION
  // ===========================================================================
  //
  // This component can be used in two modes:
  //   1.  Standalone: Uses internal state
  //   2.  Controlled: Uses external state passed via props
  //
  // This section resolves which state to use based on prop availability
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
  // SECTION 6: WEBSOCKET INTEGRATION
  // ===========================================================================
  //
  // useJobWebSocket hook provides:
  //   - sendMessage(msg): Send commands to WebSocket (SUBSCRIBE/UNSUBSCRIBE)
  //   - lastMessage: Most recent WebSocket message received
  //   - isConnected: WebSocket connection status
  //
  // Message flow:
  //   1. Backend publishes to Redis: ws_channel:job:{job_id}
  //   2.  Rust Hub receives via pattern subscription
  //   3. Rust Hub wraps message: {channel: ".. .", data: "..."}
  //   4.  Rust Hub sends to subscribed WebSocket clients
  //   5.  Frontend receives via this hook
  //   6. lastMessage updates, triggering useEffect below
  // ===========================================================================
 
  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
 
  // ===========================================================================
  // SECTION 7: WEBSOCKET MESSAGE PROCESSING
  // ===========================================================================
  //
  // This effect processes incoming WebSocket messages and routes them to
  // appropriate handlers based on job_id and event_type.
  //
  // Message structure (from Rust Hub):
  //   {
  //       "channel": "ws_channel:job:jsnapy-UUID",
  //       "data": "{\"type\":\"result\",\"event_type\":\"PRE_CHECK_COMPLETE\",... }"
  //   }
  //
  // We need to:
  //   1. Parse the outer wrapper (channel + data)
  //   2.  Parse the inner JSON string (actual event)
  //   3.  Determine if this message is for our current job
  //   4. Route to validation or upload handler
  // ===========================================================================
 
  useEffect(() => {
    if (!lastMessage) return;
 
    try {
      // Parse the message data
      let messageData;
 
      if (typeof lastMessage === 'string') {
        messageData = JSON.parse(lastMessage);
      } else {
        messageData = lastMessage;
      }
 
      // Unwrap the data field if it's a string (Rust Hub wrapper format)
      let eventData = messageData;
      if (messageData.data && typeof messageData. data === 'string') {
        try {
          eventData = JSON. parse(messageData.data);
        } catch (e) {
          // If parsing fails, use the original messageData
          eventData = messageData;
        }
      } else if (messageData.data && typeof messageData.data === 'object') {
        eventData = messageData.data;
      }
 
      // Process the event using logProcessor for consistent formatting
      const processedLog = processLogMessage(eventData);
 
      // Add to terminal logs for display
      setTerminalLogs(prev => [... prev, processedLog]);
 
      // ===========================================================================
      // VALIDATION MESSAGE HANDLING
      // ===========================================================================
      //
      // Check if this message is for our storage validation job
      // We look for the PRE_CHECK_COMPLETE event which contains validation results
      // ===========================================================================
 
      if (checkJobId && eventData.event_type === 'PRE_CHECK_COMPLETE') {
        console.log('✅ Received PRE_CHECK_COMPLETE event:', eventData);
 
        const validationData = eventData.data;
 
        if (validationData && typeof validationData. validation_passed === 'boolean') {
          // Extract validation result
          const validationPassed = validationData.validation_passed;
          const validationMessage = eventData.message || validationData.message;
 
          console.log(`Validation result: ${validationPassed ? 'PASSED' : 'FAILED'}`);
 
          // Update storage check state
          setStorageCheck({
            has_sufficient_space: validationPassed,
            message: validationMessage,
            required_mb: validationData.required_mb,
            available_mb: validationData.available_mb,
            best_filesystem: validationData. best_filesystem,
            recommendations: validationData.recommendations || []
          });
 
          // Clear checking state
          setIsCheckingStorage(false);
 
          // Handle validation failure
          if (!validationPassed) {
            setStorageCheckError(validationMessage);
 
            // Add error log to terminal
            setTerminalLogs(prev => [...prev, {
              id: `validation_failed_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'ERROR',
              message: validationMessage,
              isTechnical: false,
              originalEvent: eventData
            }]);
          } else {
            // Clear any previous error
            setStorageCheckError(null);
 
            // Add success log to terminal
            setTerminalLogs(prev => [...prev, {
              id: `validation_passed_${Date.now()}`,
              timestamp: new Date(). toLocaleTimeString(),
              type: 'SUCCESS',
              message: '✅ Storage validation passed - Ready to upload',
              isTechnical: false,
              originalEvent: eventData
            }]);
          }
        }
      }
 
      // ===========================================================================
      // UPLOAD MESSAGE HANDLING
      // ===========================================================================
      //
      // Check if this message is for our file upload job
      // Track progress updates and completion status
      // ===========================================================================
 
      if (uploadJobId) {
        // Handle progress updates
        if (eventData.event_type === 'PROGRESS_UPDATE' && eventData.data?. progress) {
          setUploadProgress(eventData.data.progress);
        }
 
        // Handle upload completion
        if (eventData. event_type === 'OPERATION_COMPLETE') {
          setIsUploading(false);
 
          const success = eventData.data?. success !== false && eventData.data?.status !== 'FAILED';
 
          if (success) {
            setUploadProgress(100);
            setUploadError(null);
 
            // Add success log
            setTerminalLogs(prev => [...prev, {
              id: `upload_success_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              type: 'SUCCESS',
              message: '✅ File uploaded successfully',
              isTechnical: false,
              originalEvent: eventData
            }]);
          } else {
            const errorMsg = eventData.message || eventData.data?.error || 'Upload failed';
            setUploadError(errorMsg);
 
            // Add error log
            setTerminalLogs(prev => [...prev, {
              id: `upload_failed_${Date.now()}`,
              timestamp: new Date(). toLocaleTimeString(),
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
        timestamp: new Date(). toLocaleTimeString(),
        type: 'ERROR',
        message: `Failed to parse message: ${err.message}`,
        isTechnical: true,
        originalEvent: { error: err. message }
      }]);
    }
  }, [lastMessage, checkJobId, uploadJobId]);
 
  // ===========================================================================
  // SECTION 8: AUTO-SCROLL TERMINAL
  // ===========================================================================
 
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);
 
  // ===========================================================================
  // SECTION 9: STORAGE VALIDATION FUNCTION
  // ===========================================================================
  //
  // This function triggers the storage validation workflow:
  //   1. Validate prerequisites (file, hostname, credentials)
  //   2. POST to validation endpoint with file_size
  //   3. Subscribe to WebSocket channel for results
  //   4. Update UI state to show "checking" status
  //
  // CRITICAL: This function now includes file_size in the request payload
  // This enables accurate validation based on actual file size requirements
  // ===========================================================================
 
  const startStorageCheck = async () => {
    console.log('🔍 Starting storage validation...');
 
    // Validate prerequisites
    if (!selectedFile) {
      console.warn('No file selected for validation');
      return;
    }
 
    if (!parameters.hostname || !parameters.username || !parameters. password) {
      console.warn('Missing required credentials for validation');
      return;
    }
 
    // Reset state
    setIsCheckingStorage(true);
    setStorageCheckError(null);
    setStorageCheck(null);
    setTerminalLogs([{
      id: 'validation_start',
      type: 'INFO',
      message: `🔍 Validating storage on ${parameters.hostname}... `,
      timestamp: new Date(). toLocaleTimeString(),
      isTechnical: false
    }]);
 
    try {
      // Build validation request payload
      // CRITICAL: Include file_size for accurate validation
      const payload = {
        hostname: parameters.hostname,
        username: parameters.username,
        password: parameters.password,
        tests: ["test_storage_check"],
        mode: "check",
        tag: "snap",
        file_size: selectedFile.size  // ✅ NEW: Send file size in bytes
      };
 
console.log('📤 Sending validation request:', {
        hostname: payload.hostname,
        file_size: payload.file_size,
        file_size_mb: (payload.file_size / (1024 * 1024)).toFixed(2),
        selectedFile: selectedFile,
        selectedFileSize: selectedFile ? selectedFile.size : 'NO FILE'
      });
 
      // Send POST request to validation endpoint
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
      console.log('✅ Validation job queued:', data);
 
      const { job_id, ws_channel } = data;
 
      // Store job ID for message filtering
      setCheckJobId(job_id);
 
      // Subscribe to WebSocket channel for real-time updates
      // Channel format: "job:jsnapy-UUID"
      // Rust Hub will add "ws_channel:" prefix internally
      if (ws_channel && isConnected) {
        console.log(`📡 Subscribing to validation channel: ${ws_channel}`);
        sendMessage({
          type: 'SUBSCRIBE',
          channel: ws_channel
        });
 
        setTerminalLogs(prev => [... prev, {
          id: 'validation_subscribed',
          type: 'INFO',
          message: `Subscribed to validation updates (${job_id})`,
          timestamp: new Date().toLocaleTimeString(),
          isTechnical: true
        }]);
      } else {
        console.error('❌ Cannot subscribe: WebSocket not connected');
        throw new Error('WebSocket not connected - cannot receive validation results');
      }
 
    } catch (error) {
      console. error('❌ Storage validation error:', error);
      setStorageCheckError(error.message);
      setIsCheckingStorage(false);
 
      setTerminalLogs(prev => [... prev, {
        id: 'validation_error',
        type: 'ERROR',
        message: `Validation failed: ${error.message}`,
        timestamp: new Date(). toLocaleTimeString(),
        isTechnical: false
      }]);
    }
  };
 
  // ===========================================================================
  // SECTION 10: AUTOMATIC VALIDATION TRIGGER (DEBOUNCED)
  // ===========================================================================
  //
  // This effect automatically triggers storage validation when:
  //   - User selects a file
  //   - User enters hostname and credentials
  //   - All required fields are filled
  //
  // Debouncing prevents excessive validation requests while user is typing.
  // ===========================================================================
 
  useEffect(() => {
    // Check if all required fields are present
    const isReady = selectedFile &&
                    parameters.hostname &&
                    parameters.username &&
                    parameters.password;
 
    if (isReady && ! isCheckingStorage && !storageCheck) {
      console.log('📋 All fields ready - scheduling automatic validation...');
 
      // Debounce: Wait for user to stop typing before validating
      const timer = setTimeout(() => {
        console.log('⏰ Debounce timer expired - triggering validation');
        startStorageCheck();
      }, VALIDATION_DEBOUNCE_DELAY);
 
      // Cleanup: Cancel timer if fields change before debounce completes
      return () => {
        console.log('🚫 Debounce timer cancelled - fields changed');
        clearTimeout(timer);
      };
    } else if (! isReady) {
      // If fields become incomplete, reset validation state
      setStorageCheck(null);
      setStorageCheckError(null);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);
 
  // ===========================================================================
  // SECTION 11: FILE UPLOAD FUNCTION
  // ===========================================================================
  //
  // This function handles the actual file upload after validation passes:
  //   1. Build FormData with file and parameters
  //   2. POST to upload endpoint
  //   3. Subscribe to upload WebSocket channel
  //   4.  Track progress and completion
  // ===========================================================================
 
  const handleUpload = async () => {
    console.log('📤 Starting file upload...');
 
    if (!selectedFile || !parameters.hostname || !parameters. username || !parameters.password) {
      console.error('Missing required fields for upload');
      return;
    }
 
    // Reset upload state
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setTerminalLogs(prev => [...prev, {
      id: 'upload_start',
      type: 'INFO',
      message: `📤 Starting upload of ${selectedFile.name} to ${parameters.hostname}...`,
      timestamp: new Date().toLocaleTimeString(),
      isTechnical: false
    }]);
 
    try {
      // Build multipart form data
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('hostname', parameters.hostname);
      formData.append('username', parameters.username);
      formData. append('password', parameters.password);
      formData.append('protocol', 'scp');
      formData.append('scriptId', `image_upload_${Date.now()}`);
      formData.append('wsClientId', 'web_client');
      formData.append('remote_filename', selectedFile.name);
 
      console.log('📤 Sending upload request.. .');
 
      // Send upload request
      const response = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
 
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload request failed: ${errorText}`);
      }
 
      const data = await response.json();
      console. log('✅ Upload job queued:', data);
 
      const { job_id, ws_channel } = data;
 
      // Store upload job ID
      setUploadJobId(job_id);
 
      // Subscribe to upload WebSocket channel
      if (ws_channel && isConnected) {
        console.log(`📡 Subscribing to upload channel: ${ws_channel}`);
        sendMessage({
          type: 'SUBSCRIBE',
          channel: ws_channel
        });
      }
 
    } catch (error) {
      console.error('❌ Upload error:', error);
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
  // SECTION 12: UI HELPER FUNCTIONS
  // ===========================================================================
 
  const getStorageStatusIcon = () => {
    if (isCheckingStorage) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
    }
    if (storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) {
      return <XCircle className="h-5 w-5 text-red-600" />;
    }
    if (storageCheck && storageCheck.has_sufficient_space) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
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
    if (isCheckingStorage) return 'border-blue-200 bg-blue-50';
    if (storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) {
      return 'border-red-200 bg-red-50';
    }
    if (storageCheck && storageCheck. has_sufficient_space) {
      return 'border-green-200 bg-green-50';
    }
    return 'border-gray-200 bg-gray-50';
  };
 
  const canUpload = () => {
    return selectedFile &&
           parameters.hostname &&
           parameters.username &&
           parameters.password &&
           storageCheck &&
           storageCheck.has_sufficient_space &&
           ! isCheckingStorage &&
           !isUploadingResolved;
  };
 
  // ===========================================================================
  // SECTION 13: RENDER UI
  // ===========================================================================
 
  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
 
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Image Upload</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload firmware images and configuration files to Juniper devices
          </p>
        </div>
 
        {/* WebSocket Connection Status */}
        <Badge variant={isConnected ? "success" : "destructive"}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Badge>
      </div>
 
      <Separator />
 
      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 
        {/* LEFT COLUMN: Configuration */}
        <div className="space-y-6">
 
          {/* FILE SELECTION */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                File Selection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FileSelection
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                isRunning={isRunning || isUploadingResolved}
              />
            </CardContent>
          </Card>
 
          {/* DEVICE CONFIGURATION */}
          <Card>
            <CardHeader>
              <CardTitle>Device Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
 
          {/* STORAGE VALIDATION STATUS */}
          <Card className={`border-2 ${getStorageStatusColor()}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getStorageStatusIcon()}
                Storage Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{getStorageStatusText()}</span>
                {isCheckingStorage && (
                  <Badge variant="outline" className="text-blue-600">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Checking...
                  </Badge>
                )}
              </div>
 
              {/* Storage Check Result Details */}
              {storageCheck && (
                <div className="space-y-2 text-sm">
                  {storageCheck.has_sufficient_space ?  (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        <div className="font-medium mb-1">✅ Storage Check Passed</div>
                        {storageCheck.required_mb && storageCheck.available_mb && (
                          <div className="text-xs space-y-1">
                            <div>Required: {storageCheck.required_mb. toFixed(2)} MB</div>
                            <div>Available: {storageCheck.available_mb.toFixed(2)} MB</div>
                            {storageCheck.best_filesystem && (
                              <div>Filesystem: {storageCheck.best_filesystem['mounted-on']}</div>
                            )}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="bg-red-50 border-red-200">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        <div className="font-medium mb-1">❌ Insufficient Storage</div>
                        {storageCheck.message && (
                          <div className="text-xs whitespace-pre-wrap">{storageCheck.message}</div>
                        )}
                        {storageCheck.recommendations && storageCheck.recommendations.length > 0 && (
                          <div className="mt-2 text-xs space-y-1">
                            <div className="font-semibold">Recommendations:</div>
                            {storageCheck. recommendations.map((rec, idx) => (
                              <div key={idx}>• {rec}</div>
                            ))}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
 
              {/* Storage Check Error */}
              {storageCheckError && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {storageCheckError}
                  </AlertDescription>
                </Alert>
              )}
 
              {/* Manual Retry Button */}
              {(storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) && (
                <Button
                  onClick={startStorageCheck}
                  disabled={isCheckingStorage}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {isCheckingStorage ?  (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rechecking...
                    </>
                  ) : (
                    'Retry Validation'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
 
          {/* UPLOAD BUTTON */}
          <Button
            onClick={handleUpload}
            disabled={!canUpload()}
            className="w-full"
            size="lg"
          >
            {isUploadingResolved ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Uploading...  {uploadProgressResolved. toFixed(0)}%
              </>
            ) : (
              <>
                <Upload className="mr-2 h-5 w-5" />
                Upload File
              </>
            )}
          </Button>
 
          {/* Upload Progress Bar */}
          {isUploadingResolved && uploadProgressResolved > 0 && (
            <div className="space-y-2">
              <Progress value={uploadProgressResolved} className="w-full" />
              <p className="text-xs text-center text-gray-600">
                {uploadProgressResolved.toFixed(1)}% complete
              </p>
            </div>
          )}
 
          {/* Upload Error */}
          {uploadError && (
            <Alert className="bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {uploadError}
              </AlertDescription>
            </Alert>
          )}
        </div>
 
        {/* RIGHT COLUMN: Live Terminal */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Live Execution Log
                </CardTitle>
 
                {/* Debug Mode Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
                >
                  {showTechnicalLogs ? '🔧 Debug: ON' : '🔧 Debug: OFF'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <LiveLogViewer
                logs={terminalLogs}
                isConnected={isConnected}
                height="h-[600px]"
                showTechnical={showTechnicalLogs}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
