# MCP Todo Server - Project Specification v2

## Project Overview
A remote Model Context Protocol (MCP) server for managing todos, accessible from Claude mobile app, Claude Desktop, and Claude Code across multiple devices (work laptop, home laptop, mobile).

**⚠️ SECURITY NOTICE:** This implementation uses simple service-key authentication suitable ONLY for personal use. See Security Considerations section.

## Tech Stack
- **Language**: Node.js + TypeScript
- **Database**: Supabase PostgreSQL (free tier: 500MB, 50K rows)
- **Hosting**: Cloudflare Workers (free tier: 100K requests/day, 10ms CPU)
- **MCP Transport**: Streamable HTTP (`/mcp`) + SSE (`/sse` for compatibility)
- **Authentication**: Simple - Supabase service key
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.3.0 (required for Streamable HTTP)

## Architecture

```
┌─────────────────────────────────────────┐
│      Supabase PostgreSQL Database       │
│      - todos table                      │
│      - Soft delete support              │
└─────────────────────────────────────────┘
                    ▲
                    │ Supabase Client (service key)
                    │
┌─────────────────────────────────────────┐
│   Cloudflare Worker (MCP Server)        │
│   - /mcp (Streamable HTTP)              │
│   - /sse (Server-Sent Events)           │
│   - CORS enabled                        │
│   - Input validation                    │
│   - Error handling                      │
└─────────────────────────────────────────┘
                    ▲
                    │ MCP Protocol
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   Claude.ai   Claude      Claude
   Mobile      Desktop     Code
   (native)    (mcp-remote) (native)
```

## Database Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Todos table
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL DEFAULT 'default-user',  -- Future-proofing for multi-user
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT,
  tags TEXT[],
  due_date TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed')),
  CONSTRAINT valid_priority CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high')),
  CONSTRAINT title_not_empty CHECK (char_length(title) > 0),
  CONSTRAINT title_length CHECK (char_length(title) <= 500),
  CONSTRAINT description_length CHECK (description IS NULL OR char_length(description) <= 5000),
  CONSTRAINT category_length CHECK (char_length(category) <= 50 AND char_length(category) > 0)
);

-- Performance indexes
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_category ON todos(category);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_priority ON todos(priority) WHERE priority IS NOT NULL;
CREATE INDEX idx_todos_active ON todos(deleted_at) WHERE deleted_at IS NULL;  -- For soft delete queries

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_todos_updated_at 
  BEFORE UPDATE ON todos
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for active todos only
CREATE VIEW active_todos AS
  SELECT * FROM todos WHERE deleted_at IS NULL;
```

## Data Model

### Todo Object
```typescript
interface Todo {
  id: string;                    // UUID
  user_id: string;               // Default: 'default-user'
  title: string;                 // Required, 1-500 chars
  description?: string | null;   // Optional, max 5000 chars
  category: string;              // Required, 1-50 chars, defaults to 'personal'
  status: 'pending' | 'in_progress' | 'completed';  // Required
  priority?: 'low' | 'medium' | 'high' | null;  // Optional
  tags?: string[] | null;        // Optional array, max 20 items, each max 30 chars
  due_date?: string | null;      // Optional, ISO 8601 format (stored as UTC)
  deleted_at?: string | null;    // ISO 8601 format (for soft delete)
  created_at: string;            // ISO 8601 format
  updated_at: string;            // ISO 8601 format
}
```

## Input Validation Rules

### Title
- **Required**: Yes
- **Min length**: 1 character
- **Max length**: 500 characters
- **Sanitization**: Strip HTML tags, trim whitespace
- **Pattern**: Any printable characters

### Description
- **Required**: No
- **Max length**: 5000 characters
- **Sanitization**: Strip HTML tags, trim whitespace

### Category
- **Required**: Yes (defaults to 'personal')
- **Min length**: 1 character
- **Max length**: 50 characters
- **Pattern**: Letters, numbers, spaces, hyphens, underscores only
- **Sanitization**: Lowercase, trim whitespace

### Status
- **Required**: Yes (defaults to 'pending')
- **Allowed values**: 'pending', 'in_progress', 'completed'

### Priority
- **Required**: No
- **Allowed values**: 'low', 'medium', 'high', null

### Tags
- **Required**: No
- **Max items**: 20
- **Each tag max length**: 30 characters
- **Pattern**: Letters, numbers, hyphens only (no spaces)
- **Sanitization**: Lowercase, trim whitespace

### Due Date
- **Required**: No
- **Format**: ISO 8601 string (e.g., "2026-12-31T23:59:59Z")
- **Timezone**: Always stored as UTC
- **Validation**: Must parse as valid date

## MCP Tools Specification

### 1. add_todo
Create a new todo item.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "minLength": 1, "maxLength": 500 },
    "description": { "type": "string", "maxLength": 5000 },
    "category": { "type": "string", "minLength": 1, "maxLength": 50 },
    "priority": { "type": "string", "enum": ["low", "medium", "high"] },
    "tags": { 
      "type": "array", 
      "items": { "type": "string", "maxLength": 30 },
      "maxItems": 20
    },
    "due_date": { "type": "string", "format": "date-time" }
  },
  "required": ["title"]
}
```

