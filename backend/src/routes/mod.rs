// src/routes/mod.rs

//! # Routes Module
//! 
//! Defines the main routing structure for the Axum server.

use axum::{routing::get, Router};
use crate::api::state::AppState;

pub mod websocket;

/// Creates and configures the main application router.
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Define the main WebSocket route at the root path '/ws'
        .route("/ws", get(websocket::websocket_handler))
        // Add other HTTP routes here if needed (e.g., /api/health, /api/users)
        // .route("/api/health", get(health_handler))
        .with_state(state)
}
