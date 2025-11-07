import LoginForm from "./LoginForm";
import { loginAction } from "./actions";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = (Array.isArray(sp?.next) ? sp?.next[0] : sp?.next) || "/";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const csrf = (await cookies()).get("csrf")?.value || "";

  return (
    <div className="max-w-md mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10">
        <h1 className="text-2xl font-semibold text-center mb-6">Connexion</h1>
        <p className="text-center text-fg-subtle text-sm mb-8">
          Reconnecte-toi pour accéder à ton espace ZoneStat.
        </p>
        <LoginForm action={loginAction} next={next} turnstileSiteKey={turnstileSiteKey} csrf={csrf} />
        <p className="mt-6 text-center text-sm text-fg-subtle">
          Pas encore de compte ?{" "}
          <a
            className="text-[var(--color-primary)] hover:underline"
            href={`/signup?next=${encodeURIComponent(next)}`}
          >
            Créer un compte
          </a>
        </p>
      </div>
    </div>
  );
}
