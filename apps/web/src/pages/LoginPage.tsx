import { useState } from "react";
import { login } from "../api.js";
import { useAuth } from "../auth.js";
import { AuthCard, Field } from "../components/AuthCard.js";
import { Link, navigate, safeNext, useLocation } from "../router.js";
import { usePageMeta } from "../usePageMeta.js";

export function LoginPage() {
  usePageMeta("Log in", { noindex: true });
  const { setUser } = useAuth();
  const { search } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) return setError(result.message);
    setUser(result.email);
    navigate(safeNext(search.get("next")));
  }

  return (
    <AuthCard
      title="Log in"
      intro="Log in to join the flash sale."
      error={error}
      submitLabel="Log in"
      submitting={submitting}
      onSubmit={submit}
      footer={
        <>
          <Link to="/forgot-password">Forgot password?</Link>
          <span>
            New here? <Link to="/register">Create an account</Link>
          </span>
        </>
      }
    >
      <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
    </AuthCard>
  );
}
