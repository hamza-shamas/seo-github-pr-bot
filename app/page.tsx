import { ironSession, getSessionUser } from "@/lib/session";
import { ConnectScreen } from "@/components/ConnectScreen";
import { RepoLanding } from "@/components/RepoLanding";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ oauth_error?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const [user, params, session] = await Promise.all([
    getSessionUser(),
    searchParams,
    ironSession(),
  ]);

  if (user) {
    return <RepoLanding user={user} repo={session.repo} />;
  }
  return <ConnectScreen oauthError={params.oauth_error} />;
}
