import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import type { ConversionJobEvent } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

interface Props {
  events: ConversionJobEvent[];
  converting: boolean;
}

interface ConversionSummary {
  completedCount: number;
  failedCount: number;
  totalCount: number;
  progress: number;
}

interface StatusTextOptions extends ConversionSummary {
  converting: boolean;
  latest?: ConversionJobEvent;
}

function summarizeConversion(events: ConversionJobEvent[]): ConversionSummary {
  const jobStarted = events.find((e) => e.type === "job_started");
  const completedCount = events.filter(
    (e) => e.type === "sticker_completed",
  ).length;
  const failedCount = events.filter((e) => e.type === "sticker_failed").length;
  const totalCount = jobStarted?.taskCount ?? 0;
  const progress =
    totalCount > 0 ? ((completedCount + failedCount) / totalCount) * 100 : 0;

  return { completedCount, failedCount, totalCount, progress };
}

function getFinishedStatusText(
  latest: ConversionJobEvent,
  failedCount: number,
): string {
  const successCount = "successCount" in latest ? latest.successCount : undefined;
  return `Done ・ ${successCount ?? 0} sticker${successCount === 1 ? "" : "s"} added${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
}

function getStatusText({
  latest,
  converting,
  completedCount,
  failedCount,
  totalCount,
}: StatusTextOptions): string | null {
  switch (latest?.type) {
    case "job_started":
      return `Converting ${totalCount} file${totalCount !== 1 ? "s" : ""}…`;
    case "sticker_started":
      return `${completedCount + 1} / ${totalCount}`;
    case "sticker_completed":
    case "sticker_failed":
      return `${completedCount + failedCount} / ${totalCount}`;
    case "job_finished":
      return getFinishedStatusText(latest, failedCount);
    default:
      return converting ? appTokens.copy.status.starting : null;
  }
}

function ConversionProgress({ totalCount, progress }: Pick<ConversionSummary, "totalCount" | "progress">) {
  return (
    <LinearProgress
      variant={totalCount > 0 ? "determinate" : "indeterminate"}
      value={progress}
      sx={{
        mb: 0.5,
        borderRadius: appTokens.shape.radius.panel,
        height: appTokens.sizes.progress.height,
      }}
    />
  );
}

function StatusCaption({ statusText }: { statusText: string }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontSize: appTokens.typography.fontSizes.caption }}
    >
      {statusText}
    </Typography>
  );
}

export function ConversionStatus({ events, converting }: Props) {
  if (!converting && events.length === 0) return null;

  const summary = summarizeConversion(events);
  const statusText = getStatusText({
    ...summary,
    converting,
    latest: events[0],
  });

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 2,
        pt: 0.5,
        pb: 0.75,
      }}
    >
      {converting && <ConversionProgress {...summary} />}
      {statusText && <StatusCaption statusText={statusText} />}
    </Box>
  );
}
