// File Path: backend/src/routes/websocket.rs

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use tokio::sync::mpsc;
use tracing::{info, warn};
use uuid::Uuid;
use std::time::Duration;

use crate::api::state::AppState;

const CLIENT_TIMEOUT: Duration = Duration::from_secs(30);

/// Main entry point for the WebSocket upgrade.
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handles the WebSocket connection lifecycle and message passing.
async fn handle_socket(socket: WebSocket, state: AppState) {
    let connection_id = Uuid::new_v4();
    info!("New WebSocket connection established: {}", connection_id);

    // Split the socket into a sender and receiver
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // 1. Create a channel to send messages from the broadcast worker to this client's ws_sender
    let (_tx, mut rx) = mpsc::channel(32); // mpsc channel for targeted messages (if needed)

    // 2. Add the sender to the ConnectionManager for targeted messaging (if implemented)
    // NOTE: This is skipped for simplicity, as only the broadcast is required by the current errors.

    // 3. Subscribe to the global broadcast channel
    // FIX: This field is now correctly available in ConnectionManager
    let mut broadcast_rx = state.connection_manager.broadcast_sender.subscribe();

    // Spawn a worker to handle sending broadcast messages to the client
    let connection_id_clone = connection_id.to_string();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Channel for targeted messages (from tx above)
                Some(msg) = rx.recv() => {
                    if ws_sender.send(Message::Text(msg)).await.is_err() {
                        warn!("Could not send targeted message to client {}.", connection_id_clone);
                        break; 
                    }
                }
                // Channel for global broadcast messages
                Ok(msg) = broadcast_rx.recv() => {
                    if ws_sender.send(Message::Text(msg)).await.is_err() {
                        warn!("Could not send broadcast message to client {}.", connection_id_clone);
                        break; 
                    }
                }
                // If both channels are closed, or an error occurs, the loop exits.
                else => break, 
            }
        }
        info!("Broadcast worker stopped for client {}", connection_id_clone);
    });
    
    // Receiver loop: Handles messages coming *from* the client
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(msg) => {
                match msg {
                    Message::Text(text) => {
                        info!("Received message from {}: {}", connection_id, text);
                        
                        // Example: If a client sends a message, broadcast it to everyone
                        let broadcast_msg = format!("Client {} says: {}", connection_id, text);
                        
                        // FIX: Calling the broadcast method on the manager
                        state.connection_manager.broadcast(&broadcast_msg).await;
                    }
                    Message::Close(c) => {
                        info!("Client {} closed connection: {:?}", connection_id, c);
                        break;
                    }
                    // Handle other message types
                    _ => info!("Client {} sent non-text message.", connection_id),
                }
            }
            Err(e) => {
                warn!("WebSocket error for client {}: {}", connection_id, e);
                break;
            }
        }
    }

    // Cleanup: Remove the connection from the manager when the loop exits
    let id_string = connection_id.to_string();
    // FIX: Convert Uuid to &str for the remove_connection call (Fixes E0308)
    state.connection_manager.remove_connection(&id_string).await;
    info!("WebSocket handler finished for client {}", connection_id);
}
