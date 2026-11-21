-- Catégories créées au départ (modifiables ensuite depuis l'application).
-- ON CONFLICT : relancer cette migration sur une base déjà remplie ne change rien.
INSERT INTO "categories" ("id", "name", "type", "color", "position", "updated_at") VALUES
  ('cat_defaut_dons',             'Dons',                  'INCOME',  'vert',     1, CURRENT_TIMESTAMP),
  ('cat_defaut_adhesions',        'Adhésions',             'INCOME',  'violet',   2, CURRENT_TIMESTAMP),
  ('cat_defaut_cours_anglais',    'Cours d''anglais',      'INCOME',  'bordeaux', 3, CURRENT_TIMESTAMP),
  ('cat_defaut_cours_arabe',      'Cours d''arabe',        'INCOME',  'bordeaux', 4, CURRENT_TIMESTAMP),
  ('cat_defaut_soutien_scolaire', 'Soutien scolaire',      'INCOME',  'ambre',    5, CURRENT_TIMESTAMP),
  ('cat_defaut_sorties',          'Sorties',               'INCOME',  'sable',    6, CURRENT_TIMESTAMP),
  ('cat_defaut_fournitures',      'Fournitures',           'EXPENSE', 'rose',     1, CURRENT_TIMESTAMP),
  ('cat_defaut_loyer',            'Loyer et charges',      'EXPENSE', 'gris',     2, CURRENT_TIMESTAMP),
  ('cat_defaut_sorties_depenses', 'Sorties et événements', 'EXPENSE', 'sable',    3, CURRENT_TIMESTAMP),
  ('cat_defaut_intervenants',     'Intervenants',          'EXPENSE', 'violet',   4, CURRENT_TIMESTAMP),
  ('cat_defaut_frais_divers',     'Frais divers',          'EXPENSE', 'gris',     5, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
