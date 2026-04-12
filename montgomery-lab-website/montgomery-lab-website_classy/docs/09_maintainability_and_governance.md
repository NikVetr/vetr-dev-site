# Maintainability and governance

## Goal

The finished site should be impressive, but it should not require a specialist frontend engineer for routine upkeep.

## Nonnegotiable principles

- common edits should happen in content files, not component code
- navigation should be data-driven
- consortia dropdown entries should be data-driven
- a lab member should be able to add a person, publication, consortium, or alumni record by copying a template
- placeholder content should be visibly marked and easy to replace
- custom animations should be isolated and optional
- any build-time scripts for media should be documented and rerunnable

## Contributor workflows to support

### add a new lab member
- add one content file
- add an image if available
- no code changes required

### add a new consortium
- add one content file
- update site settings only if ordering needs adjustment
- no component rewrites required

### add a new publication
- add one content record or refresh a curated import
- no page editing required

### update social links or contact details
- edit one settings file

## Documentation minimum

Leave behind:
- setup instructions
- local development instructions
- build/deploy instructions
- content editing guide
- media workflow guide
- navigation reference
- component catalog

## Recommended governance model

- one lab member owns content review cadence
- one technically comfortable lab member owns deploy access
- factual updates happen monthly or quarterly
- publication refresh happens on a predictable schedule
- media curation happens only when there is clearly better material

## Definition of success

A future lab member should be able to understand how the site works within one sitting and make a routine update without fear of breaking unrelated pages.
