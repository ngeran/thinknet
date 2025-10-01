// File Path: backend/src/models/mod.rs
// (Content provided by the user in the initial request)

// =========================================================================================
// SECTION 1: IMPORTS
// =========================================================================================

use axum::{
    response::{IntoResponse, Response},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// =========================================================================================
// SECTION 2: WEB SOCKET MODELS (Dummy declaration)
// =========================================================================================
// NOTE: websocket.rs is likely in src/models/websocket.rs, but we'll assume it's just a placeholder here.
// If you have a file at src/models/websocket.rs, uncomment the line below.
// pub mod websocket;


// =========================================================================================
// SECTION 3: API ERROR HANDLING
// =========================================================================================

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("YAML parsing error: {0}")]
    YamlParseError(String),
    
    #[error("File not found: {0}")]
    FileNotFound(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Bad request: {0}")]
    BadRequest(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Deserialization error: {0}")]
    DeserializationError(String),
    
    #[error("WebSocket error: {0}")]
    WebSocketError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
    
    #[error("Internal server error: {0}")]
    InternalError(String),
    
    #[error("Execution error: {0}")]
    ExecutionError(String),
    
    #[error("Job execution error: {0}")]
    JobExecutionError(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            ApiError::YamlParseError(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ApiError::FileNotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::NotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ApiError::IoError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()),
            ApiError::SerializationError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Serialization failed".to_string()),
            ApiError::DeserializationError(_) => (StatusCode::BAD_REQUEST, "Invalid request format".to_string()),
            ApiError::WebSocketError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "WebSocket error".to_string()),
            ApiError::ValidationError(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ApiError::InternalError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()),
            ApiError::ExecutionError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ApiError::JobExecutionError(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = serde_json::json!({
            "error": error_message,
            "status": status.as_u16()
        });

        (status, axum::Json(body)).into_response()
    }
}

// Implement the From trait for `axum::Error` to `ApiError`
impl From<axum::Error> for ApiError {
    fn from(inner: axum::Error) -> Self {
        ApiError::ExecutionError(inner.to_string())
    }
}

// =========================================================================================
// SECTION 4: JOB EVENT MODELS (Content as provided)
// =========================================================================================

/// Standardized job event for real-time progress tracking across all device operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobEvent {
    pub job_id: String,
    pub device: String,
    pub job_type: String,
    pub event_type: String,
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub data: serde_json::Value,
    pub error: Option<String>,
}

impl JobEvent {
    pub fn new(job_id: &str, device: &str, job_type: &str, event_type: &str, status: &str, data: serde_json::Value) -> Self {
        Self {
            job_id: job_id.to_string(),
            device: device.to_string(),
            job_type: job_type.to_string(),
            event_type: event_type.to_string(),
            status: status.to_string(),
            timestamp: Utc::now(),
            data,
            error: None,
        }
    }
    
    pub fn with_error(job_id: &str, device: &str, job_type: &str, error: &str, data: serde_json::Value) -> Self {
        Self {
            job_id: job_id.to_string(),
            device: device.to_string(),
            job_type: job_type.to_string(),
            event_type: "failed".to_string(),
            status: "failed".to_string(),
            timestamp: Utc::now(),
            data,
            error: Some(error.to_string()),
        }
    }
}

/// Request structure for subscribing to job events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobSubscriptionRequest {
    pub device_filter: Option<String>,
    pub job_type_filter: Option<String>,
}

/// Response structure for job subscription confirmation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobSubscriptionResponse {
    pub subscription_id: String,
    pub topics: Vec<String>,
}

// =========================================================================================
// SECTION 5: NAVIGATION MODELS (Content as provided)
// =========================================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationConfig {
    pub items: Vec<NavigationItem>,
    pub settings: Option<NavigationSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationItem {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub path: Option<String>,
    pub children: Option<Vec<NavigationItem>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationSettings {
    pub theme: Option<String>,
    pub layout: Option<String>,
    pub collapsible: Option<bool>,
}

// =========================================================================================
// SECTION 6: BACKUP & RESTORE MODELS (Content as provided)
// =========================================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRequest {
    pub hostname: String,
    pub username: String,
    pub password: String,
    pub inventory_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResponse {
    pub status: String,
    pub message: String,
    pub logs: Option<String>,
    pub files: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreRequest {
    pub hostname: String,
    pub username: String,
    pub password: String,
    pub backup_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResponse {
    pub status: String,
    pub message: String,
    pub logs: Option<String>,
}
