# flash-sale-arief

A Claude Code plugin for this repo. Three skills that string the repo's own tools together into the workflows that come up most.

| Skill | Use when |
|---|---|
| `investigate` | Something is wrong (oversell suspicion, stuck "pending", 503s, slow purchases, a leak) and you need the cause, not a guess |
| `app-server-mutation-testing` | You changed `apps/api` logic or a test, or Stryker reports survivors |
| `verify-and-log` | You think a change is done: run the definition-of-done checks and append the result to `docs/verification-log.md` |

## Load it

For one session:

```bash
claude --plugin-dir .claude/plugins/flash-sale-arief
```

Skills then show up as `flash-sale-arief:investigate` and so on. Check the manifest and skills with `claude plugin validate .claude/plugins/flash-sale-arief`.

## Layout

```
.claude/plugins/flash-sale-arief/
  .claude-plugin/plugin.json
  README.md
  skills/
    investigate/SKILL.md
    app-server-mutation-testing/SKILL.md
    verify-and-log/SKILL.md
```

The skills lean on the project skills in `.claude/skills/` (`read-database`, `codegraph`, `backend-api`) and the invariants in the root `CLAUDE.md`. They don't repeat them.
