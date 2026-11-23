import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDayWithYear, formatEuros, formatFullDay } from "@/lib/format";
import type { ReceiptDocument, ReceiptScheduleLine } from "@/lib/views";

/*
 * Le reçu au format A4 (maquette `04-recu-pdf.html`), construit uniquement à
 * partir du contenu figé à l'émission (`snapshot`). Les textes saisis sont
 * rendus comme du texte, jamais interprétés.
 *
 * Police : Helvetica (intégrée au format PDF, aucun fichier à charger). Les
 * codes couleur sont écrits ici en dur : les jetons CSS n'existent pas dans un PDF.
 */

const BORDEAUX = "#7A1F35";
const INK = "#2A1A1E";
const NAV = "#5C4A4F";
const MUTED = "#6B5A5E";
const LINE = "#E5DADD";

const styles = StyleSheet.create({
  page: { paddingTop: 54, paddingHorizontal: 54, paddingBottom: 42, fontFamily: "Helvetica", fontSize: 11, color: INK, flexDirection: "column" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 20, borderBottomWidth: 2.25, borderBottomColor: BORDEAUX },
  association: { fontFamily: "Helvetica-Bold", fontSize: 25, color: BORDEAUX, maxWidth: 330 },
  contact: { marginTop: 7, fontSize: 9.75, color: NAV, lineHeight: 1.55, maxWidth: 330 },
  headerRight: { alignItems: "flex-end" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16.5, letterSpacing: 0.9 },
  meta: { marginTop: 5, fontSize: 10.5, color: NAV },
  cancelled: { marginTop: 14, padding: 9, borderWidth: 0.75, borderColor: BORDEAUX, borderRadius: 5, color: BORDEAUX, fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  section: { marginTop: 30 },
  small: { fontSize: 9.75, color: MUTED, marginBottom: 5 },
  payer: { fontFamily: "Helvetica-Bold", fontSize: 13.5 },
  payerAddress: { marginTop: 4, fontSize: 10.5, color: NAV, lineHeight: 1.45 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10.5, borderBottomWidth: 0.75, borderBottomColor: LINE, fontSize: 11.25 },
  rowHead: { fontSize: 9.75, color: MUTED, borderBottomColor: INK },
  rowLabel: { flex: 1, paddingRight: 16 },
  rowValue: { maxWidth: 260, textAlign: "right" },
  totalWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 15 },
  total: { flexDirection: "row", alignItems: "center", backgroundColor: "#F7EEF0", paddingVertical: 13, paddingHorizontal: 21, borderRadius: 6 },
  totalLabel: { fontSize: 11.25, color: NAV, marginRight: 30 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 19.5, color: BORDEAUX },
  words: { marginTop: 18, fontSize: 10.5, color: NAV, lineHeight: 1.45 },
  schedule: { marginTop: 26, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 0.75, borderColor: LINE, borderRadius: 6, fontSize: 10.5, color: NAV, lineHeight: 1.6 },
  spacer: { flexGrow: 1, minHeight: 24 },
  signatureWrap: { flexDirection: "row", justifyContent: "flex-end" },
  signature: { width: 195, alignItems: "center" },
  signatureLabel: { fontSize: 10.5, color: NAV, marginBottom: 52, textAlign: "center" },
  signatureName: { alignSelf: "stretch", borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 6, fontSize: 9.75, color: MUTED, textAlign: "center" },
  footer: { marginTop: 30, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: LINE, fontSize: 9, color: MUTED, textAlign: "center" },
  watermark: { position: "absolute", top: 330, left: 0, right: 0, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 96, color: BORDEAUX, opacity: 0.13, transform: "rotate(-28deg)" },
});

/** Helvetica ne connaît pas les espaces insécables produites par le formatage français. */
function plain(text: string): string {
  return text.replace(/[   ]/g, " ");
}

const euros = (cents: number) => plain(formatEuros(cents));

