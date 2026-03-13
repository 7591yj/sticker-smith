import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import type { ConversionJobEvent } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

interface Props {
  events: ConversionJobEvent[];
  converting: boolean;
}

export function ConversionStatus({ events, converting }: Props) {
  if (!converting && events.length === 0) return null;

  const jobStarted = events.find((e) => e.type === "job_started");
  const completedCount = events.filter(
    (e) => e.type === "asset_completed",
  ).length;
  const failedCount = events.filter((e) => e.type === "asset_failed").length;
  const totalCount = jobStarted?.taskCount ?? 0;
  const progress =
    totalCount > 0 ? ((completedCount + failedCount) / totalCount) * 100 : 0;

  const latest = events[0];
  let statusText: string | null = null;
  if (latest?.type === "job_started") {
    statusText = `Converting ${totalCount} asset${totalCount !== 1 ? "s" : ""}…`;
  } else if (latest?.type === "asset_started") {
    statusText = `${completedCount + 1} / ${totalCount}`;
  } else if (
    latest?.type === "asset_completed" ||
    latest?.type === "asset_failed"
  ) {
    statusText = `${completedCount + failedCount} / ${totalCount}`;
  } else if (latest?.type === "job_finished") {
    statusText = `Done ・ ${latest.successCount ?? 0} converted${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
  } else if (converting) {
    statusText = appTokens.copy.status.starting;
  }

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
      {converting && (
        <LinearProgress
          variant={totalCount > 0 ? "determinate" : "indeterminate"}
          value={progress}
          sx={{
            mb: 0.5,
            borderRadius: appTokens.shape.radius.panel,
            height: appTokens.sizes.progress.height,
          }}
        />
      )}
      {statusText && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: appTokens.typography.fontSizes.caption }}
        >
          {statusText}
        </Typography>
      )}
    </Box>
  );
}
