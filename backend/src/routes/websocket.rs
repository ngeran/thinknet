// File Path: backend/src/routes/websocket.rs

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse
};
use uuid::Uuid;
use futures::{StreamExt, SinkExt};
use tracing::{info, warn};
use serde::{Deserialize, Serialize};

// 🔑 FIX: Corrected import path from crate::api::state
use crate::api::state::AppState; 
use crate::services::redis_service::RedisMessage; 

// Client command struct for SUBSCRIBE/UNSUBSCRIBE messages
#[derive(Debug, Deserialize, Serialize)]
struct ClientCommand {
    #[serde(rename = "type")] 
    command_type: String,
    channel: String,
}


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

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Placeholder channel (unused in this version)
    let (_tx, mut rx) = tokio::sync::mpsc::channel::<String>(32); 

    let mut broadcast_rx = state.connection_manager.broadcast_sender.subscribe();

    // --- Sender Task (Handles messages from Redis to Client) ---
    let connection_id_clone = connection_id.to_string();
    let state_clone = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Handle targeted messages (currently unused/placeholder)
                Some(msg) = rx.recv() => {
                    if ws_sender.send(Message::Text(msg)).await.is_err() {
                        warn!("Could not send targeted message to client {}.", connection_id_clone);
                        break;
                    }
                }
                
                // CORE LOGIC: Handle incoming RedisMessage from the global broadcast
                Ok(redis_msg) = broadcast_rx.recv() => {
                    let is_subscribed = {
                        let subs = state_clone.connection_manager.subscriptions.lock().await;
                        // Check if the client's subscribed channel matches the message's source channel
                        subs.get(&connection_id_clone)
                            .map(|sub_channel| sub_channel == &redis_msg.channel)
                            .unwrap_or(false)
                    };

                    if is_subscribed {
                        // Serialize the message
                        let serialized_msg = match serde_json::to_string(&redis_msg) {
                             Ok(s) => s,
                             Err(e) => {
                                 warn!("Failed to serialize RedisMessage for client {}: {}", connection_id_clone, e);
                                 continue;
                             }
                        };
                        
                        // Send the message to the client
                        if ws_sender.send(Message::Text(serialized_msg)).await.is_err() {
                            warn!("Could not send job message to client {}.", connection_id_clone);
                            break; 
                        }
                    }
                }
                
                else => break, 
            }
        }
        info!("Job message worker stopped for client {}", connection_id_clone);
    });
    
    // --- Receiver Loop (Handles messages from Client to Hub) ---
    let connection_id_rcv = connection_id.to_string();
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(msg) => {
                match msg {
                    Message::Text(text) => {
                        info!("Received command from {}: {}", connection_id, text);
                        
                        // Parse the client command (SUBSCRIBE/UNSUBSCRIBE)
                        match serde_json::from_str::<ClientCommand>(&text) {
                            Ok(cmd) => {
                                match cmd.command_type.as_str() {
                                    "SUBSCRIBE" => {
                                        state.connection_manager.subscribe(&connection_id_rcv, &cmd.channel).await;
                                    },
                                    "UNSUBSCRIBE" => {
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
                    _ => info!("Client {} sent non-text message.", connection_id),
                }
            }
            Err(e) => {
                warn!("WebSocket error for client {}: {}", connection_id, e);
                break;
            }
        }
    }

    // Cleanup
    state.connection_manager.remove_connection(&connection_id_rcv).await;
    info!("WebSocket handler finished for client {}", connection_id);
}