function scheduleText(lines: ReceiptScheduleLine[]): string {
  const parts = lines.map((line) => {
    const name = `${line.method === "CHEQUE" ? "chèque" : "versement"} ${line.number}`;
    const status = line.status === "CASHED" ? "encaissé le" : line.status === "REJECTED" ? "rejeté, prévu le" : "prévu le";
    return `${name} (${euros(line.amountCents)}) ${status} ${plain(formatDayWithYear(line.day))}`;
  });
  return `Échéancier : ${parts.join(" · ")}`;
}

export function ReceiptPdf({ document }: { document: ReceiptDocument }) {
  const { snapshot } = document;
  const association = snapshot.association;
  const contact = [association.email, association.phone].filter(Boolean).join(" · ");

  return (
    <Document
      title={`Reçu n° ${document.number}`}
      author={association.name}
      subject={snapshot.designation}
      creator="Iqra Compta"
      producer="Iqra Compta"
      language="fr-FR"
    >
      <Page size="A4" style={styles.page}>
        {document.cancelled ? (
          <Text style={styles.watermark} fixed>
            ANNULÉ
          </Text>
        ) : null}

        <View style={styles.header}>
          <View>
            <Text style={styles.association}>{association.name}</Text>
            <View style={styles.contact}>
              {association.addressLines.map((line, index) => (
                <Text key={index}>{line}</Text>
              ))}
              {contact ? <Text>{contact}</Text> : null}
              {association.rna ? <Text>N° RNA : {association.rna}</Text> : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>REÇU</Text>
            <Text style={styles.meta}>N° {document.number}</Text>
            <Text style={styles.meta}>Le {plain(formatFullDay(document.issuedDay))}</Text>
          </View>
        </View>

        {document.cancelled ? (
          <Text style={styles.cancelled}>Ce reçu a été annulé : l&apos;encaissement correspondant n&apos;est plus compté.</Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.small}>Reçu de</Text>
          <Text style={styles.payer}>{snapshot.payer.name}</Text>
          {snapshot.payer.address ? <Text style={styles.payerAddress}>{snapshot.payer.address}</Text> : null}
        </View>

        <View style={styles.section}>
          <View style={[styles.row, styles.rowHead]}>
            <Text>Désignation</Text>
            <Text>Montant</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{snapshot.designation}</Text>
            <Text>{euros(snapshot.amountCents)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: NAV }]}>Mode de paiement</Text>
            <Text style={styles.rowValue}>{snapshot.methodLabel}</Text>
          </View>
          {snapshot.paidDay !== document.issuedDay ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: NAV }]}>Date du paiement</Text>
              <Text style={styles.rowValue}>{plain(formatFullDay(snapshot.paidDay))}</Text>
            </View>
          ) : null}

          <View style={styles.totalWrap}>
            <View style={styles.total}>
              <Text style={styles.totalLabel}>Total reçu</Text>
              <Text style={styles.totalValue}>{euros(snapshot.amountCents)}</Text>
            </View>
          </View>
          <Text style={styles.words}>Somme reçue en toutes lettres : {snapshot.amountWords}.</Text>
        </View>

        {snapshot.schedule ? <Text style={styles.schedule}>{scheduleText(snapshot.schedule)}</Text> : null}

        <View style={styles.spacer} />

        <View style={styles.signatureWrap}>
          <View style={styles.signature}>
            <Text style={styles.signatureLabel}>Pour l&apos;association, le/la trésorier(e)</Text>
            <Text style={styles.signatureName}>{association.treasurerName || "Nom et signature"}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Association loi 1901 · {snapshot.notice}</Text>
      </Page>
    </Document>
  );
}

/** Le reçu en PDF, prêt à être envoyé au navigateur. */
export async function renderReceiptPdf(document: ReceiptDocument): Promise<Buffer> {
  return renderToBuffer(<ReceiptPdf document={document} />);
}
