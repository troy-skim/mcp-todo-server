# MCP Todo Server

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-orange)

A Model Context Protocol (MCP) server for managing todos, built on Cloudflare Workers with Supabase PostgreSQL. This server enables Claude to manage your todos through natural language conversations.

## Features

- **12 MCP Tools** for complete todo management
- **Multi-platform support** - Works with Claude Desktop, Claude Code CLI, and Claude.ai
- **Cloud-native** - Runs on Cloudflare Workers edge network
- **Persistent storage** - Supabase PostgreSQL database
- **Soft delete** - Recover accidentally deleted todos
- **Full-text search** - Search across titles and descriptions
- **Categorization & Tags** - Organize todos with categories and tags
- **Priority & Status tracking** - Track todo progress and importance

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Cloudflare account](https://cloudflare.com/)
- [Supabase account](https://supabase.com/)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd mcp-todo-server
npm install
```

### 2. Set Up Supabase Database

Create a new Supabase project and run this SQL in the SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create todos table
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL DEFAULT 'default-user',
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT,
  tags TEXT[],
  due_date TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints
ALTER TABLE todos ADD CONSTRAINT valid_status
  CHECK (status IN ('pending', 'in_progress', 'completed'));
ALTER TABLE todos ADD CONSTRAINT valid_priority
  CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'));
ALTER TABLE todos ADD CONSTRAINT title_not_empty
  CHECK (char_length(title) > 0);
ALTER TABLE todos ADD CONSTRAINT title_length
  CHECK (char_length(title) <= 500);
ALTER TABLE todos ADD CONSTRAINT description_length
  CHECK (description IS NULL OR char_length(description) <= 5000);
ALTER TABLE todos ADD CONSTRAINT category_length
  CHECK (char_length(category) <= 50 AND char_length(category) > 0);

-- Create indexes for performance
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_category ON todos(category);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_priority ON todos(priority) WHERE priority IS NOT NULL;
CREATE INDEX idx_todos_active ON todos(deleted_at) WHERE deleted_at IS NULL;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create view for active todos
CREATE VIEW active_todos AS
SELECT * FROM todos WHERE deleted_at IS NULL;
```

### 3. Configure Secrets

Set your Supabase credentials for Cloudflare Workers:

```bash
wrangler secret put SUPABASE_URL
# Enter your Supabase URL (e.g., https://xxxxx.supabase.co)

wrangler secret put SUPABASE_SERVICE_KEY
# Enter your Supabase service role key
```

For local development, create `.dev.vars`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

### 4. Deploy

```bash
npm run deploy
```

Your server will be available at: `https://mcp-todo-server.<your-account>.workers.dev`

---

## Connecting to Claude

### Claude Desktop

1. Locate your Claude Desktop config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the MCP server configuration:

```json
{
  "mcpServers": {
    "todos": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp-todo-server.<your-account>.workers.dev/mcp"
      ]
    }
  }
}
```

> **Note**: If Claude Desktop fails to connect, use the full path to npx:
> ```json
> "command": "/Users/<username>/.nvm/versions/node/v22.19.0/bin/npx"
> ```

3. Restart Claude Desktop

4. Look for the hammer icon in Claude Desktop - your tools should be available

### Claude Code (CLI)

Add the MCP server with one command:

```bash
claude mcp add --transport http todos https://mcp-todo-server.<your-account>.workers.dev/mcp
```

Verify it's connected:

```bash
claude mcp list
```

### Claude.ai (Web & Mobile)

1. Go to Claude.ai Settings
2. Navigate to **Integrations** or **MCP Connectors**
3. Click **Add Custom Connector**
4. Enter the URL: `https://mcp-todo-server.<your-account>.workers.dev/mcp`
5. Save and refresh

---

## How to Use with Claude

Once connected, you can manage your todos through natural conversation. Here are examples for each capability:

### Creating Todos

**Basic todo:**
> "Add a todo to buy groceries"

**With details:**
> "Create a todo: Review quarterly report. Set it as high priority in the work category with a due date of next Friday"

**With tags:**
> "Add a todo to call the dentist, tag it as health and appointments"

### Viewing Todos

**List all todos:**
> "Show me all my todos"
> "What's on my todo list?"

**Filter by status:**
> "Show me todos that are in progress"
> "List all completed todos"

**Filter by category:**
> "Show my work todos"
> "What personal tasks do I have?"

**Filter by priority:**
> "What are my high priority items?"
> "Show low priority todos"

**Filter by tag:**
> "Show todos tagged with 'urgent'"

**View a specific todo:**
> "Show me the details of todo [paste the ID]"

### Updating Todos

**Change title:**
> "Rename the 'buy groceries' todo to 'buy groceries and supplies'"

**Change priority:**
> "Set the quarterly report todo to high priority"

**Add due date:**
> "Set a due date of January 15th for the dentist appointment todo"

**Change category:**
> "Move the meeting notes todo to the work category"

**Update tags:**
> "Add the 'important' tag to my quarterly report todo"

### Managing Status

**Mark as in progress:**
> "Mark the quarterly report as in progress"
> "Start working on the buy groceries todo"

**Mark as complete:**
> "Mark the dentist appointment as done"
> "Complete the buy groceries todo"

**Reopen a todo:**
> "Set the meeting notes todo back to pending"

### Deleting & Restoring

**Soft delete (recoverable):**
> "Delete the old meeting notes todo"
> "Remove the cancelled appointment from my list"

**Permanent delete:**
> "Permanently delete the test todo"
> "Hard delete the spam entry"

**Restore deleted todo:**
> "Restore the meeting notes todo I just deleted"
> "Bring back the accidentally deleted task"

**View deleted todos:**
> "Show me deleted todos"
> "List all todos including deleted ones"

### Searching

**Search by keyword:**
> "Search for todos containing 'report'"
> "Find all todos with 'meeting' in the title or description"

### Filtering by Date

**Due soon:**
> "What todos are due this week?"
> "Show me todos due between today and Friday"

**Overdue:**
> "What todos are overdue?"
> "Show me todos that were due before today"

### Organizing

**View categories:**
> "What categories do I have?"
> "List all my todo categories"

**View tags:**
> "Show me all tags I'm using"
> "What tags exist in my todos?"

---

## Tool Reference

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `add_todo` | Create a new todo | title (required), description, category, priority, tags, due_date |
| `list_todos` | List todos with filters | category, status, priority, tag, include_deleted, limit, offset |
| `get_todo` | Get a single todo by ID | id (required) |
| `update_todo` | Update todo fields | id (required), title, description, category, status, priority, tags, due_date |
| `delete_todo` | Soft or hard delete | id (required), permanent (default: false) |
| `restore_todo` | Restore soft-deleted todo | id (required) |
| `mark_complete` | Quick-complete a todo | id (required) |
| `mark_in_progress` | Quick-start a todo | id (required) |
| `get_categories` | List all categories | none |
| `get_tags` | List all tags | none |
| `filter_by_date_range` | Filter by due date | start_date, end_date, category, status |
| `search_todos` | Full-text search | query (required), limit |

### Field Constraints

| Field | Type | Constraints |
|-------|------|-------------|
| title | string | 1-500 characters, required |
| description | string | max 5000 characters |
| category | string | 1-50 characters, defaults to "personal" |
| status | enum | "pending", "in_progress", "completed" (default: "pending") |
| priority | enum | "low", "medium", "high" (optional) |
| tags | array | max 20 tags, each max 30 characters |
| due_date | string | ISO 8601 format (e.g., "2025-01-15T10:00:00Z") |

**Automatic Fields:**
- `id` - UUID generated automatically
- `created_at` - Set when todo is created
- `updated_at` - Updated automatically on every change
- `deleted_at` - Set when soft-deleted, cleared when restored

### Pagination

The `list_todos` tool supports pagination:

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `limit` | Number of todos per page | 50 | 1-100 |
| `offset` | Number of todos to skip | 0 | 0+ |

**Examples:**
> "Show me the first 10 todos"
> "Get todos 20 through 30" (offset: 20, limit: 10)

### Soft Delete Behavior

When you delete a todo without `permanent: true`:
- The todo is **soft-deleted** (marked with a `deleted_at` timestamp)
- It won't appear in `list_todos` by default
- Use `include_deleted: true` to see soft-deleted todos
- Use `restore_todo` to recover it

**To permanently delete:**
> "Permanently delete todo [ID]"

This removes the todo from the database completely and cannot be undone.

### Error Responses

All tools return errors in a consistent format:

```json
{
  "content": [{
    "type": "text",
    "text": "{\"error\": {\"code\": \"ERROR_CODE\", \"message\": \"Description\"}}"
  }],
  "isError": true
}
```

| Error Code | Description |
|------------|-------------|
| `VALIDATION_ERROR` | Invalid input (missing required field, wrong format) |
| `NOT_FOUND` | Todo with specified ID doesn't exist |
| `DATABASE_ERROR` | Database operation failed |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Development

### Local Development

```bash
npm run dev
```

This starts a local server at `http://localhost:8787`.

### Testing with curl

```bash
# Health check
curl http://localhost:8787/health

# List tools
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Add a todo
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"add_todo",
      "arguments":{"title":"Test todo","priority":"high"}
    }
  }'

# List todos
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{"name":"list_todos","arguments":{}}
  }'
```

### Project Structure

```
src/
├── index.ts                 # Cloudflare Worker entry point
├── config/
│   └── constants.ts         # Application constants
├── supabase/
│   └── client.ts            # Supabase client factory
├── tools/
│   ├── index.ts             # Tool registry (all 12 tools)
│   ├── add-todo.ts
│   ├── list-todos.ts
│   ├── get-todo.ts
│   ├── update-todo.ts
│   ├── delete-todo.ts
│   ├── restore-todo.ts
│   ├── mark-complete.ts
│   ├── mark-in-progress.ts
│   ├── get-categories.ts
│   ├── get-tags.ts
│   ├── filter-by-date-range.ts
│   └── search-todos.ts
├── types/
│   ├── todo.ts              # Todo interfaces
│   └── mcp.ts               # Environment types
└── utils/
    ├── validation.ts        # Input validation
    ├── sanitization.ts      # Input sanitization
    ├── errors.ts            # Error handling
    └── cors.ts              # CORS configuration
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Compile TypeScript |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run tail` | View production logs |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` or `/health` | GET | Health check |
| `/mcp` | POST | MCP JSON-RPC endpoint (Streamable HTTP) |
| `/sse` | GET | Server-Sent Events connection |
| `/sse/message` | POST | SSE message handler |

### MCP Protocol Methods

| Method | Description |
|--------|-------------|
| `initialize` | Initialize connection |
| `notifications/initialized` | Acknowledge initialization |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |

---

## Troubleshooting

### Claude Desktop won't connect

1. **Check npx path**: Use the full path to npx in your config
2. **Restart Claude Desktop**: Changes require a restart
3. **Check logs**: Look at Claude Desktop logs for connection errors
4. **Use /mcp endpoint**: Use Streamable HTTP (`/mcp`) instead of SSE (`/sse`)

### SSL errors after deployment

New workers.dev subdomains may take 5-10 minutes for SSL certificate propagation. Wait and retry.

### Tools not appearing

1. Verify the server URL is correct
2. Check that the server responds to `/health`
3. Ensure `tools/list` returns your tools

### Database errors

1. Verify Supabase credentials are set correctly
2. Check that the database schema is applied
3. Look at Cloudflare Workers logs: `npm run tail`

---

## Security Notes

- This server uses a hardcoded `default-user` ID (single-user system)
- Supabase service key has full database access
- CORS is set to `*` (open to all origins)
- Suitable for personal use only
- For multi-user or production use, implement proper authentication

---

## Monitoring Usage (Free Tier)

### Supabase Free Tier Limits

| Resource | Limit |
|----------|-------|
| Database size | 500 MB |
| Storage | 1 GB |
| Bandwidth | 5 GB/month |
| Edge functions | 500K invocations/month |

**Check usage:**
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **Settings** → **Usage**

**Check via SQL** (run in Supabase SQL Editor):

```sql
-- Table size
SELECT pg_size_pretty(pg_total_relation_size('todos')) as total_size;

-- Row count
SELECT count(*) FROM todos;

-- Database size
SELECT pg_size_pretty(pg_database_size(current_database())) as db_size;
```

### Cloudflare Workers Free Tier Limits

| Resource | Limit |
|----------|-------|
| Requests | 100,000/day |
| CPU time | 10ms per request |

**Check usage:**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select **Workers & Pages** → **mcp-todo-server**
3. View the **Analytics** tab

**Live request monitoring:**

```bash
npm run tail
```

---

## CI/CD

This project uses GitHub Actions for continuous integration and deployment.

### Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yml` | Push/PR to main | Runs type checking and linting |
| `deploy.yml` | Push to main | Deploys to Cloudflare Workers |

### Setup GitHub Secrets

Before pushing to GitHub, add these secrets in **Settings → Secrets → Actions**:

| Secret | Description | How to get |
|--------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers permissions | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Shown in Workers dashboard URL or run `wrangler whoami` |

**Note:** Supabase secrets are already configured in Cloudflare Workers via `wrangler secret put`.

---

## License

MIT
