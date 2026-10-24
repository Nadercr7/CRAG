# UI and writing tools for the RAG demo

Research date: 2026-10-24. Sources are the GitHub and npm pages fetched that day. Items marked "not verified" were not confirmed from a primary source.

## Limits of this check

- The `gh` API refused these repos because they are not attached to this session. I read the public GitHub pages and raw files instead. Nothing from these repos was installed or run.
- Last-commit dates could not be read for any repo. The repo pages showed commit counts but no dates. Treat "last update" as unverified.
- The CDN hosts (cdnjs, jsdelivr) are blocked by the sandbox proxy. I could not confirm that each library is served there. Library sizes come from the npm tarballs (gzip level 9, a close proxy for CDN transfer size).
- Star counts below come from the GitHub pages on 2026-10-24. Blog posts report very different numbers (for example, 55k to 88k for UI UX Pro Max). Those posts are older or unverified, so I did not use them.

---

## 1. UI UX Pro Max

- **Link:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **Stars:** about 139.8k (GitHub page). 14.8k forks. MIT license.
- **Last update:** not verified. 283 commits on `main`.
- **What it does:** A design-intelligence catalog for Claude Code. The skill tells the agent to query local data before choosing a style. A Python search script (standard library only, no network calls per the README) returns matches by domain. The skill's own SKILL.md lists: 79 searchable styles (50 active), 192 product palettes, 74 font pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 chart types, and 22 stacks. Older blog posts quote different counts, so use the repo's figures.
- **Repo layout:** the source of truth is `src/ui-ux-pro-max/`. The installed skill lives in `.claude/skills/ui-ux-pro-max/`. The repo also contains a `.claude/skills/` folder with seven skills (banner-design, brand, design-system, design, slides, ui-styling, ui-ux-pro-max).
- **Install (verbatim from the README):**

  Option A, Claude Code marketplace:
  ```
  /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
  ```

  Option B, CLI (recommended in the README):
  ```
  npm install -g ui-ux-pro-max-cli
  cd /path/to/your/project
  uipro init --ai claude
  ```
  Use `uipro init --ai claude --global` to install into `~/.claude/skills/` instead. Run `uipro init --dry-run` first to see which files will be written. Python 3 is required for the search script.

- **Use it for:** palettes, font pairings, chart-type guidance, and accessibility checks. Its search script only helps when the agent actually runs it, so ask for a domain query explicitly, for example `--domain chart`.
- **Caveat:** the CLI writes a set of files into the project. Review them before committing. The skill's data is broad, and not every style fits a data-dense demo.
- **Verdict:** good complement. Use it for palette and font decisions and for the chart domain. Do not let it set the overall layout.

## 2. Alternatives and complements (ranked for this project)

Ranking criteria: vanilla HTML/CSS/JS, data-dense demo, a page that shows a step-by-step pipeline, and a dashboard with charts.

### 2a. Anthropic frontend-design skill (rank 1)

- **Link:** https://github.com/anthropics/skills/tree/main/skills/frontend-design
- **Stars:** about 183.5k for the whole `anthropics/skills` repo (GitHub page). The repo README says many skills are Apache 2.0. The document skills (docx, pdf, pptx, xlsx) are source-available, not open source. The `frontend-design` folder contains `LICENSE.txt` and `SKILL.md`.
- **Last update:** not verified.
- **What it does:** a short `SKILL.md` (frontmatter: name `frontend-design`; it covers building distinctive, non-template UI). Its sections: Typography, Color, Motion, Layout, Anti-patterns, Writing, and Process (plan with a token system and ASCII wireframes, review against the brief, build, then remove one element). Concrete rules include: body text under 80 characters per line, 4 to 6 named hex values as a base palette, motion only for one orchestrated moment, and no SaaS-card kit or gradient washes. It also says "structure is information," which fits a pipeline page.
- **Install (from the README of anthropics/skills):**
  ```
  /plugin marketplace add anthropics/skills
  ```
  Then choose `Browse and install plugins`, pick `anthropic-agent-skills`, and install `document-skills` or `example-skills`. Or run `/plugin install example-skills@anthropic-agent-skills`.
  I did not confirm which plugin contains `frontend-design`. Check the plugin's contents in the `/plugin` UI. Manual install is also possible: copy `skills/frontend-design/` into `~/.claude/skills/` or `.claude/skills/`.
- **Verdict:** best base for this project. It is short, neutral about frameworks, and does not push a template look.

### 2b. Impeccable (rank 2, as an audit step)

- **Link:** https://github.com/pbakaus/impeccable
- **Stars:** about 86.1k (GitHub page). Apache-2.0. Last update not verified.
- **What it does:** a design-language package with one skill, `impeccable`, invoked as `/impeccable <command> <target>`. It has 24 commands (for example `critique`, `audit`, `polish`, `typeset`, `layout`, `distill`, `quieter`, `bolder`). It also has 62 deterministic detector rules that run without an LLM. Those rules catch things like small touch targets, heading structure, and common AI styling. The `init` command writes a `PRODUCT.md` file.
- **Install (from the README):**
  ```
  npx impeccable install
  ```
  Then run `/impeccable init` inside Claude Code. Other routes: `/plugin marketplace add pbakaus/impeccable`, a git submodule with `npx impeccable link`, or a manual copy from `dist/`.
