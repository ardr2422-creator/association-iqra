import { renderReceiptPdf } from "@/components/receipts/receipt-pdf";
import { getReceiptDocument } from "@/lib/data/receipts";

/*
 * Le reçu en PDF. `getReceiptDocument` vérifie la session (sans session :
 * retour à la connexion) et l'identifiant. Le document est reconstruit à
 * chaque demande à partir du contenu figé du reçu ; il n'est jamais mis en cache.
 */

function notFound(): Response {
  return new Response("Ce reçu n'existe pas.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
  });
}

export async function GET(request: Request, context: RouteContext<"/recus/[id]/pdf">): Promise<Response> {
  const { id } = await context.params;
  const document = await getReceiptDocument(id);
  if (!document) return notFound();

  let pdf: Buffer;
  try {
    pdf = await renderReceiptPdf(document);
  } catch (error) {
    console.error("[reçus] génération du PDF impossible pour le reçu", document.number, error);
    return new Response("Le reçu n'a pas pu être généré. Réessayez dans un instant.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  }

  const download = new URL(request.url).searchParams.has("telecharger");
  // Le numéro vient de la base (« 2026-0001 ») ; on ne garde que chiffres et tirets par précaution.
  const fileName = `recu-${document.number.replace(/[^0-9-]/g, "")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.byteLength),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
