/**
 * =============================================================================
 * IMAGE UPLOADER FORM COMPONENT
 * =============================================================================
 * A highly interactive and visually appealing form component for image uploads.
 * Provides a complete UI for file selection (via drag-and-drop or browsing),
 * device targeting, authentication, and initiating the upload process.
 * * @version 2.9.2 - FIXED FINAL SUCCESS PAYLOAD FILTERING
 * @last_updated 2025-10-26
 * =============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ArrowRight, Loader2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Shared components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

// WebSocket configuration (same as Templates component)
const WS_BASE = 'ws://localhost:3100/ws';

/**
 * Image Uploader Form Component
 * Handles image file selection and device configuration with real-time progress tracking
 */
export default function ImageUploader({
  // Optional props - component works without them
  parameters: externalParameters,
  onParamChange: externalOnParamChange,
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  onUpload, // Parent can still override if needed
  isRunning = false,
  isUploading: externalIsUploading,
  uploadProgress: externalUploadProgress
}) {
  // =========================================================================
  // 🧠 COMPLETE STATE MANAGEMENT - Standalone version
  // =========================================================================
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '',
    inventory_file: '',
    username: '',
    password: ''
  });
  // State for the upload process
  const [internalIsUploading, setInternalIsUploading] = useState(false);
  const [internalUploadProgress, setInternalUploadProgress] = useState(0);
  // Final result object (success/fail, message, job ID, etc.)
  const [uploadResult, setUploadResult] = useState(null);
  // Detailed message for the current step in the process
  const [currentStep, setCurrentStep] = useState('');
  // WebSocket status for UI icon
  const [wsStatus, setWsStatus] = useState('disconnected'); // disconnected, connecting, connected, error

  // WebSocket reference (using same pattern as Templates)
  const websocketRef = useRef(null);
  const jobIdRef = useRef(null);
  // Critical flag to prevent race conditions when manually closing the connection
  const intendedCloseRef = useRef(false);

  // =========================================================================
  // 🔄 STATE RESOLUTION - Use external props if provided, otherwise internal state
  // =========================================================================
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploading = externalIsUploading !== undefined ? externalIsUploading : internalIsUploading;
  const uploadProgress = externalUploadProgress !== undefined ? externalUploadProgress : internalUploadProgress;

  // Determine which state setters to use
  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // =========================================================================
  // 🧹 CLEANUP EFFECT - Close WebSocket on unmount
  // =========================================================================
  useEffect(() => {
    return () => {
      if (websocketRef.current) {
        intendedCloseRef.current = true;
        websocketRef.current.close(1000, 'Component unmounting');
        console.log('[IMAGE UPLOADER] WebSocket connection cleaned up');
      }
    };
  }, []);

  // =========================================================================
  // 📡 WEB SOCKET INTEGRATION - USING PROVEN TEMPLATES PATTERN
  // =========================================================================
  const connectToWebSocket = (wsChannel, jobId) => {
    // Clean up any existing connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'New connection requested');
    }

    jobIdRef.current = jobId;
    intendedCloseRef.current = false;

    console.log(`[IMAGE UPLOADER] Establishing WebSocket connection for channel: ${wsChannel}`);

    try {
      // Use the same WebSocket base as the working Templates component
      const ws = new WebSocket(`${WS_BASE}`);
      websocketRef.current = ws;
      setWsStatus('connecting');

      ws.onopen = () => {
        console.log(`[IMAGE UPLOADER] WebSocket connected successfully`);
        setWsStatus('connected');

        // 🔑 CRITICAL: Send SUBSCRIBE command exactly like Templates component
        const subscribeCommand = {
          type: 'SUBSCRIBE',
          channel: wsChannel
        };
        ws.send(JSON.stringify(subscribeCommand));

        // Update the queue step to COMPLETE after connection is established
        setCurrentStep('Real-time connection established ✓');
        console.log(`[IMAGE UPLOADER] Subscribed to job channel: ${wsChannel}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[IMAGE UPLOADER] WebSocket message received:', data);

          // Process WebSocket messages using the same pattern as Templates
          handleWebSocketMessage(data);

        } catch (error) {
          console.error('[IMAGE UPLOADER] Error parsing WebSocket message:', error, 'Raw message:', event.data);
        }
      };

      ws.onclose = (event) => {
        console.log(`[IMAGE UPLOADER] WebSocket connection closed:`, event.code, event.reason);
        setWsStatus('disconnected');

        // Only treat as error if closure wasn't intended
        if (!intendedCloseRef.current) {
          console.warn('[IMAGE UPLOADER] WebSocket closed unexpectedly');
          setCurrentStep('Connection lost - progress updates unavailable');
        }
      };

      ws.onerror = (error) => {
        console.error('[IMAGE UPLOADER] WebSocket error:', error);
        setWsStatus('error');
        setCurrentStep('WebSocket connection error');
      };

    } catch (error) {
      console.error('[IMAGE UPLOADER] Failed to create WebSocket connection:', error);
      setWsStatus('error');
      setCurrentStep('Failed to establish progress tracking');
    }
  };

  // =========================================================================
  // 📨 WEB SOCKET MESSAGE HANDLER - FIXED FINAL SUCCESS FILTERING
  // =========================================================================
  const handleWebSocketMessage = (data) => {
    // 1. Extract and normalize the event payload
    const { payload: finalPayload, isNested } = extractNestedProgressData(data);

    // 🎯 CRITICAL FIX: The final success payload is nested and lacks an 'event_type'.
    // Check for the nested success condition BEFORE the event_type filter.
    if (isNested && finalPayload.success === true) {
      console.log('[IMAGE UPLOADER] Final success payload (nested) detected and processed.');
      setInternalUploadProgress(100);
      setCurrentStep('Upload completed successfully!');
      setInternalIsUploading(false); // Stop the spinner

      // Update result for the final success card
      setUploadResult({
        success: true,
        completed: true,
        // Use the details from the nested payload
        finalMessage: finalPayload.details?.summary || 'File uploaded and verified successfully!',
        deviceInfo: finalPayload.details?.device_info,
        jobId: jobIdRef.current, // Use the stored job ID
      });

      // Close connection as job is finished
      intendedCloseRef.current = true;
      if (websocketRef.current) websocketRef.current.close();
      return; // Job is complete, stop processing all other logic
    }

    // 2. Filter out non-actionable payloads (e.g., raw STDERR, or payloads without event_type)
    if (!finalPayload || !finalPayload.event_type) {
      // This now only filters out raw, non-JSON error messages or other unexpected formats
      return;
    }

    console.log('[IMAGE UPLOADER] Processing WebSocket event:', finalPayload.event_type);

    switch (finalPayload.event_type) {
      case 'OPERATION_START':
        setCurrentStep('Starting upload process...');
        break;

      case 'STEP_START':
        setCurrentStep(finalPayload.message);
        break;

      case 'STEP_COMPLETE':
        setCurrentStep(`${finalPayload.message} ✓`);
        break;

      case 'PROGRESS_UPDATE':
        if (finalPayload.data && finalPayload.data.progress !== undefined) {
          setInternalUploadProgress(finalPayload.data.progress);
        }
        setCurrentStep(finalPayload.message || 'Uploading file...');
        break;

      case 'ORCHESTRATOR_LOG':
        // All nested success messages are handled at the top. This handles other nested logs.
        if (isNested) {
          console.log('[IMAGE UPLOADER] Processing nested (non-success) progress event log.');
          // Note: If the inner message had an event_type (e.g., STEP_COMPLETE), 
          // it would have been processed above the switch statement as the primary payload.
        }
        break;

      case 'UPLOAD_COMPLETE': // Fall-through case
      case 'OPERATION_COMPLETE':
        if (finalPayload.success) {
          setInternalUploadProgress(100);
          setCurrentStep('Operation completed successfully!');
          setInternalIsUploading(false);

          setUploadResult(prev => ({
            ...prev,
            success: true,
            completed: true,
            finalMessage: finalPayload.details?.summary || 'Operation completed successfully!',
            deviceInfo: finalPayload.details?.device_info
          }));

          intendedCloseRef.current = true;
          if (websocketRef.current) websocketRef.current.close();
        } else {
          // Handle failure case
          setInternalIsUploading(false);
          setCurrentStep(`Operation failed: ${finalPayload.message}`);
          setUploadResult({
            success: false,
            error: finalPayload.message,
            completed: true
          });
          intendedCloseRef.current = true;
          if (websocketRef.current) websocketRef.current.close();
        }
        break;

      case 'ERROR':
      case 'UPLOAD_FAILED':
        setInternalIsUploading(false);
        setCurrentStep(`Upload failed: ${finalPayload.message || finalPayload.error}`);
        setUploadResult({
          success: false,
          error: finalPayload.message || finalPayload.error,
          completed: true
        });
        intendedCloseRef.current = true;
        if (websocketRef.current) websocketRef.current.close();
        console.error('[IMAGE UPLOADER] Upload failed via WebSocket:', finalPayload);
        break;

      default:
        console.log('[IMAGE UPLOADER] Unknown WebSocket event:', finalPayload.event_type);
    }
  };

  // =========================================================================
  // 🔄 NESTED PROGRESS DATA EXTRACTION (SAME AS TEMPLATES COMPONENT)
  // =========================================================================
  const extractNestedProgressData = (initialParsed) => {
    let currentPayload = initialParsed;
    let deepestNestedData = null;
    let isNested = false;

    // Check if the primary payload has a 'data' field that is a JSON string
    if (initialParsed.data) {
      try {
        const dataPayload = typeof initialParsed.data === 'string'
          ? JSON.parse(initialParsed.data)
          : initialParsed.data;

        currentPayload = dataPayload;

        // Handle ORCHESTRATOR_LOG messages with nested JSON in the 'message' field
        if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
          const message = dataPayload.message;
          // Regex to extract JSON from [STDOUT] or [STDERR] wrapper
          const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);

          if (jsonMatch && jsonMatch[2]) {
            try {
              deepestNestedData = JSON.parse(jsonMatch[2]);
              isNested = true; // Mark as nested content
            } catch {
              console.warn('[IMAGE UPLOADER] Failed to parse nested JSON:', jsonMatch[2].substring(0, 200));
            }
          }
        }
      } catch (error) {
        // If initialParsed.data is a string but not JSON, we ignore it and use the original payload
        console.warn('[IMAGE UPLOADER] Failed to parse data field:', error.message);
      }
    } else {
      // Handle the Rust Orchestrator log structure which puts the nested message in 'message' field
      if (currentPayload.event_type === "ORCHESTRATOR_LOG" && currentPayload.message) {
        const message = currentPayload.message;
        // Regex to extract JSON from [STDOUT] or [STDERR] wrapper
        const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);

        if (jsonMatch && jsonMatch[2]) {
          try {
            deepestNestedData = JSON.parse(jsonMatch[2]);
            isNested = true;
          } catch {
            console.warn('[IMAGE UPLOADER] Failed to parse nested JSON in message field:', jsonMatch[2].substring(0, 200));
          }
        }
      }
    }

    return {
      payload: deepestNestedData || currentPayload,
      isNested: isNested
    };
  };

  // =========================================================================
  // 🎯 FASTAPI UPLOAD HANDLER
  // =========================================================================
  const uploadToFastAPI = async () => {
    if (!isFormValid || !selectedFile) {
      console.error('[IMAGE UPLOADER] Cannot upload: Form invalid or no file selected');
      return;
    }

    // Reset previous results and states
    setUploadResult(null);
    setInternalIsUploading(true);
    setInternalUploadProgress(0);
    setCurrentStep('Initializing upload...');
    setWsStatus('disconnected');

    // Close any existing WebSocket connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'New upload starting');
      websocketRef.current = null;
    }

    try {
      console.log('[IMAGE UPLOADER] Starting file upload to FastAPI...');

      // Create FormData for multipart/form-data request
      const formData = new FormData();

      // 🔑 Append the file ONLY ONCE as File object
      formData.append('file', selectedFile);

      // Device configuration parameters
      if (parameters.hostname) {
        formData.append('hostname', parameters.hostname);
      }
      if (parameters.inventory_file) {
        formData.append('inventory_file', parameters.inventory_file);
      }
      formData.append('username', parameters.username);
      formData.append('password', parameters.password);
      formData.append('protocol', 'scp');

      // Use original filename as remote_filename
      const remoteFilename = selectedFile.name;
      formData.append('remote_filename', remoteFilename);

      // Generate required parameters with correct camelCase names
      const runId = `image_upload_${Date.now()}`;
      const scriptId = `image_upload_${Date.now()}`;
      const wsClientId = `ws_${Date.now()}`;

      // Add required parameters for backend (camelCase)
      formData.append('run_id', runId);
      formData.append('mode', 'cli');

      // 🔑 Use camelCase for required backend parameters
      formData.append('scriptId', scriptId); // camelCase - required by backend
      formData.append('wsClientId', wsClientId); // camelCase - required by backend

      console.log('[IMAGE UPLOADER] Sending upload request with backend-compatible parameters:', {
        file: selectedFile.name,
        hostname: parameters.hostname,
        username: parameters.username,
        remoteFilename: remoteFilename,
        scriptId, // camelCase
        wsClientId, // camelCase
        runId,
        mode: 'cli'
      });

      // 🎯 CALL FASTAPI UPLOAD ENDPOINT
      const response = await fetch('http://localhost:8000/api/files/upload', {
        method: 'POST',
        body: formData,
        // Note: Don't set Content-Type header - browser will set it with boundary for FormData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('[IMAGE UPLOADER] FastAPI response:', result);

      // Handle successful job queuing
      if (result.job_id && result.ws_channel) {
        console.log(`[IMAGE UPLOADER] Upload job queued successfully. Job ID: ${result.job_id}`);

        // Store the initial result for display
        setUploadResult({
          success: true,
          jobId: result.job_id,
          message: result.message,
          wsChannel: result.ws_channel,
          completed: false
        });

        // 🎯 CONNECT TO WEB SOCKET FOR REAL-TIME PROGRESS TRACKING
        setCurrentStep('Connecting to progress tracker...');
        connectToWebSocket(result.ws_channel, result.job_id);

      } else {
        throw new Error('Invalid response from server: missing job_id or ws_channel');
      }

    } catch (error) {
      console.error('[IMAGE UPLOADER] Upload failed:', error);

      // Set error result
      setUploadResult({
        success: false,
        error: error.message,
        completed: true
      });

      // Reset uploading state on error
      setInternalIsUploading(false);
      setInternalUploadProgress(0);
      setCurrentStep('');
    }
  };

  // =========================================================================
  // 🎯 UPLOAD HANDLER - DECIDES WHICH UPLOAD METHOD TO USE
  // =========================================================================
  const handleUpload = () => {
    if (!isFormValid) {
      console.warn('[IMAGE UPLOADER] Form validation failed, cannot upload');
      return;
    }

    if (onUpload) {
      // If parent provided onUpload, use it (allows parent to override)
      console.log('[IMAGE UPLOADER] Calling parent onUpload handler');
      onUpload();
    } else {
      // Use the built-in FastAPI upload handler
      console.log('[IMAGE UPLOADER] Using built-in FastAPI upload handler');
      uploadToFastAPI();
    }
  };

  // =========================================================================
  // 🧹 RESET HANDLER
  // =========================================================================
  const handleReset = () => {
    // Close WebSocket connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'User reset');
      websocketRef.current = null;
    }

    // Reset all states
    setSelectedFile(null);
    setUploadResult(null);
    setInternalUploadProgress(0);
    setInternalIsUploading(false);
    setCurrentStep('');
    setWsStatus('disconnected');
    jobIdRef.current = null;
    intendedCloseRef.current = false;
  };

  // =========================================================================
  // 🧩 VALIDATION
  // =========================================================================
  const isFormValid =
    selectedFile &&
    parameters?.username?.trim() &&
    parameters?.password?.trim() &&
    (parameters?.hostname?.trim() || parameters?.inventory_file?.trim());

  // =========================================================================
  // 🎨 UI RENDER
  // =========================================================================
  const getWsStatusIcon = () => {
    switch (wsStatus) {
      case 'connected': return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'error': return <WifiOff className="h-4 w-4 text-red-500" />;
      default: return <WifiOff className="h-4 w-4 text-gray-400" />;
    }
  };

  const getWsStatusText = () => {
    switch (wsStatus) {
      case 'connected': return 'Live updates connected';
      case 'connecting': return 'Connecting to updates...';
      case 'error': return 'Updates unavailable';
      default: return 'Updates disconnected';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ------------------------------------------------------------------ */}
        {/* FILE SELECTION CARD - Using Shared Component (HAS ITS OWN PROGRESS BAR) */}
        {/* ------------------------------------------------------------------ */}
        <FileSelection
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          isRunning={isRunning}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          title="File Selection"
          description="Choose a file to upload to your network device"
          acceptText="Supports common file formats (TXT, BIN, IMG, CONF, etc.)"
        />

        {/* ------------------------------------------------------------------ */}
        {/* DEVICE CONFIGURATION CARD */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle>Device Configuration</CardTitle>
            <CardDescription>
              Target device and authentication settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* REAL-TIME STATUS DISPLAY - CLEAN VERSION WITHOUT DUPLICATE PROGRESS BARS */}
      {/* ------------------------------------------------------------------ */}
      {isUploading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Upload in Progress
              <div className="flex items-center gap-1 ml-auto text-sm font-normal">
                {getWsStatusIcon()}
                <span className={
                  wsStatus === 'connected' ? 'text-green-600' :
                    wsStatus === 'error' ? 'text-red-600' :
                      'text-blue-600'
                }>
                  {getWsStatusText()}
                </span>
              </div>
            </CardTitle>
            <CardDescription>
              {currentStep || 'Processing your upload...'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Current Status</p>
                  <p className="text-sm text-gray-600 mt-1">{currentStep || 'Initializing...'}</p>
                </div>
                {wsStatus === 'connected' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-100 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-green-700">Live</span>
                  </div>
                )}
              </div>

              {/* Only show file transfer progress if we have actual progress from hardware */}
              {uploadProgress > 0 && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-blue-800">File Transfer</span>
                    <span className="text-blue-700">{uploadProgress?.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* UPLOAD RESULT DISPLAY */}
      {/* ------------------------------------------------------------------ */}
      {uploadResult && !isUploading && (
        <Card className={
          uploadResult.success
            ? uploadResult.completed
              ? "border-green-200 bg-green-50"
              : "border-blue-200 bg-blue-50"
            : "border-red-200 bg-red-50"
        }>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {uploadResult.success ? (
                uploadResult.completed ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-green-800">Upload Completed Successfully!</h4>
                      <p className="text-sm text-green-700 mt-1">{uploadResult.finalMessage}</p>
                      {uploadResult.deviceInfo && (
                        <div className="mt-2 p-2 bg-green-100 rounded text-xs">
                          <p><strong>Device:</strong> {uploadResult.deviceInfo.hostname}</p>
                          <p><strong>Model:</strong> {uploadResult.deviceInfo.model}</p>
                          <p><strong>Version:</strong> {uploadResult.deviceInfo.version}</p>
                        </div>
                      )}
                      <p className="text-xs text-green-600 mt-2">Job ID: {uploadResult.jobId}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-6 w-6 text-blue-600 animate-spin mt-0.5" />
                    <div>
                      <h4 className="text-lg font-semibold text-blue-800">Upload Queued Successfully!</h4>
                      <p className="text-sm text-blue-700">{uploadResult.message}</p>
                      <p className="text-xs text-blue-600 mt-1">Job ID: {uploadResult.jobId}</p>
                      <p className="text-xs text-blue-600">WebSocket Channel: {uploadResult.wsChannel}</p>
                      <p className="text-xs text-blue-500 mt-2">ⓘ Monitoring progress via WebSocket...</p>
                    </div>
                  </>
                )
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="text-lg font-semibold text-red-800">Upload Failed</h4>
                    <p className="text-sm text-red-700">{uploadResult.error}</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* UPLOAD ACTION CARD */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="text-lg font-semibold mb-2">Ready to Upload</h4>
              <div className="space-y-1 text-sm text-gray-600">
                {selectedFile && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-gray-500">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </p>
                )}
                {parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Device: {parameters.hostname}</span>
                  </p>
                )}
                {parameters?.inventory_file && !parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Inventory File: {parameters.inventory_file}</span>
                  </p>
                )}
                {!isFormValid && (
                  <p className="text-orange-600 text-sm whitespace-pre-line">
                    {!selectedFile && '• Select a file to upload\n'}
                    {!parameters?.hostname && !parameters?.inventory_file && '• Configure device target\n'}
                    {(!parameters?.username || !parameters?.password) && '• Provide authentication credentials'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {uploadResult && (
                <Button
                  onClick={handleReset}
                  variant="outline"
                  disabled={isUploading}
                >
                  Upload Another File
                </Button>
              )}
              <Button
                onClick={handleUpload}
                disabled={isRunning || isUploading || !isFormValid}
                size="lg"
                className="w-full sm:w-auto"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading... {uploadProgress?.toFixed(0) || 0}%
                  </>
                ) : (
                  <>
                    Upload File
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
