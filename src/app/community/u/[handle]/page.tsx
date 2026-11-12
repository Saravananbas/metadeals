import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityShell } from "@/features/community/components/Shell";
import { ReportButton } from "@/features/community/components/PostActions";
import { Empty, PostCard } from "@/features/community/components/parts";
import { CustomerError } from "@/server/customer/service";
import { getPublicProfile } from "@/server/community/service";
import { communityPageViewer } from "@/server/community/session";
import styles from "@/features/community/community.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member | MetaDeals4U Community", robots: { index: false, follow: false } };

export default async function MemberPage({ params }: { params: Promise<{ handle: string }> }) {
  await communityPageViewer();
  const profile = await getPublicProfile((await params).handle).catch((error) => { if (error instanceof CustomerError && error.status === 404) return null; throw error; });
  if (!profile) notFound();
  return (
    <CommunityShell>
      <div className={styles.card}>
        <h1 style={{ margin: 0 }}>{profile.handle}</h1>
        {profile.bio && <p>{profile.bio}</p>}
        <div className={styles.meta}><span>Member since {profile.joined}</span><span>{profile.postCount} posts</span><span>{profile.commentCount} comments</span></div>
        <div className={styles.actions}><ReportButton targetType="PROFILE" targetId={profile.handle} /></div>
      </div>
      {profile.posts.map((post) => <PostCard key={post.id} post={post} />)}
      {!profile.posts.length && <Empty>No public posts yet.</Empty>}
    </CommunityShell>
  );
}
