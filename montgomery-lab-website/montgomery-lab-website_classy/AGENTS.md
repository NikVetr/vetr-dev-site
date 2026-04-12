# AGENTS.md

## scope
This repository uses git. Default to small, reviewable changes with concise but detailed commits that are logically grouped.
Prefer fast, local checks over expensive full runs unless the latter are requested or warranted (eg after a major refactor).

## repo discovery
- it is okay to use `ls`, but prefer:
  - `git ls-files` to list tracked files
  - `rg -n "<pattern>"` (ripgrep) for searching
  - `find . -maxdepth 2 -type f` when you need quick structure

## environments (use what the repo already uses)
- R:
  - if `renv.lock` exists: restore with `R -q -e 'renv::restore()'`
  - record reproducibility notes when relevant (e.g., `sessionInfo()`)
- python:
  - use the repo’s existing tool (eg uv/conda/venv). do not change it unless asked
- Stan:
  - prefer cmdstanr if used in repo; compile/smoke-test models after edits
- shell:
  - assume zsh/bash; scripts must be non-interactive and CI-friendly

## testing (choose the smallest relevant set)
- if this is an R package:
  - run `R CMD check` (or documented equivalent) before finalizing changes when feasible
  - run focused tests first (e.g., `R -q -e 'testthat::test_file("path")'`) when appropriate
- if Stan code changed:
  - at least run a syntax check/compile for the edited model(s)
  - run a tiny sampling smoke test on toy data (few iters) to confirm it runs
- if a web visualization or html/js/css changed:
  - build/serve using the repo’s documented command
  - use playwright to run small, relevant test(s) (or a single spec)

## git usage
- work in the existing working tree; do not push or open PRs unless asked
- avoid rewriting history

## parallel computing
- for particularly demanding and embarrassingly parallelizable jobs, this computer has access to a small cluster, please see `/home/nikgvetr/repos/parallel-workers` and especially `README_parallel_workers.md` and `RUNBOOK_parallel_workers.md` for details on its use

## coding
- in R, prefer base-R plots over ggplot unless the latter has a strong advantage in that specific context
- when asked to generate plots, inspect them after rendering (use magick to rasterize if they are in a vector format) to check for clipped graphical elements or excessive whitespace
- before finishing: run the most relevant tests/lints for the changed area.
- don’t “fix” failing tests by weakening them unless explicitly requested.
- save intermediate data objects with descriptive filenames if they are expensive to generate for later reuse
- separate out utility functions, data preprocessing, analysis, results postprocessing, and visualization code into independent files
- avoid writing duplicated functions if a function already exists the required (or highly similar) functionality
- follow existing style in nearby files and content; copy patterns from the most idiomatic code.
- add short comments only where the “why” isn’t obvious -- otherwise, strive for self-documenting code

## organization
- for most projects, prefer organization that is simple and understandable but structured, with modular, self-contained pieces
- for bioinformatics work, structure the steps of a workflow in a legible numbered order, such as scripts in a folder that start with "01_", "02_*", and so on, with an orchestrator script that can run these end to end 
- use an untracked /tmp/ directory for more exploratory work. It should have its own file structure (eg distinct folders for scripts and output). Contents outside of /tmp/ should be used by the most up-to-date state of the project.

## summarization
- Following major requests, update a summary.md file that explains the whole project concise, yet descriptive. Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, and why we made these technical decisions.
- Do not refer to the path we took to get to the current state of the project, such as refactoring old codebases, temporary files, or agentic scaffolding. The file should only describe the current state of the repo.

##  bash Guidelines
- Avoid commands that cause output buffering issues
- DO NOT pipe output through head, tail, less, or more when monitoring or checking command output
- DO NOT use | head -n X or | tail -n X to truncate output - these cause buffering problems
- Instead, let commands complete fully, or use --max-lines flags if the command supports them
- For log monitoring, prefer reading files directly rather than piping through filters
- Run commands directly without pipes when possible
- If you need to limit output, use command-specific flags (e.g., git log -n 10 instead of git log | head -10)
- Avoid chained pipes that can cause output to buffer indefinitely

## output format (in your response)
- start with a short checklist plan
- if instructions are unclear, make a best guess at the intended request, but state what decision you made in response to those unclear instructions
- if instructions are especially unclear on an especially important decision or action, ask for clarification
- if blocked, state exactly what you need and propose the smallest next step to unblock
- end with:
  - summary of changes
  - files touched
  - commands run + results
  - any risks you see or concerns you have about the current projects
  - anything you skipped from the previous request
  - what you recommend as the next follow-up steps
 