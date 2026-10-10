# Project Agent Instructions

- For implementation requests, inspect the relevant code and proceed directly; do not add unnecessary preambles, progress narration, or conversational filler.
- Ask a concise clarifying question only when a material requirement is ambiguous or a blocker requires the user's decision. Otherwise, make reasonable assumptions and complete the work.
- When the user asks to `git push`, treat that as authorization to validate the relevant changes, stage only task-related files, create a commit, and push it to the configured upstream. Do not include unrelated worktree changes.
- After completing a task, report the outcome briefly, including validation and commit/push status when applicable.
