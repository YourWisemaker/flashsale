import { useState } from "react";
import { resetPassword } from "../api.js";
import { useAuth } from "../auth.js";
import { AuthCard, Field } from "../components/AuthCard.js";
import { Link, navigate, useLocation } from "../router.js";
import { usePageMeta } from "../usePageMeta.js";

export function ResetPasswordPage() {
  usePageMeta("Set a new password", { noindex: true });
  const { setUser } = useAuth();
  const token = useLocation().search.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <section className="auth card">
        <h1 className="auth__title">Reset link missing</h1>
        <p className="auth__intro">Open the link from your email, or ask for a new one.</p>
        <Link to="/forgot-password" className="buy__button buy__button--link">
          Send a new link
        </Link>
      </section>
    );
  }

  async function submit() {
    if (password !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    setError(null);
    const result = await resetPassword(token as string, password);
    setSubmitting(false);
    if (!result.ok) return setError(result.message);
    setUser(result.email);
    navigate("/");
  }

  return (
    <AuthCard
      title="Set a new password"
      error={error}
      submitLabel="Save new password"
      submitting={submitting}
      onSubmit={submit}
      footer={<Link to="/forgot-password">Need a new link?</Link>}
    >
      <Field id="password" label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} hint="At least 8 characters." />
      <Field id="confirm" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
    </AuthCard>
  );
}
