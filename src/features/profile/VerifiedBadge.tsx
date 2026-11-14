import { BadgeCheck } from "lucide-react";
import styles from "./profile.module.css";

/** Shown only for members whom MetaDeals4U staff have verified. Members cannot set it themselves. */
export function VerifiedBadge({ size = 18 }: { size?: number }) {
  return <span className={styles.verified} title="Verified member" role="img" aria-label="Verified member"><BadgeCheck size={size} aria-hidden /></span>;
}
