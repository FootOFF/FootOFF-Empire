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
      'Tu es le président d’un club fondé en Départementale, avec onze joueurs, un terrain municipal et 8 000 €. Le but : monter de division en division jusqu’à l’Élite, puis gagner le championnat, la Coupe nationale et la Coupe d’Europe des clubs, en bâtissant le complexe le plus prestigieux du pays.',
      'Quatre divisions de huit clubs : Départementale, Régionale, Nationale, Élite. Une saison compte sept journées de championnat, toutes à domicile, et les tours de coupe se glissent entre elles. En Élite, quatorze journées en aller-retour : chaque adversaire reçu une fois et visité une fois, une journée sur deux à l’extérieur, où l’avantage du terrain passe chez l’adversaire. Les deux premiers montent, les deux derniers descendent. En Élite, les deux premiers jouent la Coupe d’Europe la saison suivante, face aux meilleurs clubs du continent, plus forts à chaque tour.',
      'Chaque début de saison, le conseil d’administration du club te fixe trois objectifs (un classement, un défi sportif, un défi du club) avec leur prime. Les trois réussis valent un bonus de saison parfaite.',
    ],
  },
  {
    id: 'match', title: 'Le match',
    body: [
      'Avant le coup d’envoi, tu choisis ton onze sur le terrain, ton dispositif (de 5-3-2 à 3-4-3) et ta tactique (offensive, équilibrée, bloc bas). Le pronostic affiché est exact : c’est lui qui décide du tirage, minute par minute, avec le niveau de chaque joueur à son poste, sa condition physique du moment, les signes distinctifs et l’avantage du terrain. Vérifié sur vingt mille matchs : un match annoncé à 75 % est gagné trois fois sur quatre.',
      'Pendant le direct, tu peux accélérer (×4 : le jeu file entre les temps forts, qui se jouent toujours à vitesse normale, ralenti compris), aller à la mi-temps, ou arrêter le match à toute minute pour un changement ou une nouvelle tactique : ta décision s’applique au prochain arrêt de jeu, une à deux minutes plus tard. Cinq changements par match, pause comprise ; le dispositif se change aussi à la pause et à chaque arrêt de jeu. Un expulsé ne se remplace pas : déplace-le sur le poste à laisser vide (jamais celui du gardien). Si l’app se ferme pendant un match, il reprend à la minute où tu l’as laissé.',
      'Un joueur hors de son poste perd de l’efficacité : poste de dépannage −5 %, ligne voisine −12 %, ligne opposée −25 %, gardien et joueur de champ −50 %. Un dispositif ouvert donne plus d’occasions des deux côtés ; un bloc bas ferme le match.',
      'En coupe, pas de match nul : tirs au but. Ta chance exacte de gagner la séance est affichée avant le match (finition de tes tireurs, réflexes de ton gardien). Les notes de match sur 10 suivent le résultat, les buts, les passes, les cartons et la cage inviolée.',
    ],
  },
  {
    id: 'joueurs', title: 'Les joueurs',
    body: [
      'Chaque joueur a neuf caractéristiques sur 20 (finition, passe, dribble, vitesse, endurance, puissance, placement, défense, sang-froid ; six de gardien), un niveau sur 20 calculé pour son poste, un âge, un potentiel caché que tes recruteurs estiment en fourchette, et parfois un ou deux signes distinctifs (Finisseur, Passeur, Roc, Chat, Leader, Flèche, Infatigable, Frappe lointaine, Joueur des grands soirs, Sang chaud). Chaque signe a un vrai effet en match, chiffré sur la fiche du joueur : environ un dixième de point au classement par match là où il agit. Les joueurs adverses ont les leurs : ils comptent en match et dans le pronostic.',
      'Progression : un bond chaque été vers le potentiel, grand pour un jeune, nul après 28 ans ; déclin physique dès 32 ans, retraite vers 34-36 ans. Toucher son potentiel prend plusieurs saisons, d’autant plus que le joueur est déjà fort. Entre les matchs, le centre d’entraînement fait progresser quatre joueurs par séance, et un peu tout le monde après chaque match. En Élite, deux fois plus de journées : chaque séance y compte pour deux tiers, autant de progrès par saison qu’ailleurs.',
      'Condition physique, de 0 à 100 : un match complet coûte 25 à 40 points selon l’endurance (moitié pour un gardien, 40 % de moins pour un Infatigable). D’ici le match suivant, un joueur récupère une part de sa fatigue : 55 % jusqu’à 27 ans, 50 % jusqu’à 31 ans, 45 % au-delà, et chaque niveau du centre d’entraînement y ajoute 2,5 % (jusqu’à 67,5 % au niveau 5 pour un jeune). Un titulaire qui joue tout se stabilise autour de 75 % au coup d’envoi, entre 50 et 90 % selon son âge, son endurance et ton centre (davantage pour un gardien ou un Infatigable) ; l’après-match montre la condition de chacun au coup de sifflet, puis au prochain match. En match, la condition baisse minute après minute et pèse sur le niveau, jusqu’à −15 %, et un joueur fatigué se blesse plus souvent. La forme (la moyenne des notes de ses derniers matchs) se lit sur les fiches mais ne pèse pas en match : seules la condition physique et les capacités comptent. Trois boutons composent ton équipe d’un geste : « Meilleur onze » (les meilleures notes), « Onze frais » (les meilleurs joueurs à 80 % de condition ou plus ; un joueur fatigué seulement si personne de frais ne tient son poste) et « Faire tourner » (les remplaçants du dernier match jouent, complétés par les titulaires les plus reposés ; le gardien reste s’il est frais).',
      'Blessures : environ une tous les quatre à cinq matchs pour l’équipe, bien plus pour un joueur épuisé. Le blessé sort, et s’il te reste un changement, le match s’arrête pour le faire (le staff le remplace si tu passes la fin de la mi-temps). Absence de une à neuf dates selon la gravité, sans entraînement. L’été soigne tout. Le centre médical réduit le risque en match (−8 % par niveau) et soigne entre deux matchs : un soin par blessé et par date, payé 15 % de son salaire, avec sa chance exacte de faire revenir le joueur un match plus tôt.',
      'Suspensions : un carton rouge direct vaut deux matchs, un second jaune un match, trois jaunes dans la saison un match. Les absents restent sur le banc, grisés, et sont listés avant le match.',
    ],
  },
  {
    id: 'mercato', title: 'Mercato et valeur',
    body: [
      'Chaque joueur a une valeur de marché : environ deux saisons de salaire, plus pour un jeune à potentiel, moins pour un trentenaire. C’est la référence de tous les prix.',
      'Recruter : le marché suit ta division (un joueur libre un peu en dessous du club moyen, les meilleurs joueurs sous contrat un cran au-dessus). Un joueur sous contrat se négocie en deux temps : l’indemnité avec son club (sa valeur, ajustée au contrat qui lui reste et au cours du marché), puis son contrat avec lui. Un joueur libre n’a pas d’indemnité : il attend une prime à la signature d’environ 70 % de sa valeur. La jauge affiche tes vraies chances d’accord ; une proposition sérieuse refusée amène une contre-proposition. Trois tentatives par joueur et par journée pour l’indemnité, autant pour le contrat ; l’indemnité convenue tient jusqu’à la prochaine journée. Le Bureau des transferts allonge la liste, fait baisser les indemnités et resserre les fourchettes de potentiel.',
      'Contrats : chaque joueur signe un salaire par saison, une durée (un à cinq ans, la saison en cours comptant pour un an), une prime à la signature et, hors Élite et hors ligue entre amis, une clause de montée. Il demande le salaire de son niveau dans ta division ; une prime ou la durée qu’il souhaite (courte pour un jeune à fort potentiel, longue passé 30 ans) le font signer pour moins. Le salaire reste fixe pendant le contrat : seules une prolongation et, à chaque montée, sa clause de montée le changent. À la descente, un salaire au-dessus de celui de son niveau dans la nouvelle division y est ramené.',
      'Prolonger : depuis la fiche du joueur ou l’onglet Contrats de la Direction. Il demande le salaire de son niveau actuel : prolonger tôt un joueur qui progresse coûte moins cher. Sans prolongation, il part libre à la fin de sa dernière saison, sans indemnité ; en dernière année, il se vend aussi moins cher.',
      'Vendre : ton effectif ne descend jamais sous 13 joueurs, la vente est refusée à 13. Mets un joueur en vente à ton prix. Quatre clubs étudient le dossier et les intéressés font aussitôt leur offre (petit club, club ambitieux, grand club), d’autres après chaque journée. Négocie face à face ou fais monter les enchères. Les offres partent d’environ 85 % de la valeur ; un grand club peut payer davantage. En Élite, les géants européens suivent tes stars, de plus près quand ton club joue la Coupe d’Europe : ils paient bien au-dessus de la valeur, et leur offre spontanée pour un joueur qui n’est pas à vendre peut dépasser de moitié sa valeur.',
      'Une recrue, comme un jeune monté de l’académie, ne peut être vendue qu’après quatre journées de championnat au club. Faire progresser un joueur, ou lancer un jeune de l’académie, rapporte.',
    ],
  },
  {
    id: 'complexe', title: 'Le complexe',
    body: [
      'Sept parcelles autour du stade, à bâtir dans l’ordre que tu veux, chaque bâtiment une seule fois, cinq niveaux chacun.',
      'Stade : 600 places au départ, jusqu’à 75 000. Quand la demande dépasse la capacité, des supporters restent dehors : agrandis, ou passe en tarif Premium ou Prestige (Direction du club, onglet Billetterie).',
      'Centre d’entraînement : séances entre les matchs, une épreuve en 3D par ligne (jouée, elle rapporte plus ; simulée, le gain moyen est assuré), nouvelles épreuves à chaque niveau, programmes de signes distinctifs dès le niveau 3, meilleure récupération. Tu peux confier les séances au staff : il les simule avant chaque match, avec les joueurs conseillés.',
      'Académie : six jeunes recrutés gratuitement parmi les repérés après chaque journée (toutes les deux en Élite ; un ou deux selon le niveau), qui progressent et montent en équipe première quand tu le décides ; à 19 ans, un jeune qui n’est pas monté s’en va. Les grands potentiels sont rares (18 ou plus : moins de deux par saison au niveau 5) et mettent des années à éclore.',
      'Espace supporters (public, buvette, boutique, réputation), Siège et partenaires (sponsors, revenus pendant ton absence), Bureau des transferts (réseau de recruteurs), Direction du club (droits TV, contrats des joueurs, billetterie), Centre médical (soins des blessés, prévention des blessures).',
      'Chaque bâtiment coûte 4 % de son prix par saison en entretien.',
    ],
  },
  {
    id: 'argent', title: 'L’argent',
    body: [
      'Recettes d’un match à domicile : billets, buvette, boutique, loges dans les grands stades, droits TV à partir de la Régionale. À l’extérieur (Élite), seuls les droits TV reviennent au club. Le public dépend de la division, de ta réputation, de l’espace supporters, de la forme de l’équipe, de l’affiche et des trophées gagnés. Soirs de coupe : plus de monde, billets plus chers ; en Coupe d’Europe, des droits TV européens.',
      'Revenus de saison : sponsors (selon la division, le siège et la réputation, versés à la reprise dès la deuxième saison : un club promu touche tout de suite ceux de sa nouvelle division), prime de classement, primes de coupe, primes d’objectif, primes de titre.',
      'L’Élite joue à l’échelle d’un grand championnat européen : droits TV et sponsors de plusieurs dizaines de millions, salaires de plusieurs millions par an pour les titulaires et de plus de dix millions pour les stars, transferts à plusieurs dizaines de millions, Coupe d’Europe à plus de cent millions pour le vainqueur. Les petites divisions gardent des budgets modestes : la montée en Élite change d’échelle.',
      'Dépenses : salaires (ceux des contrats) et entretien, comptés à chaque journée de championnat (un septième de la saison, un quatorzième en Élite) et payés en une fois au bilan de la saison ; travaux ; recrutements. Un joueur ne coûte que les journées passées au club. La trésorerie montre ce qu’il faudra payer en fin de saison et ce qui reste réellement disponible ; un achat qui ne laisserait pas de quoi payer est signalé avant d’être conclu.',
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
