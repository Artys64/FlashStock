"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [establishmentName, setEstablishmentName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, organizationName, establishmentName }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message || body.error || "Falha ao criar conta.");
        return;
      }

      router.replace("/batches");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1>Criar conta</h1>

        <label className={styles.field}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          Senha
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className={styles.field}>
          Confirmar senha
          <input
            className={styles.input}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>

        <hr className={styles.divider} />

        <label className={styles.field}>
          Nome da organização
          <input
            className={styles.input}
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          Nome do estabelecimento
          <input
            className={styles.input}
            type="text"
            value={establishmentName}
            onChange={(e) => setEstablishmentName(e.target.value)}
            required
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.button} type="submit" disabled={loading}>
          {loading ? "Criando conta..." : "Criar conta"}
        </button>

        <p className={styles.footer}>
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </form>
    </main>
  );
}
