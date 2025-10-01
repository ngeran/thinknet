// File Path: backend/src/routes/navigation.rs (Updated)

//! Navigation Routes
//!
//! Provides endpoints for fetching and validating UI navigation data.

use axum::{routing::get, Router};
use crate::api::state::AppState;
// FIX: Instead of declaring a local 'api' module, import the required handlers
// from the existing top-level 'api' module (which contains navigation handlers).
use crate::api::navigation;


/// Creates navigation-related routes.
pub fn routes() -> Router<AppState> {
    Router::new()
        // Route to get generic navigation data
        .route("/api/navigation", get(navigation::get_navigation))
        // Route to get navigation data loaded directly from a validated YAML file
        .route("/api/navigation/yaml", get(navigation::get_navigation_from_yaml))
        // Route to get settings-specific navigation items
        .route("/api/navigation/settings", get(navigation::get_settings_navigation))
}
