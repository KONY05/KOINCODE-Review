"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { approveCliDevice, denyCliDevice } from "@/lib/actions/cli-auth";

type Props = {
  deviceCode: string;
  userEmail: string;
};

type State = "idle" | "approved" | "denied" | "error";

export function CliAuthApproval({ deviceCode, userEmail }: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleApprove = async () => {
    setPending(true);
    const result = await approveCliDevice(deviceCode);
    setPending(false);
    if (!result.success) {
      setError(result.error);
      setState("error");
      return;
    }
    setState("approved");
  };

  const handleDeny = async () => {
    setPending(true);
    await denyCliDevice(deviceCode);
    setPending(false);
    setState("denied");
  };

  if (state === "approved") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>CLI authorized</CardTitle>
          <CardDescription>
            You can close this tab and return to your terminal.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === "denied") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Request denied</CardTitle>
          <CardDescription>You can close this tab.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Authorize KOINCODE CLI</CardTitle>
        <CardDescription>
          A KOINCODE CLI on your machine wants to connect as {userEmail}. It
          will be able to connect and disconnect repositories on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={handleApprove} disabled={pending}>
          Allow
        </Button>
        <Button onClick={handleDeny} disabled={pending} variant="outline">
          Deny
        </Button>
      </CardContent>
    </Card>
  );
}
