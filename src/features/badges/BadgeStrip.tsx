import type { TopBadge } from "./catalog";
import { BADGE_ICONS } from "./icons";
import styles from "./badges.module.css";

const TIER_CLASS = [styles.t1, styles.t2, styles.t3, styles.t4, styles.t5] as const;

/** A member's best badges on their public profile: icon and tier name only (their counts are not shown). */
export function BadgeStrip({ top, total }: { top: TopBadge[]; total: number }) {
  if (!top.length) return null;
  return (
    <ul className={styles.strip} aria-label={`Badges: ${total} unlocked`}>
      {top.map((b) => {
        const Icon = BADGE_ICONS[b.icon];
        return (
          <li key={b.key} className={styles.pill} title={`${b.name}, ${b.title}`}>
            <span className={`${styles.pillIcon} ${TIER_CLASS[b.level - 1]}`} aria-hidden="true"><Icon size={16} strokeWidth={1.9} /></span>
            <span><b>{b.name}</b><small>{b.title}</small></span>
          </li>
        );
      })}
      {total > top.length && <li className={styles.more}>+{total - top.length} more</li>}
    </ul>
  );
}
