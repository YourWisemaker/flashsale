import type { FormEvent, ReactNode } from "react";

/** Shared frame for the account pages: a centered card with a form. */
export function AuthCard(props: {
  title: string;
  intro?: ReactNode;
  error: string | null;
  notice?: string | null;
  submitLabel: string;
  submitting: boolean;
  onSubmit(): void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="auth card" aria-labelledby="auth-title">
      <h1 id="auth-title" className="auth__title">
        {props.title}
      </h1>
      {props.intro && <p className="auth__intro">{props.intro}</p>}
      <form
        className="auth__form"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!props.submitting) props.onSubmit();
        }}
      >
        {props.children}
        {props.error && (
          <p className="auth__error" role="alert">
            {props.error}
          </p>
        )}
        {props.notice && (
          <p className="auth__notice" role="status">
            {props.notice}
          </p>
        )}
        <button type="submit" className="buy__button" disabled={props.submitting}>
          {props.submitting ? "Please wait..." : props.submitLabel}
        </button>
      </form>
      {props.footer && <div className="auth__footer">{props.footer}</div>}
    </section>
  );
}

export function Field(props: { id: string; label: string; type: string; value: string; onChange(value: string): void; autoComplete: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type}
        value={props.value}
        autoComplete={props.autoComplete}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.hint && (
        <p id={`${props.id}-hint`} className="field__hint">
          {props.hint}
        </p>
      )}
    </div>
  );
}
