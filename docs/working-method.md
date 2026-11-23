# Working method

How heath.js is developed: one developer working with an AI coding assistant (Claude Code). It covers planning, issues, reviews and taking changes through pull requests. It grew out of the work on heath.js from October 2026 and is versioned, so the way of working can be traced over time and reused as a starting point in other projects.

Most of it is project-neutral. Parts specific to heath.js are marked as such.

**Version 4** (19 November 2026). History at the end.

## Working together

- **Questions are questions.** A question ("can we…", "is there…", "how does…") gets an answer and, where useful, a proposal. Files, commits, config and remotes change only on a direct instruction. Read-only checks to answer a question are fine.
- **Explain before doing.** Describe the plan in a line or two and ask.
- **A go-ahead names its scope.** "Shall I do steps 1–3?" covers steps 1–3 and nothing more. Anything new that comes up on the way is asked about first, not reported afterwards. Answering clarifying questions is not a go-ahead.
- **Stop uncommitted.** The developer reviews and tests each change before it's committed (see "Reviewing a change before committing"). "Do b" means implement b, not commit it.
- **The simplest thing that works.** No helper, script or abstraction unless it earns its place. When a change looks over-engineered, say so and simplify.
- **Look up current versions** before pinning any action, image, package or tool; never pin from memory.
- **Plain Markdown in replies,** no HTML tags.

## Planning layers

Each kind of information has one home; the others link to it.

