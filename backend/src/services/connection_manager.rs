// src/services/connection_manager.rs

//! # Connection Manager Service
//! 
//! Manages the lifecycle of active WebSocket connections and handles broadcasting messages 
//! to all connected clients.

use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, Mutex};
use axum::extract::ws::Message;
use uuid::Uuid;
use tracing::{info, warn};

/// Type alias for a thread-safe shared map of active connections.
/// Key is the unique Uuid, value is the Axum WebSocket sender.
pub type Tx = broadcast::Sender<Arc<Message>>;
type ConnectionMap = Arc<Mutex<HashMap<Uuid, Tx>>>;

/// The central structure for managing WebSocket connections.
#[derive(Debug, Clone)]
pub struct ConnectionManager {
    // Map of active connection IDs to their respective message senders (Tx).
    // The inner type is for simplicity; typically, a more complex state
    // would be stored per connection.
    active_connections: ConnectionMap,
    // Broadcast channel for sending messages to all connected clients.
    // The Arc<Message> is used to allow sharing message payload across connections.
    pub broadcast_sender: Tx,
}

impl ConnectionManager {
    /// Creates a new `ConnectionManager`.
    /// 
    /// # Arguments
    /// * `capacity` - The buffer size for the internal broadcast channel.
    pub fn new(capacity: usize) -> Self {
        // Create a broadcast channel for message distribution.
        let (broadcast_sender, _) = broadcast::channel(capacity);
        
        ConnectionManager {
            active_connections: Arc::new(Mutex::new(HashMap::new())),
            broadcast_sender,
        }
    }

    /// Adds a new connection to the manager.
    /// (Note: In this simple structure, this logic is implicitly handled in the `ws_handler`).
    /// For a more complex setup, you would manage individual client Txs here.

    /// Broadcasts a message to all active connections.
    /// 
    /// # Arguments
    /// * `message` - The message to send. Cloned to be wrapped in Arc for sharing.
    pub async fn broadcast(&self, message: &str) {
        // Create an Arc<Message> from the string slice.
        let msg = Arc::new(Message::Text(message.to_owned()));
        
        info!("Broadcasting message: {}", message);
        
        // Send the message through the broadcast channel.
        match self.broadcast_sender.send(msg) {
            Ok(count) => info!("Successfully broadcasted to {} connections.", count),
            Err(e) => warn!("Failed to broadcast message: {}", e),
        }
    }

    /// Removes a connection from the manager.
    /// 
    /// # Arguments
    /// * `id` - The unique ID of the connection to remove.
    pub async fn remove_connection(&self, id: Uuid) {
        let mut map = self.active_connections.lock().await;
        if map.remove(&id).is_some() {
            info!("Connection {} removed.", id);
        } else {
            warn!("Attempted to remove non-existent connection: {}", id);
        }
    }
}
