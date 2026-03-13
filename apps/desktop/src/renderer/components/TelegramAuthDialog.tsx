import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  state: TelegramState | null;
  onClose: () => void;
  onSubmitTdlibParameters: (input: {
    apiId: string;
    apiHash: string;
  }) => Promise<unknown>;
  onSubmitPhoneNumber: (input: { phoneNumber: string }) => Promise<unknown>;
  onSubmitCode: (input: { code: string }) => Promise<unknown>;
  onSubmitPassword: (input: { password: string }) => Promise<unknown>;
}

function titleForState(state: TelegramState | null) {
  switch (state?.authStep) {
    case "wait_tdlib_parameters":
      return "TDLib Parameters";
    case "wait_phone_number":
      return "Telegram Phone";
    case "wait_code":
      return "Telegram Code";
    case "wait_password":
      return "Telegram Password";
    case "ready":
      return "Telegram Connected";
    default:
      return appTokens.copy.dialogs.telegramSetup;
  }
}

function actionLabelForState(state: TelegramState | null) {
  switch (state?.authStep) {
    case "wait_tdlib_parameters":
    case "wait_phone_number":
    case "wait_code":
    case "wait_password":
      return appTokens.copy.actions.confirm;
    default:
      return appTokens.copy.actions.close;
  }
}

export function TelegramAuthDialog({
  open,
  state,
  onClose,
  onSubmitTdlibParameters,
  onSubmitPhoneNumber,
  onSubmitCode,
  onSubmitPassword,
}: Props) {
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setApiId(state?.tdlib.apiId ?? "");
    setApiHash("");
    setPhoneNumber(state?.user.phoneNumber ?? "");
    setCode("");
    setPassword("");
    setSubmitting(false);
  }, [open, state]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      switch (state?.authStep) {
        case "wait_tdlib_parameters":
          if (!apiId.trim() || !apiHash.trim()) {
            return;
          }
          await onSubmitTdlibParameters({
            apiId: apiId.trim(),
            apiHash: apiHash.trim(),
          });
          return;
        case "wait_phone_number":
          if (!phoneNumber.trim()) {
            return;
          }
          await onSubmitPhoneNumber({
            phoneNumber: phoneNumber.trim(),
          });
          return;
        case "wait_code":
          if (!code.trim()) {
            return;
          }
          await onSubmitCode({ code: code.trim() });
          return;
        case "wait_password":
          if (!password) {
            return;
          }
          await onSubmitPassword({ password });
          return;
        default:
          onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const requiresSubmit =
    state?.authStep === "wait_tdlib_parameters" ||
    state?.authStep === "wait_phone_number" ||
    state?.authStep === "wait_code" ||
    state?.authStep === "wait_password";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogTitle
          sx={{
            fontSize: appTokens.typography.fontSizes.dialogTitle,
            fontWeight: appTokens.typography.fontWeights.medium,
            pb: 1,
          }}
        >
          {titleForState(state)}
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Stack spacing={1.5}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
            >
              {state?.lastError ?? state?.message ?? appTokens.copy.emptyStates.noTelegramPacks}
            </Typography>

            {state?.authStep === "wait_tdlib_parameters" ? (
              <>
                <TextField
                  autoFocus
                  fullWidth
                  size="small"
                  label={appTokens.copy.labels.telegramApiId}
                  value={apiId}
                  onChange={(event) => setApiId(event.target.value)}
                />
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label={appTokens.copy.labels.telegramApiHash}
                  value={apiHash}
                  onChange={(event) => setApiHash(event.target.value)}
                />
              </>
            ) : null}

            {state?.authStep === "wait_phone_number" ? (
              <TextField
                autoFocus
                fullWidth
                size="small"
                label={appTokens.copy.labels.telegramPhoneNumber}
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
            ) : null}

            {state?.authStep === "wait_code" ? (
              <TextField
                autoFocus
                fullWidth
                size="small"
                label={appTokens.copy.labels.telegramCode}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            ) : null}

            {state?.authStep === "wait_password" ? (
              <TextField
                autoFocus
                fullWidth
                size="small"
                type="password"
                label={appTokens.copy.labels.telegramPassword}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            ) : null}

            {state?.authStep === "ready" ? (
              <Stack spacing={0.75}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: appTokens.typography.fontSizes.caption }}
                >
                  {state.tdlib.apiId ? `API ID: ${state.tdlib.apiId}` : "API ID not saved"}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: appTokens.typography.fontSizes.caption }}
                >
                  {state.user.phoneNumber
                    ? `Phone: ${state.user.phoneNumber}`
                    : "Phone number not saved"}
                </Typography>
                {state.sessionUser ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: appTokens.typography.fontSizes.caption }}
                  >
                    {state.sessionUser.username
                      ? `Account: ${state.sessionUser.displayName} (@${state.sessionUser.username})`
                      : `Account: ${state.sessionUser.displayName}`}
                  </Typography>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={onClose} disabled={submitting}>
            {requiresSubmit
              ? appTokens.copy.actions.cancel
              : appTokens.copy.actions.close}
          </Button>
          {requiresSubmit ? (
            <Button
              size="small"
              type="submit"
              variant="contained"
              disabled={
                submitting ||
                (state?.authStep === "wait_tdlib_parameters" &&
                  (!apiId.trim() || !apiHash.trim())) ||
                (state?.authStep === "wait_phone_number" && !phoneNumber.trim()) ||
                (state?.authStep === "wait_code" && !code.trim()) ||
                (state?.authStep === "wait_password" && password.length === 0)
              }
            >
              {actionLabelForState(state)}
            </Button>
          ) : null}
        </DialogActions>
      </form>
    </Dialog>
  );
}