| Layer | Where (in heath.js) | Holds |
|---|---|---|
| Goal | A release issue (#94 "Release 1.0") | The why and when: dates, workstreams with criticality and key issues, requests to others with needed-by dates |
| Order | A pinned work plan issue (#31) | What's next: every open issue, in order, under its workstream |
| Work | The issues | Details: requirements, decisions, steps |
| Later | An ideas issue (#92) | Ideas that don't need an issue yet |
| Progress | A milestone ("1.0") | Every must-have issue; GitHub shows the progress |
| Picture | A snapshot page (optional) | The plan as a timeline, with a progress chart; updated only at milestones |
| Evidence | `docs/audits/` | Reviews: what was found, and which issue each finding became |

- Every new issue goes into the work plan right away, under its workstream, and gets the milestone if it's a must-have.
- When a workstream of "do if time" work starts, the ideas issue is reviewed too, and prioritised with it.
- No separate tool (e.g. a Trello board) alongside GitHub: one place for planning.

## Issues

- Every issue written by the assistant starts with a note that it was AI-generated and may need checking. When the assistant fills in a placeholder's requirements (rather than recording decisions), the note says they are a draft that needs careful checking.
- Every issue gets a label at creation (bug, enhancement, documentation, question).
- Steps are numbered issue.step.part.item (e.g. 13.5.5.a; items are letters), kept in a steps comment and updated as plans change.
- New problems found along the way become new issues or comments, not growth of the current pull request.
- When the solution is open, the issue lists options and says that the choice is open.

## Triage: findings, reviews, plans

- Findings are presented **one at a time**, briefly; the developer answers each with an action: an issue, part of an issue, an idea for the ideas issue, "investigate", or nothing.
- Then the developer's answers are **cross-checked** against the assistant's own proposal, naming real disagreements (not just differences in scope).
- The same works for planning: workstreams one by one, each answered with how critical it is and when.

## Reviews

- **Independent review before a pull request:** a separate agent, without the conversation, reviews the whole branch diff. Every finding is verified; confirmed ones are fixed one at a time, each reviewed before commit (fixes that change no behaviour can share one round). The rest become comments on issues.
- **A proportion review** when the developer doubts a change's size: is it over-engineered for what it does?
- **Plans get an independent review too:** consistency between the planning layers, dependencies and order, feasibility, gaps. Bookkeeping fixes are made directly; decisions go to the developer one by one.
- **UX reviews can be run by the assistant:** drive the app in a real browser (Playwright, on the real GPU) as a first-time user, compare with earlier reviews, and file the result in `docs/audits/<date>-<topic>/` with an outcome table and only the screenshots it cites, scaled down.

## Taking a change through a pull request

**Per change**
- An issue first: summary, how it works today, requirements as checkboxes, related issues.
- For anything that runs somewhere else (a server, CI, another service), inspect the target environment early, with read-only checks, before designing what depends on it.

**Branch**
- One short-lived branch per pull request, from the latest `main`, named after the issue (e.g. `40-deploy`). `main` only changes through pull requests.
- No tiny pull requests: small documentation changes ride along with a larger one, unless there's a stated reason.

**Code**
- Real logic goes in small, tested functions, with test fixtures that break assumptions on purpose (target not first, several neighbours, a deleted item). Trivial glue is tested through the real set-up instead.
- Descriptive names, and a one-line comment on each function.

**Reviewing a change before committing**
1. **The handover:** the assistant stops with the change uncommitted and gives a short list of the changed files, as links to the changed places, plus test steps where the change affects behaviour. No pasted diffs, and no explanations unless asked.
2. **The review:** in VS Code's Source Control panel, clicking a changed file opens the red/green diff against the last commit. It's set to show inline rather than side by side (`"diffEditor.renderSideBySide": false`).
3. **The test:** in the app, following the given steps.
4. **The go-ahead:** the developer says when to commit, and whether the assistant may choose the split.

**Commits**
- Only on the developer's word; one commit per item; Conventional Commits (`type(scope): summary`, imperative, lowercase, no trailing period).
- The developer may delegate the split ("commit as you see fit"). Check what's staged before each commit.

**Before the pull request**
- A manual test of the whole branch, with written steps so it can be repeated; rerun after the review fixes.
- A version bump on every pull request, by semver (before 1.0: minor for breaking changes, patch for features and fixes). In heath.js, `npm version patch --no-git-tag-version` also updates `CITATION.cff`, and CI checks both.
- If a new AI model was used, add it to the README's "Use of AI".
- The independent review (above).

**The pull request**
- Draft the description (summary, contents, testing, what's next, attribution) and show it in full in the chat, before pushing or opening anything.
- Open the pull request only after the developer has approved that text, together with the go-ahead to push and open it. If the text changes after approval, show it again.
- The AI note says what actually happened: "Written with Claude (AI), checked by <developer>" only after an explicit approval of the text; otherwise "Written with Claude (AI), not yet checked by the developer". Never write "checked" on the assistant's own initiative.
- Use "Closes #n" only when the issue should close. ("Closes #68's first steps" closed #68 by accident.)
- CI must be green. Merge with a merge commit, only on the developer's explicit go-ahead.

**After the merge**
- In heath.js, CI publishes the image and tags the version, and the deployed app updates itself.
- Pull `main`, delete the branch, tick finished items, update the work plan.
- Compare how the pull request went against this file (see below).

## Working with other people

- Mention people only neutrally ("for reference"). Never ask anyone for input, feedback or action unless the developer says so.
- Public text never claims someone's review or approval ("checked by …", "approved by …") unless that person has actually given it in this session.
- Public repositories hold no server details: no hostnames, addresses, user names or keys in issues, commits or files.
- Messages to others: the plain first draft is usually best.

## Keeping this file up to date

After each pull request, and after a planning session that changes the method, compare how it went against this file. If something changed (a step added, dropped, reordered, or done differently and kept), write a new version: update the text, add a line to the history below, and say so. If nothing changed, say that.

## History

- **Version 4** (19 November 2026): planning layers (release issue, work plan by workstream, ideas issue, milestone, snapshot page); triage one by one, then a cross-check; independent reviews of plans; self-run UX reviews; issue notes for drafts; no unrequested asks; checking what's staged; care with "Closes #n". Moved into the repository so other projects can use it as a starting point.
- **Version 3** (19 November 2026, after PR #72): the version bump also updates `CITATION.cff`; new AI models go into the README.
- **Version 2** (18 November 2026, after PR #48): the simplest solution first, unit tests only for real logic; the whole-branch manual test rerun after review fixes; non-behavioural fixes may share a review round; merging from the terminal; inspect target environments early; no tiny pull requests.
- **Version 1** (18 November 2026): the method as practised in #13 and #40: issue first, numbered steps, explain before doing, stop uncommitted, review before the pull request, one commit per item, version bump, merge on the go-ahead.
