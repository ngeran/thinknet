/**
 * =================================================================
 * ⚙️ Rust WebSocket Hub (Router & Handler)
 * =================================================================
 *
 * File Path: backend/src/routes/websocket.rs
 * Description:
 * This file defines the WebSocket endpoint and the core logic for handling
 * client connections, managing job subscriptions, and correctly relaying
 * real-time log messages from the Redis pipeline to the frontend.
 *
 * 🔑 CRITICAL FIX APPLIED:
 * When a client sends a SUBSCRIBE command (e.g., "job:UUID"), the Hub
 * now correctly prepends the "ws_channel:" prefix before calling the
 * ConnectionManager to store the subscription. This ensures the stored
 * channel name matches the channel used by the orchestrator in Redis.
 *
 */

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse
};
use uuid::Uuid;
use futures::{StreamExt, SinkExt};
use tracing::{info, warn};
use serde::{Deserialize, Serialize};

// Import core components
use crate::api::state::AppState; 
use crate::services::redis_service::RedisMessage; 

// Client command struct for SUBSCRIBE/UNSUBSCRIBE messages
#[derive(Debug, Deserialize, Serialize)]
struct ClientCommand {
    #[serde(rename = "type")] 
    command_type: String,
    channel: String, // e.g., "job:backup-UUID" sent by frontend
}


/// Router handler for the WebSocket upgrade request.
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Core function that handles the WebSocket connection lifecycle and message passing.
async fn handle_socket(socket: WebSocket, state: AppState) {
    let connection_id = Uuid::new_v4();
    info!("New WebSocket connection established: {}", connection_id);

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Placeholder channel (currently unused)
    let (_tx, mut rx) = tokio::sync::mpsc::channel::<String>(32); 

    // Subscribe to the global broadcast channel that carries all Redis messages.
    let mut broadcast_rx = state.connection_manager.broadcast_sender.subscribe();

    // --- Sender Task (Relays messages from Redis to Client) ---
    // This task listens for the global Redis broadcast and filters it down to 
    // only the messages the current client is subscribed to.
    let connection_id_clone = connection_id.to_string();
    let state_clone = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // 1. Handle targeted messages (mpsc, currently unused/placeholder)
                Some(msg) = rx.recv() => {
                    if ws_sender.send(Message::Text(msg)).await.is_err() {
                        warn!("Could not send targeted message to client {}.", connection_id_clone);
                        break;
                    }
                }
                
                // 2. CORE LOGIC: Handle incoming RedisMessage from the global broadcast
                Ok(redis_msg) = broadcast_rx.recv() => {
                    // redis_msg.channel will be "ws_channel:job:UUID"
                    let is_subscribed = {
                        let subs = state_clone.connection_manager.subscriptions.lock().await;
                        
                        // This check REQUIRES the stored subscription (sub_channel) 
                        // to be "ws_channel:job:UUID" to match redis_msg.channel.
                        subs.get(&connection_id_clone)
                            .map(|sub_channel| sub_channel == &redis_msg.channel)
                            .unwrap_or(false)
                    };

                    if is_subscribed {
                        // Serialize the full RedisMessage struct {channel: "...", data: "{...}"}
                        let serialized_msg = match serde_json::to_string(&redis_msg) {
                             Ok(s) => s,
                             Err(e) => {
                                 warn!("Failed to serialize RedisMessage for client {}: {}", connection_id_clone, e);
                                 continue;
                             }
                        };
                        
                        // Send the message to the client over the WebSocket
                        if ws_sender.send(Message::Text(serialized_msg)).await.is_err() {
                            warn!("Could not send job message to client {}. Client disconnected.", connection_id_clone);
                            break; // Exit the loop on send failure (disconnected client)
                        }
                    }
                }
                
                // If any side of the select fails (e.g., channel closed), break the loop
                else => break, 
            }
        }
        info!("Job message worker stopped for client {}", connection_id_clone);
    });
    
    // --- Receiver Loop (Handles commands from Client to Hub) ---
    let connection_id_rcv = connection_id.to_string();
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(msg) => {
                match msg {
                    Message::Text(text) => {
                        info!("Received command from {}: {}", connection_id, text);
                        
                        match serde_json::from_str::<ClientCommand>(&text) {
                            Ok(cmd) => {
                                match cmd.command_type.as_str() {
                                    "SUBSCRIBE" => {
                                        // 🔑 THE CRITICAL FIX: Add the prefix to match Redis publication
                                        // If client sends "job:UUID", we store "ws_channel:job:UUID"
                                        let full_channel_name = format!("ws_channel:{}", cmd.channel); 
                                        info!("Attempting to subscribe client {} to Redis channel: {}", connection_id_rcv, full_channel_name);
                                        
                                        // Call to ConnectionManager.subscribe in state.rs
                                        state.connection_manager.subscribe(&connection_id_rcv, &full_channel_name).await;
                                    },
                                    "UNSUBSCRIBE" => {
                                        info!("Unsubscribing client {} from current job.", connection_id_rcv);
                                        state.connection_manager.unsubscribe(&connection_id_rcv).await;
                                    },
                                    _ => warn!("Unknown client command type: {}", cmd.command_type),
                                }
                            }
                            Err(e) => {
                                warn!("Failed to parse client command as JSON: {}. Message: {}", e, text);
                            }
                        }
                    }
                    Message::Close(c) => {
                        info!("Client {} closed connection: {:?}", connection_id, c);
                        break;
                    }
                    // Ignore non-text messages
                    _ => info!("Client {} sent non-text message.", connection_id), 
                }
            }
            Err(e) => {
                warn!("WebSocket error for client {}: {}", connection_id, e);
                break;
            }
        }
    }

    // Cleanup when the connection is dropped (Receiver loop exits)
    state.connection_manager.remove_connection(&connection_id_rcv).await;
    info!("WebSocket handler finished for client {}", connection_id);
}
