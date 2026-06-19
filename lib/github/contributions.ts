import { graphql } from "@octokit/graphql";

type ContributionDay = {
  date: string;
  contributionCount: number;
  contributionLevel:
    | "NONE"
    | "FIRST_QUARTILE"
    | "SECOND_QUARTILE"
    | "THIRD_QUARTILE"
    | "FOURTH_QUARTILE";
};

type ContributionWeek = {
  contributionDays: ContributionDay[];
};

export type ContributionCalendar = {
  totalContributions: number;
  weeks: ContributionWeek[];
};

export type ContributionStats = {
  totalCommits: number;
  totalPullRequests: number;
  totalRepositoriesContributedTo: number;
};

export type MonthlyActivity = {
  month: string;
  commits: number;
  pullRequests: number;
};

type GraphQLContributionsResponse = {
  viewer: {
    contributionsCollection: {
      contributionCalendar: ContributionCalendar;
      totalCommitContributions: number;
      totalPullRequestContributions: number;
      totalRepositoriesWithContributedCommits: number;
      commitContributionsByRepository: {
        repository: { name: string };
        contributions: {
          nodes: { occurredAt: string }[];
        };
      }[];
      pullRequestContributionsByRepository: {
        repository: { name: string };
        contributions: {
          nodes: { occurredAt: string }[];
        };
      }[];
    };
  };
};

const CONTRIBUTIONS_QUERY = `
  query {
    viewer {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
        totalCommitContributions
        totalPullRequestContributions
        totalRepositoriesWithContributedCommits
        commitContributionsByRepository(maxRepositories: 100) {
          repository { name }
          contributions(first: 100) {
            nodes { occurredAt }
          }
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          repository { name }
          contributions(first: 100) {
            nodes { occurredAt }
          }
        }
      }
    }
  }
`;

function buildMonthlyActivity(
  data: GraphQLContributionsResponse["viewer"]["contributionsCollection"]
): MonthlyActivity[] {
  const monthMap = new Map<string, { commits: number; pullRequests: number }>();

  for (const repo of data.commitContributionsByRepository) {
    for (const node of repo.contributions.nodes) {
      const month = node.occurredAt.slice(0, 7);
      const entry = monthMap.get(month) ?? { commits: 0, pullRequests: 0 };
      entry.commits++;
      monthMap.set(month, entry);
    }
  }

  for (const repo of data.pullRequestContributionsByRepository) {
    for (const node of repo.contributions.nodes) {
      const month = node.occurredAt.slice(0, 7);
      const entry = monthMap.get(month) ?? { commits: 0, pullRequests: 0 };
      entry.pullRequests++;
      monthMap.set(month, entry);
    }
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, data]) => ({
      month,
      commits: data.commits,
      pullRequests: data.pullRequests,
    }));
}

export async function getContributions(token: string) {
  const gql = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  const data = await gql<GraphQLContributionsResponse>(CONTRIBUTIONS_QUERY);
  const collection = data.viewer.contributionsCollection;

  const calendar: ContributionCalendar = collection.contributionCalendar;

  const stats: ContributionStats = {
    totalCommits: collection.totalCommitContributions,
    totalPullRequests: collection.totalPullRequestContributions,
    totalRepositoriesContributedTo:
      collection.totalRepositoriesWithContributedCommits,
  };

  const monthlyActivity = buildMonthlyActivity(collection);

  return { calendar, stats, monthlyActivity };
}
