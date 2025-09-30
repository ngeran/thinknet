// src/main.rs

//! # Main Application Entry Point
//! 
//! Sets up the asynchronous environment, initializes application-wide shared state, 
//! and starts the Axum WebSocket server on the configured port (3100).

use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
// FIX: Required for Axum 0.7+ to create the listener and run the server.
use tokio::net::TcpListener; 

// Import modules from the project structure
mod api;
mod routes;
mod services;

// Import core components
use api::state::AppState;
use routes::create_router;

/// The main entry point for the Tokio runtime.
#[tokio::main]
async fn main() {
    // 1. Setup Logging
    // Initialize tracing subscriber for structured logging.
    // NOTE: This now requires the "env-filter" feature in Cargo.toml.
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                // Default filter: 'info' level for our app, 'debug' for underlying HTTP stack.
                .unwrap_or_else(|_| "rust_websocket_backend=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer()) // Use console formatting layer
        .init();

    info!("Starting Rust WebSocket Backend Server...");

    // 2. Initialize Shared State
    // Create the global application state (App State) instance, which holds
    // the Arc<ConnectionManager> for thread-safe access across routes.
    let state = AppState::new();

    // 3. Configure Router
    // Build the Axum router, attaching the /ws route and the shared state.
    let app = create_router(state);

    // 4. Configure Server Listener (FIX: Axum 0.7 style)
    // Use the specified port 3100 to avoid conflicts.
    let addr = SocketAddr::from(([127, 0, 0, 1], 3100)); 
    
    // Create a TCP listener using Tokio. This is the new way to manage binding.
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind TCP listener to {}: {}", addr, e);
            return;
        }
    };
    
    info!("Server listening on http://{}", addr);

    // 5. Run the Server (FIX: Use axum::serve)
    // Serve the application using the created listener.
    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
