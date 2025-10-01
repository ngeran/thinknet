// File Path: backend/src/routes/health.rs
//! Health Check Routes
//! 
//! Provides health monitoring and system status endpoints

use axum::{routing::get, Router};
use crate::api::state::AppState; // Use the correct path for AppState

/// Health check endpoint
/// Returns "OK" if the server is running correctly
pub async fn health_check() -> &'static str {
    "OK"
}

/// Creates health-related routes and merges them into the main router.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
}
