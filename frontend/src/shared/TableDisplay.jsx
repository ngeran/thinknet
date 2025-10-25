/**
 * UNIVERSAL TABLE DISPLAY COMPONENT
 * 
 * A highly flexible and reusable React component for displaying structured data
 * in a professional table format with advanced features including search, sort,
 * pagination, and multi-format export capabilities.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Table as TableIcon,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Save,
  FileText,
  Database,
  Grid,
  Loader2,
  CheckCircle,
  AlertCircle
} from "lucide-react";

// =============================================================================
// UTILITY FUNCTIONS - Data Transformation & Formatting
// =============================================================================

/**
 * Safe method to check if object has own property
 */
const hasOwnProperty = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

/**
 * Recursively flattens nested objects into a single-level object with dot notation.
 */
const flattenObject = (obj, prefix = '') => {
  // Handle null, undefined, or primitive values
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return { [prefix]: obj };
  }

  const flattened = {};

  for (const key in obj) {
    if (hasOwnProperty(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      // Handle different data types appropriately
      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (Array.isArray(value)) {
        // Convert arrays to readable comma-separated strings
        flattened[newKey] = value.map(item =>
          typeof item === 'object' ? JSON.stringify(item) : String(item)
        ).join(', ');
      } else if (typeof value === 'object') {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        // Primitive values: string, number, boolean
        flattened[newKey] = value;
      }
    }
  }

  return flattened;
};

/**
 * Auto-detects column headers from an array of data objects by analyzing all keys
 * across all objects.
 */
const detectHeaders = (data) => {
  // Early return for empty data
  if (!data || data.length === 0) return [];

  const allKeys = new Set();

  // Collect all unique keys from all objects in the dataset
  data.forEach(item => {
    const flattened = flattenObject(item);
    Object.keys(flattened).forEach(key => allKeys.add(key));
  });

  // Return sorted array for consistent column ordering
  return Array.from(allKeys).sort();
};

/**
 * Formats any value for safe and consistent display in table cells.
 */
const formatCellValue = (value) => {
  // Handle null and undefined
  if (value === null || value === undefined) return '';

  // Handle boolean values with user-friendly strings
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  // Handle objects and arrays with JSON serialization
  if (typeof value === 'object') return JSON.stringify(value);

  // Handle all other primitives with string conversion
  return String(value);
};

/**
 * Converts data array to CSV format for export with proper escaping and formatting.
 */
