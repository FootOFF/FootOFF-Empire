import React, { useEffect, useRef, useState } from 'react';
import { useKeydown } from './presence';
import { uiSound } from './uisound';
import { IconChevronLeft } from './icons';

// Règles du jeu, en langage joueur : ce que disent docs/ECONOMIE.md et docs/JOUEURS.md, sans formule. Accessible depuis
// l'écran titre et le menu pause (vue « rules »). Chapitres en puces, texte qui défile ; Échap revient au menu.

export const RULES = [
  {
    id: 'but', title: 'Le but du jeu',
    body: [
      'Tu es le président d’un club fondé en Départementale, avec onze joueurs, un terrain municipal et 8 000 €. Le but : monter de division en division jusqu’à l’Elite, puis gagner le championnat, la Coupe nationale et la Coupe d’Europe des clubs, en bâtissant le complexe le plus prestigieux du pays.',
      'Quatre divisions de huit clubs : Départementale, Régionale, Nationale, Elite. Une saison compte sept journées de championnat, tous les matchs à domicile, et les tours de coupe se glissent entre elles. Les deux premiers montent, les deux derniers descendent. En Elite, les deux premiers jouent la Coupe d’Europe la saison suivante.',
      'Chaque début de saison, le président fixe trois objectifs (un classement, un défi sportif, un défi du club) avec leur prime. Les trois réussis valent un bonus de saison parfaite.',
    ],
  },
  {
    id: 'match', title: 'Le match',
    body: [
      'Avant le coup d’envoi, tu choisis ton onze sur le terrain, ton dispositif (de 5-3-2 à 3-4-3) et ta tactique (offensive, équilibrée, bloc bas). Le pronostic affiché est exact : c’est lui qui décide du tirage, minute par minute, avec le niveau de chaque joueur à son poste, sa condition physique du moment, les signes distinctifs et l’avantage du terrain.',
      'Pendant le direct, tu peux accélérer, aller à la mi-temps, ou arrêter le match à toute minute pour un changement ou une nouvelle tactique : ta décision s’applique au prochain arrêt de jeu, une à deux minutes plus tard. Cinq changements par match, pause comprise. Un expulsé ne se remplace pas.',
      'Un joueur hors de son poste perd de l’efficacité : poste de dépannage −5 %, ligne voisine −12 %, ligne opposée −25 %, gardien et joueur de champ −50 %. Un dispositif ouvert donne plus d’occasions des deux côtés ; un bloc bas ferme le match.',
      'En coupe, pas de match nul : tirs au but. Les notes de match sur 10 suivent le résultat, les buts, les passes, les cartons et la cage inviolée.',
    ],
  },
  {
    id: 'joueurs', title: 'Les joueurs',
    body: [
      'Chaque joueur a neuf caractéristiques sur 20 (finition, passe, dribble, vitesse, endurance, puissance, placement, défense, sang-froid ; six de gardien), un niveau sur 20 calculé pour son poste, un âge, un potentiel caché que tes recruteurs estiment en fourchette, et parfois un ou deux signes distinctifs (Finisseur, Passeur, Roc, Chat, Leader, Flèche, Infatigable, Frappe lointaine, Joueur des grands soirs, Sang chaud).',
      'Progression : un bond chaque été vers le potentiel, grand pour un jeune, nul après 28 ans ; déclin physique dès 32 ans, retraite vers 34-36 ans. Entre les matchs, le centre d’entraînement fait progresser quatre joueurs par séance, et un peu tout le monde après chaque match.',
      'Condition physique, de 0 à 100 : un match complet coûte 25 à 36 points selon l’endurance (moitié pour un gardien ; un Infatigable fatigue bien moins), chaque date du calendrier en rend 20 à 28 selon l’âge, plus avec le centre d’entraînement. En match, elle baisse minute après minute et pèse sur le niveau, jusqu’à −15 %. « Meilleur onze » en tient compte : fais tourner.',
      'Blessures : environ une tous les quatre matchs pour l’équipe, bien plus pour un joueur épuisé. Le blessé sort, et s’il te reste un changement, le match s’arrête pour le faire. Absence de une à neuf dates selon la gravité, sans entraînement. L’été soigne tout.',
      'Suspensions : un carton rouge direct vaut deux matchs, un second jaune un match, trois jaunes dans la saison un match. Les absents restent sur le banc, grisés, et sont listés avant le match.',
    ],
  },
  {
    id: 'mercato', title: 'Mercato et valeur',
    body: [
      'Chaque joueur a une valeur de marché : environ deux saisons de salaire, plus pour un jeune à potentiel, moins pour un trentenaire. C’est la référence de tous les prix.',
      'Recruter : un joueur libre demande une prime d’une saison de salaire ; un club vendeur demande la valeur, ajustée au contrat qui reste et au cours du marché, et se négocie. La jauge affiche tes vraies chances d’accord ; une offre sérieuse refusée amène une contre-proposition. Trois offres par joueur et par journée. Le Bureau des transferts allonge la liste, fait baisser les indemnités et resserre les fourchettes de potentiel.',
      'Vendre : mets un joueur en vente à ton prix. Quatre clubs étudient le dossier et les intéressés font aussitôt leur offre (petit club, club ambitieux, grand club), d’autres après chaque journée. Négocie face à face ou fais monter les enchères. Une vente immédiate rapporte 85 % de la valeur ; un grand club peut payer davantage.',
      'Acheter puis revendre aussitôt coûte 15 à 30 %. Faire progresser un joueur, ou lancer un jeune de l’académie, rapporte.',
    ],
  },
  {
    id: 'complexe', title: 'Le complexe',
    body: [
      'Sept parcelles autour du stade, à bâtir dans l’ordre que tu veux, chaque bâtiment une seule fois, cinq niveaux chacun.',
      'Stade : 600 places au départ, jusqu’à 75 000. Quand la demande dépasse la capacité, des supporters restent dehors : agrandis, ou passe en tarif Premium ou Prestige (Direction du club, onglet Billetterie).',
      'Centre d’entraînement : séances entre les matchs, une épreuve en 3D par ligne (jouée, elle rapporte plus ; simulée, le gain moyen est assuré), nouvelles épreuves à chaque niveau, programmes de signes distinctifs dès le niveau 3, meilleure récupération.',
      'Académie : six jeunes recrutés gratuitement parmi les repérés après chaque journée, qui progressent et montent en équipe première quand tu le décides ; à 19 ans, un jeune qui n’est pas monté s’en va.',
      'Espace supporters (public, buvette, boutique, réputation), Siège et partenaires (sponsors, revenus pendant ton absence), Bureau des transferts (réseau de recruteurs), Direction du club (droits TV, baisses de salaire, billetterie).',
      'Chaque bâtiment coûte 4 % de son prix par saison en entretien.',
    ],
  },
  {
    id: 'argent', title: 'L’argent',
    body: [
      'Recettes d’un match à domicile : billets, buvette, boutique, loges dans les grands stades, droits TV à partir de la Régionale. Le public dépend de la division, de ta réputation, de l’espace supporters, de la forme de l’équipe, de l’affiche et des trophées gagnés. Soirs de coupe : plus de monde, billets plus chers ; en Coupe d’Europe, des droits TV européens.',
      'Revenus de saison : sponsors (selon la division, le siège et la réputation), prime de classement, primes de coupe, primes d’objectif, primes de titre.',
      'Dépenses : salaires (selon le niveau du joueur et la division ; les stars de l’Elite coûtent cher) et entretien, payés par septième à chaque journée ; travaux ; recrutements.',
      'Si la saison se termine dans le rouge, le conseil vend tes plus gros salaires pour redresser les comptes. L’écran Finances prévoit la fin de saison et avertit avant une dépense risquée.',
    ],
  },
  {
    id: 'reputation', title: 'Réputation et statuts',
    body: [
      'Chaque victoire fait grandir ta réputation, davantage dans les divisions hautes, en coupe et avec un espace supporters développé ; une défaite la fait baisser un peu. Un titre, une coupe, une montée la font bondir. Chaque été en efface 12 % : il faut gagner encore pour rester grand.',
      'Elle attire : plus de public et de ventes à la boutique, de meilleurs contrats de sponsoring, des vendeurs plus conciliants au mercato, et des recruteurs qui te proposent de plus grands noms.',
      'Statuts : Club de quartier, Club qui monte (6), Club régional (12), Club national (25), Grand club (45), Club de légende (80). Les grandes étapes du jeu (primes de palier) suivent la même échelle.',
    ],
  },
];

export function RulesView({ onBack, active = true, initial = 'but' }) {
  const [cur, setCur] = useState(initial);
  const body = useRef(null);
  useKeydown((e) => { if (active && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); uiSound('back'); onBack(); } });
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [cur]);
  const chapter = RULES.find((r) => r.id === cur) || RULES[0];
  return (
    <div className="cm-rules" role="document" aria-label="Règles du jeu">
      <div className="cm-rules-chips">
        {RULES.map((r) => (
          <button key={r.id} type="button" className={`chipbtn ${cur === r.id ? 'on' : ''}`} aria-pressed={cur === r.id} onClick={() => { setCur(r.id); uiSound('tab'); }}>{r.title}</button>
        ))}
      </div>
      <div className="cm-rules-body" ref={body}>
        <h3>{chapter.title}</h3>
        {chapter.body.map((t, i) => <p key={i}>{t}</p>)}
      </div>
      <div className="cm-save-actions">
        <button type="button" className="btn ghost" onClick={() => { uiSound('back'); onBack(); }}><IconChevronLeft /> Retour</button>
      </div>
    </div>
  );
}