**Returns:** Created todo object

**Errors:**
- `VALIDATION_ERROR`: Invalid input
- `DATABASE_ERROR`: Supabase error

---

### 2. list_todos
List active todos with optional filtering.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "category": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] },
    "priority": { "type": "string", "enum": ["low", "medium", "high"] },
    "tag": { "type": "string" },
    "include_deleted": { "type": "boolean", "default": false },
    "limit": { "type": "number", "minimum": 1, "maximum": 100, "default": 50 },
    "offset": { "type": "number", "minimum": 0, "default": 0 }
  }
}
```

**Returns:** Array of todo objects

**Notes:** Only returns active todos (deleted_at IS NULL) unless include_deleted=true

---

### 3. get_todo
Get a single todo by ID.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" }
  },
  "required": ["id"]
}
```

**Returns:** Todo object

**Errors:**
- `NOT_FOUND`: Todo doesn't exist or is deleted

---

### 4. update_todo
Update an existing todo (partial update supported).

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "title": { "type": "string", "minLength": 1, "maxLength": 500 },
    "description": { "type": "string", "maxLength": 5000 },
    "category": { "type": "string", "minLength": 1, "maxLength": 50 },
    "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] },
    "priority": { "type": "string", "enum": ["low", "medium", "high"] },
    "tags": { 
      "type": "array", 
      "items": { "type": "string", "maxLength": 30 },
      "maxItems": 20
    },
    "due_date": { "type": "string", "format": "date-time" }
  },
  "required": ["id"]
}
```

**Returns:** Updated todo object

**Notes:** Only updates fields that are provided (partial update)

---

### 5. delete_todo
Soft-delete a todo by ID.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "permanent": { "type": "boolean", "default": false }
  },
  "required": ["id"]
}
```

**Returns:** Success message

**Notes:** Sets deleted_at timestamp unless permanent=true (hard delete)

---

### 6. restore_todo
Restore a soft-deleted todo.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" }
  },
  "required": ["id"]
}
```

**Returns:** Restored todo object

---

### 7. mark_complete
Quick action to mark a todo as completed.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" }
  },
  "required": ["id"]
}
```

**Returns:** Updated todo object

---

### 8. mark_in_progress
Quick action to mark a todo as in progress.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" }
  },
  "required": ["id"]
}
```

**Returns:** Updated todo object

---

### 9. get_categories
List all unique categories currently in use.

**Input Schema:** None

**Returns:** 
```json
{
  "categories": ["personal", "work", "shopping", ...]
}
```

---

### 10. get_tags
List all unique tags currently in use.

**Input Schema:** None

**Returns:** 
```json
{
  "tags": ["urgent", "important", "low-priority", ...]
}
```

---

### 11. filter_by_date_range
Filter todos by due date range.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "start_date": { "type": "string", "format": "date-time" },
    "end_date": { "type": "string", "format": "date-time" },
    "category": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] }
  }
}
```

**Returns:** Array of todo objects

**Notes:** All dates in UTC. If no dates provided, returns all todos.

---

