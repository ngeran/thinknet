/**
 * Image Uploader Component
 * 
 * FIXES APPLIED:
 * 1. Storage Check API Endpoint - Added multiple fallback endpoints with proper error handling
 * 2. Progress Bar Reset Issue - Fixed WebSocket progress reset using connection tracking
 * 3. Enhanced error handling and user feedback
 * 
 * FEATURES:
 * - File selection and device configuration
 * - Real-time storage capacity checking
 * - WebSocket-based progress tracking
 * - Comprehensive error handling
 * - Clean black/white theme UI
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  ArrowRight,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  HardDrive,
  Upload,
  Server,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

// Shared components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

// Configuration constants
const WS_BASE = 'ws://localhost:3100/ws';
const API_BASE = 'http://localhost:8000/api';

export default function ImageUploader({
  // External control props for integration into larger systems
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
  // 🧠 STATE MANAGEMENT - Internal state for standalone operation
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
  const [uploadResult, setUploadResult] = useState(null);
  const [currentStep, setCurrentStep] = useState('');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [storageCheck, setStorageCheck] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageCheckError, setStorageCheckError] = useState(null);

  // =========================================================================
  // 🔗 REFERENCE MANAGEMENT - Persistent across re-renders
  // =========================================================================
  const websocketRef = useRef(null);
  const jobIdRef = useRef(null);
  const intendedCloseRef = useRef(false);
  // 🎯 CRITICAL FIX: Track WebSocket connection state to prevent progress resets
  const hasActiveWebSocketRef = useRef(false);

  // =========================================================================
  // 🔄 STATE RESOLUTION - Prioritize external props over internal state
  // =========================================================================
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploading = externalIsUploading !== undefined ? externalIsUploading : internalIsUploading;
  const uploadProgress = externalUploadProgress !== undefined ? externalUploadProgress : internalUploadProgress;

  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // =========================================================================
  // 🧹 CLEANUP EFFECT - Ensures proper WebSocket closure on unmount
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
  // 💾 STORAGE CHECK FUNCTIONS - FIXED ENDPOINT HANDLING
  // =========================================================================

  /**
   * Checks device storage capacity before upload
   * 🎯 FIX: Tries multiple API endpoints to handle different server configurations
   */
  const checkDeviceStorage = async () => {
    // Validate required parameters
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) {
      setStorageCheckError('Missing required information for storage check');
      return { hasSufficientSpace: true, skipped: true };
    }

    setIsCheckingStorage(true);
    setStorageCheckError(null);
    setCurrentStep('Checking device storage availability...');

    try {
      // 🎯 FIX: Multiple endpoint fallbacks for different server configurations
      const endpoints = [
        `${API_BASE}/device/check-storage`,  // Primary expected endpoint
        `${API_BASE}/check-storage`,         // Alternative path
        'http://localhost:8000/device/check-storage' // Direct endpoint
      ];

      let response = null;
      let lastError = null;
      let successfulEndpoint = '';

      // Try each endpoint until one works
      for (const endpoint of endpoints) {
        try {
          console.log(`🔍 Trying storage check endpoint: ${endpoint}`);
          response = await fetch(endpoint, {
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

          if (response.ok) {
            successfulEndpoint = endpoint;
            console.log(`✅ Storage check successful with endpoint: ${endpoint}`);
            break;
          } else {
            lastError = `Endpoint ${endpoint} returned ${response.status}`;
            console.warn(`❌ ${lastError}`);
          }
        } catch (error) {
          lastError = `Endpoint ${endpoint} failed: ${error.message}`;
          console.warn(`❌ ${lastError}`);
        }
      }

      // If all endpoints failed, throw comprehensive error
      if (!response || !response.ok) {
        throw new Error(`All storage check endpoints failed. Last error: ${lastError}`);
      }

      const result = await response.json();

      // Validate response structure
      if (!result || typeof result.has_sufficient_space === 'undefined') {
        throw new Error('Invalid response format from storage check');
      }

      // Add endpoint info to result for debugging
      result.used_endpoint = successfulEndpoint;

      setStorageCheck(result);
      setStorageCheckError(null);

      // Update UI based on storage check result
      if (result.has_sufficient_space) {
        setCurrentStep('✅ Sufficient storage space available');
        return { hasSufficientSpace: true, data: result };
      } else {
        setCurrentStep('❌ Insufficient storage space on device');
        return { hasSufficientSpace: false, data: result };
      }

    } catch (error) {
      console.error('❌ Storage check failed:', error);
      const errorMessage = error.message || 'Unknown error during storage check';
      setStorageCheckError(errorMessage);
      setCurrentStep('⚠️ Storage check failed - proceeding with upload');
      return { hasSufficientSpace: true, skipped: true, error: errorMessage };
    } finally {
      setIsCheckingStorage(false);
    }
  };

  /**
   * Auto-check storage when file and device info become available
   */
  useEffect(() => {
    if (selectedFile && parameters.hostname && parameters.username && parameters.password) {
      const timer = setTimeout(() => {
        checkDeviceStorage();
      }, 1000); // Debounce to avoid excessive checks

      return () => clearTimeout(timer);
    } else {
      // Reset storage check when requirements aren't met
      setStorageCheck(null);
      setStorageCheckError(null);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);

  // =========================================================================
  // 📡 WEB SOCKET INTEGRATION - FIXED PROGRESS RESET ISSUE
  // =========================================================================

  /**
   * Establishes WebSocket connection for real-time progress updates
   * 🎯 FIX: Uses connection tracking to prevent progress bar resets
   */
  const connectToWebSocket = (wsChannel, jobId) => {
    // Cleanup previous connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'New connection requested');
    }

    jobIdRef.current = jobId;
    intendedCloseRef.current = false;
    // 🎯 CRITICAL FIX: Mark WebSocket as active to prevent progress resets
    hasActiveWebSocketRef.current = true;
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

        // 🎯 FIX: Don't reset progress here - maintain existing progress state
        console.log('🔄 WebSocket connected - maintaining current progress state');
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
        hasActiveWebSocketRef.current = false;
        if (!intendedCloseRef.current) {
          console.warn('[IMAGE UPLOADER] WebSocket closed unexpectedly');
          setCurrentStep('Connection lost - progress updates unavailable');
        }
      };

      ws.onerror = (error) => {
        console.error('[IMAGE UPLOADER] WebSocket error:', error);
        setWsStatus('error');
        hasActiveWebSocketRef.current = false;
        setCurrentStep('WebSocket connection error');
      };

    } catch (error) {
      console.error('[IMAGE UPLOADER] Failed to create WebSocket connection:', error);
      setWsStatus('error');
      hasActiveWebSocketRef.current = false;
      setCurrentStep('Failed to establish progress tracking');
    }
  };

  // =========================================================================
  // 📨 WEB SOCKET MESSAGE HANDLER - COMPREHENSIVE PROGRESS MANAGEMENT
  // =========================================================================

  /**
   * Processes WebSocket messages and updates UI state accordingly
   * 🎯 FIX: Prevents progress resets by tracking connection state
   */
  const handleWebSocketMessage = (data) => {
    const { payload: finalPayload, isNested } = extractNestedProgressData(data);

    // =======================================================================
    // 🎯 SUCCESS MESSAGE HANDLING - Complete upload on success
    // =======================================================================
    if ((isNested && finalPayload.success === true) ||
      (finalPayload.success === true && finalPayload.details)) {
      console.log('✅ Handling success message');
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
      hasActiveWebSocketRef.current = false;
      if (websocketRef.current) websocketRef.current.close();
      return;
    }

    // =======================================================================
    // 📊 PROGRESS HANDLING - FIXED: Only update when WebSocket is active
    // =======================================================================
    let rawProgressValue = finalPayload?.data?.progress || finalPayload?.progress || data.progress;

    if (rawProgressValue !== undefined) {
      const progressValue = Math.max(0, Math.min(100, parseFloat(rawProgressValue)));

      if (!isNaN(progressValue)) {
        console.log(`📊 WebSocket progress update: ${progressValue}%`);

        // 🎯 CRITICAL FIX: Only update progress if we have an active WebSocket connection
        // This prevents progress resets when WebSocket connects
        if (hasActiveWebSocketRef.current) {
          setInternalUploadProgress(progressValue);
        }

        const message = finalPayload.message || (progressValue < 100 ? 'Uploading file...' : 'File transfer complete.');
        setCurrentStep(message);
      }
    }

    // =======================================================================
    // 🎭 EVENT TYPE HANDLING - Process different event types
    // =======================================================================
    if (!finalPayload || !finalPayload.event_type) return;

    switch (finalPayload.event_type) {
      case 'OPERATION_START':
        setCurrentStep('Starting upload process...');
        // Only reset progress at the very start, not when WebSocket connects
        if (!hasActiveWebSocketRef.current) {
          setInternalUploadProgress(0);
        }
        break;

      case 'OPERATION_COMPLETE':
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
        } else {
          setInternalIsUploading(false);
          setCurrentStep(`Operation failed: ${finalPayload.message}`);
          setUploadResult({
            success: false,
            error: finalPayload.message,
            completed: true
          });
        }
        intendedCloseRef.current = true;
        hasActiveWebSocketRef.current = false;
        if (websocketRef.current) websocketRef.current.close();
        break;

      case 'ERROR':
      case 'UPLOAD_FAILED':
        setInternalIsUploading(false);
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
        hasActiveWebSocketRef.current = false;
        if (websocketRef.current) websocketRef.current.close();
        break;

      default:
        // Ignore unhandled event types
        break;
    }
  };

  // =========================================================================
  // 🔄 NESTED PROGRESS DATA EXTRACTION - Handles complex message structures
  // =========================================================================

  /**
   * Extracts progress data from nested WebSocket message structures
   * Handles both direct messages and messages wrapped in orchestrator logs
   */
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
  // 🎯 UPLOAD HANDLERS - Main upload workflow
  // =========================================================================

  /**
   * Handles file upload to FastAPI backend
   * Includes proper progress initialization and WebSocket setup
   */
  const uploadToFastAPI = async () => {
    if (!isFormValid || !selectedFile) return;

    // Reset states before starting a new job
    setUploadResult(null);
    setInternalIsUploading(true);

    // 🎯 FIX: Set initial progress to 0 only at the very start
    setInternalUploadProgress(0);
    setCurrentStep('Initializing upload...');
    setWsStatus('disconnected');

    // Reset WebSocket tracking
    hasActiveWebSocketRef.current = false;

    // Close any prior WebSocket connection
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'New upload starting');
    }

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Append device and authentication parameters
      if (parameters.hostname) formData.append('hostname', parameters.hostname);
      if (parameters.inventory_file) formData.append('inventory_file', parameters.inventory_file);
      formData.append('username', parameters.username);
      formData.append('password', parameters.password);
      formData.append('protocol', 'scp');
      formData.append('remote_filename', selectedFile.name);

      // Generate unique identifiers for job tracking
      const runId = `image_upload_${Date.now()}`;
      const scriptId = `image_upload_${Date.now()}`;
      const wsClientId = `ws_${Date.now()}`;
      formData.append('run_id', runId);
      formData.append('mode', 'cli');
      formData.append('scriptId', scriptId);
      formData.append('wsClientId', wsClientId);

      // Submit upload to FastAPI
      const response = await fetch('http://localhost:8000/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Handle successful job queuing
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
      // Handle upload failure
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

  /**
   * Main upload handler with storage check integration
   */
  const handleUpload = async () => {
    if (!isFormValid) return;

    // Check storage before uploading (unless already checked and insufficient)
    if (!storageCheck || storageCheck.has_sufficient_space) {
      const storageResult = await checkDeviceStorage();

      if (!storageResult.hasSufficientSpace && !storageResult.skipped) {
        return;
      }
    }

    // Use external handler if provided, otherwise use internal
    if (onUpload) {
      onUpload();
    } else {
      uploadToFastAPI();
    }
  };

  // =========================================================================
  // 🧹 RESET HANDLER - Clears all states for new upload
  // =========================================================================

  const handleReset = () => {
    if (websocketRef.current) {
      intendedCloseRef.current = true;
      websocketRef.current.close(1000, 'User reset');
    }

    setSelectedFile(null);
    setUploadResult(null);
    setStorageCheck(null);
    setStorageCheckError(null);
    setInternalUploadProgress(0);
    setInternalIsUploading(false);
    setCurrentStep('');
    setWsStatus('disconnected');
    jobIdRef.current = null;
    intendedCloseRef.current = false;
    hasActiveWebSocketRef.current = false;
  };

  // =========================================================================
  // 🧩 VALIDATION & UI HELPER FUNCTIONS
  // =========================================================================

  /**
   * Validates if form has all required fields filled
   */
  const isFormValid =
    selectedFile &&
    parameters?.username?.trim() &&
    parameters?.password?.trim() &&
    (parameters?.hostname?.trim() || parameters?.inventory_file?.trim());

  /**
   * WebSocket status indicator helpers
   */
  const getWsStatusIcon = () => {
    switch (wsStatus) {
      case 'connected': return <Wifi className="h-4 w-4 text-green-600" />;
      case 'connecting': return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'error': return <WifiOff className="h-4 w-4 text-red-600" />;
      default: return <WifiOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getWsStatusText = () => {
    switch (wsStatus) {
      case 'connected': return 'Live';
      case 'connecting': return 'Connecting';
      case 'error': return 'Error';
      default: return 'Offline';
    }
  };

  const getWsStatusVariant = () => {
    switch (wsStatus) {
      case 'connected': return 'default';
      case 'connecting': return 'secondary';
      case 'error': return 'destructive';
      default: return 'outline';
    }
  };

  /**
   * Storage check status management
   */
  const getStorageCheckStatus = () => {
    if (isCheckingStorage) return 'checking';
    if (storageCheckError) return 'error';
    if (storageCheck) return storageCheck.has_sufficient_space ? 'sufficient' : 'insufficient';
    return 'idle';
  };

  /**
   * Utility function to format file sizes for display
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // =========================================================================
  // 🎨 UI RENDER - Clean black/white theme with improved feedback
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* FILE SELECTION AND DEVICE CONFIGURATION GRID */}
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
        <Card className="border-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5" />
              Device Configuration
            </CardTitle>
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

      {/* STORAGE CHECK DISPLAY - IMPROVED WITH ERROR HANDLING */}
      {selectedFile && parameters.hostname && (
        <Card className="border-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5" />
              Device Storage Check
              {isCheckingStorage && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              )}
            </CardTitle>
            <CardDescription>
              Verifying available storage space on target device {parameters.hostname}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Storage Check Status with Dynamic Styling */}
              <div className={`p-4 rounded-lg border-2 ${getStorageCheckStatus() === 'checking' ? 'border-blue-200 bg-blue-50' :
                  getStorageCheckStatus() === 'error' ? 'border-orange-200 bg-orange-50' :
                    getStorageCheckStatus() === 'sufficient' ? 'border-green-200 bg-green-50' :
                      getStorageCheckStatus() === 'insufficient' ? 'border-red-200 bg-red-50' :
                        'border-gray-200 bg-gray-50'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {/* Checking State */}
                    {getStorageCheckStatus() === 'checking' && (
                      <>
                        <p className="font-semibold text-blue-800">Checking Storage...</p>
                        <p className="text-sm text-blue-700 mt-1">
                          Connecting to {parameters.hostname} to verify available space
                        </p>
                      </>
                    )}

                    {/* Error State */}
                    {getStorageCheckStatus() === 'error' && (
                      <>
                        <p className="font-semibold text-orange-800">Storage Check Failed</p>
                        <p className="text-sm text-orange-700 mt-1">
                          {storageCheckError || 'Unable to check storage availability'}
                        </p>
                        <p className="text-xs text-orange-600 mt-2">
                          You can proceed with upload, but verify storage manually if needed
                        </p>
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={checkDeviceStorage}
                            disabled={isCheckingStorage}
                            className="border-orange-300 text-orange-700 hover:bg-orange-50"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry Storage Check
                          </Button>
                        </div>
                      </>
                    )}

                    {/* Sufficient Space State */}
                    {getStorageCheckStatus() === 'sufficient' && storageCheck && (
                      <>
                        <p className="font-semibold text-green-800">✅ Sufficient Space Available</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-green-700">
                          <span>Required: <strong>{storageCheck.required_mb} MB</strong></span>
                          <span>Available: <strong>{storageCheck.available_mb} MB</strong></span>
                          <span>Filesystem: <strong>{storageCheck.filesystem}</strong></span>
                        </div>
                      </>
                    )}

                    {/* Insufficient Space State */}
                    {getStorageCheckStatus() === 'insufficient' && storageCheck && (
                      <>
                        <p className="font-semibold text-red-800">❌ Insufficient Storage Space</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-red-700">
                          <span>Required: <strong>{storageCheck.required_mb} MB</strong></span>
                          <span>Available: <strong>{storageCheck.available_mb} MB</strong></span>
                          <span>Filesystem: <strong>{storageCheck.filesystem}</strong></span>
                        </div>
                      </>
                    )}

                    {/* Idle State */}
                    {getStorageCheckStatus() === 'idle' && (
                      <p className="text-gray-600">Storage check will run automatically when device information is provided</p>
                    )}

                    {/* Storage Usage Visualization */}
                    {storageCheck && (
                      <div className="mt-3">
                        <div className="flex justify-between text-sm text-gray-700 mb-1">
                          <span>Storage Usage</span>
                          <span>{storageCheck.used_percent}% used</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${storageCheck.used_percent > 90 ? 'bg-red-600' :
                                storageCheck.used_percent > 80 ? 'bg-orange-500' : 'bg-blue-600'
                              }`}
                            style={{ width: `${storageCheck.used_percent}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>Total: {storageCheck.total_mb} MB</span>
                          <span>Available: {storageCheck.available_mb} MB</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status Icons */}
                  {getStorageCheckStatus() === 'sufficient' && (
                    <CheckCircle2 className="h-6 w-6 text-green-600 ml-4" />
                  )}
                  {getStorageCheckStatus() === 'insufficient' && (
                    <AlertCircle className="h-6 w-6 text-red-600 ml-4" />
                  )}
                  {getStorageCheckStatus() === 'error' && (
                    <AlertCircle className="h-6 w-6 text-orange-600 ml-4" />
                  )}
                </div>

                {/* Method Information Footer */}
                {storageCheck && storageCheck.method && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Check method: <span className="font-medium">{storageCheck.method}</span>
                      {storageCheck.method === 'simulation' && ' (estimated values)'}
                      {storageCheck.used_endpoint && ` via ${storageCheck.used_endpoint}`}
                    </p>
                  </div>
                )}
              </div>

              {/* Insufficient Space Recommendations */}
              {getStorageCheckStatus() === 'insufficient' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="font-semibold text-red-800 mb-2">Recommended Actions:</p>
                  <ul className="list-disc list-inside text-red-700 space-y-1 text-sm">
                    <li>Delete unused files from the device</li>
                    <li>Clear system logs or temporary files</li>
                    <li>Check available space with: <code className="bg-red-100 px-1 rounded">show system storage</code></li>
                    <li>Try uploading to a different filesystem if available</li>
                    <li>Consider compressing the file before upload</li>
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPLOAD PROGRESS DISPLAY - FIXED PROGRESS BAR */}
      {isUploading && (
        <Card className="border-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Loader2 className="h-5 w-5 animate-spin" />
                Upload Progress
              </CardTitle>
              <Badge variant={getWsStatusVariant()} className="flex items-center gap-1">
                {getWsStatusIcon()}
                {getWsStatusText()}
              </Badge>
            </div>
            <CardDescription className="text-base font-medium text-gray-800">
              {currentStep}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 🎯 FIXED: Progress bar no longer resets when WebSocket connects */}
              {uploadProgress >= 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-800">Transfer Progress</span>
                    <span className="text-gray-700 font-semibold">{uploadProgress?.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-black h-3 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPLOAD RESULT DISPLAY */}
      {uploadResult && !isUploading && (
        <Card className={`border-2 ${uploadResult.success
            ? uploadResult.completed
              ? "border-green-600 bg-white"
              : "border-blue-600 bg-white"
            : "border-red-600 bg-white"
          }`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {uploadResult.success ? (
                uploadResult.completed ? (
                  <>
                    <CheckCircle2 className="h-7 w-7 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-gray-900">Upload Completed Successfully!</h4>
                      <p className="text-gray-700 mt-2">{uploadResult.finalMessage}</p>
                      {uploadResult.deviceInfo && (
                        <div className="mt-3 p-3 bg-gray-100 rounded-lg border">
                          <p className="text-sm"><strong>Device:</strong> {uploadResult.deviceInfo.hostname}</p>
                          <p className="text-sm"><strong>Model:</strong> {uploadResult.deviceInfo.model}</p>
                          <p className="text-sm"><strong>Version:</strong> {uploadResult.deviceInfo.version}</p>
                        </div>
                      )}
                      <p className="text-sm text-gray-600 mt-3">Job ID: {uploadResult.jobId}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-7 w-7 text-blue-600 animate-spin mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-xl font-bold text-gray-900">Upload Queued Successfully!</h4>
                      <p className="text-gray-700 mt-2">{uploadResult.message}</p>
                      <p className="text-sm text-gray-600 mt-2">Job ID: {uploadResult.jobId}</p>
                      <p className="text-sm text-gray-600">WebSocket Channel: {uploadResult.wsChannel}</p>
                      <p className="text-xs text-blue-600 mt-3 font-medium">ⓘ Monitoring progress via WebSocket...</p>
                    </div>
                  </>
                )
              ) : (
                <>
                  <AlertCircle className="h-7 w-7 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="text-xl font-bold text-gray-900">Upload Failed</h4>
                    <p className="text-gray-700 mt-2 mb-4">{uploadResult.error}</p>
                    {uploadResult.error?.includes('disk space') && (
                      <div className="p-4 bg-gray-100 rounded-lg border">
                        <p className="font-semibold text-gray-900 mb-2">Recommended Actions:</p>
                        <ul className="list-disc list-inside text-gray-700 space-y-1 text-sm">
                          <li>Delete unused files from the device</li>
                          <li>Clear system logs or temporary files</li>
                          <li>Check available space with: <code className="bg-gray-200 px-1 rounded">show system storage</code></li>
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
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h4 className="text-xl font-bold text-gray-900 mb-3">Ready to Upload</h4>
              <div className="space-y-2 text-sm text-gray-700">
                {selectedFile && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-semibold">{selectedFile.name}</span>
                    <span className="text-gray-500">({formatFileSize(selectedFile.size)})</span>
                  </p>
                )}
                {parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Device: <strong>{parameters.hostname}</strong></span>
                  </p>
                )}
                {parameters?.inventory_file && !parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Inventory File: <strong>{parameters.inventory_file}</strong></span>
                  </p>
                )}
                {storageCheck && !storageCheck.has_sufficient_space && (
                  <p className="flex items-center gap-2 text-red-600 font-medium">
                    <AlertCircle className="h-4 w-4" />
                    <span>Insufficient storage space on device</span>
                  </p>
                )}
                {!isFormValid && (
                  <div className="text-orange-700 text-sm space-y-1">
                    {!selectedFile && <p className="flex items-center gap-2">• Select a file to upload</p>}
                    {!parameters?.hostname && !parameters?.inventory_file && <p className="flex items-center gap-2">• Configure device target</p>}
                    {(!parameters?.username || !parameters?.password) && <p className="flex items-center gap-2">• Provide authentication credentials</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              {uploadResult && (
                <Button
                  onClick={handleReset}
                  variant="outline"
                  disabled={isUploading}
                  className="border-2"
                >
                  Upload Another File
                </Button>
              )}
              <Button
                onClick={handleUpload}
                disabled={isRunning || isUploading || !isFormValid || (storageCheck && !storageCheck.has_sufficient_space)}
                size="lg"
                className="w-full sm:w-auto bg-black hover:bg-gray-800 text-white border-2 border-black"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading {uploadProgress?.toFixed(0) || 0}%
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
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
