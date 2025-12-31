# AGENTS.md - Development Guidelines

This document provides agentic coding agents (such as OpenCode) with essential information for working effectively in the graph-mode repository.

## Project Overview

Graph-Mode is a framework for building tightly-defined agents that use LLMs as "transformers" to convert unstructured data to structured data, which then executes predictable code. The project includes:
- A Bun-based backend server (TypeScript)
- A React/Vite UI frontend
- SQLite database integration
- Compiled binary distribution

## Build & Run Commands

### Development
```bash
# Install dependencies
bun install

# Start dev server (runs backend + Vite dev server concurrently)
bun run dev

# The frontend runs at http://localhost:5173
# The backend API runs at http://localhost:3000
# Frontend is configured to proxy /api calls to the backend
```

### Build
```bash
# Build the project (creates dist/graph-mode executable + dist/public/ static files)
bun run build

# The build process:
# 1. Creates dist/ directories
# 2. Builds UI with Vite to public/
# 3. Bundles server/index.ts into standalone binary (dist/graph-mode)
# 4. Copies public/ assets to dist/public/
```

### Lint
```bash
# Run ESLint across the entire project
bun run lint

# ESLint will check all .ts and .tsx files
# Fix issues automatically with: bun run lint -- --fix
```

### Testing
Currently, there is no test setup in the project. When tests are added, they should use Bun's test runner:
```bash
# To run tests (once established)
bun test

# To run a specific test file
bun test path/to/test.test.ts
```

## Code Style & Conventions

### TypeScript Configuration

**Strict Mode Enabled** (`strict: true`)
- All variables must have explicit types
- Null/undefined checks are enforced
- `noUnusedLocals` and `noUnusedParameters` enabled
- `noImplicitAny` enforced

### Imports

1. **Import Order**: Group imports in this order:
   - External dependencies (React, figlet, etc.)
   - Internal modules (relative imports)
   - Blank line between groups

2. **ES Module Syntax**: Always use ESM syntax
   ```typescript
   // ✓ Good
   import { useState } from 'react'
   import { Database } from 'bun:sqlite'
   
   // ✗ Avoid
   const React = require('react')
   ```

