import { t } from '../i18n/index';

// Rôles des joueurs (1.0.54, choix du PDG du 14/11 : « 3 + 3 par poste », « vocabulaire du football », aptitude qui compte
// sans rien afficher, pas de consignes individuelles) : pour chaque famille de postes, trois rôles avec le ballon et trois
// sans. Un rôle déplace le joueur dans les zones du moteur (zones.js : la part de son temps dans chaque tiers et chaque
// couloir) et change ce qui compte de lui dans le profil de l'équipe (q : poids de ses qualités). Un joueur fait pour son
// rôle le rend utile ; un joueur à contre-emploi le paie, sans qu'aucune note ne le dise.
//   at : [tiers de départ, tiers d'arrivée, part] avec le ballon ; al : vers l'axe (+) ou le couloir (−), avec le ballon
//   dt, dl : la même chose sans le ballon ; q : poids de ses qualités dans le profil de l'équipe (1 : comme le poste),
//   clés build, press, pace, defPace, air, defAir, cross, drib, vision, wall, shoot (zones.js, skillsOf) ;
//   gk (gardien) : defPace (libéro : ses sorties et sa vitesse couvrent la profondeur), defAir (il prend les centres)
// Le premier rôle de chaque liste est celui du poste, sans changement (le jeu d'avant la 1.0.54).
export const ROLE_FAMILY = {
  G: 'G', DC: 'DC', DG: 'FB', DD: 'FB', DLG: 'FB', DLD: 'FB', MDC: 'MDC', MC: 'MC', MG: 'WM', MD: 'WM',
  MOC: 'MOC', MOG: 'W', MOD: 'W', ATG: 'W', ATD: 'W', BT: 'BT',
};
export const ROLES = {
  G: {
    with: [
      { id: 'mixte', name: t('Relance mixte'), desc: t('Varie le jeu court et long selon le pressing.'), fx: {} },
      { id: 'courte', name: t('Relance courte'), desc: t('Relance au pied vers ses défenseurs.'), fx: { q: { build: 2 } } },
      { id: 'longue', name: t('Relance longue'), desc: t('Dégage loin vers ses attaquants.'), fx: { q: { build: 0.4 } } },
    ],
    without: [
      { id: 'ligne', name: t('Sur sa ligne'), desc: t('Reste dans sa cage.'), fx: {} },
      { id: 'libero', name: t('Gardien libéro'), desc: t('Sort couvrir la profondeur derrière sa défense.'), fx: { gk: { defPace: 1 } } },
      { id: 'sorties', name: t('Sort sur les centres'), desc: t('Va chercher les centres dans sa surface.'), fx: { gk: { defAir: 1 } } },
    ],
  },
  DC: {
    with: [
      { id: 'central', name: t('Défenseur central'), desc: t('Joue simple et sûr.'), fx: {} },
      { id: 'relanceur', name: t('Relanceur'), desc: t('Lance le jeu par des passes vers l’avant.'), fx: { q: { build: 1.5, vision: 1.3 } } },
      { id: 'monte', name: t('Défenseur qui monte'), desc: t('Porte le ballon jusqu’au milieu.'), fx: { at: [0, 1, 0.12], q: { drib: 1.4, build: 1.2 } } },
    ],
    without: [
      { id: 'zone', name: t('Défenseur de zone'), desc: t('Tient sa zone dans la ligne.'), fx: {} },
      { id: 'stoppeur', name: t('Stoppeur'), desc: t('Sort au contact de l’attaquant qui décroche.'), fx: { dt: [0, 1, 0.06], q: { wall: 1.2, press: 1.3 } } },
      { id: 'couvreur', name: t('Couvreur'), desc: t('Reste derrière ses partenaires pour couvrir la profondeur.'), fx: { dt: [1, 0, 0.08], q: { defPace: 1.4, wall: 1.1 } } },
    ],
  },
  FB: {
    with: [
      { id: 'lateral', name: t('Latéral'), desc: t('Soutient l’attaque sans se livrer.'), fx: {} },
      { id: 'offensif', name: t('Latéral offensif'), desc: t('Déborde et centre depuis la ligne de fond.'), fx: { at: [1, 2, 0.09], al: -0.1, q: { cross: 1.4, pace: 1.2 } } },
      { id: 'interieur', name: t('Latéral intérieur'), desc: t('Rentre dans l’axe pour aider à construire.'), fx: { al: 0.35, q: { build: 1.3, vision: 1.3, cross: 0.6 } } },
    ],
    without: [
      { id: 'ligne', name: t('Reste dans la ligne'), desc: t('Reste aligné avec ses centraux.'), fx: {} },
      { id: 'presse', name: t('Presse son ailier'), desc: t('Monte presser l’ailier adverse.'), fx: { dt: [0, 1, 0.06], q: { press: 1.4 } } },
      { id: 'resserre', name: t('Se resserre'), desc: t('Se rapproche de l’axe pour fermer la surface.'), fx: { dl: 0.2, q: { wall: 1.2, defAir: 1.2 } } },
    ],
  },
  MDC: {
    with: [
      { id: 'sentinelle', name: t('Sentinelle'), desc: t('Reste devant la défense et remet le ballon en jeu.'), fx: {} },
      { id: 'meneur', name: t('Meneur reculé'), desc: t('Oriente le jeu depuis devant la défense.'), fx: { at: [1, 0, 0.06], q: { build: 1.5, vision: 1.4 } } },
      { id: 'relayeur', name: t('Relayeur'), desc: t('Remonte le ballon balle au pied.'), fx: { at: [0, 1, 0.12], q: { press: 1.2, drib: 1.2 } } },
    ],
    without: [
      { id: 'protege', name: t('Protège la défense'), desc: t('Couvre l’espace devant ses défenseurs.'), fx: {} },
      { id: 'recuperateur', name: t('Récupérateur'), desc: t('Harcèle le porteur pour gagner le ballon.'), fx: { dt: [0, 1, 0.1], q: { press: 1.4, wall: 1.15 } } },
      { id: 'decroche', name: t('Décroche entre les centraux'), desc: t('Recule entre ses centraux à la perte du ballon.'), fx: { dt: [1, 0, 0.05], q: { defAir: 1.15, wall: 1.1 } } },
    ],
  },
  MC: {
    with: [
      { id: 'relayeur', name: t('Milieu relayeur'), desc: t('Fait le lien entre la défense et l’attaque.'), fx: {} },
      { id: 'meneur', name: t('Meneur de jeu'), desc: t('Dicte le tempo par ses passes.'), fx: { q: { vision: 1.35, build: 1.2, drib: 0.85 } } },
      { id: 'boxtobox', name: t('Box-to-box'), desc: t('Se projette dans la surface adverse.'), fx: { at: [1, 2, 0.05], q: { shoot: 1.2, press: 1.1, vision: 0.85 } } },
    ],
    without: [
      { id: 'tient', name: t('Tient sa place'), desc: t('Garde sa position au milieu.'), fx: {} },
      { id: 'presse', name: t('Presse haut'), desc: t('Presse haut le porteur adverse.'), fx: { dt: [1, 2, 0.1], q: { press: 1.4 } } },
      { id: 'couvre', name: t('Couvre la défense'), desc: t('Recule pour protéger sa défense.'), fx: { dt: [1, 0, 0.06], q: { wall: 1.2 } } },
    ],
  },
  WM: {
    with: [
      { id: 'milieu', name: t('Milieu de couloir'), desc: t('Tient son couloir en attaque comme en défense.'), fx: {} },
      { id: 'deborde', name: t('Ailier débordant'), desc: t('Fait la différence sur le côté et centre.'), fx: { at: [1, 2, 0.02], al: -0.1, q: { cross: 1.3, pace: 1.2 } } },
      { id: 'interieur', name: t('Ailier intérieur'), desc: t('Repique dans l’axe pour frapper.'), fx: { at: [1, 2, 0.03], al: 0.16, q: { drib: 1.2, shoot: 1.2, cross: 0.6 } } },
    ],
    without: [
      { id: 'replie', name: t('Se replie'), desc: t('Revient aider son latéral.'), fx: {} },
      { id: 'presse', name: t('Presse le latéral'), desc: t('Presse le latéral adverse.'), fx: { dt: [1, 2, 0.1], q: { press: 1.4 } } },
      { id: 'reste', name: t('Reste haut'), desc: t('Reste haut pour lancer les contres.'), fx: { dt: [1, 2, 0.08], q: { pace: 1.3 } } },
    ],
  },
  MOC: {
    with: [
      { id: 'meneur', name: t('Meneur offensif'), desc: t('Crée le jeu dans les trente derniers mètres.'), fx: {} },
      { id: 'second', name: t('Second attaquant'), desc: t('Accompagne le buteur dans la surface.'), fx: { at: [1, 2, 0.1], q: { shoot: 1.4, pace: 1.2 } } },
      { id: 'entre', name: t('Joue entre les lignes'), desc: t('Décroche entre les lignes pour combiner.'), fx: { at: [2, 1, 0.04], q: { vision: 1.3, drib: 1.1 } } },
    ],
    without: [
      { id: 'tient', name: t('Tient sa place'), desc: t('Garde sa place derrière le buteur.'), fx: {} },
      { id: 'presse', name: t('Presse la relance'), desc: t('Presse la relance adverse.'), fx: { dt: [1, 2, 0.1], q: { press: 1.4 } } },
      { id: 'revient', name: t('Revient au milieu'), desc: t('Recule pour aider le milieu.'), fx: { dt: [2, 1, 0.1], q: { wall: 1.2 } } },
    ],
  },
  W: {
    with: [
      { id: 'ailier', name: t('Ailier'), desc: t('Joue son côté et combine.'), fx: {} },
      { id: 'deborde', name: t('Ailier débordant'), desc: t('Prend l’espace sur l’aile et centre.'), fx: { al: -0.15, q: { cross: 1.5, pace: 1.3 } } },
      { id: 'interieur', name: t('Ailier intérieur'), desc: t('Repique sur son bon pied pour frapper.'), fx: { al: 0.1, q: { drib: 1.2, shoot: 1.2, cross: 0.6 } } },
    ],
    without: [
      { id: 'replie', name: t('Revient défendre'), desc: t('Revient défendre sur son côté.'), fx: {} },
      { id: 'presse', name: t('Presse le latéral'), desc: t('Presse le latéral adverse.'), fx: { dt: [1, 2, 0.1], q: { press: 1.4 } } },
      { id: 'reste', name: t('Reste haut'), desc: t('Reste haut pour lancer les contres.'), fx: { dt: [1, 2, 0.09], q: { pace: 1.2 } } },
    ],
  },
  BT: {
    with: [
      { id: 'avant', name: t('Avant-centre'), desc: t('Joue en pointe et conclut les actions.'), fx: {} },
      { id: 'pivot', name: t('Pivot'), desc: t('Garde le ballon dos au but et le remet.'), fx: { at: [2, 1, 0.03], q: { air: 1.6, build: 1.4, vision: 1.2 } } },
      { id: 'renard', name: t('Renard des surfaces'), desc: t('Rôde dans la surface, à l’affût.'), fx: { at: [1, 2, 0.02], q: { pace: 1.2, vision: 0.7, build: 0.7 } } },
    ],
    without: [
      { id: 'reste', name: t('Reste devant'), desc: t('Reste devant, prêt pour le contre.'), fx: {} },
      { id: 'presse', name: t('Presse la relance'), desc: t('Presse le gardien et les défenseurs centraux.'), fx: { dt: [1, 2, 0.1], q: { press: 1.5 } } },
      { id: 'revient', name: t('Revient défendre'), desc: t('Recule pour aider son milieu.'), fx: { dt: [2, 1, 0.12], q: { wall: 1.2 } } },
    ],
  },
};

