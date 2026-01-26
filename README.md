# Orbit

Global Issue → AI Agents → Solutions Pipeline

An AI-augmented platform for individuals to identify systemic issues and build solutions.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Docker](https://docker.com/) (for Postgres)

### Setup

1. Install dependencies:
```bash
bun install
```

2. Start Postgres:
```bash
docker compose up -d
```

3. Copy environment file:
```bash
cp .env.example .env
```

4. Run database migrations:
```bash
bun run db:generate
bun run db:migrate
```

5. Start development servers:
```bash
# Terminal 1: API server (port 3000)
bun run --filter @orbit/api dev

# Terminal 2: Dashboard (port 3001)
bun run --filter @orbit/dashboard dev
```

6. Open http://localhost:3001

## Project Structure

```
orbit/
├── packages/
│   ├── core/       # Domain types and Zod schemas
│   ├── db/         # Database layer (Drizzle ORM)
│   └── api/        # HTTP API (Hono)
├── apps/
│   └── dashboard/  # Web UI (Next.js)
├── docs/           # Documentation
│   ├── idea.md         # Conceptual overview
│   └── architecture.md # Technical decisions
└── docker-compose.yml
```

## Architecture

See [architecture.md](./architecture.md) for detailed technical decisions.

### Core Concepts

- **Pattern**: Systemic signal detected from sources
- **Issue**: Triaged problem with IUTLN scoring
- **ProblemBrief**: Structured problem definition
- **SituationModel**: Evidence and system map
- **Solution**: What to build
- **Decision**: Approval to act
- **Artifact**: Built outputs
- **RunLog**: Execution trace

### Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **API**: Hono
- **Dashboard**: Next.js + Tailwind
- **LLM**: Anthropic, OpenAI, Groq (multi-provider)

## Development

### Commands

```bash
# Install dependencies
bun install

# Run all dev servers
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

### Database

```bash
# Generate migrations
bun run db:generate

# Run migrations
bun run db:migrate

# Open Drizzle Studio
bun run --filter @orbit/db studio
```

## License

MIT
