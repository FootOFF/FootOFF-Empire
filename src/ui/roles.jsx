import React, { useState } from 'react';
import { formationOf } from '../game/tactics';
import { POST_SHORT, typeOf } from '../game/posts';
import { ROLES, ROLE_FAMILY, roleOf as roleChoice } from '../game/roles';
import { haptic } from './haptics';
import { uiSound } from './uisound';
import { t } from '../i18n/index';

// Rôles des joueurs (1.0.54, PDG 14/11 : « 3 + 3 par poste », vocabulaire du football, une aptitude qui compte sans rien
// afficher) : un toucher sur un joueur déplie ses trois rôles avec ballon et ses trois rôles sans ballon ; le premier de
// chaque liste est le rôle du poste. Aucune note ni jauge : un rôle qui lui va le rend meilleur, en match seulement.
// roles : { [id du joueur]: { w, d } } ; onChange(roles) : les rôles mis à jour (un joueur revenu aux rôles du poste en sort).
const lastName = (name = '') => name.slice(name.indexOf(' ') + 1);
export function RolesPanel({ players, lineup, formation, roles = {}, onChange, compact = false }) {
  const [open, setOpen] = useState(null);
  const cells = formationOf(formation).cells;
  const rows = lineup.map((id, k) => {
    const p = players.find((x) => x.id === id);
    if (!p) return null;
    const type = cells[k] === 'G' ? 'G' : typeOf(cells[k]);
    const fam = ROLES[ROLE_FAMILY[type]];
    if (!fam) return null;
    return { p, k, type, fam, pick: roleChoice(type, roles[id]) };
  }).filter(Boolean);
  const set = (id, type, part, roleId) => {
    const cur = roleChoice(type, roles[id]);
    const next = { ...cur, [part]: roleId };
    const fam = ROLES[ROLE_FAMILY[type]];
    const out = { ...roles };
    if (next.w === fam.with[0].id && next.d === fam.without[0].id) delete out[id]; else out[id] = next;
    haptic('tap');
    uiSound('tap');
    onChange(out);
  };
  return (
    <div className={`roles ${compact ? 'compact' : ''}`}>
      <p className="roles-help">{t('Touche un joueur pour choisir son rôle avec et sans ballon. Un rôle qui lui va le rend meilleur.')}</p>
      <ul className="roles-list">
        {rows.map(({ p, type, fam, pick }) => {
          const w = fam.with.find((x) => x.id === pick.w) || fam.with[0];
          const d = fam.without.find((x) => x.id === pick.d) || fam.without[0];
          const custom = w !== fam.with[0] || d !== fam.without[0];
          const isOpen = open === p.id;
          return (
            <li key={p.id} className={`roles-row ${isOpen ? 'open' : ''} ${custom ? 'custom' : ''}`}>
              <button type="button" className="roles-head" aria-expanded={isOpen} onClick={() => { uiSound(isOpen ? 'back' : 'tap'); setOpen(isOpen ? null : p.id); }}>
                <span className="roles-post">{POST_SHORT[type] || type}</span>
                <span className="roles-name">{lastName(p.name)}</span>
                <span className="roles-sum">{custom ? `${w.name} · ${d.name}` : t('Rôles du poste')}</span>
              </button>
              {isOpen && (
                <div className="roles-pick">
                  {[['w', t('Avec ballon'), fam.with, w], ['d', t('Sans ballon'), fam.without, d]].map(([part, label, list, cur]) => (
                    <div key={part} className="roles-group" role="radiogroup" aria-label={label}>
                      <span className="roles-label">{label}</span>
                      <div className="roles-chips">
                        {list.map((r) => (
                          <button key={r.id} type="button" role="radio" aria-checked={r === cur} className={`roles-chip ${r === cur ? 'on' : ''}`} onClick={() => set(p.id, type, part, r.id)}>{r.name}</button>
                        ))}
                      </div>
                      <p className="roles-desc">{cur.desc}</p>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