// Les rôles d'un joueur à son poste : ceux choisis s'ils existent pour ce poste, sinon ceux du poste (un joueur passé
// d'arrière à milieu reprend les rôles de son nouveau poste). r : { w, d } (identifiants) ou rien.
export function roleOf(type, r) {
  const fam = ROLES[ROLE_FAMILY[type] || ''];
  if (!fam) return { w: null, d: null };
  return {
    w: fam.with.some((x) => x.id === r?.w) ? r.w : fam.with[0].id,
    d: fam.without.some((x) => x.id === r?.d) ? r.d : fam.without[0].id,
  };
}
// Rôles d'une équipe gardés propres (sauvegarde, plan d'une ligue) : seulement des identifiants connus, et rien pour un
// joueur aux rôles de son poste
export function cleanRoles(roles) {
  const out = {};
  if (!roles || typeof roles !== 'object') return out;
  const ids = new Set(Object.values(ROLES).flatMap((f) => [...f.with, ...f.without].map((x) => x.id)));
  for (const [k, v] of Object.entries(roles)) {
    if (!v || typeof v !== 'object') continue;
    const w = ids.has(v.w) ? v.w : null;
    const d = ids.has(v.d) ? v.d : null;
    if (w || d) out[k] = { ...(w ? { w } : {}), ...(d ? { d } : {}) };
  }
  return out;
}
