/**
 * =============================================================================
 * JSON EXTRACTION UTILITIES
 * =============================================================================
 *
 * Extracts nested JSON from WebSocket messages using robust parsing algorithms
 *
 * @module utils/jsonExtraction
 * @author nikos-geranios_vgi
 * @date 2025-11-05
 */
 
/**
 * 🎯 CRITICAL FUNCTION: Extracts nested JSON from WebSocket messages
 *
 * Backend sends PRE_CHECK_EVENT embedded in ORCHESTRATOR_LOG like this:
 * "[STDOUT] PRE_CHECK_EVENT:{...json...}"
 *
 * This function:
 * 1. Identifies embedded JSON patterns
 * 2. Extracts JSON using brace-counting algorithm
 * 3. Handles trailing text after JSON objects
 * 4. Provides comprehensive error logging
 * 5. Adds parse errors to UI for user visibility
 *
 * IMPROVEMENTS IN v4.6.0:
 * - Brace-counting algorithm handles complex nested JSON
 * - String escape handling prevents false brace matches
 * - Parse errors visible in job output
 * - Extensive logging for debugging
 * - Fallback extraction methods
 *
 * @param {Object} initialParsed - Initially parsed WebSocket message
 * @param {Function} setJobOutput - State setter to add error messages to UI
 *
 * @returns {Object} { payload: extractedData, isNested: boolean }
 *
 * @example
 * const { payload, isNested } = extractNestedProgressData(parsedMessage, setJobOutput);
 * if (payload.event_type === 'PRE_CHECK_COMPLETE') {
 *   // Handle pre-check completion
 * }
 */
