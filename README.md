<p align="center">
  <img src="public/logo.png" alt="KOINCODE Review" />
</p>


An open-source AI-powered code review agent. Connect your GitHub repos, bring your own LLM API key, and get automated reviews with fix suggestions on every pull request.

## Features

- **Automated PR reviews** — AI-generated inline comments posted directly to your pull requests
- **Code fix suggestions** — actionable diffs you can apply with one click (auto-committed to the branch)
- **Multi-provider LLM support** — Anthropic, OpenAI, Google, OpenRouter
- **BYOK (Bring Your Own Key)** — no built-in model hosting, no billing complexity
- **Repository memory** — teach the reviewer per-repo conventions via PR comment replies or manual rules
- **Codebase context** — hybrid vector indexing gives the reviewer understanding of your broader codebase
- **Usage tracking** — monitor API calls, tokens, latency, and errors per key
- **Encrypted storage** — API keys encrypted with AES-256-GCM at rest, decrypted only at invocation

## Getting Started

```bash
git clone https://github.com/KONY05/KOINCODE-Review.git
cd KOINCODE-Review
pnpm install
cp .env.local.example .env.local  # fill in your keys
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## How It Works

1. Sign in with GitHub via Clerk OAuth
2. Choose an LLM provider and add your API key
3. Connect repositories — webhooks are installed automatically
4. Open a PR — a background job fetches the diff, retrieves codebase context, and sends the review prompt to your chosen LLM
5. Review comments with fix suggestions are posted to the PR
6. Apply fixes (auto-committed) or resolve them (dismiss)

## License

[MIT](LICENSE)
