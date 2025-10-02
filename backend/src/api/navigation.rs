// File Path: backend/src/api/navigation.rs

// ====================================================================
// SECTION 1: Imports and Constants
// Description: Imports necessary libraries and defines global constants.
// ====================================================================

use axum::{
    extract::{Query, State}, 
    Json
};
use std::collections::HashMap;
use serde_json::Value;

use crate::{
    api::state::AppState, 
    models::{
        ApiResult, 
        // Note: NavigationConfig is no longer directly used in get_navigation, 
        // but kept here as a reference model.
        // ApiError, NavigationConfig 
    }
};

const DEFAULT_NAVIGATION_SCHEMA: &str = "navigation";


// ====================================================================
// SECTION 2: Primary Navigation Handlers
// Description: API endpoints for fetching main navigation data.
// ====================================================================

/// Fetches and returns the primary navigation configuration.
/// 
/// This handler loads the default 'navigation.yaml', validates it against 
/// the schema, and returns the resulting JSON data.
pub async fn get_navigation(
    Query(params): Query<HashMap<String, String>>, 
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let schema_name = params.get("schema").map(|s| s.as_str()).unwrap_or(DEFAULT_NAVIGATION_SCHEMA);
    
    // 1. Fetch data: Loads the file, converts to Value, and validates against the schema.
    let yaml_data = state.yaml_service
        .get_yaml_data(schema_name, None)
        .await?;

    // 2. FIX APPLIED: The previous attempt to deserialize into NavigationConfig was 
    // removed here because the YAML file structure (an array of items) did not match
    // the struct's expected root structure (an object with an 'items' key).
    
    // 3. Return the raw, validated JSON Value directly.
    Ok(Json(yaml_data)) 
}

/// Fetches settings-specific navigation.
/// 
/// This route uses a separate schema/data file (e.g., 'settings_navigation.yaml')
/// to serve specialized navigation items.
pub async fn get_settings_navigation(
    Query(params): Query<HashMap<String, String>>, 
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let schema_name = params.get("schema").map(|s| s.as_str()).unwrap_or("settings_navigation");
    
    let yaml_data = state.yaml_service
        .get_yaml_data(schema_name, None)
        .await?;

    Ok(Json(yaml_data))
}


// ====================================================================
// SECTION 3: Validation Endpoint
// Description: API endpoint for explicitly triggering and checking data validation.
// ====================================================================

/// Fetches navigation data for a specific YAML file and performs validation.
/// 
/// This is typically used for debugging, returning a JSON object that explicitly 
/// states if the data is 'valid' along with the data itself or validation errors.
pub async fn get_navigation_from_yaml(
    Query(params): Query<HashMap<String, String>>, 
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let file_path = params.get("file").map(|s| s.as_str());
    let schema_name = params.get("schema").map(|s| s.as_str()).unwrap_or(DEFAULT_NAVIGATION_SCHEMA);

    // This service call returns a Value structured as: {"valid": bool, "data": Value}
    let validated_result = state.yaml_service
        .validate_yaml_data(schema_name, file_path)
        .await?;

    // The result from validate_yaml_data is a JSON Value confirming validation status
    Ok(Json(validated_result))
}
