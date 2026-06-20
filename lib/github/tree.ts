import { Octokit } from "@octokit/rest";

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

export type RepoFile = {
  path: string;
  content: string;
  fileType: "readme" | "config" | "source" | "tree";
};

type TreeItem = {
  path?: string;
  type?: string;
  size?: number;
};

function isReadme(path: string): boolean {
  const fileName = path.split("/").pop() ?? "";
  return README_PATTERNS.includes(fileName.toLowerCase());
}

function isConfigFile(path: string): boolean {
  return CONFIG_FILES.has(path.toLowerCase());
}

function classifyFile(path: string): RepoFile["fileType"] | null {
  if (isReadme(path)) return "readme";
  if (isConfigFile(path)) return "config";
  return null;
}

export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<RepoFile[]> {
  const octokit = new Octokit({ auth: token });
  const MAX_FILES = 30;

  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: "true",
  });

  const treeItems: TreeItem[] = treeData.tree;
  const treeListing = treeItems
    .filter((item) => item.path)
    .map((item) => `${item.type === "tree" ? "d" : "f"} ${item.path}`)
    .join("\n");

  const files: RepoFile[] = [
    { path: "__tree__", content: treeListing, fileType: "tree" },
  ];

  const filesToFetch: { path: string; fileType: RepoFile["fileType"] }[] = [];
  for (const item of treeItems) {
    if (!item.path || item.type !== "blob") continue;
    if ((item.size ?? 0) > 100_000) continue;

    const fileType = classifyFile(item.path);
    if (fileType) {
      filesToFetch.push({ path: item.path, fileType });
    }
    if (filesToFetch.length >= MAX_FILES - 1) break;
  }

  const contentResults = await Promise.allSettled(
    filesToFetch.map(async ({ path, fileType }) => {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: defaultBranch,
      });

      if ("content" in data && data.encoding === "base64") {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { path, content, fileType } satisfies RepoFile;
      }

      return null;
    })
  );

  for (const result of contentResults) {
    if (result.status === "fulfilled" && result.value) {
      files.push(result.value);
    }
  }

  return files;
}
