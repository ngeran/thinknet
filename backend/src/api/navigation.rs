// File Path: backend/src/api/navigation.rs
//! Navigation API Handlers
//! Implements logic for fetching and managing navigation data using YamlService.

use axum::{
    extract::{Query, State}, 
    Json
};
use std::collections::HashMap;
use serde_json::Value;

use crate::{
    api::state::AppState, 
    models::{
        ApiResult, ApiError, 
        NavigationConfig
    }
};

const DEFAULT_NAVIGATION_SCHEMA: &str = "navigation";

/// Fetches and returns the primary navigation configuration.
/// 
/// This handler demonstrates fetching validated data from YamlService.
// FIX: The return type must be ApiResult<Json<Value>> to satisfy the Axum Handler trait (E0277)
pub async fn get_navigation(
    Query(params): Query<HashMap<String, String>>, 
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let schema_name = params.get("schema").map(|s| s.as_str()).unwrap_or(DEFAULT_NAVIGATION_SCHEMA);
    
    // Example: Fetch data for the main navigation schema
    let yaml_data = state.yaml_service
        .get_yaml_data(schema_name, None)
        .await?;

    // Optionally: Map the Value into a strongly typed struct (NavigationConfig)
    let _nav_config: NavigationConfig = serde_json::from_value(yaml_data.clone())
        .map_err(|e| ApiError::SerializationError(format!("Failed to deserialize navigation: {}", e)))?;

    Ok(Json(yaml_data)) // Return the raw validated JSON Value
}

/// Fetches navigation data for a specific YAML file and performs validation.
// FIX: The return type must be ApiResult<Json<Value>> (E0277)
pub async fn get_navigation_from_yaml(
    Query(params): Query<HashMap<String, String>>, 
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let file_path = params.get("file").map(|s| s.as_str());
    let schema_name = params.get("schema").map(|s| s.as_str()).unwrap_or(DEFAULT_NAVIGATION_SCHEMA);

    let validated_result = state.yaml_service
        .validate_yaml_data(schema_name, file_path)
        .await?;

    // The result from validate_yaml_data is already a JSON Value confirming validation status
    Ok(Json(validated_result))
}

/// Fetches settings-specific navigation (example of a specialized route).
// FIX: The return type must be ApiResult<Json<Value>> (E0277)
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
