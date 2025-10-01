// File Path: backend/src/api/state.rs

use std::{sync::Arc, collections::HashMap};
use tokio::sync::{broadcast, mpsc, Mutex}; 
use crate::services::yaml_service::YamlService; 

/// --- 1. ConnectionManager ---
/// Manages active WebSocket connections and broadcasting messages.
pub struct ConnectionManager {
    // Sender for the broadcast channel (used to send messages to ALL subscribers)
    pub broadcast_sender: broadcast::Sender<String>, 
    
    // Map to track individual connections (used for targeted messages or cleanup)
    pub connections: Mutex<HashMap<String, mpsc::Sender<String>>>, 
}

impl ConnectionManager {
    const BROADCAST_CHANNEL_CAPACITY: usize = 100;

    /// Creates a new ConnectionManager instance.
    pub fn new() -> Self {
        // Create the broadcast channel (tx is sender, _rx is thrown away since subscribers 
        // will create their own receivers).
        let (tx, _rx) = broadcast::channel(Self::BROADCAST_CHANNEL_CAPACITY);
        
        Self {
            broadcast_sender: tx, 
            connections: Mutex::new(HashMap::new()),
        }
    }
    
    /// Publishes a message to all subscribers. (Fixes E0599 - no method named `broadcast`)
    pub async fn broadcast(&self, message: &str) {
        if let Err(e) = self.broadcast_sender.send(message.to_string()) {
            tracing::warn!("Failed to broadcast message: {}", e);
        }
    }

    /// Removes a connection from the active connections map. 
    /// (Fixes E0599 - no method named `remove_connection`)
    // NOTE: Accepts &str, so the caller (websocket.rs) must convert Uuid.
    pub async fn remove_connection(&self, connection_id: &str) {
        let mut connections = self.connections.lock().await;
        connections.remove(connection_id);
        tracing::info!("Removed connection ID: {}", connection_id);
    }
}


/// --- 2. AppState ---
/// The global application state struct, shared across all Axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub connection_manager: Arc<ConnectionManager>, 
    pub yaml_service: Arc<YamlService>, 
}

impl AppState {
    /// Constructor called in main.rs to initialize state.
    pub fn new(connection_manager: Arc<ConnectionManager>, yaml_service: Arc<YamlService>) -> Self {
        Self {
            connection_manager,
            yaml_service,
        }
    }
}