3. **Extensions**: Include `.ts`/`.tsx` extensions in imports (required by TypeScript's `verbatimModuleSyntax`)
   ```typescript
   // ✓ Good (if importing types)
   import type { ComponentProps } from 'react'
   ```

### Formatting

- **Tabs**: Use tabs (2 spaces configured in eslint)
- **Line Length**: Keep reasonable, no hard limit enforced
- **Semicolons**: Omit semicolons (ESLint flat config compatible)
- **Trailing Commas**: Use trailing commas in multiline structures

### Type Annotations

1. **Always annotate function parameters and return types**
   ```typescript
   // ✓ Good
   function handleClick(count: number): void {
     setCount((prev) => prev + 1)
   }
   
   // ✗ Avoid
   function handleClick(count) {
     return setCount(count + 1)
   }
   ```

2. **Use `type` for type aliases, not interfaces in most cases**
   ```typescript
   type Post = {
     id: string
     title: string
   }
   ```

3. **Use `as const` for literal types when needed**
   ```typescript
   const NODE_TYPES = ['agent', 'human', 'code'] as const
   ```

### Naming Conventions

- **Components**: PascalCase (e.g., `GraphCanvas`, `NodeEditor`)
- **Functions & Variables**: camelCase (e.g., `handleNodeClick`, `nodeCache`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_PORT`, `MAX_NODES`)
- **Files**: 
  - Components: PascalCase (e.g., `NodeCard.tsx`)
  - Utilities & Hooks: camelCase (e.g., `useGraph.ts`, `pathUtils.ts`)
  - Index files: `index.ts` (re-export public API)

### Error Handling

1. **Try-Catch Pattern**: Use for error boundaries and API calls
   ```typescript
   try {
     const data = await fetch('/api/nodes')
     return data.json()
   } catch (error) {
     console.error('Failed to fetch nodes:', error)
     // Return fallback or throw context-aware error
     throw new Error(`Failed to fetch nodes: ${error}`)
   }
   ```

2. **Explicit Error Types**: Avoid bare `catch` blocks
   ```typescript
   // ✓ Good
   catch (error: unknown) {
     if (error instanceof Error) {
       console.error(error.message)
     }
   }
   
   // ✗ Avoid
   catch (error) { }
   ```

3. **Error Fallbacks**: Always provide sensible defaults
   ```typescript
   const posts = db.query("SELECT * FROM posts").all() ?? []
   const publicDir = process.env.PUBLIC_DIR ?? './public'
   ```

### React & Hooks

1. **Hook Rules**: Follow React Hook guidelines
   - Only call hooks at the top level
   - Only call hooks from React functions or custom hooks
   - Use ESLint plugin: `eslint-plugin-react-hooks`

2. **Component Structure**:
   ```typescript
   // ✓ Good structure
   import { useState } from 'react'
   import styles from './Card.module.css'
   
   interface CardProps {
     title: string
     onClick: () => void
   }
   
   export function Card({ title, onClick }: CardProps) {
     const [isOpen, setIsOpen] = useState(false)
     
     return (
       <div className={styles.card}>
         <h2>{title}</h2>
         <button onClick={onClick}>Open</button>
       </div>
     )
   }
   ```

3. **Avoid React Refresh violations**: Use named exports for components
   ```typescript
   // ✓ Good
   export function MyComponent() { }
   
   // ✗ Avoid (breaks HMR)
   export default function MyComponent() { }
   ```

### API Endpoints

- Base URL: `/api`
- Routes defined in `server/index.ts:handleAPI()`
- Currently implemented: `/api/posts` (GET, POST), `/api/posts/:id` (GET)
- Return JSON responses with appropriate HTTP status codes

### Database

- Uses Bun's built-in SQLite: `import { Database } from 'bun:sqlite'`
- Database file: `graph-mode.db` (in project root during dev, same directory as binary in distribution)
- Initialize tables in `server/index.ts` during startup
- Always handle missing tables gracefully with fallback returns

### File Paths

- Use `path` module for cross-platform path handling (imported as `* as path`)
- Resolve relative to execution context or CWD when distributing as binary
- Example in `server/index.ts:18-34`: Dynamic public directory resolution for both dev and distribution modes

## Common Tasks for Agents

### Adding a New Component
1. Create file in `ui/src/` with PascalCase name
2. Export named function component
3. Add TypeScript interface for props
4. Run `bun run lint -- --fix` to auto-format
5. Test with dev server: `bun run dev`

### Modifying Server Logic
1. Edit `server/index.ts` directly
2. Add error handling for all database queries
3. Return appropriate HTTP status codes (200, 201, 404, 500)
4. Restart dev server to see changes

### Adding Database Tables
1. Add `CREATE TABLE IF NOT EXISTS` statement in `server/index.ts:9-13`
2. Use SQLite syntax supported by Bun
3. Always check `if (fs.existsSync(publicDir))` pattern for graceful fallbacks

### Type-Checking Only
```bash
# If you only want to check types without emitting code
bun run --prefer-bun "bunx --bun tsc --noEmit ui/src"
```

## Project Structure

```
├── server/              # Backend (TypeScript, Bun)
│   ├── index.ts         # Main server with Bun.serve() + API routes
│   └── bundle-entry.ts  # Entry point for binary compilation
├── ui/                  # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.tsx      # Main React component
│   │   ├── main.tsx     # React root
│   │   └── index.css    # Global styles
│   ├── vite.config.ts   # Vite configuration with /api proxy
│   └── tsconfig.*.json
├── scripts/
│   └── build.ts         # Build script (Bun compilation)
├── public/              # Static assets (built by Vite)
└── package.json         # Dependencies, scripts
```

## ESLint Configuration

- **Config File**: `eslint.config.js` (flat config format)
- **Coverage**: All `.ts` and `.tsx` files
- **Plugins**:
  - `@eslint/js` - JavaScript recommendations
  - `typescript-eslint` - TypeScript rules
  - `eslint-plugin-react-hooks` - React Hook enforcements
  - `eslint-plugin-react-refresh` - Vite React Refresh compatibility
- **Global Ignores**: `dist/` directory

## Key Dependencies

- **React 19** - UI library
- **TypeScript 5.9** - Type safety
- **Vite 7** - Frontend bundler with HMR
- **Bun** - Runtime, package manager, test runner
- **Figlet** - ASCII art text rendering

## Notes for Agents

- The project uses **Bun exclusively** as the runtime (not Node.js)
- **No test framework installed yet** - recommend adding Bun test or Vitest when needed
- **Binary distribution**: The build outputs a standalone executable that includes the public assets
- **API proxying**: The Vite dev server proxies `/api` requests to the Bun backend
- **Database path**: Resolved dynamically to work in both dev (relative to script) and production (binary directory)
