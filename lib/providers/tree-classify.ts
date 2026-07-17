import type { RepoFile } from "./types";

const CONFIG_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "cargo.toml",
  "go.mod",
  "go.sum",
  "gemfile",
  "makefile",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.yml",
  "eslint.config.js",
  "eslint.config.mjs",
  ".prettierrc",
  ".prettierrc.json",
  "biome.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.js",
  "postcss.config.mjs",
  ".env.example",
]);

const README_PATTERNS = ["readme.md", "readme", "readme.rst", "readme.txt"];

function isReadme(path: string): boolean {
  const fileName = path.split("/").pop() ?? "";
  return README_PATTERNS.includes(fileName.toLowerCase());
}

function isConfigFile(path: string): boolean {
  return CONFIG_FILES.has(path.toLowerCase());
}

/** Classifies a repo-tree path as readme/config/neither — same rules regardless of git host. */
export function classifyFile(path: string): RepoFile["fileType"] | null {
  if (isReadme(path)) return "readme";
  if (isConfigFile(path)) return "config";
  return null;
}