- **Caveats:**
  - Telemetry is on by default. Starting a design sends a request to impeccable.style, and anonymous choice data is recorded unless you opt out. The page says project files and code are not sent. Read the opt-out steps in the README before installing.
  - On supported harnesses, the installer adds a hook that scans UI edits. The hook downloads an engine binary on first run.
- **Verdict:** useful as an audit pass at the end (`critique` and `audit` on the finished pages). Install it only after you have read the telemetry opt-out.

### 2c. Not checked in depth

- Other design skills and plugins were not evaluated. Ranking was limited to the three above, which were the ones that came up with verified repo pages.
- The sandbox already has a local `dataviz` skill, which covers chart palettes, stat tiles, and dashboard layout. It matches the dashboard page better than any external UI skill for chart colors. Use it alongside frontend-design.

## 3. Humanizer skills

### 3a. blader/humanizer (best fit)

- **Link:** https://github.com/blader/humanizer
- **Stars:** about 60.2k (GitHub page). MIT license. Version 3.1.0 (from SKILL.md frontmatter). 101 commits. Last update not verified.
- **Warning about forks:** a search result pointed to `github.com/c-b-g-m/blader-humanizer`, which is a fork under another account. Use the `blader` repo.
- **What it does:** rewrites AI-sounding prose without changing its claims. The skill lists 26 patterns in six groups:
  - A. Staging instead of stating (not-X-but-Y contrasts, one-line closers, staged openers)
  - B. Rhythm by rule (forced triads, repeated sentence openings, overused dashes, passive voice)
  - C. Inflation and borrowed authority (AI vocabulary, inflated significance, sales language)
  - D. Formatting by rule (decorative bold, decorative headings, curly quotes)
  - E. Leftovers (chatbot residue, knowledge-limit disclaimers, the document writing about itself)
  - F. Wrong reader (re-explaining what the reader already knows)

  Process: draft (mark patterns), audit (rewrite while keeping every supported claim, and check that no facts, numbers, or citations were added), then rewrite. Three output modes: pasted text returns the draft, the remaining patterns, and the final text; file mode edits prose only; embedded mode returns only the final text.
- **Install (from the README):**
  ```
  /plugin marketplace add blader/humanizer
  /plugin install humanizer@humanizer
  ```
  The plugin is invoked as `/humanizer:humanizer`. It needs Claude Code 2.1.142 or newer. On older versions, use:
  ```
  npx skills add blader/humanizer --global --agent claude-code
  ```
- **Caveat:** the README says detectors still flag most of its output. The goal is clear prose, not detector evasion. For the technical report, check every number and citation after the rewrite, because the audit step only reduces the risk of changed claims.
- **Verdict:** use it. It fits the goal of prose that reads naturally.

## 4. Chart libraries for vanilla JS

Sizes are from the npm tarballs. Gzip is level 9 on the minified UMD or IIFE build.

| Library | Version to pin | Released | Minified (raw) | Gzip | License | Notes |
|---|---|---|---|---|---|---|
| Chart.js | 4.5.1 | 2025-10-13 | 208.5 KB | 70.4 KB | MIT | Latest is 4.6.1, released 2026-10-22, which is under the two-week age rule for CDN pins. Use 4.5.1 for now. |
| ECharts | 6.1.0 | 2026-05-19 | 1,121.9 KB | 367.9 KB | Apache-2.0 | Richest feature set (heatmaps, custom series). Heavy for a demo. |
| uPlot | 1.6.32 | 2025-03-14 | 51.1 KB | 22.0 KB (JS) + 0.8 KB (CSS) | MIT | Fastest and smallest, aimed at time series. Less suited to bar and pie charts. |

CDN availability: not verified from this sandbox. The standard paths are `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js` and `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js`. Check both URLs before using them.

- **Recommendation:** Chart.js 4.5.1. The dashboard needs bars, lines, and tooltips for experiment results. Chart.js covers those in about 70 KB gzipped.

---

## Recommendation

1. **Design base:** Anthropic's frontend-design skill (section 2a). It is short and does not force a template look. Pair it with the local `dataviz` skill for chart colors and dashboard layout.
2. **Palette and font lookup:** UI UX Pro Max (section 1), installed with the CLI. Ask for domain queries (`--domain color`, `--domain typography`, `--domain chart`). Review the files it writes before committing.
3. **Final audit:** Impeccable's `critique` and `audit` commands (section 2b). Read the telemetry opt-out first, and turn it off if you do not want the data sent.
4. **Prose:** blader/humanizer (section 3a), run on the README and the technical report. Check every number, citation, and claim after the rewrite.
5. **Charts:** Chart.js 4.5.1 (section 4). Load it from cdnjs or jsdelivr with the exact version, and verify the URL before use.
6. **Before relying on any of this:** check the last-commit dates on each repo, which were not verified here.
