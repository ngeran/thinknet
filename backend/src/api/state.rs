// src/api/state.rs

//! # Application State
//! 
//! Defines the shared state that will be accessible by all route handlers.

use std::sync::Arc;
use crate::services::connection_manager::ConnectionManager;

/// The core application state, wrapped in an Arc for thread-safe sharing.
#[derive(Clone)]
pub struct AppState {
    // The central service for managing all WebSocket connections.
    pub connection_manager: Arc<ConnectionManager>,
}

impl AppState {
    /// Creates a new instance of the application state.
    pub fn new() -> Self {
        // Initialize the ConnectionManager with a capacity for the broadcast channel.
        let connection_manager = ConnectionManager::new(100); 
        
        AppState {
            connection_manager: Arc::new(connection_manager),
        }
    }
}