const exportToCSV = (data, headers) => {
  try {
    const csvContent = [
      // Header row
      headers.map(header => `"${header.replace(/"/g, '""')}"`).join(','),

      // Data rows with proper CSV escaping
      ...data.map(row =>
        headers.map(header => {
          const value = row[header] || '';
          // Escape quotes and wrap in quotes for CSV safety
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`);
  }
};

// =============================================================================
// MAIN COMPONENT DEFINITION
// =============================================================================

/**
 * Universal TableDisplay Component
 */
export default function TableDisplay({
  title = "Data Table",
  headers = null,
  data = [],
  isVisible = true,
  className = "",
  maxRows = 100,
  searchable = true,
  enableSave = false,
  saveConfig = {
    formats: ["csv", "json"],
    defaultFilename: "table-data"
  }
}) {
  // =============================================================================
  // STATE MANAGEMENT - User Interactions & UI State
  // =============================================================================

  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // =============================================================================
  // DATA PROCESSING MEMOIZED VALUES - Performance Optimized
  // =============================================================================

  /**
   * Processes and flattens input data for consistent table display.
   */
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Validate data structure
    if (!Array.isArray(data)) {
      console.warn('TableDisplay: data prop must be an array');
      return [];
    }

    return data.map(item => {
      try {
        return flattenObject(item);
      } catch (error) {
        console.error('TableDisplay: Error flattening object', error, item);
        return {};
      }
    });
  }, [data]);

  /**
   * Determines table headers - uses provided headers or auto-detects from data.
   */
  const tableHeaders = useMemo(() => {
    if (headers && headers.length > 0) {
      // Validate custom headers
      if (!Array.isArray(headers)) {
        console.warn('TableDisplay: headers must be an array');
        return detectHeaders(processedData);
      }
      return headers;
    }
    return detectHeaders(processedData);
  }, [headers, processedData]);

  /**
   * Filters data based on search term across all columns.
   */
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return processedData;

    const query = searchTerm.toLowerCase();
    return processedData.filter(row =>
      tableHeaders.some(header => {
        const cellValue = formatCellValue(row[header]);
        return cellValue.toLowerCase().includes(query);
      })
    );
  }, [processedData, searchTerm, tableHeaders]);

  /**
   * Sorts data based on current sort configuration.
   */
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = formatCellValue(a[sortConfig.key]);
      const bValue = formatCellValue(b[sortConfig.key]);

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  /**
   * Paginates sorted data for current page display.
   */
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * maxRows;
    return sortedData.slice(startIndex, startIndex + maxRows);
  }, [sortedData, currentPage, maxRows]);

  /**
   * Total number of pages for pagination controls.
   */
  const totalPages = Math.ceil(sortedData.length / maxRows);

  // =============================================================================
  // EVENT HANDLERS - User Interaction Management
  // =============================================================================

  /**
   * Handles column sorting - toggles between ascending/descending.
   */
  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    // Reset to first page when changing sort
    setCurrentPage(1);
  }, []);

  /**
   * Handles search input changes and resets to first page.
   */
  const handleSearch = useCallback((e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  }, []);

  /**
   * Handles data export in specified format with error handling and user feedback.
   */
  const handleSave = useCallback(async (format) => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      let content;
      let mimeType;
      let extension;

      switch (format) {
        case 'csv':
          content = exportToCSV(sortedData, tableHeaders);
          mimeType = 'text/csv;charset=utf-8;';
          extension = 'csv';
          break;

        case 'json':
          content = JSON.stringify(sortedData, null, 2);
          mimeType = 'application/json;charset=utf-8;';
          extension = 'json';
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Create and trigger download using Blob API
      const blob = new Blob(['\uFEFF' + content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const filename = `${saveConfig.defaultFilename}-${timestamp}.${extension}`;

      link.href = url;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up URL object
      URL.revokeObjectURL(url);

      setSaveStatus({
        type: 'success',
        message: `Exported ${sortedData.length} rows as ${filename}`
      });

    } catch (error) {
      console.error('TableDisplay export error:', error);
      setSaveStatus({
        type: 'error',
        message: `Export failed: ${error.message}`
      });
    } finally {
      setIsSaving(false);
      // Clear status after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [sortedData, tableHeaders, saveConfig.defaultFilename]);

  // =============================================================================
  // RENDER HELPERS - UI Component Generation
  // =============================================================================

  /**
   * Renders appropriate sort icon for column header based on current sort state.
   */
  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronDown className="h-3 w-3 text-slate-400 opacity-50" />;
    }
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-600" />
      : <ChevronDown className="h-3 w-3 text-blue-600" />;
  };

  /**
   * Renders save/export buttons with status indicators and loading states.
   */
  const renderSaveButton = () => {
    if (!enableSave || sortedData.length === 0) return null;

    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          {saveConfig.formats.map(format => (
            <button
              key={format}
              onClick={() => handleSave(format)}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors shadow-sm"
              aria-label={`Export as ${format.toUpperCase()}`}
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3 w-3" aria-hidden="true" />
              )}
              Export {format.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Save status notification */}
        {saveStatus && (
          <div
            className={`absolute top-full left-0 mt-2 px-3 py-2 rounded-lg text-xs font-medium z-10 shadow-lg ${saveStatus.type === 'success'
                ? 'bg-green-100 text-green-800 border border-green-200'
                : 'bg-red-100 text-red-800 border border-red-200'
              }`}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              {saveStatus.type === 'success' ? (
                <CheckCircle className="h-3 w-3" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
              )}
              {saveStatus.message}
            </div>
          </div>
        )}
      </div>
    );
  };

  // =============================================================================
  // EARLY RETURN CONDITIONS - Component Visibility
  // =============================================================================

  // Return null if component is explicitly hidden
  if (!isVisible) return null;

  // =============================================================================
  // RENDER LOGIC - Empty State Handling
  // =============================================================================

  // Handle empty data state with informative message and graceful degradation
  if (!processedData || processedData.length === 0) {
    return (
      <div
        className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm ${className}`}
        role="region"
        aria-label={title}
      >
        {/* Header remains visible even with no data */}
        <div className="px-5 py-4 border-b border-slate-100/80">
          <div className="flex items-center gap-3">
            <div
              className="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm"
              aria-hidden="true"
            >
              <TableIcon className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">No data available</p>
            </div>
          </div>
        </div>

        {/* Empty state illustration */}
        <div className="p-8 text-center" role="status" aria-live="polite">
          <Grid className="h-12 w-12 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-500 text-sm">No data to display</p>
          {data && data.length > 0 && (
            <p className="text-slate-400 text-xs mt-1">
              Data format may be incompatible
            </p>
          )}
        </div>
      </div>
    );
  }

  // =============================================================================
  // MAIN COMPONENT RENDER
  // =============================================================================

  return (
    <div
      className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm ${className}`}
      role="region"
      aria-label={`${title} table with ${sortedData.length} rows`}
    >
      {/* HEADER SECTION - Title, Controls, and Expand/Collapse */}
      <div className="px-5 py-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between gap-3">
          {/* Title and Expand/Collapse Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-3 hover:bg-slate-100/50 rounded-xl p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-expanded={isExpanded}
            aria-controls="table-content"
          >
            <div
              className="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm"
              aria-hidden="true"
            >
              <TableIcon className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">
                {sortedData.length} row{sortedData.length !== 1 ? 's' : ''}
                {filteredData.length !== processedData.length && (
                  <span aria-live="polite">
                    {' '}(filtered from {processedData.length})
                  </span>
                )}
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''
                }`}
              aria-hidden="true"
            />
          </button>

          {/* Save/Export Buttons */}
          <div className="flex items-center gap-3">
            {renderSaveButton()}
          </div>
        </div>
      </div>

      {/* TABLE CONTENT SECTION - Search, Table, and Pagination */}
      {isExpanded && (
        <div id="table-content" className="p-5">
          {/* SEARCH BAR - Global Search Filter */}
          {searchable && (
            <div className="mb-4" role="search" aria-label="Table search">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Search across all columns..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  aria-label="Search table content"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label="Clear search"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MAIN TABLE - Responsive Table with Sortable Headers */}
          <div className="border rounded-xl shadow-sm overflow-hidden" role="table" aria-label={title}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr role="row">
                    {tableHeaders.map((header) => (
                      <th
                        key={header}
                        onClick={() => handleSort(header)}
                        className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors focus:outline-none focus:bg-slate-100"
                        role="columnheader"
                        aria-sort={
                          sortConfig.key === header
                            ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                            : 'none'
                        }
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSort(header);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate" title={header}>
                            {header}
                          </span>
                          {renderSortIcon(header)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200" role="rowgroup">
                  {paginatedData.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="hover:bg-slate-50 transition-colors"
                      role="row"
                    >
                      {tableHeaders.map((header) => (
                        <td
                          key={header}
                          className="px-4 py-3 text-sm text-slate-800 font-mono max-w-xs"
                          role="cell"
                        >
                          <div
                            className="truncate"
                            title={formatCellValue(row[header])}
                          >
                            {formatCellValue(row[header])}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PAGINATION CONTROLS - Navigation for Large Datasets */}
          {totalPages > 1 && (
            <div
              className="mt-4 flex items-center justify-between"
              role="navigation"
              aria-label="Table pagination"
            >
              <div className="text-sm text-slate-500" aria-live="polite">
                Showing {((currentPage - 1) * maxRows) + 1} to{' '}
                {Math.min(currentPage * maxRows, sortedData.length)} of{' '}
                {sortedData.length} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
