import Link from "next/link";

export const dynamic = "force-dynamic";

type InstagramAuthCallbackPageProps = {
  searchParams: Promise<{
    error?: string;
    error_description?: string;
  }>;
};

export default async function InstagramAuthCallbackPage({
  searchParams,
}: InstagramAuthCallbackPageProps) {
  const params = await searchParams;
  const hasError = Boolean(params.error);

  return (
    <main
      style={{
        alignItems: "center",
        background: "#fff",
        color: "#06143d",
        display: "flex",
        minHeight: "100vh",
        justifyContent: "center",
        padding: "32px",
      }}
    >
      <section style={{ maxWidth: 560, textAlign: "center" }}>
        <p style={{ fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Bagelito · Instagram
        </p>
        <h1>{hasError ? "Instagram connection was not completed" : "Instagram login completed"}</h1>
        <p>
          {hasError
            ? params.error_description || "Return to Meta for Developers and try the connection again."
            : "You can return to Meta for Developers to finish generating the access token and webhook setup."}
        </p>
        <Link href="/admin?section=inbox">Return to Bagelito admin</Link>
      </section>
    </main>
  );
}
