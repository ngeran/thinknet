// backend/src/main.rs (FIXED)

//! # Main Application Entry Point
//! 
//! Sets up the asynchronous environment, initializes application-wide shared state, 
//! and starts the Axum WebSocket server on the configured port (3100).

use std::{net::SocketAddr, sync::Arc}; // Added 'Arc' for shared state
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tokio::net::TcpListener;

// Import modules from the project structure
mod api;
mod routes;
mod services;
mod models; // FIX 1: Declare the new 'models' module

// Import core components
use api::state::{AppState, ConnectionManager}; // FIX 2: Import ConnectionManager
use services::yaml_service::YamlService;      // FIX 3: Import YamlService
use routes::create_router;

/// The main entry point for the Tokio runtime.
#[tokio::main]
async fn main() {
    // Define the directories for configuration files (must match Docker copy paths)
    const SCHEMA_DIR: &str = "/app/shared/schemas"; 
    const DATA_DIR: &str = "/app/shared/data";
    
    // 1. Setup Logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rust_websocket_backend=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Rust WebSocket Backend Server...");

    // 2. Initialize Shared State (FIX 4: Initialize and construct AppState explicitly)

    // Initialize YamlService (must be done first as it's an async operation)
    let yaml_service = YamlService::new(SCHEMA_DIR, DATA_DIR)
        .await
        .expect("Failed to initialize YamlService. Check shared/data and shared/schemas paths/contents.");
    
    // Initialize ConnectionManager
    let connection_manager = Arc::new(ConnectionManager::new()); 

    // Create the global application state (AppState)
    let state = AppState::new(connection_manager, Arc::new(yaml_service));

    // 3. Configure Router
    let app = create_router(state);

    // 4. Configure Server Listener
    let addr = SocketAddr::from(([127, 0, 0, 1], 3100));
    
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind TCP listener to {}: {}", addr, e);
            return;
        }
    };
    
    info!("Server listening on http://{}", addr);

    // 5. Run the Server
    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