### 12. search_todos (BONUS)
Full-text search on title and description.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 1 },
    "limit": { "type": "number", "default": 20 }
  },
  "required": ["query"]
}
```

**Returns:** Array of matching todo objects

---

## Project File Structure

```
mcp-todo-server/
├── src/
│   ├── index.ts                 # Cloudflare Worker entry point
│   ├── mcp/
│   │   ├── server.ts            # MCP server initialization
│   │   ├── transport-http.ts    # Streamable HTTP handler
│   │   └── transport-sse.ts     # SSE handler
│   ├── supabase/
│   │   └── client.ts            # Supabase client setup
│   ├── tools/
│   │   ├── add-todo.ts
│   │   ├── list-todos.ts
│   │   ├── get-todo.ts
│   │   ├── update-todo.ts
│   │   ├── delete-todo.ts
│   │   ├── restore-todo.ts
│   │   ├── mark-complete.ts
│   │   ├── mark-in-progress.ts
│   │   ├── get-categories.ts
│   │   ├── get-tags.ts
│   │   ├── filter-by-date-range.ts
│   │   └── search-todos.ts
│   ├── types/
│   │   ├── todo.ts              # TypeScript interfaces
│   │   └── mcp.ts               # MCP type definitions
│   ├── utils/
│   │   ├── validation.ts        # Input validation
│   │   ├── sanitization.ts      # Data sanitization
│   │   ├── errors.ts            # Error types and handlers
│   │   └── cors.ts              # CORS headers
│   └── config/
│       └── constants.ts         # App constants
├── wrangler.toml                # Cloudflare Worker config
├── package.json
├── tsconfig.json
├── .env.example                 # Environment variables template
├── .gitignore
└── README.md
```

## Configuration Files

### wrangler.toml
```toml
name = "mcp-todo-server"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"

# Environment variables (non-secret)
[vars]
MCP_SERVER_NAME = "todo-server"
ALLOWED_ORIGINS = "*"

