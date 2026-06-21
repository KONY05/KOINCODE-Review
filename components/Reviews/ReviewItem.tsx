"use client";

import {
  ExternalLinkIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
  ClockIcon,
  CheckCircle2Icon,
  XCircleIcon,
  LoaderIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import type { ReviewEntry } from "@/lib/actions/reviews";

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: ClockIcon,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  in_progress: {
    label: "In Progress",
    icon: LoaderIcon,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2Icon,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: XCircleIcon,
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
} as const;

export default function ReviewItem({ review }: { review: ReviewEntry }) {
  const config = STATUS_CONFIG[review.status];
  const StatusIcon = config.icon;
  const commentCount = review.comments?.length ?? 0;

  return (
    <div className="rounded-2xl border border-(--kc-border-subtle) bg-card p-6 transition-colors hover:border-(--kc-border)">
      <div className="flex items-start gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--kc-bg) text-(--kc-text-muted)">
          <GitPullRequestIcon className="size-[18px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[15px] font-semibold leading-snug">
              {review.prTitle}
            </h3>
            <Badge
              className={`border-0 ${config.className}`}
            >
              <StatusIcon className="size-3" />
              {config.label}
            </Badge>
          </div>

          <p className="mt-1 text-[13px] text-(--kc-text-muted)">
            {review.repoFullName}
            <span className="mx-1.5 text-(--kc-text-dim)">·</span>
            #{review.prNumber}
          </p>

          <div className="mt-1 flex items-center gap-3 text-[12px] text-(--kc-text-dim)">
            <span>{formatRelativeTime(review.createdAt)}</span>
            {review.model && (
              <>
                <span>·</span>
                <span className="font-mono">{review.model}</span>
              </>
            )}
          </div>
        </div>

      </div>

      {review.summary && (
        <div className="mt-4 rounded-xl border border-(--kc-border-subtle) bg-(--kc-bg) p-4">
          <p className="line-clamp-3 text-[13px] leading-relaxed text-(--kc-text-secondary)">
            {review.summary}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Link
          href={review.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-(--kc-cream) px-3.5 py-1.5 text-[13px] font-semibold text-(--kc-cream-text) transition-colors hover:bg-(--kc-cream-hover)"
        >
          <ExternalLinkIcon className="size-3.5" />
          View on GitHub
        </Link>
        {commentCount > 0 && (
          <>
            <span className="text-(--kc-text-dim)">·</span>
            <span className="inline-flex items-center gap-1 text-[13px] text-(--kc-text-dim)">
              <MessageSquareIcon className="size-3" />
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
