// File Path: backend/src/api/state.rs

use std::{sync::Arc, collections::HashMap};
use tokio::sync::{broadcast, mpsc, Mutex};
use crate::services::{yaml_service::YamlService, redis_service::RedisMessage};
use tracing::{info, warn};

// --- 1. ConnectionManager ---
/// Manages active WebSocket connections, the global broadcast channel, 
/// and client job subscriptions.
pub struct ConnectionManager {
    /// Global channel used to push messages received from Redis Pub/Sub to all connected clients.
    pub broadcast_sender: broadcast::Sender<RedisMessage>,
    
    /// Map to track which client is subscribed to which job channel.
    /// Key: WebSocket Connection ID (String, from Uuid)
    /// Value: The Redis channel name (String, e.g., "ws_channel:job:UUID")
    pub subscriptions: Mutex<HashMap<String, String>>,
    
    /// Map to track individual connections (kept for future targeted messaging/cleanup).
    pub connections: Mutex<HashMap<String, mpsc::Sender<String>>>,
}

impl ConnectionManager {
    /// Capacity for the global broadcast channel.
    const BROADCAST_CHANNEL_CAPACITY: usize = 100;

    /// Creates a new ConnectionManager instance.
    pub fn new() -> Self {
        // Create the broadcast channel that carries RedisMessage structs
        let (tx, _rx) = broadcast::channel(Self::BROADCAST_CHANNEL_CAPACITY);
        
        Self {
            broadcast_sender: tx,
            subscriptions: Mutex::new(HashMap::new()),
            connections: Mutex::new(HashMap::new()),
        }
    }
    
    /// Publishes a generic message to all clients via the global broadcast channel.
    /// Primarily used for diagnostic or non-job messages.
    pub async fn broadcast(&self, message: &str) {
        let msg = RedisMessage {
            channel: "broadcast".to_string(),
            data: message.to_string(),
        };
        if let Err(e) = self.broadcast_sender.send(msg) {
            tracing::warn!("Failed to broadcast message: {}", e);
        }
    }
    
    /// Adds a subscription for a client to a specific job channel.
    /// This map is checked by the WebSocket receive handler to filter messages.
    pub async fn subscribe(&self, connection_id: &str, channel_name: &str) {
        let mut subs = self.subscriptions.lock().await;
        subs.insert(connection_id.to_string(), channel_name.to_string());
        info!("Client {} subscribed to channel: {}", connection_id, channel_name);
    }
    
    /// Removes a client's job subscription.
    pub async fn unsubscribe(&self, connection_id: &str) {
        let mut subs = self.subscriptions.lock().await;
        subs.remove(connection_id);
        info!("Client {} unsubscribed.", connection_id);
    }

    /// Removes a connection from the active connections map and ensures unsubscribe.
    pub async fn remove_connection(&self, connection_id: &str) {
        self.unsubscribe(connection_id).await; // Unsubscribe upon disconnect

        let mut connections = self.connections.lock().await;
        connections.remove(connection_id);
        tracing::info!("Removed connection ID: {}", connection_id);
    }
}


/// --- 2. AppState ---
/// Holds application-wide shared state.
#[derive(Clone)]
pub struct AppState {
    pub connection_manager: Arc<ConnectionManager>,
    pub yaml_service: Arc<YamlService>,
}

impl AppState {
    /// Creates a new AppState instance.
    pub fn new(connection_manager: Arc<ConnectionManager>, yaml_service: Arc<YamlService>) -> Self {
        Self {
            connection_manager,
            yaml_service,
        }
    }
}
