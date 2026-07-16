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
    };
  };
};

type MonthlyContributionsResponse = {
  viewer: Record<
    string,
    {
      totalCommitContributions: number;
      totalPullRequestContributions: number;
    }
  >;
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
      }
    }
  }
`;

function getLast6Months(): { month: string; from: string; to: string }[] {
  const months: { month: string; from: string; to: string }[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthNum = d.getMonth();
    const from = new Date(Date.UTC(year, monthNum, 1)).toISOString();
    const to = new Date(Date.UTC(year, monthNum + 1, 0, 23, 59, 59)).toISOString();
    const month = `${year}-${String(monthNum + 1).padStart(2, "0")}`;
    months.push({ month, from, to });
  }

  return months;
}

function buildMonthlyQuery(months: { from: string; to: string }[]): string {
  const fragments = months.map(
    (m, i) =>
      `m${i}: contributionsCollection(from: "${m.from}", to: "${m.to}") {
        totalCommitContributions
        totalPullRequestContributions
      }`
  );

  return `query { viewer { ${fragments.join("\n")} } }`;
}

export async function getContributions(token: string) {
  const gql = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  const months = getLast6Months();

  const [data, monthlyData] = await Promise.all([
    gql<GraphQLContributionsResponse>(CONTRIBUTIONS_QUERY),
    gql<MonthlyContributionsResponse>(buildMonthlyQuery(months)),
  ]);

  const collection = data.viewer.contributionsCollection;

  const calendar: ContributionCalendar = collection.contributionCalendar;

  const stats: ContributionStats = {
    totalCommits: collection.totalCommitContributions,
    totalPullRequests: collection.totalPullRequestContributions,
    totalRepositoriesContributedTo:
      collection.totalRepositoriesWithContributedCommits,
  };

  const monthlyActivity: MonthlyActivity[] = months.map((m, i) => {
    const entry = monthlyData.viewer[`m${i}`];
    return {
      month: m.month,
      commits: entry.totalCommitContributions,
      pullRequests: entry.totalPullRequestContributions,
    };
  });

  return { calendar, stats, monthlyActivity };
}
