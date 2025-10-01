// backend/src/routes/mod.rs (Final Corrected Version)

use axum::{routing::get, Router};
use crate::api::state::AppState; // Changed from AppState to crate::api::state::AppState

pub mod websocket;
pub mod navigation;
pub mod health; // Now points to the health.rs file you provided

/// Creates and configures the main application router.
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Define the main WebSocket route at the root path '/ws'
        .route("/ws", get(websocket::websocket_handler))

        // Merge health monitoring routes
        .merge(health::routes())

        // Merge navigation/YAML data routes
        .merge(navigation::routes()) // Use navigation::routes() instead of yaml::routes()
        
        .with_state(state)

        // NOTE: The previous line `.merge(yaml::routes())` is REMOVED
}
