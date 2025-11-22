# AGENTS.md - Development Guidelines

## Build/Lint/Test Commands

### Frontend (React/Vite)
- `cd frontend && npm run dev` - Start development server
- `cd frontend && npm run build` - Build for production  
- `cd frontend && npm run lint` - Run ESLint
- `cd frontend && npm run preview` - Preview production build

### Backend (Rust)
- `cd backend && cargo build` - Build project
- `cd backend && cargo test` - Run all tests
- `cd backend && cargo test <test_name>` - Run single test
- `cd backend && cargo clippy` - Lint with Clippy

### App Gateway (Python/FastAPI)
- `cd app_gateway && python -m uvicorn main:app --reload` - Development server
- `cd app_gateway && python -m pyright` - Type checking
- `cd app_gateway && python -m pytest` - Run tests

## Code Style Guidelines

### Frontend (React/JSX)
- Use functional components with hooks
- Import React first, then external libraries, then internal modules
- Use PascalCase for components, camelCase for variables/functions
- Follow ESLint configuration in frontend/eslint.config.js
- Use Tailwind CSS for styling with shadcn/ui components

### Backend (Rust)  
- Use `cargo fmt` for formatting
- Prefer `async/await` with tokio runtime
- Use `Result<T, E>` for error handling with thiserror
- Follow snake_case for functions/variables, PascalCase for types
- Use `tracing` for logging, not `println!`

### Python (FastAPI)
- Use type hints consistently
- Follow PEP 8 formatting
- Use loguru for logging
- Prefer async/await with FastAPI
- Use Pydantic models for request/response validation

### General
- Write descriptive commit messages
- Include error handling for all external calls
- Use environment variables for configuration
- Follow existing patterns in each codebase