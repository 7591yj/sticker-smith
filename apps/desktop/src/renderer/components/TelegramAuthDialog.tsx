import { useEffect, useState, type FormEvent } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { TelegramAuthStep, TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

export interface TelegramAuthDialogProps {
  open: boolean;
  state: TelegramState | null;
  onClose: () => void;
  onSubmitTdlibParameters: (input: { apiId: string; apiHash: string }) => Promise<unknown>;
  onSubmitPhoneNumber: (input: { phoneNumber: string }) => Promise<unknown>;
  onSubmitCode: (input: { code: string }) => Promise<unknown>;
  onSubmitPassword: (input: { password: string }) => Promise<unknown>;
}

type AuthFormState = {
  apiId: string;
  apiHash: string;
  phoneNumber: string;
  code: string;
  password: string;
};

type AuthFormSetters = {
  setApiId: (value: string) => void;
  setApiHash: (value: string) => void;
  setPhoneNumber: (value: string) => void;
  setCode: (value: string) => void;
  setPassword: (value: string) => void;
};

type SubmitHandlers = Pick<
  TelegramAuthDialogProps,
  "onSubmitTdlibParameters" | "onSubmitPhoneNumber" | "onSubmitCode" | "onSubmitPassword"
>;

type TelegramTextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  type?: "password";
};

type SubmittableAuthStep = Extract<
  TelegramAuthStep,
  "wait_tdlib_parameters" | "wait_phone_number" | "wait_code" | "wait_password"
>;

type SubmitReadyState = TelegramState & { authStep: SubmittableAuthStep };

function titleForState(state: TelegramState | null) {
  switch (state?.authStep) {
    case "wait_tdlib_parameters": return "Telegram API details";
    case "wait_phone_number": return "Telegram phone number";
    case "wait_code": return "Telegram login code";
    case "wait_password": return "Two-step password";
    case "ready": return "Telegram connected";
    default: return appTokens.copy.dialogs.telegramSetup;
  }
}

function actionLabelForState(state: TelegramState | null) {
  switch (state?.authStep) {
    case "wait_tdlib_parameters":
    case "wait_phone_number":
    case "wait_code":
    case "wait_password":
      return state.authStep === "wait_tdlib_parameters"
        ? "Save API details"
        : appTokens.copy.actions.confirm;
    default:
      return appTokens.copy.actions.close;
  }
}

function authStepRequiresSubmit(state: TelegramState | null): state is SubmitReadyState {
  return state?.authStep === "wait_tdlib_parameters" || state?.authStep === "wait_phone_number" || state?.authStep === "wait_code" || state?.authStep === "wait_password";
}

function canSubmit(state: TelegramState | null, form: AuthFormState) {
  switch (state?.authStep) {
    case "wait_tdlib_parameters": return Boolean(form.apiId.trim() && form.apiHash.trim());
    case "wait_phone_number": return Boolean(form.phoneNumber.trim());
    case "wait_code": return Boolean(form.code.trim());
    case "wait_password": return form.password.length > 0;
    default: return true;
  }
}

function accountSummaryLines(state: TelegramState) {
  const lines = [
    state.tdlib.apiId ? `Telegram API ID: ${state.tdlib.apiId}` : "Telegram API ID not saved",
    state.user.phoneNumber ? `Phone: ${state.user.phoneNumber}` : "Telegram phone number not saved",
  ];

  if (state.sessionUser) {
    const username = state.sessionUser.username ? ` (@${state.sessionUser.username})` : "";
    lines.push(`Account: ${state.sessionUser.displayName}${username}`);
  }

  return lines;
}

function ReadyAccountDetails({ state }: { state: TelegramState }) {
  return (
    <Stack spacing={0.75}>
      {accountSummaryLines(state).map((line) => (
        <Typography key={line} variant="caption" color="text.secondary" sx={{ fontSize: appTokens.typography.fontSizes.caption }}>{line}</Typography>
      ))}
    </Stack>
  );
}

