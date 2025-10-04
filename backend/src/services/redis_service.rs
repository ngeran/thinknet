use redis::Msg;  // Remove AsyncCommands since it's unused
use tokio::sync::broadcast;
use std::env;
use tracing::{info, error, instrument};
use futures::StreamExt; // Required for the .next() stream method

// The channel that the Python scripts will publish to
const REDIS_CHANNEL: &str = "automation_job_updates";

/// Starts a background task to listen for messages on Redis Pub/Sub.
/// This function runs in a continuous loop to handle potential connection failures.
#[instrument(skip(ws_tx))]
pub async fn start_redis_listener(
    ws_tx: broadcast::Sender<String>
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| "redis_broker".to_string());
    let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let redis_url = format!("redis://{}:{}", redis_host, redis_port);
    info!("Starting Redis listener, attempting connection to: {}", redis_url);
    
    // Use an infinite loop to handle reconnections if the connection fails
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

/// Connects to Redis, subscribes to the channel, and runs the message consumption loop.
async fn try_connect_and_subscribe(
    url: &str,
    ws_tx: broadcast::Sender<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = redis::Client::open(url)?;
    let conn = client.get_tokio_connection().await?;
    
    let mut pubsub = conn.into_pubsub();
    pubsub.subscribe(REDIS_CHANNEL).await?;
    info!("Successfully subscribed to Redis channel: {}", REDIS_CHANNEL);
    
    // Get the stream handle. .on_message() returns a Stream.
    let mut message_stream = pubsub.on_message(); 
    
    // Iterate over the stream using .next().await
    // The stream returns Option<Msg>, not Option<Result<Msg, _>>
    while let Some(msg) = message_stream.next().await {
        
        // --- 1. Handle Payload Extraction Error ---
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(e) => {
                // If the payload can't be extracted, log the error and skip this message.
                error!("Failed to get payload from Redis message: {}", e);
                continue; 
            }
        };
        
        info!("Redis message received: {}", payload);
        
        // --- 2. Broadcast to WebSocket Clients ---
        if ws_tx.send(payload).is_err() {
            // Non-fatal: means no WebSocket clients are listening.
        }
    }
    
    // Stream terminated normally (connection closed)
    Ok(())
}
