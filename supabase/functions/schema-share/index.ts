import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const authClient = createClient(SUPABASE_URL, PUBLIC_KEY, { auth: { persistSession: false } });
const encoder = new TextEncoder();

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const configured = (Deno.env.get("SHARE_ALLOWED_ORIGINS") ?? "https://domi-schema-studio.vercel.app,http://127.0.0.1:4173,http://127.0.0.1:4174,http://localhost:4173,http://localhost:4174").split(",").map(x => x.trim());
  if (configured.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
  return configured[0];
}

function headers(request: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function reply(request: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function userFrom(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const { data, error } = await authClient.auth.getUser(authorization.slice(7));
  return error ? null : data.user;
}

function validSnapshot(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  return map.version === 1 && typeof map.title === "string" && Array.isArray(map.modules) && Array.isArray(map.groups) && Array.isArray(map.entities) && Array.isArray(map.relationships) && map.modules.length <= 100 && map.groups.length <= 200 && map.entities.length <= 1000 && map.relationships.length <= 5000 && encoder.encode(JSON.stringify(value)).byteLength <= 2_000_000;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== "POST") return reply(request, 405, { error: "Método no permitido." });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply(request, 400, { error: "Solicitud inválida." }); }
  const action = body.action;

  if (action === "get") {
    const token = typeof body.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return reply(request, 404, { error: "Este enlace no existe o ya no está disponible." });
    const tokenHash = await hashToken(token);
    const { data, error } = await service.from("schema_shares").select("id,title,snapshot,expires_at,view_count").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
    if (error || !data || (data.expires_at && new Date(data.expires_at) <= new Date())) return reply(request, 404, { error: "Este enlace no existe, venció o fue revocado." });
    service.from("schema_shares").update({ view_count: Number(data.view_count) + 1 }).eq("id", data.id).then(() => {});
    return reply(request, 200, { title: data.title, snapshot: data.snapshot, expiresAt: data.expires_at });
  }

  const user = await userFrom(request);
  if (!user) return reply(request, 401, { error: "Inicia sesión en Domi Schema Studio." });

  if (action === "create") {
    if (!validSnapshot(body.snapshot)) return reply(request, 400, { error: "El esquema no es válido o supera 2 MB." });
    const sourceProjectId = typeof body.projectId === "string" ? body.projectId.slice(0, 150) : "";
    if (!sourceProjectId) return reply(request, 400, { error: "Falta el proyecto de origen." });
    const days = body.expiresInDays === null ? null : Number(body.expiresInDays);
    if (days !== null && ![7, 30].includes(days)) return reply(request, 400, { error: "Expiración inválida." });
    const token = randomToken(), tokenHash = await hashToken(token);
    const expiresAt = days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
    const snapshot = body.snapshot as Record<string, unknown>;
    const title = String(snapshot.title ?? "Esquema compartido").trim().slice(0, 100) || "Esquema compartido";
    const { data, error } = await service.from("schema_shares").insert({ owner_id: user.id, source_project_id: sourceProjectId, token_hash: tokenHash, title, snapshot, expires_at: expiresAt }).select("id,expires_at").single();
    if (error) return reply(request, 500, { error: "No se pudo crear el enlace." });
    return reply(request, 201, { id: data.id, token, expiresAt: data.expires_at });
  }

  if (action === "revoke") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(request, 400, { error: "Enlace inválido." });
    const { data, error } = await service.from("schema_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id).is("revoked_at", null).select("id").maybeSingle();
    if (error || !data) return reply(request, 404, { error: "No se encontró un enlace activo de tu cuenta." });
    return reply(request, 200, { revoked: true });
  }

  return reply(request, 400, { error: "Acción inválida." });
});
