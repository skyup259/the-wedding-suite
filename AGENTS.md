# Contributor and agent handoff

- Read `PROJECT_STATUS.md` and `README.md` before changing the application. The root PRD, architecture, database, API and MongoDB setup documents are the product/technical baseline.
- Update `PROJECT_STATUS.md` with every meaningful development change: current milestone, implemented behaviour, checks actually run, limitations, next steps and a dated history entry. Preserve previous history. Do not mark external services verified when only mocks were tested.
- Keep credentials, private access links, signed media URLs and personal data out of code, logs and progress documentation.
- Preserve `stitch_marriage_suite_ui_design/` as reference material. Its example controls do not override baseline scope. Flag unexpected conflicting files before overwriting them.
- Use the root npm scripts. Run checks appropriate to the change and record their results in the status document; `npm run check` verifies a complete scaffold handoff.
- Report requirement conflicts explicitly. Do not silently change permissions, wedding isolation, retention or product scope.
