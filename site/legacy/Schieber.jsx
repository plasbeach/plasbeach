// chibre — feuille de score Jass · style sanguinolent
// Logique :
//   atouts : Trèfle (×1), Carreau (×1), Cœur (×1), Pique (×2)
//   par manche : (points + annonces + match) × multiplicateur
//   bonus Match = 100 (les 9 plis)
//   total points par manche = 157 → saisir dans une équipe remplit l'autre
//   manches éditables ; objectif personnalisable

const { useState, useEffect, useMemo } = React;

// --- palette sanguinolente ------------------------------------------------
const C = {
  bg:        '#0a0807',
  bgDeep:    '#050403',
  bgVoid:    '#020100',
  panel:     '#14100e',
  panelLight:'#1f1815',
  paper:     '#2a221d',
  paperLight:'#3a2e26',
  line:      '#3a2823',
  lineDim:   '#251915',
  bone:      '#d8c9a8',
  boneDim:   '#9c8d70',
  bonePale:  '#e8dfca',
  blood:     '#7a0c0c',
  bloodBri:  '#b81818',
  bloodDeep: '#3d0606',
  bloodInk:  '#510808',
  rust:      '#6b3a1a',
  amber:     '#c9a142',
  rot:       '#5a6b32',
  ash:       '#6a605a',
};

const TRUMPS = [
  { id: 'trefle',  label: 'Trèfle',  mult: 1, glyph: '♣' },
  { id: 'carreau', label: 'Carreau', mult: 1, glyph: '♦' },
  { id: 'coeur',   label: 'Cœur',    mult: 1, glyph: '♥' },
  { id: 'pique',   label: 'Pique',   mult: 2, glyph: '♠' },
];