function TelegramTextField({ label, value, onChange, autoFocus, type }: TelegramTextFieldProps) {
  return <TextField autoFocus={autoFocus} fullWidth size="small" type={type} label={label} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function AuthStepFields({ state, form, setters }: { state: TelegramState | null; form: AuthFormState; setters: AuthFormSetters }) {
  switch (state?.authStep) {
    case "wait_tdlib_parameters":
      return (
        <>
          <TelegramTextField autoFocus label={appTokens.copy.labels.telegramApiId} value={form.apiId} onChange={setters.setApiId} />
          <TelegramTextField type="password" label={appTokens.copy.labels.telegramApiHash} value={form.apiHash} onChange={setters.setApiHash} />
        </>
      );
    case "wait_phone_number":
      return <TelegramTextField autoFocus label={appTokens.copy.labels.telegramPhoneNumber} value={form.phoneNumber} onChange={setters.setPhoneNumber} />;
    case "wait_code":
      return <TelegramTextField autoFocus label={appTokens.copy.labels.telegramCode} value={form.code} onChange={setters.setCode} />;
    case "wait_password":
      return <TelegramTextField autoFocus type="password" label={appTokens.copy.labels.telegramPassword} value={form.password} onChange={setters.setPassword} />;
    case "ready":
      return <ReadyAccountDetails state={state} />;
    default:
      return null;
  }
}

function AuthDialogContent({ state, form, setters }: { state: TelegramState | null; form: AuthFormState; setters: AuthFormSetters }) {
  return (
    <DialogContent sx={{ pt: "8px !important" }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}>{state?.lastError ?? state?.message ?? appTokens.copy.emptyStates.noTelegramPacks}</Typography>
        <AuthStepFields state={state} form={form} setters={setters} />
      </Stack>
    </DialogContent>
  );
}

function AuthDialogActions({ state, form, submitting, onClose }: { state: TelegramState | null; form: AuthFormState; submitting: boolean; onClose: () => void }) {
  const requiresSubmit = authStepRequiresSubmit(state);
  return (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button size="small" onClick={onClose} disabled={submitting}>{requiresSubmit ? appTokens.copy.actions.cancel : appTokens.copy.actions.close}</Button>
      {requiresSubmit ? <Button size="small" type="submit" variant="contained" disabled={submitting || !canSubmit(state, form)}>{actionLabelForState(state)}</Button> : null}
    </DialogActions>
  );
}

async function submitAuthStep(state: TelegramState | null, form: AuthFormState, handlers: SubmitHandlers, onClose: () => void) {
  if (!authStepRequiresSubmit(state)) {
    onClose();
    return;
  }

  if (!canSubmit(state, form)) return;

  const submitByStep = {
    wait_tdlib_parameters: () => handlers.onSubmitTdlibParameters({ apiId: form.apiId.trim(), apiHash: form.apiHash.trim() }),
    wait_phone_number: () => handlers.onSubmitPhoneNumber({ phoneNumber: form.phoneNumber.trim() }),
    wait_code: () => handlers.onSubmitCode({ code: form.code.trim() }),
    wait_password: () => handlers.onSubmitPassword({ password: form.password }),
  };

  await submitByStep[state.authStep]();
}

export function TelegramAuthDialog({ open, state, onClose, onSubmitTdlibParameters, onSubmitPhoneNumber, onSubmitCode, onSubmitPassword }: TelegramAuthDialogProps) {
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const form = { apiId, apiHash, phoneNumber, code, password };
  const setters = { setApiId, setApiHash, setPhoneNumber, setCode, setPassword };

  useEffect(() => {
    if (!open) return;
    setApiId(state?.tdlib.apiId ?? "");
    setApiHash("");
    setPhoneNumber(state?.user.phoneNumber ?? "");
    setCode("");
    setPassword("");
    setSubmitting(false);
  }, [open, state]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      await submitAuthStep(
        state,
        form,
        { onSubmitTdlibParameters, onSubmitPhoneNumber, onSubmitCode, onSubmitPassword },
        onClose,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogTitle sx={{ fontSize: appTokens.typography.fontSizes.dialogTitle, fontWeight: appTokens.typography.fontWeights.medium, pb: 1 }}>{titleForState(state)}</DialogTitle>
        <AuthDialogContent state={state} form={form} setters={setters} />
        <AuthDialogActions state={state} form={form} submitting={submitting} onClose={onClose} />
      </form>
    </Dialog>
  );
}
