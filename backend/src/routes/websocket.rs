// src/routes/websocket.rs

//! # WebSocket Route Handler
//! 
//! This module defines the main logic for handling a single WebSocket connection. 
//! It performs the WebSocket upgrade, sets up the bidirectional message loops 
//! (sending broadcasts out, receiving client messages in), and handles cleanup.

// Removed: use std::sync::Arc; (Warning Fix: Arc is only needed in the State and ConnectionManager definitions, not here.)
use axum::{
    // WebSocketUpgrade is for the handshake; Message/WebSocket are the core types; State holds AppState.
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use uuid::Uuid;
use tracing::{info, error, debug};
// StreamExt and SinkExt provide convenient methods (like .next() and .send()) for async streams.
use futures::{stream::StreamExt, sink::SinkExt};

use crate::api::state::AppState;

// Removed: use crate::services::connection_manager::Tx; (Warning Fix: This type alias is not directly used here.)

/// Handles the initial HTTP request to upgrade to a WebSocket connection.
/// 
/// Axum automatically injects `WebSocketUpgrade` and the application `State`.
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    // The Axum 'State' extractor pulls AppState, which holds the ConnectionManager.
    State(state): State<AppState>,
) -> impl IntoResponse {
    info!("Incoming WebSocket handshake request.");
    
    // The core of the upgrade: instructs Axum to call 'handle_socket' once the 
    // WebSocket handshake is complete, passing the resulting 'WebSocket' stream.
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// The main asynchronous loop for an individual WebSocket connection.
/// 
/// This function runs concurrently for every active client.
// Fix: Removed 'mut' from 'socket' (Warning Fix: It's immediately consumed by .split(), so it never needs to be reassigned).
async fn handle_socket(socket: WebSocket, state: AppState) {
    // Generate a unique identifier for this specific connection.
    let connection_id = Uuid::new_v4();
    info!("New connection established: {}", connection_id);

    // --- 1. Setup the Broadcast Receiver (Server -> Client) ---
    
    // Get a receiver bound to the manager's global broadcast channel.
    // This channel is how all connections receive messages broadcasted by any other client/service.
    let mut rx = state.connection_manager.broadcast_sender.subscribe();

    // Split the single WebSocket stream into two asynchronous halves: 
    // a sender (to write messages) and a receiver (to read messages).
    let (mut sender, mut receiver) = socket.split();

    // --- 2. Spawn an Asynchronous Task for Outgoing Messages (Broadcast Loop) ---
    
    // This task runs in the background, listening only for broadcasts.
    let broadcast_task = tokio::spawn(async move {
        // Loop indefinitely, receiving messages from the broadcast channel.
        while let Ok(msg) = rx.recv().await {
            // The 'msg' is an Arc<Message>, so we clone the content (the Message itself)
            // and send it down the WebSocket sender stream to the client.
            if let Err(e) = sender.send(msg.as_ref().clone()).await {
                // If the send fails, it usually means the client has disconnected unexpectedly.
                error!("Error sending broadcast message to {}: {}", connection_id, e);
                break; // Exit the loop on error, effectively closing the sender side.
            }
        }
        info!("Broadcast task for {} finished.", connection_id);
    });

    // --- 3. Handle Incoming Messages (Client -> Server) ---
    
    // Loop indefinitely, waiting for messages from the client on the receiver stream.
    while let Some(result) = receiver.next().await {
        match result {
            Ok(msg) => {
                match msg {
                    Message::Text(text) => {
                        info!("Received message from {}: {}", connection_id, text);
                        
                        // Core Logic: Take the received text and broadcast it back to ALL clients.
                        let broadcast_msg = format!("Client {}: {}", connection_id, text);
                        state.connection_manager.broadcast(&broadcast_msg).await;
                    }
                    Message::Close(_) => {
                        debug!("Client {} requested close.", connection_id);
                        break; // Exit the loop if the client sends a close frame.
                    }
                    _ => {
                        // Ignore other WebSocket frame types (Binary, Ping, Pong, etc.).
                        debug!("Received non-text message from {}", connection_id);
                    }
                }
            }
            Err(e) => {
                // Log and break if a general WebSocket read error occurs.
                error!("WebSocket error for {}: {}", connection_id, e);
                break;
            }
        }
    }

    // --- 4. Cleanup and Shutdown ---
    
    // When the incoming message loop (while let Some...) breaks, 
    // we stop the complementary outgoing broadcast task.
    broadcast_task.abort(); 

    // Remove the connection ID from the ConnectionManager's internal tracking 
    // to ensure subsequent broadcasts don't try to send to a closed receiver.
    state.connection_manager.remove_connection(connection_id).await; 
    info!("Connection {} closed.", connection_id);
}
