/**
 * =============================================================================
 * IMAGE UPLOADER FORM COMPONENT
 * =============================================================================
 * A highly interactive and visually appealing form component for image uploads.
 * Provides a complete UI for file selection (via drag-and-drop or browsing),
 * device targeting, authentication, and initiating the upload process.
 * 
 * @version 2.9.7 - FIXED SUCCESS MESSAGE HANDLING
 * @last_updated 2025-10-27
 * 
 * BUG FIXES:
 * - Fixed WebSocket message parsing for success cases
 * - Added direct success message handling alongside nested messages
 * - Improved OPERATION_COMPLETE event handling
 * - Enhanced debugging capabilities
 * =============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ArrowRight, Loader2, AlertCircle, Wifi, WifiOff, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Shared components - Ensure these files exist and are correctly structured
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

// WebSocket configuration (Must match your backend WS server address)
const WS_BASE = 'ws://localhost:3100/ws';

/**
 * Image Uploader Form Component
 * Handles image file selection and device configuration with real-time progress tracking
 */
export default function ImageUploader({
  // Props for external control (if integrated into a larger system)
  parameters: externalParameters,
  onParamChange: externalOnParamChange,
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  onUpload,
  isRunning = false,
  isUploading: externalIsUploading,
  uploadProgress: externalUploadProgress
}) {
  // =========================================================================
  // 🧠 COMPLETE STATE MANAGEMENT - Internal state for standalone operation
  // =========================================================================
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '',
    inventory_file: '',
    username: '',
    password: ''
  });
  const [internalIsUploading, setInternalIsUploading] = useState(false);
  const [internalUploadProgress, setInternalUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null); // Final result (success/fail)
  const [currentStep, setCurrentStep] = useState(''); // Detailed message for current process step
  const [wsStatus, setWsStatus] = useState('disconnected'); // WebSocket status indicator
  const [storageCheck, setStorageCheck] = useState(null); // Storage check results
  const [isCheckingStorage, setIsCheckingStorage] = useState(false); // Storage check in progress

  // WebSocket references
  const websocketRef = useRef(null);
  const jobIdRef = useRef(null);
  // Flag to manage intentional closure vs. unexpected disconnection
  const intendedCloseRef = useRef(false);

  // =========================================================================
  // 🔄 STATE RESOLUTION - Prioritize external props over internal state
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
  // 🧹 CLEANUP EFFECT - Closes WebSocket when the component unmounts
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
  // 💾 STORAGE CHECK FUNCTIONS
  // =========================================================================
  const checkDeviceStorage = async () => {
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) {
      return { hasSufficientSpace: true, skipped: true }; // Skip check if missing info
    }

    setIsCheckingStorage(true);
    setCurrentStep('Checking device storage availability...');

    try {
      const response = await fetch('http://localhost:8000/api/device/check-storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          hostname: parameters.hostname,
          username: parameters.username,
          password: parameters.password,
          required_space: selectedFile.size.toString(),
          filesystem: '/'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Storage check failed: ${errorText}`);
      }

      const result = await response.json();
      setStorageCheck(result);

      if (result.has_sufficient_space) {
        setCurrentStep('✅ Sufficient storage space available');
        return { hasSufficientSpace: true, data: result };
      } else {
        setCurrentStep('❌ Insufficient storage space on device');
        return { hasSufficientSpace: false, data: result };
      }

    } catch (error) {
      console.warn('Storage check failed, proceeding with upload:', error);
      setCurrentStep('⚠️ Storage check skipped - proceeding with upload');
      return { hasSufficientSpace: true, skipped: true, error: error.message };
    } finally {
      setIsCheckingStorage(false);
    }
  };

  // Auto-check storage when file and device info are available
  useEffect(() => {
    if (selectedFile && parameters.hostname && parameters.username && parameters.password) {
      const timer = setTimeout(() => {
        checkDeviceStorage();
      }, 1000); // Delay to avoid excessive checks

      return () => clearTimeout(timer);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);

  // =========================================================================
  // 📡 WEB SOCKET INTEGRATION - Handles real-time communication for progress
  // =========================================================================
  const connectToWebSocket = (wsChannel, jobId) => {
    // 1. Cleanup previous connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'New connection requested');
    }

    jobIdRef.current = jobId;
    intendedCloseRef.current = false;
    setWsStatus('connecting');

    try {
      const ws = new WebSocket(`${WS_BASE}`);
      websocketRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        // Subscribe to the specific job channel
        const subscribeCommand = { type: 'SUBSCRIBE', channel: wsChannel };
        ws.send(JSON.stringify(subscribeCommand));
        setCurrentStep('Real-time connection established ✓');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('[IMAGE UPLOADER] Error parsing WebSocket message:', error, 'Raw message:', event.data);
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
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
  // 🐛 DEBUG HELPER - Temporary function to diagnose WebSocket messages
  // =========================================================================
  const debugWebSocketMessage = (data, finalPayload, isNested) => {
    console.log('🔍 RAW WebSocket message:', data);
    console.log('🔍 Processed payload:', finalPayload);
    console.log('🔍 Is nested:', isNested);
    console.log('🔍 Has success:', finalPayload.success);
    console.log('🔍 Event type:', finalPayload.event_type);
    console.log('🔍 Has details:', !!finalPayload.details);
  };

  // =========================================================================
  // 📨 WEB SOCKET MESSAGE HANDLER - COMPREHENSIVE FIX FOR SUCCESS HANDLING
  // =========================================================================
  const handleWebSocketMessage = (data) => {
    // 1. Extract and normalize the event payload (handles nested logs)
    const { payload: finalPayload, isNested } = extractNestedProgressData(data);

    // 🐛 TEMPORARY DEBUG - Uncomment to see what messages are being received
    // debugWebSocketMessage(data, finalPayload, isNested);

    // =======================================================================
    // 🎯 CRITICAL FIX: SUCCESS MESSAGE HANDLING
    // =======================================================================

    // 2A. Handle nested success messages (wrapped in ORCHESTRATOR_LOG)
    if (isNested && finalPayload.success === true) {
      console.log('✅ Handling nested success message');
      setInternalUploadProgress(100);
      setCurrentStep('Upload completed successfully!');
      setInternalIsUploading(false);

      setUploadResult({
        success: true,
        completed: true,
        finalMessage: finalPayload.details?.summary || 'File uploaded successfully!',
        deviceInfo: finalPayload.details?.device_info,
        jobId: jobIdRef.current,
      });

      intendedCloseRef.current = true;
      if (websocketRef.current) websocketRef.current.close();
      return;
    }

    // 2B. Handle direct success messages (not nested)
    if (finalPayload.success === true && finalPayload.details) {
      console.log('✅ Handling direct success message');
      setInternalUploadProgress(100);
      setCurrentStep('Upload completed successfully!');
      setInternalIsUploading(false);

      setUploadResult({
        success: true,
        completed: true,
        finalMessage: finalPayload.details.summary || 'File uploaded successfully!',
        deviceInfo: finalPayload.details.device_info,
        jobId: jobIdRef.current,
      });

      intendedCloseRef.current = true;
      if (websocketRef.current) websocketRef.current.close();
      return;
    }

    // =======================================================================
    // 📊 PROGRESS HANDLING
    // =======================================================================

    // 3. CORE FIX: Robust Progress Value Extraction and Conversion
    let rawProgressValue = finalPayload?.data?.progress; // 1st Check: Standard nested location

    if (rawProgressValue === undefined) {
      rawProgressValue = finalPayload?.progress; // 2nd Check: Root of nested payload
    }

    if (rawProgressValue === undefined && data.progress !== undefined) {
      rawProgressValue = data.progress; // 3rd Check: Original top-level message
    }

    if (rawProgressValue !== undefined) {
      // Convert to number and clamp between 0-100
      const progressValue = Math.max(0, Math.min(100, parseFloat(rawProgressValue)));

      if (!isNaN(progressValue)) {
        setInternalUploadProgress(progressValue);

        // Update step message based on payload content or progress
        const message = finalPayload.message || (progressValue < 100 ? 'Uploading file...' : 'File transfer complete.');
        setCurrentStep(message);
      }
    }

    // =======================================================================
    // 🎭 EVENT TYPE HANDLING
    // =======================================================================

    // 4. Filter out non-actionable payloads
    if (!finalPayload || !finalPayload.event_type) {
      return;
    }

    // 5. Handle all other event types
    switch (finalPayload.event_type) {
      case 'OPERATION_START': {
        setCurrentStep('Starting upload process...');
        break;
      }

      case 'STEP_START':
      case 'STEP_COMPLETE': {
        // Only update step if we didn't just update with progress message
        if (!rawProgressValue) {
          setCurrentStep(`${finalPayload.message} ${finalPayload.event_type === 'STEP_COMPLETE' ? '✓' : ''}`);
        }
        break;
      }

      case 'UPLOAD_COMPLETE': {
        setCurrentStep('File transfer completed successfully');
        // Don't set success here - wait for OPERATION_COMPLETE or success payload
        break;
      }

      case 'OPERATION_COMPLETE': {
        console.log('🔔 OPERATION_COMPLETE received:', finalPayload);
        if (finalPayload.success) {
          setInternalUploadProgress(100);
          setInternalIsUploading(false);
          setCurrentStep('Operation completed successfully!');
          setUploadResult({
            success: true,
            completed: true,
            finalMessage: 'File uploaded successfully!',
            jobId: jobIdRef.current,
          });
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
      }

      case 'ERROR':
      case 'UPLOAD_FAILED': {
        setInternalIsUploading(false);

        // Check for disk space errors specifically
        const errorMessage = finalPayload.message || finalPayload.error || '';
        if (errorMessage.includes('Insufficient space') || errorMessage.includes('disk space')) {
          setCurrentStep('Upload failed: Insufficient disk space on target device');
          setUploadResult({
            success: false,
            error: 'Device has insufficient disk space. Please free up space and try again.',
            completed: true
          });
        } else {
          setCurrentStep(`Upload failed: ${errorMessage}`);
          setUploadResult({
            success: false,
            error: errorMessage,
            completed: true
          });
        }

        intendedCloseRef.current = true;
        if (websocketRef.current) websocketRef.current.close();
        break;
      }

      default: {
        // Ignore other non-critical log types
        break;
      }
    }
  };

  // =========================================================================
  // 🔄 NESTED PROGRESS DATA EXTRACTION - Safely parses embedded JSON data
  // =========================================================================
  const extractNestedProgressData = (initialParsed) => {
    let currentPayload = initialParsed;
    let deepestNestedData = null;
    let isNested = false;

    // Check for nested data in the 'data' field (common for queue messages)
    if (initialParsed.data) {
      try {
        const dataPayload = typeof initialParsed.data === 'string'
          ? JSON.parse(initialParsed.data)
          : initialParsed.data;
        currentPayload = dataPayload;

        // Check for double-nested data inside ORCHESTRATOR_LOG messages
        if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
          const jsonMatch = dataPayload.message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);
          if (jsonMatch && jsonMatch[2]) {
            try {
              deepestNestedData = JSON.parse(jsonMatch[2]);
              isNested = true;
            } catch (parseError) {
              console.debug('[IMAGE UPLOADER] Failed to parse nested JSON:', parseError);
            }
          }
        }
      } catch (error) {
        console.debug('[IMAGE UPLOADER] Data field is not valid JSON:', error);
      }
    } else {
      // Check for nested data in the 'message' field (common for worker logs)
      if (currentPayload.event_type === "ORCHESTRATOR_LOG" && currentPayload.message) {
        const jsonMatch = currentPayload.message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);
        if (jsonMatch && jsonMatch[2]) {
          try {
            deepestNestedData = JSON.parse(jsonMatch[2]);
            isNested = true;
          } catch (parseError) {
            console.debug('[IMAGE UPLOADER] Failed to parse nested JSON from message:', parseError);
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
  // 🎯 FASTAPI UPLOAD HANDLER - Submits the file and job metadata
  // =========================================================================
  const uploadToFastAPI = async () => {
    if (!isFormValid || !selectedFile) return;

    // Reset states before starting a new job
    setUploadResult(null);
    setInternalIsUploading(true);
    setInternalUploadProgress(0);
    setCurrentStep('Initializing upload...');
    setWsStatus('disconnected');

    // Close any prior WebSocket connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'New upload starting');
    }

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Append all necessary device and auth parameters
      if (parameters.hostname) formData.append('hostname', parameters.hostname);
      if (parameters.inventory_file) formData.append('inventory_file', parameters.inventory_file);
      formData.append('username', parameters.username);
      formData.append('password', parameters.password);
      formData.append('protocol', 'scp');
      formData.append('remote_filename', selectedFile.name);

      // Generate and append required backend job parameters
      const runId = `image_upload_${Date.now()}`;
      const scriptId = `image_upload_${Date.now()}`;
      const wsClientId = `ws_${Date.now()}`;
      formData.append('run_id', runId);
      formData.append('mode', 'cli');
      formData.append('scriptId', scriptId); // camelCase
      formData.append('wsClientId', wsClientId); // camelCase

      // Call the FastAPI endpoint
      const response = await fetch('http://localhost:8000/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Handle successful job queuing and connect to WebSocket
      if (result.job_id && result.ws_channel) {
        setUploadResult({
          success: true,
          jobId: result.job_id,
          message: result.message,
          wsChannel: result.ws_channel,
          completed: false
        });

        setCurrentStep('Connecting to progress tracker...');
        connectToWebSocket(result.ws_channel, result.job_id);

      } else {
        throw new Error('Invalid response from server: missing job_id or ws_channel');
      }

    } catch (error) {
      // Set error state on failure
      setUploadResult({
        success: false,
        error: error.message,
        completed: true
      });
      setInternalIsUploading(false);
      setInternalUploadProgress(0);
      setCurrentStep('');
    }
  };

  // =========================================================================
  // 🎯 UPLOAD HANDLER - Executes the upload
  // =========================================================================
  const handleUpload = async () => {
    if (!isFormValid) return;

    // Check storage before uploading (unless already checked and insufficient)
    if (!storageCheck || storageCheck.has_sufficient_space) {
      const storageResult = await checkDeviceStorage();

      if (!storageResult.hasSufficientSpace && !storageResult.skipped) {
        // Don't proceed if storage check explicitly failed
        return;
      }
    }

    if (onUpload) {
      onUpload(); // Use parent's handler if provided
    } else {
      uploadToFastAPI(); // Use built-in handler
    }
  };

  // =========================================================================
  // 🧹 RESET HANDLER - Clears all states
  // =========================================================================
  const handleReset = () => {
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'User reset');
    }

    setSelectedFile(null);
    setUploadResult(null);
    setStorageCheck(null);
    setInternalUploadProgress(0);
    setInternalIsUploading(false);
    setCurrentStep('');
    setWsStatus('disconnected');
    jobIdRef.current = null;
    intendedCloseRef.current = false;
  };

  // =========================================================================
  // 🧩 VALIDATION - Checks if all required fields are filled
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

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FILE SELECTION CARD */}
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

        {/* DEVICE CONFIGURATION CARD */}
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

      {/* STORAGE CHECK DISPLAY */}
      {selectedFile && parameters.hostname && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Device Storage Check
              {isCheckingStorage && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
            </CardTitle>
            <CardDescription>
              Verifying available storage space on target device
            </CardDescription>
          </CardHeader>
          <CardContent>
            {storageCheck ? (
              <div className={`p-4 rounded-lg ${storageCheck.has_sufficient_space
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold ${storageCheck.has_sufficient_space ? 'text-green-800' : 'text-red-800'
                      }`}>
                      {storageCheck.recommendation}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Required: <strong>{storageCheck.required_mb} MB</strong> •
                      Available: <strong>{storageCheck.available_mb} MB</strong> •
                      Filesystem: <strong>{storageCheck.filesystem}</strong>
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className={`h-2 rounded-full ${storageCheck.used_percent > 90 ? 'bg-red-600' :
                          storageCheck.used_percent > 80 ? 'bg-orange-500' : 'bg-blue-600'
                          }`}
                        style={{ width: `${storageCheck.used_percent}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Used: {storageCheck.used_percent}% of {storageCheck.total_mb} MB total
                    </p>
                  </div>
                  {storageCheck.has_sufficient_space ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  )}
                </div>
              </div>
            ) : isCheckingStorage ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 font-medium">Checking device storage...</p>
                <p className="text-sm text-blue-600">Connecting to {parameters.hostname} to verify available space</p>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-600">Storage check will run automatically when device information is provided</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* REAL-TIME STATUS DISPLAY (Only visible when uploading) */}
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

              {/* File transfer progress bar */}
              {uploadProgress >= 0 && (
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

      {/* UPLOAD RESULT DISPLAY (Only visible after job finishes) */}
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
                    <p className="text-sm text-red-700 mb-2">{uploadResult.error}</p>

                    {/* Show specific guidance for disk space errors */}
                    {uploadResult.error?.includes('disk space') && (
                      <div className="p-3 bg-red-100 rounded-md text-sm">
                        <p className="font-semibold text-red-800 mb-1">Recommended Actions:</p>
                        <ul className="list-disc list-inside text-red-700 space-y-1">
                          <li>Delete unused files from the device</li>
                          <li>Clear system logs or temporary files</li>
                          <li>Check available space with: <code>show system storage</code></li>
                          <li>Try uploading to a different filesystem if available</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPLOAD ACTION CARD */}
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
                    <span className="text-xs text-gray-500">({formatFileSize(selectedFile.size)})</span>
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
                {storageCheck && !storageCheck.has_sufficient_space && (
                  <p className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Insufficient storage space on device</span>
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
                disabled={isRunning || isUploading || !isFormValid || (storageCheck && !storageCheck.has_sufficient_space)}
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
