/**
 * Qué producto de Meta mandó este webhook.
 *
 * La ruta es una sola porque la app de Meta es una sola: los tres productos
 * comparten Callback URL y App Secret, y lo único que los distingue es el campo
 * `object` del sobre.
 */
export type ProductoMeta = "whatsapp" | "messenger" | "instagram";

const POR_OBJETO: Readonly<Record<string, ProductoMeta>> = {
  whatsapp_business_account: "whatsapp",
  page: "messenger",
  instagram: "instagram",
};

/**
 * `null` para lo que no reconocemos, y quien llama responde 200.
 *
 * Meta notifica TODOS los campos a los que la app esté suscrita, y uno que no
 * nos interesa no es un error suyo: devolverle 4xx lo haría reintentar durante
 * 36 horas algo que nunca vamos a querer.
 */
export function productoDeMeta(cuerpo: unknown): ProductoMeta | null {
  const objeto = (cuerpo as { object?: unknown } | null)?.object;
  return typeof objeto === "string" ? (POR_OBJETO[objeto] ?? null) : null;
}
