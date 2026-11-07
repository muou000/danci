## Agent skills

### Issue tracker

GitHub issues in `muou000/danci` via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard 5-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` + `docs/adr/` at root). See `docs/agents/domain.md`.

### Passage authoring, annotation, and typography standards

Before writing or editing a passage, follow `docs/agents/annotation-standards.md`: choose target headwords by topic and natural context, run `npm run coverage` before drafting and after edits, and use the generated `docs/corpus/uncovered-headwords.md`. Every passage must achieve a net core headword growth rate of at least 1.0% (≥47 net new headwords out of 4,692) within 190–280 words, maintain natural discourse and grammatical correctness without awkward piling, and pass an independent SubAgent peer review (APPROVED) before closing or merging. The document also defines sublinear gloss grammar (2–3 senses, adjective “的”, adverb “地”, contextual POS) and collision-free typography.

