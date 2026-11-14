import { BadgeCheck } from "lucide-react";
import styles from "../community.module.css";

/** The identity of every official announcement: always "MetaDeals4U Team" with a verified badge, never a staff member. */
export function OfficialBadge({ label = "MetaDeals4U Team" }: { label?: string }) {
  return <span className={styles.official}><BadgeCheck size={15} aria-hidden /><b>{label}</b><i>Official</i></span>;
}
