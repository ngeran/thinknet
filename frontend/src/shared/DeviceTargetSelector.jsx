/**
 * =============================================================================
 * DEVICE TARGET SELECTOR COMPONENT
 * =============================================================================
 *
 * File Path: src/shared/DeviceTargetSelector.jsx
 * Version: 3.1.1
 * 
 * DESCRIPTION:
 * An advanced device targeting component that provides two input modes: manual
 * hostname entry and inventory file selection. Features real-time API integration,
 * intelligent mode switching, comprehensive error handling, and modern UI styling.
 *
 * UPDATE (v3.1.1): Added form wrapper and keydown event handling to prevent page refreshes
 * on input, ensuring Enter key and other keypresses do not trigger unwanted form submissions.
 *
 * KEY FEATURES:
 * • Dual input modes: Manual hostname or inventory file selection
 * • Real-time inventory file fetching from backend API
 * • Intelligent mode switching with automatic field clearing
 * • Comprehensive error handling and loading states
 * • Responsive design with mobile-first approach
 * • Accessibility-compliant with ARIA labels and keyboard navigation
 * • Auto-retry mechanism for failed API requests
 * • Visual feedback for connection status and data loading
 * • Form submission prevention for input fields
 *
 * DEPENDENCIES:
 * • react: ^18.0.0 (useState, useEffect, useCallback, useRef hooks)
 * • lucide-react: ^0.263.1 (List, Keyboard, Server, AlertCircle, ChevronDown, RefreshCw, Wifi, WifiOff icons)
 * • axios: ^1.0.0 (HTTP client for API requests)
 *
 * HOW TO USE:
 * ```jsx
 * import DeviceTargetSelector from "../shared/DeviceTargetSelector";
 *
 * function MyApp() {
 *   const [params, setParams] = useState({});
 *
 *   const handleParamChange = (name, value) => {
 *     setParams(prev => ({ ...prev, [name]: value }));
 *   };
 *
 *   return (
 *     <DeviceTargetSelector
 *       parameters={params}
 *       onParamChange={handleParamChange}
 *       title="Target Device"
 *       description="Choose the device to operate on"
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { List, Keyboard, Server, AlertCircle, ChevronDown, RefreshCw, Wifi, WifiOff } from "lucide-react";
import axios from "axios";

// =============================================================================
// MAIN COMPONENT EXPORT
// =============================================================================
// Advanced device target selector with dual input modes and API integration
export default function DeviceTargetSelector({
  parameters = {},
  onParamChange = () => { },
  title = "Device Selection",
  description = "Choose the device you want to operate on",
  className = ""
}) {
  // =============================================================================
  // STATE INITIALIZATION
  // =============================================================================
  const [inputMode, setInputMode] = useState("manual");
  const [inventoryFiles, setInventoryFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const usingFallbackRef = useRef(false);
  const componentRef = useRef(null);

  // =============================================================================
  // VALIDATION LOGIC SECTION
  // =============================================================================
  const isHostnameValid = parameters.hostname?.trim().length > 0;
  const isInventoryValid = parameters.inventory_file?.trim().length > 0;

  // =============================================================================
  // DATA FETCHING SECTION
  // =============================================================================
  // Handles API calls to fetch inventory files and manage loading states

  /**
   * Fetches available inventory files from the API with fallback mechanism
   */
  const fetchInventoryFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBackendAvailable(true);

      console.log('Fetching inventory files from API...');

      // Try with relative path first (via Vite proxy)
      let apiUrl = '/api/inventory/list';

      // If we previously had to use fallback, continue using it
      if (usingFallbackRef.current) {
        apiUrl = 'http://localhost:8000/api/inventory/list';
      }

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      console.log('API response received:', response.data);

      // Check if we got HTML instead of JSON (proxy not working)
      if (typeof response.data === 'string' && response.data.includes('<!doctype html>')) {
        throw new Error('Proxy not configured - received HTML instead of JSON');
      }

      // Handle the actual API response format
      if (response.status === 200 && response.data) {
        if (response.data.files && Array.isArray(response.data.files)) {
          setInventoryFiles(response.data.files);
          setBackendAvailable(true);
          console.log('Successfully loaded', response.data.files.length, 'inventory files');
        } else {
          throw new Error('Unexpected API response format: files array not found');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      // If proxy fails, try direct backend URL as fallback
      if (!usingFallbackRef.current && err.message.includes('Proxy not configured')) {
        console.log('Proxy not working, trying direct backend connection...');
        usingFallbackRef.current = true;
        setRetryCount(prev => prev + 1); // Trigger retry with fallback
        return;
      }
      handleFetchError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Handles errors during inventory files fetching
   * @param {Error} err - The error object
   */
  const handleFetchError = useCallback((err) => {
    console.error('Failed to fetch inventory files:', err);

    if (err.code === 'ECONNABORTED') {
      setError('Request timeout: Backend server is not responding');
      setBackendAvailable(false);
    } else if (err.response) {
      // Server responded with error status
      if (err.response.status === 404) {
        setError('Inventory endpoint not found (404)');
      } else if (err.response.status >= 500) {
        setError(`Server error: ${err.response.status}`);
        setBackendAvailable(false);
      } else {
        setError(`HTTP error: ${err.response.status} ${err.response.statusText}`);
      }
    } else if (err.request) {
      // Request was made but no response received
      setError('Backend server is not responding. Please check if the server is running.');
      setBackendAvailable(false);
    } else {
      // Other errors (CORS, network issues, etc.)
      setError(`Failed to connect: ${err.message}`);
      setBackendAvailable(false);
    }

    setInventoryFiles([]);
  }, []);

  // Fetch inventory files on component mount and retry
  useEffect(() => {
    if (inputMode === 'inventory') {
      fetchInventoryFiles();
    }
  }, [fetchInventoryFiles, inputMode, retryCount]);

  // Prevents Enter key from triggering page refresh
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (componentRef.current && componentRef.current.contains(document.activeElement)) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // =============================================================================
  // EVENT HANDLERS SECTION
  // =============================================================================
  const handleInputChange = (e) => {
    e.stopPropagation();
    const { name, value } = e.target;
    onParamChange(name, value);
  };

  const handleModeSwitch = (mode) => {
    setInputMode(mode);

    // Clear the other field when switching modes
    if (mode === "manual") {
      onParamChange("inventory_file", "");
    } else {
      onParamChange("hostname", "");
      // Fetch inventories when switching to inventory mode
      if (inventoryFiles.length === 0) {
        fetchInventoryFiles();
      }
    }
  };

  const handleRetry = (e) => {
    e.stopPropagation();
    setRetryCount(prev => prev + 1);
  };

  // Prevents default form submission
  const handleFormSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  // =============================================================================
  // UI HELPER FUNCTIONS SECTION
  // =============================================================================
  /**
   * Returns appropriate icon for file type
   * @param {string} fileName - The inventory file name
   * @returns {string} Emoji icon for the file type
   */
  const getFileIcon = (fileName) => {
    if (fileName.includes('router')) return '🔄';
    if (fileName.includes('switch')) return '🔌';
    if (fileName.includes('firewall')) return '🛡️';
    if (fileName.includes('inventory')) return '📋';
    return '📁';
  };

  /**
   * Formats file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getModeButtonClasses = (mode) => `
    flex-1 flex items-center justify-center gap-2 py-2 px-3
    rounded-md text-sm font-medium transition-all duration-200
    ${inputMode === mode
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
    }
  `.trim();

  const getInputClasses = (isValid) => `
    w-full px-3 py-2.5 text-sm border rounded-lg
    transition-all duration-200 placeholder:text-muted-foreground
    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
    hover:border-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed
    ${isValid
      ? 'border-border bg-background'
      : 'border-destructive/50 bg-destructive/5 focus:ring-destructive/20'
    }
  `.trim();

  // =============================================================================
  // COMPONENT RENDER SECTION
  // =============================================================================
  return (
    <div
      className={`
        bg-card border rounded-xl shadow-sm backdrop-blur-sm
        ${className}
      `.trim()}
    >
      {/* HEADER SECTION */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Server className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Backend Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-full ${backendAvailable
              ? 'bg-green-500/10 text-green-500'
              : 'bg-destructive/10 text-destructive'
              }`}>
              {backendAvailable ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
            </div>
          </div>
        </div>

        {/* MODE TOGGLE SECTION */}
        <div className="flex bg-muted/30 rounded-lg p-1 mt-4">
          <button
            type="button"
            onClick={() => handleModeSwitch("manual")}
            className={getModeButtonClasses("manual")}
            aria-pressed={inputMode === "manual"}
          >
            <Keyboard className="h-4 w-4" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("inventory")}
            className={getModeButtonClasses("inventory")}
            aria-pressed={inputMode === "inventory"}
            disabled={!backendAvailable}
          >
            <List className="h-4 w-4" />
            Inventory
          </button>
        </div>
      </div>

      {/* INPUT FIELDS SECTION */}
      <form onSubmit={handleFormSubmit} ref={componentRef} className="p-6">
        {inputMode === "manual" ? (
          /* MANUAL MODE - Hostname input field */
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                name="hostname"
                value={parameters.hostname || ""}
                onChange={handleInputChange}
                placeholder="e.g., router1.company.com, 192.168.1.1"
                className={`${getInputClasses(isHostnameValid)} pl-10`}
                aria-describedby={!isHostnameValid ? "hostname-error" : undefined}
              />
              <Server className={`absolute left-3 top-2.5 h-4 w-4 transition-colors ${isHostnameValid ? 'text-muted-foreground' : 'text-destructive'
                }`} />
            </div>
            {!isHostnameValid && (
              <p id="hostname-error" className="text-xs text-destructive animate-in fade-in duration-200">
                Target hostname is required
              </p>
            )}
          </div>
        ) : (
          /* INVENTORY MODE - File selection dropdown */
          <div className="space-y-2">
            <div className="relative">
              <select
                name="inventory_file"
                value={parameters.inventory_file || ""}
                onChange={handleInputChange}
                disabled={loading || !backendAvailable || inventoryFiles.length === 0}
                className={`${getInputClasses(isInventoryValid)} pl-10 pr-10 appearance-none`}
                aria-describedby={!isInventoryValid ? "inventory-error" : undefined}
              >
                <option value="">-- Select an inventory file --</option>
                {inventoryFiles.map((file) => (
                  <option key={file.name} value={file.name}>
                    {getFileIcon(file.name)} {file.name.replace('.yaml', '').replace('.yml', '')}
                    {file.size && ` (${formatFileSize(file.size)})`}
                  </option>
                ))}
              </select>
              <List className={`absolute left-3 top-2.5 h-4 w-4 pointer-events-none transition-colors ${isInventoryValid ? 'text-muted-foreground' : 'text-destructive'
                }`} />
              <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 pointer-events-none text-muted-foreground" />

              {/* Refresh button */}
              <button
                type="button"
                onClick={handleRetry}
                disabled={loading}
                className="absolute right-8 top-2.5 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Refresh inventory files"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* STATUS MESSAGES SECTION */}
            <div className="space-y-2">
              {/* Loading state */}
              {loading && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in duration-200">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Loading inventory files...
                </p>
              )}

              {/* Backend unavailable state */}
              {!backendAvailable && !loading && (
                <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <div className="flex items-center gap-2 text-destructive mb-2">
                    <WifiOff className="h-4 w-4" />
                    <span className="text-sm font-medium">Backend Unavailable</span>
                  </div>
                  <p className="text-xs text-destructive/80 mb-2">
                    Unable to connect to the backend service. Please check if the server is running.
                  </p>
                  <button
                    onClick={handleRetry}
                    className="text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive px-2 py-1 rounded transition-colors"
                  >
                    Retry Connection
                  </button>
                </div>
              )}

              {/* API error state */}
              {error && backendAvailable && !loading && (
                <p className="flex items-center gap-1 text-xs text-destructive animate-in fade-in duration-200">
                  <AlertCircle className="h-3 w-3" /> {error}
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="ml-1 text-destructive underline hover:no-underline text-xs"
                  >
                    Try again
                  </button>
                </p>
              )}

              {/* Success state */}
              {!loading && backendAvailable && inventoryFiles.length > 0 && (
                <p className="text-xs text-muted-foreground animate-in fade-in duration-200">
                  Found {inventoryFiles.length} inventory file{inventoryFiles.length !== 1 ? 's' : ''}
                </p>
              )}

              {/* No files state */}
              {!loading && backendAvailable && inventoryFiles.length === 0 && !error && (
                <p className="text-xs text-muted-foreground animate-in fade-in duration-200">
                  No inventory files found in the directory
                </p>
              )}

              {/* Validation error */}
              {!isInventoryValid && !loading && backendAvailable && inventoryFiles.length > 0 && (
                <p
                  id="inventory-error"
                  className="flex items-center gap-1 text-xs text-destructive animate-in fade-in duration-200"
                >
                  <AlertCircle className="h-3 w-3" /> Please select an inventory file
                </p>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
