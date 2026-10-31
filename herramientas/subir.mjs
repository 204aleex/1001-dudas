#!/usr/bin/env node
// Sube un vídeo al programador y lo programa en la siguiente franja libre.
//
//   node subir.mjs --login                        (una vez: pide email y contraseña, guarda la sesión)
//   node subir.mjs <carpeta-del-video>            (lee textos.json y NNN-slug.mp4 de la carpeta)
//        [--redes youtube,tiktok,instagram]       (por defecto, las tres)
//        [--dia 2026-11-02 --franja A]            (en vez de la siguiente libre)
//        [--borrador]                             (lo deja subido pero sin programar)
//   node subir.mjs --cola                         (lo que está programado)
//
// Solo usa Node 18+, sin instalar nada.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const SUPABASE_URL = "https://drolrbbkkfyzgjssqltg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyb2xyYmJra2Z5emdqc3NxbHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjgwMzIsImV4cCI6MjEwODc0NDAzMn0.Py047DXFI7F6aj1Q63bS9dGZ5jxJ9yF0TNLO3vT6NRI";
// Fuera del repo (en Windows, %USERPROFILE%): el repo es público.
const SESION = join(homedir(), ".sesion-programador.json");
const MAX_BYTES = 50 * 1024 * 1024;
const REDES = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const madrid = (iso) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

async function pedir(ruta, { token, ...init } = {}) {
  const r = await fetch(SUPABASE_URL + ruta, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token ?? SUPABASE_KEY}`, "Content-Type": "application/json", ...init.headers },
  });
  const texto = await r.text();
  const j = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(`${r.status} ${j?.message || j?.msg || j?.error_description || j?.error || texto}`);
  return j;
}

async function guardarSesion(s) {
  writeFileSync(SESION, JSON.stringify({ refresh_token: s.refresh_token, email: s.user?.email }, null, 2));
}

async function login() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = await rl.question("Email: ");
  const password = await rl.question("Contraseña: ");
  rl.close();
  const s = await pedir("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  await guardarSesion(s);
  console.log(`Sesión guardada para ${s.user.email}.`);
}

async function token() {
  if (!existsSync(SESION)) throw new Error("No hay sesión: ejecuta primero  node subir.mjs --login");
  const { refresh_token } = JSON.parse(readFileSync(SESION, "utf8"));
  const s = await pedir("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token }) })
    .catch((e) => { throw new Error(`La sesión caducó (${e.message}). Ejecuta  node subir.mjs --login`); });
  await guardarSesion(s);
  return s.access_token;
}

const unir = (x) => (Array.isArray(x) ? x.filter(Boolean).join("\n") : x ?? null);
const hashtags = (t) => [...(t || "").matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]).filter((h) => h.toLowerCase() !== "shorts").slice(0, 15);

function elegirVideo(carpeta) {
  const mp4 = readdirSync(carpeta).filter((f) => /\.mp4$/i.test(f));
  const original = mp4.find((f) => /^\d{3}-.+\.mp4$/i.test(f) && !/-web\.mp4$/i.test(f));
  const web = mp4.find((f) => /-web\.mp4$/i.test(f));
  for (const f of [original, web, ...mp4]) {
    if (f && statSync(join(carpeta, f)).size <= MAX_BYTES) return join(carpeta, f);
  }
  throw new Error(`No hay ningún .mp4 de 50 MB o menos en ${carpeta}`);
}

async function subir(carpeta) {
  const t = await token();
  const nombreCarpeta = basename(carpeta);
  const [, codigo, slug] = nombreCarpeta.match(/^(\d{3})-(.+)$/) ?? [null, null, nombreCarpeta];
  const rutaTextos = join(carpeta, "textos.json");
  if (!existsSync(rutaTextos)) throw new Error(`Falta ${rutaTextos}`);
  const tx = JSON.parse(readFileSync(rutaTextos, "utf8"));
  const video = elegirVideo(carpeta);
  const bytes = readFileSync(video);

  const ya = await pedir(`/rest/v1/videos?select=id&codigo=eq.${codigo}`, { token: t });
  if (codigo && ya.length && !args.includes("--otra-vez")) {
    throw new Error(`El ${codigo} ya está en el programador. Si de verdad quieres subirlo otra vez, añade --otra-vez`);
  }

  const archivo = `${nombreCarpeta}-${Date.now()}.mp4`;
  console.log(`Subiendo ${basename(video)} (${(bytes.length / 1048576).toFixed(1)} MB)…`);
  await pedir(`/storage/v1/object/videos/${archivo}`, { token: t, method: "POST", headers: { "Content-Type": "video/mp4" }, body: bytes });

  const ytDesc = unir(tx.youtube_descripcion);
  const [v] = await pedir("/rest/v1/videos", {
    token: t, method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      codigo, slug, titulo: tx.titulo || tx.youtube_titulo || nombreCarpeta, archivo, tamano: bytes.length, ia: true,
      yt_titulo: tx.youtube_titulo ?? null, yt_descripcion: ytDesc, yt_tags: hashtags(ytDesc),
      tiktok_texto: unir(tx.tiktok), ig_texto: unir(tx.instagram),
    }),
  });

  const redes = (opcion("--redes") ?? "youtube,tiktok,instagram").split(",").map((s) => s.trim());
  if (args.includes("--borrador")) {
    console.log(`✅ ${codigo ?? ""} subido sin programar. Prográmalo desde la web.`);
    return;
  }
  const cuerpo = { p_video: v.id, p_plataformas: redes };
  if (opcion("--dia")) { cuerpo.p_dia = opcion("--dia"); cuerpo.p_franja = opcion("--franja") ?? "A"; }
  const pubs = await pedir("/rest/v1/rpc/programar_en_franja", { token: t, method: "POST", body: JSON.stringify(cuerpo) });
  console.log(`✅ ${codigo ?? ""} ${v.titulo}`);
  for (const p of pubs) console.log(`   ${REDES[p.plataforma].padEnd(10)} ${madrid(p.programado_para)}`);
}

async function cola() {
  const t = await token();
  const pubs = await pedir(
    `/rest/v1/publicaciones?select=plataforma,programado_para,estado,error,videos(codigo,titulo)&programado_para=gte.${new Date(Date.now() - 86400000).toISOString()}&order=programado_para`,
    { token: t },
  );
  for (const p of pubs) {
    console.log(`${madrid(p.programado_para).padEnd(18)} ${REDES[p.plataforma].padEnd(10)} ${p.estado.padEnd(11)} ${p.videos.codigo ?? "   "} ${p.videos.titulo}${p.error ? `  ⚠ ${p.error}` : ""}`);
  }
}

try {
  if (args.includes("--login")) await login();
  else if (args.includes("--cola")) await cola();
  else if (args[0] && !args[0].startsWith("--")) await subir(args[0]);
  else console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).join("\n").replaceAll("// ", ""));
} catch (e) {
  console.error("❌ " + e.message);
  process.exit(1);
}
