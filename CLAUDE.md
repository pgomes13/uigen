# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in natural language, Claude generates the code via tool calls, and the result is rendered live in a sandboxed iframe — no disk writes, everything in a virtual file system.

## Commands

```bash
npm run setup        # First-time setup: install deps + Prisma generate + migrate
npm run dev          # Development server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest
npm run db:reset     # Reset the SQLite database
```

Run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

## Architecture

### Data Flow

```
User message (ChatInterface)
  → POST /api/chat
  → Claude (claude-haiku-4-5) with tool calling
  → Tool calls: str_replace_editor (view/create/edit files), file_manager (rename/delete)
  → VirtualFileSystem (in-memory, no disk I/O)
  → Babel standalone transforms JSX → JS blob URLs
  → Import map resolves @/ aliases + third-party packages via esm.sh CDN
  → Preview iframe renders the component
```

### Key Abstractions

**Virtual File System** ([src/lib/file-system.ts](src/lib/file-system.ts)): In-memory FS that Claude writes to via tool calls. Serialized as JSON for database persistence.

**Language Model Provider** ([src/lib/provider.ts](src/lib/provider.ts)): Factory `getLanguageModel()` returns either real Claude (when `ANTHROPIC_API_KEY` is set) or a `MockLanguageModel` that generates static demo components.

**Claude Tools** ([src/lib/tools/](src/lib/tools/)): Zod-validated tools Claude uses to manipulate the virtual FS — `str_replace_editor` (view, create, str_replace, insert) and `file_manager` (rename, delete).

**JSX Transformer** ([src/lib/transform/jsx-transformer.ts](src/lib/transform/jsx-transformer.ts)): Transforms virtual FS files with Babel, creates blob URLs per file, builds an import map for browser-native module resolution. Handles `@/` → root, third-party → `esm.sh`.

**Contexts**: Two React contexts manage shared state:
- [FileSystemContext](src/lib/contexts/file-system-context.tsx) — virtual FS state + tool call handling
- [ChatContext](src/lib/contexts/chat-context.tsx) — Vercel AI SDK `useChat` hook + message history

### Layout

Four-panel layout in [src/app/main-content.tsx](src/app/main-content.tsx):
- Left (35%): Chat interface
- Right (65%): Tabbed — Preview (iframe) | Code (file tree + Monaco editor)

### API Route

[src/app/api/chat/route.ts](src/app/api/chat/route.ts): Reconstructs virtual FS from request, calls Claude with `streamText`, handles tool call callbacks, saves project to DB on completion (authenticated users only). System prompt uses `cacheControl: { type: "ephemeral" }` for prompt caching.

### Persistence

SQLite via Prisma. Two models:
- `User` — email + bcrypt password
- `Project` — `messages` (chat history, JSON) + `data` (serialized virtual FS, JSON)

Authentication uses JWT stored in an httpOnly `auth-token` cookie. Anonymous users can generate components but cannot save projects.

## Tech Stack

- **Framework**: Next.js 15 App Router, React 19, TypeScript
- **AI**: `@ai-sdk/anthropic` + Vercel AI SDK, model `claude-haiku-4-5`
- **DB**: Prisma + SQLite
- **Editor**: Monaco Editor (`@monaco-editor/react`)
- **Styling**: Tailwind CSS v4
- **Code Transform**: Babel Standalone (browser-side JSX compilation)
- **Testing**: Vitest
