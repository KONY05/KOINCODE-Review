import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  indexRepo,
  cleanupDisconnectedRepos,
  processReview,
  cancelReview,
  processCommentReply,
  indexChangedFilesJob,
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepo,
    cleanupDisconnectedRepos,
    processReview,
    cancelReview,
    processCommentReply,
    indexChangedFilesJob,
  ],
});
