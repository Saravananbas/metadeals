export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";

  return Response.json({
    data: {
      appName: "MetaDeals4U",
      minAppVersion: "1.0.0",
      latestAppVersion: "1.0.0",
      maintenance: false,
      deepLinkBaseUrl: `${baseUrl}/deal/`,
      supportEmail: "support@metadeals4u.in",
      features: {
        wishlistSync: true,
        socialShare: true,
        pushNotifications: false,
        customerAccounts: true,
      },
    },
  });
}
