// File Path: backend/src/services/yaml_service.rs
// Version: 3.1.2
// Description: YAML validation and schema management service.
// (Content provided by the user in the initial request)

// ====================================================
// SECTION: Imports and Struct Definition
// ====================================================

use crate::models::{ApiError, ApiResult};
use serde_json::Value;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    // Added for serde_yaml
    borrow::Borrow,
};
use tokio::fs;
use tracing::{info, warn};
use jsonschema::{Draft, JSONSchema};
use serde_yaml; // Explicitly included for serde_yaml::from_str

pub struct YamlService {
    pub schema_dir: PathBuf, // Made public for potential testing/debugging
    pub data_dir: PathBuf,   // Made public
    pub schemas: HashMap<String, JSONSchema>,
}

// ====================================================
// SECTION: Service Initialization
// ====================================================

impl YamlService {
    pub async fn new(schema_dir: &str, data_dir: &str) -> ApiResult<Self> {
        let schema_path = PathBuf::from(schema_dir);
        let data_path = PathBuf::from(data_dir);
        
        if !schema_path.exists() {
            return Err(ApiError::FileNotFound(format!(
                "Schema directory not found: {}",
                schema_path.display()
            )));
        }

        if !data_path.exists() {
            return Err(ApiError::FileNotFound(format!(
                "Data directory not found: {}",
                data_path.display()
            )));
        }

        let mut service = Self {
            schema_dir: schema_path,
            data_dir: data_path,
            schemas: HashMap::new(),
        };

        service.load_schemas().await?;
        Ok(service)
    }

    async fn load_schemas(&mut self) -> ApiResult<()> {
        info!("Loading schemas from: {}", self.schema_dir.display());
        
        let mut entries = fs::read_dir(&self.schema_dir)
            .await
            .map_err(ApiError::IoError)?;

        while let Some(entry) = entries.next_entry().await.map_err(ApiError::IoError)? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    // Extract base name by removing ".schema" suffix if present
                    let schema_name = if stem.ends_with(".schema") {
                        stem.trim_end_matches(".schema").to_string()
                    } else {
                        stem.to_string()
                    };
                    
                    match self.load_schema(&path).await {
                        Ok(schema) => {
                            // Clone schema_name to avoid borrow after move
                            let schema_name_clone = schema_name.clone();
                            self.schemas.insert(schema_name, schema);
                            info!("Loaded schema: {} from {}", schema_name_clone, path.display());
                        }
                        Err(e) => {
                            warn!("Failed to load schema {}: {}", schema_name, e);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn load_schema(&self, schema_path: &Path) -> ApiResult<JSONSchema> {
        let content = fs::read_to_string(schema_path)
            .await
            .map_err(ApiError::IoError)?;

        let schema_value: Value = serde_json::from_str(&content)
            .map_err(|e| ApiError::ValidationError(format!("Invalid JSON schema: {}", e)))?;

        let schema = JSONSchema::options()
            .with_draft(Draft::Draft7)
            .compile(&schema_value)
            .map_err(|e| ApiError::ValidationError(format!("Schema compilation failed: {}", e)))?;

        Ok(schema)
    }
}

// ====================================================
// SECTION: YAML Data Handling (Content as provided)
// ====================================================

impl YamlService {
    pub async fn get_yaml_data(
        &self,
        schema_name: &str,
        file_path: Option<&str>,
    ) -> ApiResult<Value> {
        let yaml_path = self.resolve_yaml_path(schema_name, file_path)?;
        
        if !yaml_path.exists() {
            return Err(ApiError::FileNotFound(format!(
                "YAML file not found: {}",
                yaml_path.display()
            )));
        }

        let content = fs::read_to_string(&yaml_path)
            .await
            .map_err(ApiError::IoError)?;

        let yaml_data: Value = serde_yaml::from_str(&content)
            .map_err(|e| ApiError::YamlParseError(e.to_string()))?;

        // Validate against schema
        if let Some(schema) = self.schemas.get(schema_name) {
            schema
                .validate(yaml_data.borrow()) // Use .borrow() for validation 
                .map_err(|errors| {
                    let error_messages: Vec<String> = errors
                        .map(|e| e.to_string())
                        .collect();
                    ApiError::ValidationError(format!("Schema validation failed: {:?}", error_messages))
                })?;
        }

        Ok(yaml_data)
    }

    pub async fn validate_yaml_data(
        &self,
        schema_name: &str,
        file_path: Option<&str>,
    ) -> ApiResult<Value> {
        let schema = self.schemas.get(schema_name).ok_or_else(|| {
            ApiError::NotFound(format!("Schema '{}' not found", schema_name))
        })?;

        let yaml_data = self.get_yaml_data(schema_name, file_path).await?;
        
        // Perform validation (already done in get_yaml_data, but re-validate for clarity)
        schema
            .validate(&yaml_data)
            .map_err(|errors| {
                let error_messages: Vec<String> = errors
                    .map(|e| e.to_string())
                    .collect();
                ApiError::ValidationError(format!("Schema validation failed: {:?}", error_messages))
            })?;
        
        Ok(serde_json::json!({
            "valid": true,
            "data": yaml_data
        }))
    }
}

// ====================================================
// SECTION: Utility Methods (Content as provided)
// ====================================================

impl YamlService {
    pub async fn list_available_schemas(&self) -> ApiResult<Vec<String>> {
        Ok(self.schemas.keys().cloned().collect())
    }

    fn resolve_yaml_path(&self, schema_name: &str, file_path: Option<&str>) -> ApiResult<PathBuf> {
        match file_path {
            Some(path) => {
                // If a specific file path is provided, use it relative to data_dir
                let full_path = self.data_dir.join(path);
                Ok(full_path)
            }
            None => {
                // Default to schema_name.yaml in the data directory
                let default_file = format!("{}.yaml", schema_name);
                Ok(self.data_dir.join(default_file))
            }
        }
    }
}
