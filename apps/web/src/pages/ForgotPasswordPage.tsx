import { useState } from "react";
import { forgotPassword } from "../api.js";
import { AuthCard, Field } from "../components/AuthCard.js";
import { Link } from "../router.js";
import { usePageMeta } from "../usePageMeta.js";

export function ForgotPasswordPage() {
  usePageMeta("Forgot password", { noindex: true });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const result = await forgotPassword(email);
    setSubmitting(false);
    if (result.ok) setNotice(result.message);
    else setError(result.message);
  }

  return (
    <AuthCard
      title="Forgot password"
      intro="Enter your account email and we'll send you a link to set a new password."
      error={error}
      notice={notice}
      submitLabel="Send reset link"
      submitting={submitting}
      onSubmit={submit}
      footer={
        <>
          <Link to="/login">Back to log in</Link>
          {/* No mail provider in this demo; links land in the outbox. */}
          {import.meta.env.DEV && <span className="field__hint">Running locally? Read the email with pnpm cli outbox</span>}
        </>
      }
    >
      <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
    </AuthCard>
  );
}