export function extractNestedProgressData(initialParsed, setJobOutput) {
  let currentPayload = initialParsed;
 
  // ========================================================================
  // HANDLE ORCHESTRATOR_LOG WITH EMBEDDED JSON
  // ========================================================================
  if (initialParsed.event_type === "ORCHESTRATOR_LOG" && initialParsed.message) {
    const message = initialParsed.message;
 
    console.log("[NESTED_EXTRACTION] Full ORCHESTRATOR_LOG message:", message);
 
    // ======================================================================
    // PRE_CHECK_EVENT EXTRACTION
    // ======================================================================
    if (message.includes("PRE_CHECK_EVENT:")) {
      console.log("[NESTED_EXTRACTION] 🔍 Found PRE_CHECK_EVENT in message");
 
      try {
        // Find where JSON starts
        const jsonStartIndex = message.indexOf("PRE_CHECK_EVENT:") + "PRE_CHECK_EVENT:".length;
        let jsonString = message.substring(jsonStartIndex).trim();
 
        console.log("[NESTED_EXTRACTION] Raw JSON string length:", jsonString.length);
        console.log("[NESTED_EXTRACTION] First 200 chars:", jsonString.substring(0, 200));
 
        // Extract clean JSON using brace-counting algorithm
        const extractedJson = extractJsonWithBraceCounting(jsonString);
 
        if (extractedJson) {
          jsonString = extractedJson;
          console.log("[NESTED_EXTRACTION] ✅ Extracted clean JSON (length: " + jsonString.length + ")");
        } else {
          console.warn("[NESTED_EXTRACTION] ⚠️ Could not find end of JSON object, using full string");
        }
 
        console.log("[NESTED_EXTRACTION] Final JSON to parse:", jsonString.substring(0, 300) + "...");
 
        // Parse the extracted JSON
        const preCheckData = JSON.parse(jsonString);
 
        console.log("[NESTED_EXTRACTION] 🎯 SUCCESS: Extracted PRE_CHECK_EVENT data");
        console.log("[NESTED_EXTRACTION] Event type:", preCheckData.event_type);
        console.log("[NESTED_EXTRACTION] Full parsed data:", JSON.stringify(preCheckData, null, 2));
 
        // Verify critical data is present
        if (preCheckData.data?.pre_check_summary) {
          console.log("[NESTED_EXTRACTION] ✅ pre_check_summary found:", {
            total_checks: preCheckData.data.pre_check_summary.total_checks,
            passed: preCheckData.data.pre_check_summary.passed,
            warnings: preCheckData.data.pre_check_summary.warnings,
            critical_failures: preCheckData.data.pre_check_summary.critical_failures,
            can_proceed: preCheckData.data.pre_check_summary.can_proceed
          });
        } else if (preCheckData.pre_check_summary) {
          console.log("[NESTED_EXTRACTION] ✅ pre_check_summary found at root level");
        } else {
          console.warn("[NESTED_EXTRACTION] ⚠️ pre_check_summary NOT found in data");
          console.warn("[NESTED_EXTRACTION] Available keys:", Object.keys(preCheckData.data || preCheckData));
        }
 
        return { payload: preCheckData, isNested: true };
 
      } catch (parseError) {
        // ====================================================================
        // ERROR HANDLING - MAKE ERRORS VISIBLE TO USER
        // ====================================================================
        console.error('[NESTED_EXTRACTION] ❌ Failed to parse PRE_CHECK_EVENT JSON');
        console.error('[NESTED_EXTRACTION] Error message:', parseError.message);
        console.error('[NESTED_EXTRACTION] Error stack:', parseError.stack);
        console.error('[NESTED_EXTRACTION] Raw message:', message);
 
        // 🎯 CRITICAL: Add parse error to job output so user can see it
        if (setJobOutput) {
          setJobOutput(prev => [...prev, {
            timestamp: new Date().toISOString(),
            message: `⚠️ JSON Parse Error: ${parseError.message}`,
            level: 'error',
            event_type: 'PARSE_ERROR',
            data: {
              raw_message: message.substring(0, 500),
              error: parseError.message
            }
          }]);
        }
      }
    }
 
    // ======================================================================
    // OPERATION_COMPLETE EXTRACTION (backup method)
    // ======================================================================
    if (message.includes("OPERATION_COMPLETE")) {
      console.log("[NESTED_EXTRACTION] 🔍 Found OPERATION_COMPLETE in message");
      const operationMatch = message.match(/OPERATION_COMPLETE.*?(\{.*\})/s);
      if (operationMatch && operationMatch[1]) {
        try {
          const operationData = JSON.parse(operationMatch[1]);
          console.log("[NESTED_EXTRACTION] 🎯 Extracted OPERATION_COMPLETE");
          return { payload: operationData, isNested: true };
        } catch (parseError) {
          console.error('[NESTED_EXTRACTION] Failed to parse OPERATION_COMPLETE:', parseError);
        }
      }
    }
  }
 
  // ========================================================================
  // HANDLE NESTED DATA STRUCTURE (backup method)
  // ========================================================================
  if (initialParsed.data) {
    try {
      const dataPayload = typeof initialParsed.data === 'string'
        ? JSON.parse(initialParsed.data)
        : initialParsed.data;
 
      console.log("[NESTED_EXTRACTION] Processing nested data structure");
      return { payload: dataPayload, isNested: true };
    } catch (error) {
      console.debug('[NESTED_EXTRACTION] Data field is not valid JSON:', error);
    }
  }
 
  // Return original payload if no extraction needed
  return { payload: currentPayload, isNested: false };
}
 
/**
 * Extracts complete JSON object using brace-counting algorithm
 * Handles nested objects and string escaping
 *
 * @param {string} jsonString - String potentially containing JSON
 * @returns {string|null} Extracted JSON string or null if not found
 *
 * @private
 */
function extractJsonWithBraceCounting(jsonString) {
  let braceCount = 0;
  let jsonEndIndex = -1;
  let inString = false;
  let escapeNext = false;
 
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
 
    // Handle escape sequences in strings
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
 
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
 
    // Track string boundaries to ignore braces in strings
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
 
    // Count braces only outside of strings
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        // Found matching closing brace
        if (braceCount === 0) {
          jsonEndIndex = i + 1;
          console.log("[NESTED_EXTRACTION] Found complete JSON object at index:", jsonEndIndex);
          break;
        }
      }
    }
  }
 
  if (jsonEndIndex > 0) {
    return jsonString.substring(0, jsonEndIndex);
  }
 
  return null;
}