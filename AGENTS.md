# Working in this repo

These rules apply to every change, from people and agents alike. Several
workstreams often run in parallel, so they exist to make sure no one
overwrites anyone else's work.

## Every change goes through a pull request

- Never commit or push directly to `main`. Work on a branch and open a PR
  against `main` (`gh pr create --base main`), even for one-line changes.
- One workstream per branch and per PR. Don't pile unrelated changes onto
  an open PR.

## Rebase onto the latest `main` before merging

Right before merging, bring the branch up to date so it never overwrites
changes that landed on `main` after it branched:

```sh
git fetch origin
git rebase origin/main
npm run check
npm test
git push --force-with-lease
```

- Resolve conflicts by keeping both sides' intent. Never resolve a conflict
  by discarding the changes that came from `main`.
- Rerun `npm run check` and `npm test` after the rebase, then merge only
  when they pass on the rebased branch.
- Use `--force-with-lease`, never plain `--force`, so a push can't clobber
  commits someone else added to the branch.
