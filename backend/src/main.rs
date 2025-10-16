// File Path: backend/src/main.rs (FINALIZED WITH REDIS INTEGRATION)

//! # Main Application Entry Point
//! 
//! Sets up the asynchronous environment, initializes application-wide shared state, 
//! and starts the Axum WebSocket server, including the background Redis subscriber.

use std::{net::SocketAddr, sync::Arc};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tokio::net::TcpListener;
use tokio::spawn; // 🔑 FIX: Import tokio::spawn for background tasks

// Import modules from the project structure
mod api;
mod routes;
mod services;
mod models;

// Import core components
use api::state::{AppState, ConnectionManager};
use services::yaml_service::YamlService;
use routes::create_router;

// Import the Redis service module
use services::redis_service; 

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

    // 2. Initialize Shared State 
    
    // Initialize YamlService
    let yaml_service = YamlService::new(SCHEMA_DIR, DATA_DIR)
        .await
        .expect("Failed to initialize YamlService. Check shared/data and shared/schemas paths/contents.");
    
    // Initialize ConnectionManager (Contains the global broadcast channel)
    let connection_manager = Arc::new(ConnectionManager::new());
    
    // 3. 🚀 CRITICAL NEW STEP: Start Redis Listener Task
    // Get a clone of the broadcast sender from the ConnectionManager.
    let ws_broadcast_tx = connection_manager.broadcast_sender.clone();
    
    // Spawn the Redis listener into a background task
    spawn(async move {
        match redis_service::start_redis_listener(ws_broadcast_tx).await {
            Ok(_) => info!("Redis listener exited gracefully."),
            Err(e) => panic!("Redis listener failed critically: {}", e),
        }
    });

    // 4. Initialize AppState and Router
    let app_state = AppState::new(connection_manager.clone(), Arc::new(yaml_service));
    let app = create_router(app_state);

    // 5. Start the Axum Server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3100));
    let listener = TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to 0.0.0.0:3100");
        
    info!("Server listening on {}", addr);
    
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}
