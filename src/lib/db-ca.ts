/**
 * Certificat racine de Supabase (public, ce n'est pas un secret). Il permet de
 * vérifier que le serveur auquel on se connecte est bien la base Supabase, et
 * pas un intermédiaire.
 *
 * À récupérer dans Supabase : Database → Settings → SSL Configuration →
 * « Download certificate », puis coller ici le contenu du fichier (lignes
 * BEGIN/END CERTIFICATE comprises). On peut aussi le fournir par la variable
 * d'environnement DATABASE_CA_CERT, qui est prioritaire.
 */
export const SUPABASE_CA_CERT = ``;
