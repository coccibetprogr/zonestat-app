import SignupForm from "./SignupForm";
import { signupAction } from "./actions";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = (Array.isArray(sp?.next) ? sp?.next[0] : sp?.next) || "/";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const csrf = (await cookies()).get("csrf")?.value?.split(":")?.[0] || "";

  return (
    <div className="max-w-md mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10">
        <h1 className="text-2xl font-semibold text-center mb-6">Créer un compte</h1>
        <p className="text-center text-fg-subtle text-sm mb-8">
          Rejoins la communauté ZoneStat en un clic.
        </p>
        <SignupForm action={signupAction} next={next} turnstileSiteKey={turnstileSiteKey} csrf={csrf} />
        <p className="mt-6 text-center text-sm text-fg-subtle">
          Déjà membre ?{" "}
          <a
            className="text-[var(--color-primary)] hover:underline"
            href={`/login?next=${encodeURIComponent(next)}`}
          >
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
