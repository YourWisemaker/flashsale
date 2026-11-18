import { useState } from "react";
import { register } from "../api.js";
import { useAuth } from "../auth.js";
import { AuthCard, Field } from "../components/AuthCard.js";
import { Link, navigate } from "../router.js";
import { usePageMeta } from "../usePageMeta.js";

export function RegisterPage() {
  usePageMeta("Create an account", { noindex: true });
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    // Checked here only to save a round trip; the API enforces the rules.
    if (password !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    setError(null);
    const result = await register(email, password);
    setSubmitting(false);
    if (!result.ok) return setError(result.message);
    setUser(result.email);
    navigate("/");
  }

  return (
    <AuthCard
      title="Create an account"
      intro="One account, one pair. That's how the sale stays fair."
      error={error}
      submitLabel="Create account"
      submitting={submitting}
      onSubmit={submit}
      footer={
        <span>
          Already have an account? <Link to="/login">Log in</Link>
        </span>
      }
    >
      <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
      <Field id="password" label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} hint="At least 8 characters." />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
    </AuthCard>
  );
}
