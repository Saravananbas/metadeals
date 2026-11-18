# Rollback

Every performance change is small and independent.

| Change | How to undo |
|---|---|
| CSS chunking | remove `cssChunking: "strict"` from `experimental` in `next.config.ts` |
| Lazy imports in Header | restore the two static imports (`signOut`, `UserNamePrompt`) in `src/features/home/components/Header.tsx` |
| Eager first card image | remove the `priority` prop and the `loading`/`fetchPriority` lines in `DealCard.tsx` and `TopDealsSection.tsx` |
| Footer prefetch | remove `prefetch={false}` in `Footer.tsx` |

The commit `666324b` holds the first three; the footer change is in the working tree of branch `perf/lighthouse`. `git revert <commit>` or `git checkout <commit>~1 -- <file>` restores the previous behaviour. Original PNG hero images were never touched.