# Secrets (set via wrangler secret put)
# - SUPABASE_URL
# - SUPABASE_SERVICE_KEY
```

### package.json
```json
{
  "name": "mcp-todo-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "tsc",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.3.0",
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240129.0",
    "typescript": "^5.3.3",
    "wrangler": "^3.78.0"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### .env.example
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Optional: MCP Server Config
MCP_SERVER_NAME=todo-server
```

## CORS Configuration

All endpoints must return proper CORS headers to support web clients:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Handle OPTIONS preflight
if (request.method === 'OPTIONS') {
  return new Response(null, { 
    status: 204,
    headers: corsHeaders 
  });
}
```

## Error Handling

### Error Types
```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
}

interface MCPError {
  code: ErrorCode;
  message: string;
  details?: any;
}
```

### Error Scenarios
1. **Invalid Input**: Return VALIDATION_ERROR with specific field errors
2. **Todo Not Found**: Return NOT_FOUND with ID
3. **Database Errors**: Return DATABASE_ERROR (don't expose internal details)
4. **Malformed Requests**: Return VALIDATION_ERROR
5. **Unexpected Errors**: Return INTERNAL_ERROR, log to console

## Security Considerations

### ⚠️ WARNING: Simple Authentication
This implementation uses **service key authentication** which means:

**Risks:**
- ✗ Anyone with your Worker URL can access ALL todos
- ✗ No user-level access control
- ✗ No rate limiting by default
- ✗ Suitable ONLY for personal use

**Acceptable for:**
- ✓ Personal todo management
- ✓ Single-user scenarios
- ✓ Non-sensitive data

**DO NOT use for:**
- ✗ Shared/team todo lists
- ✗ Sensitive information
- ✗ Public-facing applications

### Mitigation Strategies

**Current (v1):**
1. Keep Worker URL secret (don't share publicly)
2. Monitor Cloudflare analytics for unusual traffic
3. Supabase service key stored securely in Workers secrets
4. Input validation prevents injection attacks

**Future Enhancements:**
1. Add IP whitelist (restrict to Claude's known IPs)
2. Implement basic API key in request headers
3. Add rate limiting (e.g., 100 requests/minute per IP)
4. Upgrade to OAuth for multi-user support

### Environment Variables Security
- ✓ Secrets stored encrypted in Cloudflare
- ✓ Not exposed in logs or Workers inspector
- ✓ Rotatable via `wrangler secret put`
- ✓ Separate from code repository

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Cloudflare account (free tier)
- Supabase account (free tier)
- Claude Pro subscription (for remote MCP on mobile)

### 1. Supabase Setup
1. Go to https://supabase.com and create account
2. Create new project (choose region closest to you)
3. Wait for project provisioning (~2 minutes)
4. Go to **SQL Editor** and run the complete database schema from above
5. Go to **Settings > API**:
   - Copy **Project URL** (save as `SUPABASE_URL`)
   - Copy **service_role key** (save as `SUPABASE_SERVICE_KEY`)
   - ⚠️ Do NOT use anon key - we need service_role for server-side

### 2. Cloudflare Setup
1. Go to https://cloudflare.com and create account
2. No domain needed for Workers
3. Install Wrangler CLI globally:
   ```bash
   npm install -g wrangler
   ```
4. Login to Cloudflare:
   ```bash
   wrangler login
   ```
   (Opens browser for OAuth)

### 3. Project Initialization
```bash
# Create project directory
mkdir mcp-todo-server
cd mcp-todo-server

# Initialize npm
npm init -y

# Install dependencies
npm install @modelcontextprotocol/sdk@^1.3.0 @supabase/supabase-js@^2.39.0

# Install dev dependencies
npm install -D @cloudflare/workers-types typescript wrangler

# Create basic file structure
mkdir -p src/{mcp,supabase,tools,types,utils,config}
```

### 4. Configure Secrets
```bash
# Set Supabase URL
wrangler secret put SUPABASE_URL
# When prompted, paste your Supabase project URL

# Set Supabase service key
wrangler secret put SUPABASE_SERVICE_KEY
# When prompted, paste your service_role key
```

### 5. Create Configuration Files
- Create `wrangler.toml` (see Configuration Files section)
- Create `package.json` scripts (see Configuration Files section)
- Create `tsconfig.json` (see Configuration Files section)
- Create `.gitignore`:
  ```
  node_modules/
  .env
  .dev.vars
  dist/
  .wrangler/
  ```

### 6. Development Workflow
```bash
# Run locally for testing
npm run dev
# Server runs at http://localhost:8787

# Deploy to Cloudflare
npm run deploy
# Returns your public URL: https://mcp-todo-server.your-account.workers.dev

# View logs
npm run tail
```

### 7. Testing with MCP Inspector
```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Run inspector
mcp-inspector

# Open browser to http://localhost:5173
# Enter your worker URL: https://mcp-todo-server.your-account.workers.dev/sse
# Test all tools
```

### 8. Client Configuration

#### A. Claude.ai (Web & Mobile)
1. Go to https://claude.ai
2. Click Settings (gear icon)
3. Go to **Integrations** tab
4. Click **Add Custom Connector**
5. Enter:
   - **Name**: Todo Server
   - **URL**: `https://mcp-todo-server.your-account.workers.dev/mcp`
   - **Auth**: None (for now)
6. Click **Add**
7. Connector automatically syncs to Claude mobile app

#### B. Claude Desktop (Work Laptop)
1. Find config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Edit config:
   ```json
   {
     "mcpServers": {
       "todos": {
         "command": "npx",
         "args": [
           "-y",
           "mcp-remote",
           "https://mcp-todo-server.your-account.workers.dev/sse"
         ]
       }
     }
   }
   ```
3. Restart Claude Desktop
4. Look for 🔨 icon in chat input (tools available)

#### C. Claude Code (Home Laptop)
```bash
# Add MCP server via CLI
claude mcp add --transport http todos https://mcp-todo-server.your-account.workers.dev/mcp

# Verify it's added
claude mcp list

# Start using in any project
# Tools automatically available in conversations
```

## Implementation Notes

### MCP Transport Implementation

#### Streamable HTTP (`/mcp`)
```typescript
// Handle POST requests with JSON-RPC MCP messages
async function handleStreamableHTTP(request: Request, env: Env) {
  const message = await request.json();
  
  // Initialize MCP server
  const server = createMCPServer(env);
  
  // Process message and return streaming response
  const response = await server.handleRequest(message);
  
  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}
```

#### SSE Transport (`/sse`)
```typescript
// Handle GET requests for SSE connection
async function handleSSE(request: Request, env: Env) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  // Send SSE headers
  const response = new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders
    }
  });
  
  // Handle MCP messages via SSE
  // (Implementation depends on MCP SDK)
  
  return response;
}
```

### Supabase Client Setup
```typescript
import { createClient } from '@supabase/supabase-js';

export function createSupabaseClient(env: Env) {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
```

### Input Validation Example
```typescript
function validateTodo(data: any): ValidationResult {
  const errors: string[] = [];
  
  // Title validation
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Title is required and must be a string');
  } else if (data.title.length === 0 || data.title.length > 500) {
    errors.push('Title must be 1-500 characters');
  }
  
  // Category validation
  if (data.category && !/^[a-zA-Z0-9\s\-_]+$/.test(data.category)) {
    errors.push('Category can only contain letters, numbers, spaces, hyphens, and underscores');
  }
  
  // Priority validation
  if (data.priority && !['low', 'medium', 'high'].includes(data.priority)) {
    errors.push('Priority must be low, medium, or high');
  }
  
  // Tags validation
  if (data.tags) {
    if (!Array.isArray(data.tags)) {
      errors.push('Tags must be an array');
    } else if (data.tags.length > 20) {
      errors.push('Maximum 20 tags allowed');
    } else {
      data.tags.forEach((tag: any, i: number) => {
        if (typeof tag !== 'string' || tag.length > 30) {
          errors.push(`Tag ${i} must be a string with max 30 characters`);
        }
        if (!/^[a-zA-Z0-9\-]+$/.test(tag)) {
          errors.push(`Tag ${i} can only contain letters, numbers, and hyphens`);
        }
      });
    }
  }
  
  // Due date validation
  if (data.due_date) {
    const date = new Date(data.due_date);
    if (isNaN(date.getTime())) {
      errors.push('Due date must be a valid ISO 8601 date string');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Performance Considerations

### Cloudflare Workers Limits
- **CPU Time**: 10ms per request (free tier)
- **Memory**: 128MB
- **Requests**: 100,000/day (free tier)

### Optimization Strategies
1. **Keep queries simple**: Use indexed columns
2. **Limit result sets**: Default to 50 items, max 100
3. **Use SELECT specific columns**: Don't SELECT * if not needed
4. **Connection pooling**: Supabase handles this automatically
5. **Caching**: Consider caching categories/tags lists

### Expected Performance
- **Typical request**: 50-200ms (including Supabase round-trip)
- **Complex queries**: 200-500ms
- **Cold start**: <1s (Workers boot very fast)

## Testing Checklist

### Local Development
- [ ] MCP server starts with `npm run dev`
- [ ] Can connect from MCP Inspector at http://localhost:8787/sse
- [ ] All 12 tools are listed in inspector
- [ ] Can successfully call each tool
- [ ] Validation errors are returned properly
- [ ] CORS headers present on all responses

### Deployment
- [ ] Secrets configured in Cloudflare
- [ ] Successfully deploys with `npm run deploy`
- [ ] Public URL accessible
- [ ] Can connect from MCP Inspector using public URL
- [ ] SSL/HTTPS working

### Supabase Integration
- [ ] Database schema created successfully
- [ ] Can insert todos via Supabase dashboard
- [ ] Constraints working (try invalid data)
- [ ] Indexes created
- [ ] Trigger for updated_at working

### MCP Tools Testing
- [ ] **add_todo**: Creates todo with all fields
- [ ] **add_todo**: Validates required fields
- [ ] **add_todo**: Sanitizes input (try HTML tags)
- [ ] **list_todos**: Returns active todos only
- [ ] **list_todos**: Filters by category work
- [ ] **list_todos**: Filters by status work
- [ ] **list_todos**: Pagination works (limit/offset)
- [ ] **get_todo**: Returns correct todo
- [ ] **get_todo**: Returns error for invalid ID
- [ ] **update_todo**: Partial updates work
- [ ] **update_todo**: Validation works
- [ ] **delete_todo**: Soft delete sets deleted_at
- [ ] **delete_todo**: Hard delete with permanent=true
- [ ] **restore_todo**: Restores soft-deleted todo
- [ ] **mark_complete**: Changes status to completed
- [ ] **mark_in_progress**: Changes status to in_progress
- [ ] **get_categories**: Returns unique categories
- [ ] **get_tags**: Returns unique tags
- [ ] **filter_by_date_range**: Date filtering works
- [ ] **search_todos**: Full-text search works

### Client Integration
- [ ] Connected to Claude.ai web
- [ ] Connected to Claude mobile (iOS/Android)
- [ ] Connected to Claude Desktop (work laptop)
- [ ] Connected to Claude Code (home laptop)
- [ ] Can use tools from all 4 clients
- [ ] Real-time sync works (add on mobile, see on desktop)

### Edge Cases
- [ ] Very long titles (500 chars)
- [ ] Very long descriptions (5000 chars)
- [ ] Maximum tags (20 items)
- [ ] Empty tags array
- [ ] Null optional fields
- [ ] Invalid UUIDs
- [ ] Non-existent todos
- [ ] Concurrent updates
- [ ] Special characters in text

## Troubleshooting Guide

### Issue: "Connection refused" in MCP Inspector
**Solution**: Make sure `npm run dev` is running and check http://localhost:8787 in browser

### Issue: "NOT_FOUND" errors for all todos
**Solution**: Check Supabase connection. Verify SUPABASE_URL and SUPABASE_SERVICE_KEY are set correctly

### Issue: CORS errors in Claude.ai web
**Solution**: Ensure CORS headers are present on ALL responses including errors and OPTIONS

### Issue: Tools not showing in Claude Desktop
**Solution**: 
1. Check config file path is correct
2. Ensure `mcp-remote` is in the args
3. Restart Claude Desktop completely
4. Check for 🔨 icon

### Issue: "CPU time limit exceeded"
**Solution**: Optimize database queries. Add more indexes. Reduce result set sizes.

### Issue: Validation errors not clear
**Solution**: Check error response format matches MCP spec. Include field-level details.

## Future Enhancements

### Phase 2 (Optional)
- [ ] OAuth authentication for multi-user
- [ ] Rate limiting per client
- [ ] Recurring todos (daily, weekly, monthly)
- [ ] Subtasks / checklists
- [ ] File attachments (using Supabase Storage)
- [ ] Email/push notifications for due dates
- [ ] Export todos (JSON, CSV)
- [ ] Import todos from other apps
- [ ] Shared todos (collaborative lists)
- [ ] Todo templates
- [ ] Analytics dashboard (completion rates, etc.)

### Phase 3 (Advanced)
- [ ] Natural language date parsing ("tomorrow", "next week")
- [ ] AI-powered categorization suggestions
- [ ] Smart priority recommendations
- [ ] Integration with calendar apps
- [ ] Voice input support
- [ ] Mobile-specific features (location-based reminders)

## Success Criteria

### Must Have (v1)
✅ MCP server deployed to Cloudflare Workers  
✅ Connected to Supabase PostgreSQL  
✅ All 12 MCP tools implemented and working  
✅ Input validation on all fields  
✅ Accessible from Claude mobile app  
✅ Accessible from Claude Desktop (work laptop)  
✅ Accessible from Claude Code (home laptop)  
✅ Categories system working (unlimited custom)  
✅ Optional fields working (description, due_date, priority, tags)  
✅ Soft delete implemented  
✅ Fast response times (<500ms average)  
✅ Zero cost (using free tiers)  
✅ No errors in basic usage  

### Nice to Have (v1)
✅ Search functionality  
✅ Restore deleted todos  
✅ Comprehensive error messages  
✅ Good documentation  

### Success Metrics
- **Response Time**: 95% of requests < 500ms
- **Uptime**: >99% (Cloudflare SLA)
- **Error Rate**: <1% of requests
- **Client Compatibility**: Works on all 4 target clients
- **Data Integrity**: No lost or corrupted todos
- **User Experience**: Can perform all common todo operations naturally

---

## Ready for Claude Code!

This spec is now complete and ready to hand off to Claude Code for implementation. It includes:
- ✅ Complete architecture
- ✅ Detailed database schema with constraints
- ✅ All MCP tool specifications
- ✅ Validation rules
- ✅ Security considerations
- ✅ Configuration files
- ✅ Setup instructions
- ✅ Testing checklist
- ✅ Troubleshooting guide

**Next Steps:**
1. Copy this entire spec to Claude Code
2. Say: "Build this MCP todo server according to the spec"
3. Claude Code will create all files and guide you through setup
4. Follow the setup instructions step-by-step
5. Test thoroughly using the testing checklist
6. Deploy and enjoy your multi-device todo system!
