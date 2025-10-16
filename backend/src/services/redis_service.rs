// File Path: backend/src/services/redis_service.rs

use tokio::sync::broadcast;
use std::env;
use tracing::{info, error, instrument};
use futures::StreamExt;
use serde::Serialize; 

// The pattern the Rust Hub will subscribe to, catching all job updates.
const REDIS_CHANNEL_PATTERN: &str = "ws_channel:job:*";

/// Struct to wrap the message received from Redis, including the channel name.
/// This is the data structure sent to WebSocket clients, allowing them to filter.
#[derive(Debug, Clone, Serialize)]
pub struct RedisMessage {
    pub channel: String, // The Redis channel the message came from (e.g., ws_channel:job:UUID)
    pub data: String,    // The actual JSON payload from the Python script
}

/// Starts a continuous background task to listen for messages on Redis Pub/Sub using a pattern.
#[instrument(skip(ws_tx))]
pub async fn start_redis_listener(
    // The ws_tx is the Sender for the global broadcast channel in ConnectionManager
    ws_tx: broadcast::Sender<RedisMessage> 
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| "redis_broker".to_string());
    let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let redis_url = format!("redis://{}:{}", redis_host, redis_port);
    info!("Starting Redis listener, attempting connection to: {}", redis_url);
    
    loop {
        match try_connect_and_subscribe(&redis_url, ws_tx.clone()).await {
            Ok(_) => info!("Redis subscription cleanly stopped (unexpected). Restarting..."),
            Err(e) => {
                error!("Redis connection or subscription failed: {}. Retrying in 5 seconds...", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

/// Connects to Redis, subscribes to the channel pattern, and runs the message consumption loop.
async fn try_connect_and_subscribe(
    url: &str,
    ws_tx: broadcast::Sender<RedisMessage>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = redis::Client::open(url)?;
    // Use the tokio connection for async operations
    let conn = client.get_tokio_connection().await?; 
    
    let mut pubsub = conn.into_pubsub();
    
    // Subscribing to a PATTERN
    pubsub.psubscribe(REDIS_CHANNEL_PATTERN).await?;
    info!("Successfully subscribed to Redis pattern: {}", REDIS_CHANNEL_PATTERN);
    
    let mut message_stream = pubsub.on_message();
    
    while let Some(msg) = message_stream.next().await {
        
        // --- 1. Handle Payload Extraction ---
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(e) => {
                error!("Failed to get payload from Redis message: {}", e);
                continue;
            }
        };
        
        // --- 2. Create the RedisMessage struct ---
        // Get the channel name the message was received on
        let redis_channel = msg.get_channel_name().to_string();
        let wrapped_message = RedisMessage {
            channel: redis_channel,
            data: payload,
        };
        
        info!("Redis message received on channel {}: {}", wrapped_message.channel, wrapped_message.data);
        
        // --- 3. Broadcast the WRAPPED message to WebSocket Clients ---
        // The clients' workers will check the 'channel' field to filter the message.
        if ws_tx.send(wrapped_message).is_err() {
            // Non-fatal: means no WebSocket clients are listening currently.
        }
    }
    
    Ok(())
}
