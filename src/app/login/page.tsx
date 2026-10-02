import { login, signup } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main style={{ maxWidth: 360, margin: "48px auto", padding: 16, display: "grid", gap: 32 }}>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      <form action={login} style={{ display: "grid", gap: 8 }}>
        <h1>Connexion</h1>
        <input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <input name="password" type="password" placeholder="Mot de passe" required autoComplete="current-password" />
        <button>Se connecter</button>
      </form>

      <form action={signup} style={{ display: "grid", gap: 8 }}>
        <h2>Inscription</h2>
        <input name="username" placeholder="Pseudo" required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" />
        <input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <input name="password" type="password" placeholder="Mot de passe (8+)" required minLength={8} autoComplete="new-password" />
        <button>Créer mon compte</button>
      </form>
    </main>
  );
}