// --- racine ---------------------------------------------------------------
function App() {
  useEffect(() => {
    const linkEl = document.createElement('link');
    linkEl.rel = 'stylesheet';
    linkEl.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;0,900;1,700;1,900&family=Special+Elite&family=IM+Fell+English+SC&family=JetBrains+Mono:wght@400;500;700&display=swap';
    document.head.appendChild(linkEl);

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        background: ${C.bgVoid};
        font-family: 'Special Elite', 'JetBrains Mono', monospace;
        color: ${C.bone};
        overflow-x: hidden;
      }
      ::selection { background: ${C.blood}; color: ${C.bone}; }
      input { font-family: inherit; color: inherit; }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; }
      button { font-family: inherit; }

      @keyframes ch_flash {
        0%   { filter: brightness(1) saturate(1); }
        25%  { filter: brightness(1.4) saturate(1.5) drop-shadow(0 0 24px ${C.bloodBri}); }
        100% { filter: brightness(1) saturate(1); }
      }
      @keyframes ch_pop {
        0%   { transform: translateY(0) scale(1); }
        35%  { transform: translateY(-3px) scale(1.04); }
        100% { transform: translateY(0) scale(1); }
      }
      @keyframes ch_fadeup {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes ch_blink { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
      @keyframes ch_drip {
        0%   { transform: translateY(-100%) scaleY(0.5); opacity: 0; }
        20%  { opacity: 1; }
        100% { transform: translateY(0) scaleY(1); opacity: 0.85; }
      }
      @keyframes ch_flicker {
        0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; text-shadow: 0 0 4px ${C.bloodBri}88, 0 0 12px ${C.blood}; }
        20%, 24%, 55% { opacity: 0.55; text-shadow: none; }
      }

      .ch-page { position: relative; min-height: 100vh; }

      /* film grain + vignette */
      .ch-page::before {
        content: '';
        position: fixed; inset: 0;
        background-image:
          radial-gradient(circle at 30% 30%, ${C.blood}11, transparent 50%),
          radial-gradient(circle at 80% 80%, ${C.bloodInk}15, transparent 55%),
          radial-gradient(ellipse at center, transparent 30%, ${C.bgVoid}d0 100%);
        pointer-events: none;
        z-index: 1;
      }
      .ch-page::after {
        content: '';
        position: fixed; inset: 0;
        background-image:
          repeating-radial-gradient(circle at 13% 27%, ${C.bone}06 0 1px, transparent 1px 3px),
          repeating-radial-gradient(circle at 71% 84%, ${C.bone}05 0 1px, transparent 1px 4px);
        pointer-events: none;
        opacity: 0.7;
        z-index: 2;
        mix-blend-mode: overlay;
      }

      .ch-inner { max-width: 1200px; margin: 0 auto; position: relative; z-index: 3; padding: 28px 20px 56px; }

      .ch-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 14px;
        padding-bottom: 26px;
        margin-bottom: 26px;
        border-bottom: 2px solid ${C.bloodDeep};
        position: relative;
      }
      .ch-header::after {
        content: '';
        position: absolute; left: 50%; bottom: -2px; transform: translateX(-50%);
        width: 60%; height: 2px;
        background: linear-gradient(90deg, transparent, ${C.bloodBri} 40%, ${C.bloodBri} 60%, transparent);
        box-shadow: 0 0 12px ${C.bloodBri};
      }
      .ch-header-side { display: flex; align-items: center; gap: 10px; }
      .ch-header-side-r { justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
      .ch-header-center { display: flex; flex-direction: column; align-items: center; gap: 4px; }

      .ch-board {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 14px;
        align-items: stretch;
        margin-bottom: 24px;
      }

      .ch-trump-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      .ch-inputs-row {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 18px;
        align-items: flex-start;
      }

      .ch-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-top: 18px;
        border-top: 1px dashed ${C.line};
      }

      .ch-history::-webkit-scrollbar { width: 6px; height: 6px; }
      .ch-history::-webkit-scrollbar-thumb { background: ${C.bloodDeep}; }
      .ch-history::-webkit-scrollbar-track { background: ${C.bgDeep}; }

      .ch-input::placeholder { color: ${C.boneDim}; opacity: 0.5; font-style: italic; }
      .ch-mobile-only { display: none; }

      /* ============= MOBILE ============= */
      @media (max-width: 760px) {
        .ch-inner { padding: 14px 10px 36px; }

        .ch-header {
          grid-template-columns: 1fr;
          gap: 10px;
          padding-bottom: 18px;
          margin-bottom: 16px;
          text-align: center;
        }
        .ch-header-side { justify-content: center !important; flex-wrap: wrap; }
        .ch-header-side-r { order: 3; }
        .ch-wordmark { font-size: 56px !important; }

        .ch-board {
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 18px;
        }
        .ch-divider { display: none !important; }

        .ch-card { padding: 22px 18px 18px !important; }
        .ch-score-number { font-size: 96px !important; }

        .ch-trump-row { grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .ch-token-disc { width: 56px !important; height: 56px !important; }

        .ch-inputs-row { grid-template-columns: 1fr; gap: 14px; }
        .ch-inputs-center { padding-top: 0 !important; order: 2; }
        .ch-input-col-r { order: 3; align-items: flex-start !important; }
        .ch-input-col-r .ch-col-head,
        .ch-input-col-r .ch-input-row,
        .ch-input-col-r .ch-bottom-row,
        .ch-input-col-r .ch-preview-row { flex-direction: row !important; }

        .ch-actions { flex-direction: column-reverse; align-items: stretch; gap: 10px; }
        .ch-actions button { width: 100%; justify-content: center; }

        .ch-entry, .ch-history-card { padding: 16px 14px !important; }

        .ch-section-title { font-size: 16px !important; }
        .ch-mult-label { display: none; }

        .ch-thead, .ch-trow { gap: 6px !important; padding: 10px 2px !important; }
        .ch-th-cumul, .ch-td-cumul { display: none; }
        .ch-th-trump, .ch-td-trump { flex: 0 0 64px !important; }
        .ch-trump-pill-text { display: none; }
        .ch-mobile-only { display: inline; }

        .ch-target-wrap { flex-wrap: wrap; }
        .ch-target-custom { width: 70px !important; }

        .ch-verdict-inner { min-width: 0 !important; padding: 32px 24px 26px !important; width: calc(100vw - 28px); }
        .ch-verdict-name { font-size: 56px !important; }

        .ch-edit-bar { flex-wrap: wrap; }
      }

      @media (max-width: 380px) {
        .ch-trump-row { grid-template-columns: repeat(2, 1fr); }
        .ch-score-number { font-size: 84px !important; }
        .ch-wordmark { font-size: 44px !important; }
      }
    `;
    document.head.appendChild(styleEl);
    return () => { linkEl.remove(); styleEl.remove(); };
  }, []);

  return <Chibre />;
}

// --- composant principal --------------------------------------------------
function Chibre() {
  const [target, setTarget]     = useState(1000);
  const [customTarget, setCustomTarget] = useState('');
  const [targetMode, setTargetMode] = useState('1000'); // '1000' | '2500' | 'custom'
  const [names, setNames]       = useState(['Nous', 'Eux']);
  const [editingName, setEditingName] = useState(null);
  const [rounds, setRounds]     = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [trumpId, setTrumpId]   = useState('coeur');
  const [p1, setP1]             = useState('');
  const [p2, setP2]             = useState('');
  const [w1, setW1]             = useState('');
  const [w2, setW2]             = useState('');
  const [match, setMatch]       = useState('none');
  const [flash, setFlash]       = useState(null);

  const trump = TRUMPS.find(t => t.id === trumpId);

  const scores = useMemo(() => {
    const s = [0, 0];
    rounds.forEach(r => { s[0] += r.t1; s[1] += r.t2; });
    return s;
  }, [rounds]);

  const winner = scores[0] >= target ? 0 : scores[1] >= target ? 1 : null;

  // Saisie auto-complémentaire : 157 = total des points par manche
  const setPoints1 = (val) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    setP1(cleaned);
    if (cleaned === '') { setP2(''); return; }
    const n = Math.min(157, parseInt(cleaned) || 0);
    setP2(String(Math.max(0, 157 - n)));
  };
  const setPoints2 = (val) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    setP2(cleaned);
    if (cleaned === '') { setP1(''); return; }
    const n = Math.min(157, parseInt(cleaned) || 0);
    setP1(String(Math.max(0, 157 - n)));
  };

  const previewT = useMemo(() => {
    const pp1 = parseInt(p1) || 0;
    const pp2 = parseInt(p2) || 0;
    const ww1 = parseInt(w1) || 0;
    const ww2 = parseInt(w2) || 0;
    const m1  = match === 'team1' ? 100 : 0;
    const m2  = match === 'team2' ? 100 : 0;
    return [(pp1 + ww1 + m1) * trump.mult, (pp2 + ww2 + m2) * trump.mult];
  }, [p1, p2, w1, w2, match, trump]);

  function applyTargetMode(mode, custom) {
    setTargetMode(mode);
    if (mode === '1000') setTarget(1000);
    else if (mode === '2500') setTarget(2500);
    else {
      const n = parseInt(custom) || 0;
      if (n > 0) setTarget(n);
    }
  }

  function validate() {
    if (winner !== null) return;
    const pp1 = parseInt(p1) || 0;
    const pp2 = parseInt(p2) || 0;
    const ww1 = parseInt(w1) || 0;
    const ww2 = parseInt(w2) || 0;
    if (pp1 + pp2 + ww1 + ww2 === 0 && match === 'none') return;

    setRounds(rs => [...rs, {
      trump: trumpId, mult: trump.mult,
      p1: pp1, p2: pp2, w1: ww1, w2: ww2,
      match,
      t1: previewT[0], t2: previewT[1],
    }]);

    if (previewT[0] > previewT[1])      setFlash(0);
    else if (previewT[1] > previewT[0]) setFlash(1);
    setTimeout(() => setFlash(null), 1100);

    setP1(''); setP2(''); setW1(''); setW2(''); setMatch('none');
  }

  function undo() { setRounds(rs => rs.slice(0, -1)); }

  function reset() {
    if (rounds.length && !confirm('Effacer la partie en cours ?')) return;
    setRounds([]); setP1(''); setP2(''); setW1(''); setW2(''); setMatch('none');
  }

  function saveEdit(idx, edited) {
    const t = TRUMPS.find(x => x.id === edited.trump) || trump;
    const m1 = edited.match === 'team1' ? 100 : 0;
    const m2 = edited.match === 'team2' ? 100 : 0;
    const t1 = (edited.p1 + edited.w1 + m1) * t.mult;
    const t2 = (edited.p2 + edited.w2 + m2) * t.mult;
    setRounds(rs => rs.map((r, i) => i === idx ? { ...edited, mult: t.mult, t1, t2 } : r));
    setEditingIdx(null);
  }
  function deleteRound(idx) {
    if (!confirm('Supprimer cette manche ?')) return;
    setRounds(rs => rs.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }

  return (
    <div className="ch-page" style={S.page}>
      {/* éclaboussures de fond */}
      <BloodSplats />

      <div className="ch-inner">
        <Header
          targetMode={targetMode} target={target}
          customTarget={customTarget} setCustomTarget={setCustomTarget}
          applyTargetMode={applyTargetMode}
          onReset={reset} canReset={rounds.length > 0}
        />

        <div className="ch-board">
          <TeamCard
            side="left"
            accent={C.bloodBri}
            name={names[0]}
            onRename={(n) => setNames([n, names[1]])}
            score={scores[0]}
            target={target}
            preview={previewT[0]}
            isWinner={winner === 0}
            flashing={flash === 0}
            editing={editingName === 0}
            setEditing={(b) => setEditingName(b ? 0 : null)}
          />
          <Divider />
          <TeamCard
            side="right"
            accent={C.amber}
            name={names[1]}
            onRename={(n) => setNames([names[0], n])}
            score={scores[1]}
            target={target}
            preview={previewT[1]}
            isWinner={winner === 1}
            flashing={flash === 1}
            editing={editingName === 1}
            setEditing={(b) => setEditingName(b ? 1 : null)}
          />
        </div>

        <RoundEntry
          trump={trump} trumpId={trumpId} setTrumpId={setTrumpId}
          names={names}
          p1={p1} setP1={setPoints1} p2={p2} setP2={setPoints2}
          w1={w1} setW1={setW1} w2={w2} setW2={setW2}
          match={match} setMatch={setMatch}
          previewT={previewT}
          onValidate={validate}
          onUndo={undo}
          canUndo={rounds.length > 0}
          locked={winner !== null}
        />

        <History
          rounds={rounds}
          names={names}
          editingIdx={editingIdx}
          setEditingIdx={setEditingIdx}
          onSave={saveEdit}
          onDelete={deleteRound}
        />

        {winner !== null && <Verdict name={names[winner]} onReset={reset} />}

        <Footer />
      </div>
    </div>
  );
}

// --- éclaboussures de sang en fond ---------------------------------------
function BloodSplats() {
  return (
    <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, opacity: 0.55 }} aria-hidden>
      <defs>
        <radialGradient id="splat1">
          <stop offset="0%"  stopColor={C.blood} stopOpacity="0.9" />
          <stop offset="60%" stopColor={C.bloodDeep} stopOpacity="0.4" />
          <stop offset="100%" stopColor={C.bloodDeep} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="splat2">
          <stop offset="0%"  stopColor={C.bloodInk} stopOpacity="0.7" />
          <stop offset="100%" stopColor={C.bloodInk} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="8%"  cy="12%" rx="220" ry="160" fill="url(#splat1)" transform="rotate(-15 100 100)" />
      <ellipse cx="92%" cy="22%" rx="180" ry="120" fill="url(#splat2)" />
      <ellipse cx="50%" cy="98%" rx="380" ry="120" fill="url(#splat1)" />
      <ellipse cx="6%"  cy="78%" rx="160" ry="100" fill="url(#splat2)" />
      {/* gouttes/coulures */}
      {[
        [12, 5, 24], [28, 3, 80], [54, 4, 30], [73, 6, 60], [88, 4, 40],
      ].map(([x, w, h], i) => (
        <rect key={i} x={`${x}%`} y="0" width={w} height={h}
              fill={C.blood} opacity="0.45" />
      ))}
    </svg>
  );
}

// --- en-tête --------------------------------------------------------------
function Header({ targetMode, target, customTarget, setCustomTarget, applyTargetMode, onReset, canReset }) {
  return (
    <header className="ch-header">
      <div className="ch-header-side">
        <span style={S.eyebrow}>
          <span style={{ color: C.bloodBri, marginRight: 6 }}>✚</span>
          PRENEZ · GARDE
        </span>
      </div>

      <div className="ch-header-center">
        <Ornament />
        <h1 className="ch-wordmark" style={S.wordmark}>chibre</h1>
        <div style={S.subtitle}>
          <span style={{ color: C.boneDim }}>—</span> feuille de pointage <span style={{ color: C.boneDim }}>—</span>
        </div>
      </div>

      <div className="ch-header-side ch-header-side-r">
        <TargetToggle
          mode={targetMode} target={target}
          custom={customTarget} setCustom={setCustomTarget}
          apply={applyTargetMode}
        />
        <button
          style={{ ...S.btnGhost, opacity: canReset ? 1 : 0.4, cursor: canReset ? 'pointer' : 'default' }}
          onClick={onReset}
          disabled={!canReset}
        >Effacer</button>
      </div>
    </header>
  );
}

function Ornament() {
  return (
    <svg width="240" height="14" viewBox="0 0 240 14" style={{ display: 'block', margin: '4px 0 6px' }} aria-hidden>
      <line x1="0"   y1="7" x2="100" y2="7" stroke={C.blood} strokeWidth="1" />
      <line x1="140" y1="7" x2="240" y2="7" stroke={C.blood} strokeWidth="1" />
      <g transform="translate(120 7)">
        <path d="M0 -7 L4 0 L0 7 L-4 0 Z" fill={C.bloodBri} />
        <circle r="1.5" fill={C.bg} />
      </g>
    </svg>
  );
}

function TargetToggle({ mode, target, custom, setCustom, apply }) {
  return (
    <div className="ch-target-wrap" style={S.targetWrap}>
      {[
        ['1000', '1000'],
        ['2500', '2500'],
      ].map(([m, l]) => (
        <button
          key={m}
          onClick={() => apply(m, custom)}
          style={{
            ...S.targetBtn,
            ...(mode === m ? S.targetBtnOn : null),
          }}
        >{l}</button>
      ))}
      <div style={{ ...S.targetCustomWrap, ...(mode === 'custom' ? S.targetCustomWrapOn : null) }}>
        <input
          className="ch-input ch-target-custom"
          type="number"
          inputMode="numeric"
          placeholder="…"
          value={mode === 'custom' ? custom : ''}
          onFocus={() => apply('custom', custom)}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '');
            setCustom(v);
            apply('custom', v);
          }}
          style={S.targetCustomInput}
        />
      </div>
    </div>
  );
}

// --- carte d'équipe -------------------------------------------------------
function TeamCard({ side, accent, name, onRename, score, target, preview, isWinner, flashing, editing, setEditing }) {
  const pct = Math.min(1, score / Math.max(1, target));
  const previewPct = preview > 0 ? Math.min(1, (score + preview) / Math.max(1, target)) : pct;

  const [shown, setShown] = useState(score);
  const [bumping, setBumping] = useState(false);
  useEffect(() => {
    if (score === shown) return;
    setBumping(true);
    const t = setTimeout(() => { setShown(score); setBumping(false); }, 180);
    return () => clearTimeout(t);
  }, [score]); // eslint-disable-line

  return (
    <div
      className="ch-card"
      style={{
        ...S.card,
        boxShadow: isWinner
          ? `0 0 0 2px ${accent}, 0 0 40px ${accent}88, inset 0 0 60px ${accent}22, 0 18px 40px -10px #000`
          : `0 0 0 1px ${C.line}, inset 0 0 40px ${C.bgVoid}, 0 18px 36px -16px #000`,
        animation: flashing ? 'ch_flash 1100ms ease-out' : undefined,
      }}
    >
      {/* corner stains */}
      <CornerStain pos="tl" />
      <CornerStain pos="br" />

      {/* edge strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        opacity: 0.7,
      }} />

      <div style={S.teamHeader}>
        <span style={{ ...S.teamSideTag, color: accent }}>{side === 'left' ? 'I' : 'II'}</span>
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            onBlur={(e) => { onRename(e.target.value.trim() || name); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
            style={{ ...S.teamNameInput, color: accent, borderColor: accent }}
          />
        ) : (
          <button style={{ ...S.teamName, color: accent }} onClick={() => setEditing(true)} title="Renommer (cliquer)">
            {name}
            <span style={{ ...S.teamNamePencil, color: C.boneDim }}> ✎</span>
          </button>
        )}
        <span style={{ ...S.teamSideTag, color: accent }}>{side === 'left' ? 'I' : 'II'}</span>
      </div>

      <div style={{
        ...S.scoreWrap,
        animation: bumping ? 'ch_pop 350ms ease-out' : undefined,
      }}>
        <div className="ch-score-number" style={{
          ...S.scoreNumber,
          color: accent,
          textShadow: `
            0 0 1px ${accent},
            0 2px 0 ${C.bgVoid},
            0 0 28px ${accent}66,
            0 0 60px ${accent}33
          `,
        }}>
          {shown}
        </div>
        <div style={S.scoreFooting}>
          <span style={S.scoreOf}>de {target}</span>
          {preview > 0 && (
            <span style={{
              ...S.previewChip,
              color: C.bonePale,
              borderColor: C.amber,
              background: `${C.amber}11`,
            }}>
              <span style={S.previewPlus}>+</span>{preview}
            </span>
          )}
        </div>
      </div>

      <Gauge pct={pct} previewPct={previewPct} accent={accent} />

      <div style={S.cardSeal}>
        {isWinner
          ? <span style={{ color: accent, animation: 'ch_flicker 2.4s infinite', letterSpacing: '0.4em' }}>· VAINQUEUR ·</span>
          : <span>
              <span style={{ color: C.boneDim }}>il reste</span>{' '}
              <span style={{ color: accent, fontWeight: 700 }}>{Math.max(0, target - score)}</span>{' '}
              <span style={{ color: C.boneDim }}>points</span>
            </span>
        }
      </div>
    </div>
  );
}

function CornerStain({ pos }) {
  const map = {
    tl: { top: -10, left: -10, rot: 0 },
    br: { bottom: -10, right: -10, rot: 180 },
  };
  const p = map[pos];
  return (
    <svg width="120" height="120" viewBox="0 0 120 120"
         style={{ position: 'absolute', ...p, transform: `rotate(${p.rot}deg)`, pointerEvents: 'none', opacity: 0.55, mixBlendMode: 'multiply' }} aria-hidden>
      <radialGradient id={`stain-${pos}`}>
        <stop offset="0%"   stopColor={C.bloodDeep} stopOpacity="0.85" />
        <stop offset="60%"  stopColor={C.bloodDeep} stopOpacity="0.3" />
        <stop offset="100%" stopColor={C.bloodDeep} stopOpacity="0" />
      </radialGradient>
      <ellipse cx="30" cy="30" rx="50" ry="38" fill={`url(#stain-${pos})`} />
    </svg>
  );
}

// --- jauge ----------------------------------------------------------------
function Gauge({ pct, previewPct, accent }) {
  const ticks = [];
  for (let i = 0; i <= 10; i++) ticks.push({ pct: i * 10, major: true });
  for (let i = 0; i < 10; i++) ticks.push({ pct: i * 10 + 5, major: false });

  return (
    <div style={S.gaugeWrap}>
      <div style={{
        ...S.gaugeTrack,
        boxShadow: `inset 0 2px 4px ${C.bgVoid}, inset 0 0 0 1px ${C.lineDim}`,
      }}>
        {previewPct > pct && (
          <div style={{
            ...S.gaugeFillPreview,
            width: `${previewPct * 100}%`,
            backgroundImage: `repeating-linear-gradient(45deg, ${C.amber}55 0 6px, ${C.amber}11 6px 12px)`,
          }} />
        )}
        <div style={{
          ...S.gaugeFill,
          width: `${pct * 100}%`,
          background: `linear-gradient(180deg, ${accent} 0%, ${accent}cc 50%, ${accent}99 100%)`,
          boxShadow: `0 0 12px ${accent}aa, inset 0 1px 0 ${C.bonePale}33, inset 0 -1px 0 ${C.bgVoid}88`,
        }} />
        {ticks.map((t, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${t.pct}%`,
            bottom: 0,
            width: 1,
            height: t.major ? 12 : 6,
            background: t.major ? C.boneDim : C.line,
            opacity: t.major ? 0.55 : 0.35,
            transform: 'translateX(-0.5px)',
          }} />
        ))}
        <div style={{ ...S.gaugeNeedle, left: `${pct * 100}%` }}>
          <div style={{
            ...S.gaugeNeedleHead,
            background: accent,
            borderColor: C.bonePale,
            boxShadow: `0 0 10px ${accent}, 0 0 20px ${accent}88`,
          }} />
          <div style={{ ...S.gaugeNeedleStem, background: accent }} />
        </div>
      </div>
    </div>
  );
}

// --- séparateur -----------------------------------------------------------
function Divider() {
  return (
    <div className="ch-divider" style={S.divider} aria-hidden>
      <svg width="36" height="280" viewBox="0 0 36 280" style={{ display: 'block' }}>
        <line x1="18" y1="0"   x2="18" y2="100" stroke={C.bloodDeep} strokeWidth="1.5" strokeDasharray="3 4" />
        <line x1="18" y1="180" x2="18" y2="280" stroke={C.bloodDeep} strokeWidth="1.5" strokeDasharray="3 4" />
        <g transform="translate(18 140)">
          <path d="M-12 0 L0 -16 L12 0 L0 16 Z" fill="none" stroke={C.bloodBri} strokeWidth="1.5" />
          <path d="M-6 0 L0 -8 L6 0 L0 8 Z" fill={C.bloodBri} opacity="0.85" />
        </g>
      </svg>
      <div style={S.dividerLabel}>VS</div>
    </div>
  );
}

// --- saisie ---------------------------------------------------------------
function RoundEntry({ trump, trumpId, setTrumpId, names,
                      p1, setP1, p2, setP2, w1, setW1, w2, setW2,
                      match, setMatch, previewT, onValidate, onUndo, canUndo, locked }) {
  return (
    <section className="ch-entry" style={S.entry}>
      <div style={S.entryHeader}>
        <div style={S.entryHeaderLeft}>
          <span style={S.sectionEyebrow}>· MANCHE ·</span>
          <span className="ch-section-title" style={S.sectionTitle}>Inscrire la donne</span>
        </div>
        <div style={S.entryHeaderRight}>
          <span style={{
            ...S.multBadge,
            borderColor: trump.mult > 1 ? C.bloodBri : C.line,
            color: trump.mult > 1 ? C.bloodBri : C.bone,
            boxShadow: trump.mult > 1 ? `0 0 12px ${C.bloodBri}55` : 'none',
          }}>
            <span style={{ ...S.multBadgeNum }}>×{trump.mult}</span>
            <span className="ch-mult-label" style={S.multBadgeLabel}>multiplicateur</span>
          </span>
        </div>
      </div>

      <div style={S.entryBody}>
        <div className="ch-trump-row">
          {TRUMPS.map(t => (
            <TrumpToken
              key={t.id}
              trump={t}
              active={t.id === trumpId}
              onClick={() => setTrumpId(t.id)}
            />
          ))}
        </div>

        <div className="ch-inputs-row">
          <ColumnInputs
            label={names[0]}
            sideTag="I"
            accent={C.bloodBri}
            points={p1} setPoints={setP1}
            weis={w1} setWeis={setW1}
            match={match === 'team1'}
            onMatch={() => setMatch(match === 'team1' ? 'none' : 'team1')}
            preview={previewT[0]}
            mult={trump.mult}
          />

          <div className="ch-inputs-center" style={S.inputsCenter}>
            <SumIndicator a={parseInt(p1)||0} b={parseInt(p2)||0} />
          </div>

          <ColumnInputs
            label={names[1]}
            sideTag="II"
            accent={C.amber}
            points={p2} setPoints={setP2}
            weis={w2} setWeis={setW2}
            match={match === 'team2'}
            onMatch={() => setMatch(match === 'team2' ? 'none' : 'team2')}
            preview={previewT[1]}
            mult={trump.mult}
            mirror
          />
        </div>

        <div className="ch-actions">
          <button
            style={{ ...S.btnGhost, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'default' }}
            disabled={!canUndo}
            onClick={onUndo}
          >↶ Annuler la dernière</button>

          <button
            style={{ ...S.btnPrimary, opacity: locked ? 0.4 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
            disabled={locked}
            onClick={onValidate}
          >
            <span style={S.btnPrimaryGlyph}>✚</span>
            <span>Valider la manche</span>
            <span style={S.btnPrimaryGlyph}>✚</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function TrumpToken({ trump, active, onClick }) {
  const isRed = trump.id === 'coeur' || trump.id === 'carreau';
  const ink = isRed ? C.bloodBri : C.bone;
  return (
    <button onClick={onClick} style={{ ...S.tokenWrap, ...(active ? S.tokenWrapOn : null) }}>
      <span className="ch-token-disc" style={{
        ...S.tokenDisc,
        borderColor: active ? C.bloodBri : C.line,
        background: active
          ? `radial-gradient(circle at 30% 30%, ${C.paperLight}, ${C.paper} 75%)`
          : `radial-gradient(circle at 30% 30%, ${C.panelLight}, ${C.panel} 75%)`,
        boxShadow: active
          ? `0 0 0 1px ${C.bloodBri}, 0 0 18px ${C.bloodBri}88, inset 0 0 16px ${C.bgVoid}`
          : `inset 0 1px 0 ${C.bone}10, inset 0 0 14px ${C.bgVoid}`,
      }}>
        <span style={{
          ...S.tokenGlyph,
          color: active ? ink : (isRed ? `${C.blood}aa` : `${C.boneDim}`),
        }}>{trump.glyph}</span>
        {trump.mult > 1 && (
          <span style={{
            position: 'absolute',
            bottom: -2, right: -2,
            background: C.bloodBri,
            color: C.bonePale,
            fontFamily: "'IM Fell English SC', serif",
            fontSize: 10,
            padding: '1px 5px',
            border: `1px solid ${C.bonePale}`,
            letterSpacing: '0.04em',
          }}>×{trump.mult}</span>
        )}
      </span>
      <span style={{
        ...S.tokenLabel,
        color: active ? C.bonePale : C.boneDim,
      }}>
        {trump.label}
      </span>
    </button>
  );
}

function ColumnInputs({ label, sideTag, accent, points, setPoints, weis, setWeis, match, onMatch, preview, mult, mirror }) {
  return (
    <div className={mirror ? 'ch-input-col-r' : ''} style={{ ...S.inputCol, alignItems: mirror ? 'flex-end' : 'flex-start' }}>
      <div className="ch-col-head" style={{ ...S.inputColHead, flexDirection: mirror ? 'row-reverse' : 'row' }}>
        <span style={{ ...S.colSide, color: accent }}>{sideTag}</span>
        <span style={{ ...S.colName, color: accent }}>{label}</span>
      </div>

      <div className="ch-input-row" style={{ ...S.inputRow, flexDirection: mirror ? 'row-reverse' : 'row' }}>
        <Field label="POINTS" hint="0–157" value={points} onChange={setPoints} accent={accent} big />
        <Field label="ANNONCES" hint="weis" value={weis} onChange={(v) => setWeis(v.replace(/[^0-9]/g, ''))} accent={accent} />
      </div>

      <div className="ch-bottom-row" style={{ ...S.inputBottomRow, flexDirection: mirror ? 'row-reverse' : 'row' }}>
        <button
          onClick={onMatch}
          style={{
            ...S.matchBtn,
            ...(match ? {
              background: `linear-gradient(180deg, ${C.bloodBri}, ${C.blood})`,
              borderColor: C.bonePale,
              color: C.bonePale,
              boxShadow: `0 0 14px ${C.bloodBri}aa, inset 0 1px 0 ${C.bonePale}33`,
            } : null),
          }}
        >
          <span style={{ ...S.matchBtnDot }}>{match ? '✚' : '+'}</span>
          MATCH <span style={{ ...S.matchBtnPlus }}>+100</span>
        </button>

        <div className="ch-preview-row" style={{ ...S.previewRow, flexDirection: mirror ? 'row-reverse' : 'row' }}>
          <span style={S.previewLabel}>cette manche</span>
          <span style={{
            ...S.previewValue,
            color: preview > 0 ? accent : C.boneDim,
          }}>
            {preview > 0 ? `+${preview}` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, value, onChange, accent, big }) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>
        {label}<span style={S.fieldHint}> · {hint}</span>
      </span>
      <input
        className="ch-input"
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        style={{
          ...S.fieldInput,
          ...(big ? S.fieldInputBig : null),
          color: accent,
          borderColor: value ? accent : C.line,
        }}
      />
    </label>
  );
}

function SumIndicator({ a, b }) {
  const sum = a + b;
  const ok = sum === 0 || sum === 157;
  const color = sum === 0 ? C.boneDim : (ok ? C.amber : C.bloodBri);
  return (
    <div style={S.sumWrap}>
      <span style={S.sumLabel}>somme</span>
      <span style={{ ...S.sumValue, color }}>{sum || '—'}</span>
      <span style={S.sumHint}>= 157</span>
    </div>
  );
}

// --- historique éditable -------------------------------------------------
function History({ rounds, names, editingIdx, setEditingIdx, onSave, onDelete }) {
  if (!rounds.length) {
    return (
      <section className="ch-history-card" style={S.history}>
        <div style={S.entryHeader}>
          <div style={S.entryHeaderLeft}>
            <span style={S.sectionEyebrow}>· REGISTRE ·</span>
            <span className="ch-section-title" style={S.sectionTitle}>Historique des manches</span>
          </div>
        </div>
        <div style={S.historyEmpty}>
          Aucune manche jouée. Distribuez les cartes.
        </div>
      </section>
    );
  }

  let r1 = 0, r2 = 0;
  return (
    <section className="ch-history-card" style={S.history}>
      <div style={S.entryHeader}>
        <div style={S.entryHeaderLeft}>
          <span style={S.sectionEyebrow}>· REGISTRE ·</span>
          <span className="ch-section-title" style={S.sectionTitle}>
            Historique · <span style={{ color: C.bloodBri }}>{rounds.length}</span> manche{rounds.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="ch-history" style={S.historyScroll}>
        <div className="ch-thead" style={S.tableHead}>
          <div style={{ ...S.thCell, flex: '0 0 38px', textAlign: 'left' }}>n°</div>
          <div className="ch-th-trump" style={{ ...S.thCell, flex: '0 0 130px' }}>Atout</div>
          <div style={{ ...S.thCell, flex: '1 1 0', textAlign: 'right' }}>{names[0]}</div>
          <div className="ch-th-cumul" style={{ ...S.thCell, flex: '0 0 70px', textAlign: 'center' }}>cumul</div>
          <div style={{ ...S.thCell, flex: '1 1 0', textAlign: 'left' }}>{names[1]}</div>
          <div className="ch-th-cumul" style={{ ...S.thCell, flex: '0 0 70px', textAlign: 'center' }}>cumul</div>
          <div style={{ ...S.thCell, flex: '0 0 36px' }}></div>
        </div>

        {rounds.map((r, i) => {
          r1 += r.t1; r2 += r.t2;
          const t = TRUMPS.find(x => x.id === r.trump) || TRUMPS[0];
          const isEditing = editingIdx === i;
          if (isEditing) {
            return (
              <EditRow
                key={i}
                round={r}
                onSave={(edited) => onSave(i, edited)}
                onCancel={() => setEditingIdx(null)}
                onDelete={() => onDelete(i)}
              />
            );
          }
          return (
            <div key={i} className="ch-trow" style={{ ...S.tableRow, animation: i === rounds.length - 1 ? 'ch_fadeup 360ms ease-out' : undefined }}>
              <div style={{ ...S.tdCell, flex: '0 0 38px', textAlign: 'left', fontFamily: "'IM Fell English SC', serif", fontSize: 18, color: C.bloodBri, fontWeight: 700 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="ch-td-trump" style={{ ...S.tdCell, flex: '0 0 130px' }}>
                <span style={{
                  ...S.trumpPill,
                  borderColor: t.mult > 1 ? C.bloodBri : C.line,
                  color: t.id === 'coeur' || t.id === 'carreau' ? C.bloodBri : C.bone,
                }}>
                  <span style={{ marginRight: 6 }}>{t.glyph}</span>
                  <span className="ch-trump-pill-text">{t.label}{t.mult > 1 ? <span style={{ color: C.amber, marginLeft: 4 }}>×{t.mult}</span> : null}</span>
                  <span className="ch-mobile-only">{t.mult > 1 ? '×2' : ''}</span>
                </span>
              </div>
              <RoundCell points={r.p1} weis={r.w1} match={r.match === 'team1'} total={r.t1} mult={r.mult} accent={C.bloodBri} align="right" />
              <div className="ch-td-cumul" style={{ ...S.tdCell, flex: '0 0 70px', textAlign: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, color: C.bone }}>
                {r1}
              </div>
              <RoundCell points={r.p2} weis={r.w2} match={r.match === 'team2'} total={r.t2} mult={r.mult} accent={C.amber} align="left" />
              <div className="ch-td-cumul" style={{ ...S.tdCell, flex: '0 0 70px', textAlign: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, color: C.bone }}>
                {r2}
              </div>
              <div style={{ ...S.tdCell, flex: '0 0 36px', textAlign: 'right' }}>
                <button onClick={() => setEditingIdx(i)} title="Modifier" style={S.editBtn}>✎</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EditRow({ round, onSave, onCancel, onDelete }) {
  const [trumpId, setTrumpId] = useState(round.trump);
  const [p1, setP1] = useState(String(round.p1));
  const [p2, setP2] = useState(String(round.p2));
  const [w1, setW1] = useState(String(round.w1 || ''));
  const [w2, setW2] = useState(String(round.w2 || ''));
  const [match, setMatch] = useState(round.match || 'none');

  const t = TRUMPS.find(x => x.id === trumpId) || TRUMPS[0];

  // auto-complete points
  const onP1 = (v) => {
    const c = v.replace(/[^0-9]/g, '');
    setP1(c);
    if (c === '') { setP2(''); return; }
    setP2(String(Math.max(0, 157 - Math.min(157, parseInt(c) || 0))));
  };
  const onP2 = (v) => {
    const c = v.replace(/[^0-9]/g, '');
    setP2(c);
    if (c === '') { setP1(''); return; }
    setP1(String(Math.max(0, 157 - Math.min(157, parseInt(c) || 0))));
  };

  const previewT1 = ((parseInt(p1)||0) + (parseInt(w1)||0) + (match === 'team1' ? 100 : 0)) * t.mult;
  const previewT2 = ((parseInt(p2)||0) + (parseInt(w2)||0) + (match === 'team2' ? 100 : 0)) * t.mult;

  return (
    <div style={{
      ...S.editRow,
      animation: 'ch_fadeup 220ms ease-out',
    }}>
      <div className="ch-edit-bar" style={S.editBar}>
        <span style={{ fontFamily: "'IM Fell English SC', serif", fontSize: 16, color: C.bloodBri, marginRight: 8 }}>Modifier</span>
        {TRUMPS.map(tt => (
          <button
            key={tt.id}
            onClick={() => setTrumpId(tt.id)}
            style={{
              ...S.editTrumpBtn,
              ...(trumpId === tt.id ? {
                borderColor: C.bloodBri,
                color: C.bonePale,
                background: C.bloodDeep,
              } : null),
            }}
            title={tt.label}
          >
            <span style={{
              color: tt.id === 'coeur' || tt.id === 'carreau' ? C.bloodBri : C.bone,
              fontSize: 18,
            }}>{tt.glyph}</span>
            <span style={{ fontSize: 10, marginLeft: 4 }}>×{tt.mult}</span>
          </button>
        ))}
      </div>

      <div style={S.editGrid}>
        <div style={S.editCol}>
          <span style={S.editColLabel}>Équipe I</span>
          <div style={S.editFieldRow}>
            <input className="ch-input" value={p1} onChange={(e) => onP1(e.target.value)} placeholder="pts" style={{ ...S.editInput, color: C.bloodBri }} />
            <input className="ch-input" value={w1} onChange={(e) => setW1(e.target.value.replace(/[^0-9]/g, ''))} placeholder="weis" style={{ ...S.editInput, color: C.bloodBri }} />
          </div>
          <button
            onClick={() => setMatch(match === 'team1' ? 'none' : 'team1')}
            style={{
              ...S.editMatchBtn,
              ...(match === 'team1' ? { background: C.blood, borderColor: C.bonePale, color: C.bonePale } : null),
            }}
          >
            {match === 'team1' ? '✚' : '+'} Match +100
          </button>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 900, color: C.bloodBri, marginTop: 4 }}>= +{previewT1}</div>
        </div>

        <div style={S.editCol}>
          <span style={S.editColLabel}>Équipe II</span>
          <div style={S.editFieldRow}>
            <input className="ch-input" value={p2} onChange={(e) => onP2(e.target.value)} placeholder="pts" style={{ ...S.editInput, color: C.amber }} />
            <input className="ch-input" value={w2} onChange={(e) => setW2(e.target.value.replace(/[^0-9]/g, ''))} placeholder="weis" style={{ ...S.editInput, color: C.amber }} />
          </div>
          <button
            onClick={() => setMatch(match === 'team2' ? 'none' : 'team2')}
            style={{
              ...S.editMatchBtn,
              ...(match === 'team2' ? { background: C.blood, borderColor: C.bonePale, color: C.bonePale } : null),
            }}
          >
            {match === 'team2' ? '✚' : '+'} Match +100
          </button>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 900, color: C.amber, marginTop: 4 }}>= +{previewT2}</div>
        </div>
      </div>

      <div style={S.editActions}>
        <button onClick={onDelete} style={{ ...S.btnGhost, color: C.bloodBri, borderColor: C.bloodBri }}>🗑 Supprimer</button>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={S.btnGhost}>Annuler</button>
        <button onClick={() => onSave({
          trump: trumpId,
          p1: parseInt(p1)||0, p2: parseInt(p2)||0,
          w1: parseInt(w1)||0, w2: parseInt(w2)||0,
          match,
        })} style={S.btnPrimary}>
          <span style={S.btnPrimaryGlyph}>✚</span> Enregistrer <span style={S.btnPrimaryGlyph}>✚</span>
        </button>
      </div>
    </div>
  );
}

function RoundCell({ points, weis, match, total, mult, accent, align }) {
  const parts = [`${points}`];
  if (weis)  parts.push(`+${weis}a`);
  if (match) parts.push('+100m');
  return (
    <div style={{ ...S.tdCell, flex: '1 1 0', textAlign: align }}>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 22, color: accent, marginRight: 8 }}>
        {total}
      </span>
      <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 11, color: C.boneDim }}>
        ({parts.join(' ')}){mult > 1 ? `×${mult}` : ''}
      </span>
    </div>
  );
}

// --- verdict --------------------------------------------------------------
function Verdict({ name, onReset }) {
  return (
    <div style={S.verdict}>
      <div className="ch-verdict-inner" style={S.verdictInner}>
        <Ornament />
        <div style={S.verdictKicker}>· la partie est gagnée ·</div>
        <div className="ch-verdict-name" style={S.verdictName}>{name}</div>
        <div style={S.verdictRule} />
        <button style={{ ...S.btnPrimary, marginTop: 6 }} onClick={onReset}>
          <span style={S.btnPrimaryGlyph}>✚</span>
          <span>Nouvelle partie</span>
          <span style={S.btnPrimaryGlyph}>✚</span>
        </button>
      </div>
    </div>
  );
}

function Footer() {
  const items = [
    [C.bone,    'Trèfle',  '♣'],
    [C.bloodBri,'Carreau', '♦'],
    [C.bloodBri,'Cœur',    '♥'],
    [C.bone,    'Pique ×2','♠'],
  ];
  return (
    <footer className="ch-footer" style={S.footer}>
      {items.map(([col, name, gl], i) => (
        <span key={name}>
          <span style={{ color: col, marginRight: 4 }}>{gl}</span>
          <span style={{ color: C.boneDim }}>{name}</span>
          {i < items.length - 1 && <span style={{ color: C.lineDim, margin: '0 10px' }}>·</span>}
        </span>
      ))}
    </footer>
  );
}

// --- styles ---------------------------------------------------------------
const S = {
  page: {
    minHeight: '100vh',
    background: `
      radial-gradient(ellipse at 25% 0%,  ${C.bloodInk}88 0%, transparent 55%),
      radial-gradient(ellipse at 80% 100%, ${C.bloodInk}55 0%, transparent 55%),
      linear-gradient(180deg, ${C.bg} 0%, ${C.bgDeep} 50%, ${C.bgVoid} 100%),
      ${C.bgVoid}
    `,
    backgroundAttachment: 'fixed',
  },

  eyebrow: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    letterSpacing: '0.34em',
    textTransform: 'uppercase',
    color: C.bloodBri,
    fontWeight: 700,
  },
  wordmark: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 78,
    margin: 0,
    color: C.bonePale,
    letterSpacing: '0.005em',
    lineHeight: 1,
    textShadow: `
      2px 2px 0 ${C.bloodDeep},
      4px 4px 0 ${C.bgVoid},
      0 0 22px ${C.blood}88
    `,
  },
  subtitle: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    letterSpacing: '0.32em',
    color: C.boneDim,
    textTransform: 'lowercase',
  },

  targetWrap: {
    display: 'inline-flex',
    border: `1px solid ${C.line}`,
    background: C.panel,
    boxShadow: `inset 0 0 8px ${C.bgVoid}, 0 2px 4px ${C.bgVoid}`,
  },
  targetBtn: {
    background: 'transparent',
    border: 'none',
    borderRight: `1px solid ${C.lineDim}`,
    color: C.boneDim,
    padding: '8px 14px',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 13,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    fontWeight: 700,
  },
  targetBtnOn: {
    background: `linear-gradient(180deg, ${C.bloodBri}, ${C.blood})`,
    color: C.bonePale,
    boxShadow: `inset 0 1px 0 ${C.bonePale}33, inset 0 -2px 4px ${C.bloodDeep}`,
    textShadow: `0 1px 0 ${C.bloodDeep}`,
  },
  targetCustomWrap: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px',
    background: C.bgDeep,
    transition: 'all 200ms ease',
  },
  targetCustomWrapOn: {
    background: `linear-gradient(180deg, ${C.bloodBri}22, ${C.bloodDeep})`,
    boxShadow: `inset 0 0 12px ${C.blood}55`,
  },
  targetCustomInput: {
    width: 60,
    background: 'transparent',
    border: 'none',
    color: C.bonePale,
    padding: '8px 6px',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    outline: 'none',
    textAlign: 'center',
  },

  divider: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minWidth: 36,
  },
  dividerLabel: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    fontFamily: "'IM Fell English SC', serif",
    fontWeight: 700,
    fontSize: 16,
    color: C.bonePale,
    background: C.bg,
    padding: '6px 8px',
    letterSpacing: '0.16em',
    border: `1px solid ${C.bloodDeep}`,
    boxShadow: `0 0 10px ${C.blood}66`,
  },

  card: {
    position: 'relative',
    padding: '34px 30px 24px',
    background: `
      radial-gradient(ellipse at 18% 8%, ${C.paperLight}, ${C.paper} 60%, ${C.panel} 100%)
    `,
    backgroundColor: C.paper,
    color: C.bone,
    overflow: 'hidden',
    transition: 'box-shadow 350ms ease',
    border: 'none',
  },
  teamHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 12,
  },
  teamSideTag: {
    fontFamily: "'IM Fell English SC', serif",
    fontWeight: 700,
    fontSize: 18,
    letterSpacing: '0.12em',
    opacity: 0.85,
  },
  teamName: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 36,
    letterSpacing: '0.01em',
    padding: '2px 10px',
    textShadow: `1px 1px 0 ${C.bgVoid}`,
  },
  teamNamePencil: {
    fontSize: 14,
    marginLeft: 6,
    fontStyle: 'normal',
    opacity: 0.6,
  },
  teamNameInput: {
    background: C.bgVoid,
    border: '1px solid',
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 32,
    textAlign: 'center',
    padding: '4px 10px',
    outline: 'none',
    width: 220,
  },
  scoreWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: '4px 0 14px',
  },
  scoreNumber: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 'clamp(110px, 14vw, 168px)',
    lineHeight: 0.92,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'lining-nums tabular-nums',
  },
  scoreFooting: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  scoreOf: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 13,
    letterSpacing: '0.18em',
    color: C.boneDim,
    textTransform: 'lowercase',
  },
  previewChip: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 2,
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 18,
    border: `1px solid`,
    padding: '2px 10px',
  },
  previewPlus: { fontSize: 14, marginRight: 1 },

  gaugeWrap: { padding: '14px 0 6px' },
  gaugeTrack: {
    position: 'relative',
    height: 20,
    background: `linear-gradient(180deg, ${C.bgVoid}, ${C.bgDeep})`,
    border: `1px solid ${C.line}`,
  },
  gaugeFill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    transition: 'width 480ms cubic-bezier(.2,.7,.2,1)',
  },
  gaugeFillPreview: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    transition: 'width 220ms ease',
  },
  gaugeNeedle: {
    position: 'absolute',
    top: -8, bottom: -8,
    transform: 'translateX(-50%)',
    transition: 'left 480ms cubic-bezier(.2,.7,.2,1)',
    pointerEvents: 'none',
  },
  gaugeNeedleHead: {
    width: 10, height: 10,
    border: `1px solid`,
    borderRadius: '50%',
    margin: '0 auto',
  },
  gaugeNeedleStem: {
    width: 2,
    height: 'calc(100% - 10px)',
    margin: '0 auto',
  },

  cardSeal: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 13,
    letterSpacing: '0.16em',
    paddingTop: 12,
    borderTop: `1px dashed ${C.line}`,
    textTransform: 'lowercase',
  },

  entry: {
    position: 'relative',
    background: `linear-gradient(180deg, ${C.panel}, ${C.bgDeep})`,
    border: `1px solid ${C.line}`,
    padding: '20px 22px',
    marginBottom: 22,
    boxShadow: `0 0 24px ${C.bloodInk}88, inset 0 0 30px ${C.bgVoid}`,
  },
  entryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `1px dashed ${C.line}`,
  },
  entryHeaderLeft: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  entryHeaderRight: { display: 'flex', alignItems: 'center', gap: 12 },
  sectionEyebrow: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 11,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: C.bloodBri,
    fontWeight: 700,
  },
  sectionTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic',
    fontWeight: 700,
    fontSize: 22,
    color: C.bonePale,
  },
  multBadge: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 8,
    border: '1px solid',
    padding: '5px 14px',
    background: C.bgVoid,
  },
  multBadgeNum: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 22,
  },
  multBadgeLabel: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 11,
    letterSpacing: '0.18em',
    textTransform: 'lowercase',
    color: C.boneDim,
  },

  entryBody: { display: 'flex', flexDirection: 'column', gap: 22 },

  tokenWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 7,
    padding: '12px 4px 8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 180ms ease',
    position: 'relative',
  },
  tokenWrapOn: { transform: 'translateY(-3px)' },
  tokenDisc: {
    position: 'relative',
    width: 64, height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid',
    transition: 'all 220ms ease',
  },
  tokenGlyph: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontSize: 32,
    lineHeight: 1,
    transition: 'all 220ms ease',
    textShadow: `1px 1px 0 ${C.bgVoid}`,
  },
  tokenLabel: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 13,
    letterSpacing: '0.1em',
    textTransform: 'lowercase',
    fontWeight: 700,
    transition: 'color 220ms ease',
  },

  inputsCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
  },
  inputCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
  },
  inputColHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  colSide: {
    fontFamily: "'IM Fell English SC', serif",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.12em',
    opacity: 0.8,
  },
  colName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic',
    fontWeight: 700,
    fontSize: 22,
  },
  inputRow: { display: 'flex', gap: 10, width: '100%' },
  inputBottomRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: '1 1 0',
  },
  fieldLabel: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 11,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: C.boneDim,
    fontWeight: 700,
  },
  fieldHint: { letterSpacing: '0.14em', opacity: 0.7, fontStyle: 'italic', textTransform: 'lowercase' },
  fieldInput: {
    width: '100%',
    background: C.bgVoid,
    border: `1px solid ${C.line}`,
    padding: '10px 14px',
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 700,
    fontStyle: 'italic',
    fontSize: 24,
    fontVariantNumeric: 'lining-nums tabular-nums',
    outline: 'none',
    transition: 'border-color 220ms ease',
    boxShadow: `inset 0 2px 4px ${C.bgVoid}`,
  },
  fieldInputBig: { fontSize: 32, padding: '8px 14px', fontWeight: 900 },

  sumWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    minWidth: 60,
  },
  sumLabel: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 10,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: C.boneDim,
    fontWeight: 700,
  },
  sumValue: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 30,
    lineHeight: 1,
  },
  sumHint: {
    fontFamily: "'Special Elite', monospace",
    fontSize: 10,
    color: C.boneDim,
    letterSpacing: '0.06em',
  },

  matchBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: C.bgVoid,
    border: `1px solid ${C.line}`,
    color: C.boneDim,
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 200ms ease',
  },
  matchBtnDot: { fontSize: 13, color: C.bloodBri },
  matchBtnPlus: { color: C.amber, marginLeft: 2, fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontWeight: 900 },

  previewRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  previewLabel: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: C.boneDim,
    fontWeight: 700,
  },
  previewValue: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 24,
  },

  btnGhost: {
    background: 'transparent',
    border: `1px solid ${C.line}`,
    color: C.bonePale,
    padding: '10px 18px',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 13,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 200ms ease',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 30px',
    background: `linear-gradient(180deg, ${C.bloodBri} 0%, ${C.blood} 60%, ${C.bloodDeep} 100%)`,
    border: `1px solid ${C.bonePale}`,
    color: C.bonePale,
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 20,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    boxShadow: `
      inset 0 1px 0 ${C.bonePale}44,
      inset 0 -3px 6px ${C.bloodDeep},
      0 4px 0 ${C.bloodDeep},
      0 0 20px ${C.blood}aa
    `,
    textShadow: `0 1px 0 ${C.bloodDeep}, 0 0 8px ${C.bonePale}55`,
  },
  btnPrimaryGlyph: { color: C.bonePale, fontSize: 14, opacity: 0.85 },

  history: {
    background: `linear-gradient(180deg, ${C.panel}, ${C.bgDeep})`,
    border: `1px solid ${C.line}`,
    padding: '20px 22px',
    marginBottom: 22,
    boxShadow: `0 0 18px ${C.bloodInk}66, inset 0 0 20px ${C.bgVoid}`,
  },
  historyEmpty: {
    fontFamily: "'IM Fell English SC', serif",
    fontStyle: 'normal',
    fontSize: 14,
    color: C.boneDim,
    textAlign: 'center',
    padding: '28px 0',
    border: `1px dashed ${C.line}`,
    background: C.bgVoid,
    letterSpacing: '0.12em',
  },
  historyScroll: {
    maxHeight: 360,
    overflowY: 'auto',
  },
  tableHead: {
    display: 'flex',
    gap: 12,
    padding: '8px 4px 10px',
    borderBottom: `1px solid ${C.bloodDeep}`,
    marginBottom: 4,
  },
  thCell: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 11,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: C.bloodBri,
    fontWeight: 700,
  },
  tableRow: {
    display: 'flex',
    gap: 12,
    padding: '12px 4px',
    borderBottom: `1px dotted ${C.lineDim}`,
    alignItems: 'center',
  },
  tdCell: { fontFamily: "'Special Elite', monospace", fontSize: 12 },
  trumpPill: {
    display: 'inline-flex',
    alignItems: 'center',
    background: C.bgVoid,
    padding: '4px 10px',
    border: '1px solid',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  editBtn: {
    background: 'transparent',
    border: `1px solid ${C.line}`,
    color: C.boneDim,
    width: 28, height: 28,
    cursor: 'pointer',
    fontSize: 13,
    transition: 'all 200ms ease',
  },

  // edit row
  editRow: {
    padding: '16px 12px',
    background: `linear-gradient(180deg, ${C.bloodInk}33, ${C.bgVoid})`,
    border: `1px solid ${C.bloodBri}`,
    boxShadow: `0 0 18px ${C.bloodBri}55, inset 0 0 20px ${C.bgVoid}`,
    margin: '6px 0',
  },
  editBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 12,
    borderBottom: `1px dashed ${C.line}`,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  editTrumpBtn: {
    background: C.bgVoid,
    border: `1px solid ${C.line}`,
    color: C.bone,
    padding: '6px 10px',
    fontFamily: "'IM Fell English SC', serif",
    cursor: 'pointer',
    transition: 'all 180ms ease',
    display: 'inline-flex',
    alignItems: 'center',
  },
  editGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  editCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  editColLabel: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: C.boneDim,
    fontWeight: 700,
  },
  editFieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
  },
  editInput: {
    background: C.bgVoid,
    border: `1px solid ${C.line}`,
    padding: '6px 10px',
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 700,
    fontSize: 18,
    outline: 'none',
  },
  editMatchBtn: {
    background: C.bgVoid,
    border: `1px solid ${C.line}`,
    color: C.boneDim,
    padding: '6px 12px',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontWeight: 700,
    cursor: 'pointer',
    width: 'fit-content',
    transition: 'all 180ms ease',
  },
  editActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    marginTop: 12,
    borderTop: `1px dashed ${C.line}`,
    flexWrap: 'wrap',
  },

  verdict: {
    position: 'fixed',
    inset: 0,
    background: `radial-gradient(ellipse at center, ${C.bloodInk}cc, ${C.bgVoid}f5)`,
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    animation: 'ch_fadeup 320ms ease-out',
    padding: 16,
  },
  verdictInner: {
    position: 'relative',
    background: `
      radial-gradient(ellipse at 18% 8%, ${C.paperLight}, ${C.paper} 60%, ${C.panel} 100%)
    `,
    padding: '44px 64px 36px',
    border: `1px solid ${C.bloodBri}`,
    boxShadow: `
      0 40px 100px ${C.bgVoid},
      inset 0 0 60px ${C.bloodInk}55,
      0 0 60px ${C.bloodBri}88,
      0 0 120px ${C.blood}55
    `,
    textAlign: 'center',
    color: C.bone,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    minWidth: 420,
  },
  verdictKicker: {
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: C.bloodBri,
    marginTop: 6,
    fontWeight: 700,
  },
  verdictName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 900,
    fontStyle: 'italic',
    fontSize: 76,
    color: C.bonePale,
    lineHeight: 1,
    textShadow: `
      2px 2px 0 ${C.bloodDeep},
      4px 4px 0 ${C.bgVoid},
      0 0 40px ${C.bloodBri}88,
      0 0 80px ${C.blood}55
    `,
  },
  verdictRule: {
    width: 90, height: 1,
    background: `linear-gradient(90deg, transparent, ${C.bloodBri}, transparent)`,
    margin: '4px 0 8px',
    boxShadow: `0 0 8px ${C.bloodBri}`,
  },

  footer: {
    textAlign: 'center',
    padding: '20px 0 0',
    fontFamily: "'IM Fell English SC', serif",
    fontSize: 12,
    letterSpacing: '0.1em',
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
