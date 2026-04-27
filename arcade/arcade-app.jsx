// arcade/arcade-app.jsx
// Arcade Neon — フルインタラクティブ版。
// 各ゲームをアーケード筐体（マーキー＋スクリーン＋コントロールパネル）として表現する。
// 削除はネオン警告ダイアログで確認（Esc/Enter キー対応）。

const { useState, useEffect, useRef, useMemo } = React;

const ARCADE_DEFAULTS = {
  density: 'standard',
  lang: 'ja'
};

const arcT = (lang, key) => (window.I18N[lang] && window.I18N[lang][key]) || key;
const arcGenre = (id) => window.GENRES.find((g) => g.id === id);
const arcStatus = (id) => window.STATUSES.find((s) => s.id === id);

// 評価の星表示
function ArcStars({ n, max = 5 }) {
  return (
    <span className="rating-stars">
      {Array.from({ length: max }).map((_, i) =>
        <span key={i} className={i < n ? '' : 'empty'}>{i < n ? '★' : '☆'}</span>
      )}
    </span>
  );
}

// 削除確認のカスタムポップアップ。Esc=キャンセル、Enter=確定
function ConfirmDialog({ open, title, message, target, confirmLabel, cancelLabel, onConfirm, onCancel, lang }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <span>⚠ {lang === 'ja' ? '確認' : 'WARNING'}</span>
          <span className="blink-warn"></span>
        </div>
        <div className="body">
          <div className="title">{title}</div>
          <div className="msg">{message}</div>
          {target && <div className="target">▸ {target}</div>}
        </div>
        <div className="foot">
          <button className="neon-btn small" onClick={onCancel}>{cancelLabel || (lang === 'ja' ? 'キャンセル' : 'CANCEL')}</button>
          <button className="neon-btn red small" onClick={onConfirm}>{confirmLabel || (lang === 'ja' ? '削除' : 'DELETE')}</button>
        </div>
      </div>
    </div>
  );
}

// アーケード筐体カード（マーキー＋スクリーン＋ボタン群＋クレジット表示）
function Cabinet({ game, onClick, onDelete, lang }) {
  const title = lang === 'en' ? game.title_en : game.title;
  const g = arcGenre(game.genre);
  return (
    <div className="cab" style={{ '--c': game.color }} data-status={game.status} onClick={onClick}>
      <div className="status-badge">{arcStatus(game.status) ? (lang === 'en' ? arcStatus(game.status).en : arcStatus(game.status).ja).toUpperCase() : ''}</div>
      <button className="del-x" onClick={(e) => { e.stopPropagation(); onDelete(); }} title={lang === 'ja' ? '削除' : 'Delete'}>×</button>
      <div className="marquee">{title}</div>
      <div className="screen">
        {game.image
          ? <img src={game.image} alt="" />
          : <div className="screen-meta">
              <div className="top"><span>● REC</span><span>{game.platform}</span></div>
              <div className="bottom">▸ {(g ? (lang === 'en' ? g.en : g.ja) : '').toUpperCase()}</div>
            </div>}
      </div>
      <div className="controls">
        <span className="btn-dot"></span>
        <span className="btn-dot"></span>
        <span className="stick"></span>
        <span className="btn-dot"></span>
        <span className="btn-dot"></span>
      </div>
      <div className="credit">{game.platform} · {game.released ? game.released.slice(0, 4) : '----'} · {game.playtime}H</div>
    </div>
  );
}

// 詳細オーバーレイ（クリックで開く）
function ArcDetail({ game, onClose, onEdit, onDelete, lang }) {
  if (!game) return null;
  const title = lang === 'en' ? game.title_en : game.title;
  const g = arcGenre(game.genre);
  const s = arcStatus(game.status);
  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-card" style={{ '--c': game.color }} onClick={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose}>×</button>
        <div className="cover-art">
          {game.image
            ? <img src={game.image} alt="" />
            : <div className="placeholder">{title}<br/><span style={{ fontSize: 11, opacity: 0.7 }}>NO IMAGE</span></div>}
        </div>
        <div className="info">
          <h2>{title}</h2>
          <div className="row"><b>{arcT(lang, 'fGenre')}</b><span>{g ? (lang === 'en' ? g.en : g.ja) : '-'}</span></div>
          <div className="row"><b>{arcT(lang, 'fPlatform')}</b><span>{game.platform}</span></div>
          <div className="row"><b>{arcT(lang, 'released')}</b><span>{game.released}</span></div>
          <div className="row"><b>{arcT(lang, 'playtime')}</b><span>{game.playtime}{arcT(lang, 'hours')}</span></div>
          <div className="row"><b>{arcT(lang, 'fStatus')}</b><span style={{ color: s ? s.color : 'inherit' }}>{s ? (lang === 'en' ? s.en : s.ja) : '-'}</span></div>
          <div className="row"><b>{arcT(lang, 'rating')}</b><ArcStars n={game.rating} /></div>
          <div className="actions">
            <button className="neon-btn small" onClick={onEdit}>{lang === 'ja' ? '編集' : 'EDIT'}</button>
            <button className="neon-btn red small" onClick={onDelete}>{lang === 'ja' ? '削除' : 'DELETE'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// サイドパネルフォーム（追加・編集）
function ArcForm({ open, onClose, onSave, editing, lang }) {
  const empty = { title: '', title_en: '', genre: 'rpg', platform: 'PS5', released: '', playtime: 0, status: 'playing', rating: 3, color: '#ff00ff', image: null, spineStyle: 'stripe' };
  const [data, setData] = useState(empty);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (editing) setData({ ...empty, ...editing });
    else setData(empty);
  }, [editing, open]);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setData((d) => ({ ...d, image: ev.target.result }));
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  // 画像のみ削除（確認ダイアログ後）
  const removeImage = () => {
    setData((d) => ({ ...d, image: null }));
    setConfirmDel(false);
  };

  const submit = () => {
    if (!data.title.trim()) return;
    onSave({
      ...data,
      title_en: data.title_en || data.title,
      id: data.id || Date.now(),
      playtime: Number(data.playtime) || 0,
      rating: Number(data.rating) || 0
    });
  };

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={onClose}></div>
      <aside className={`side-panel ${open ? 'open' : ''}`}>
        <div className="panel-head">
          <h2>▸ {arcT(lang, 'formTitle')}</h2>
          <button className="neon-btn small" onClick={onClose}>×</button>
        </div>
        <div className="panel-body">
          <div className="field">
            <label>{arcT(lang, 'fImage')}</label>
            <div className={`upload ${data.image ? 'has-image' : ''}`} onClick={() => fileRef.current && fileRef.current.click()}>
              {data.image
                ? <img src={data.image} alt="" />
                : <>
                    <div className="upload-tag">▸ INSERT IMAGE</div>
                    <div>{arcT(lang, 'fImageHint')}</div>
                  </>}
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} />
            </div>
            {data.image && (
              <div className="image-controls">
                <button className="neon-btn small" onClick={(e) => { e.stopPropagation(); fileRef.current && fileRef.current.click(); }}>
                  {lang === 'ja' ? '差し替え' : 'REPLACE'}
                </button>
                <button className="neon-btn red small" onClick={(e) => { e.stopPropagation(); setConfirmDel(true); }}>
                  {lang === 'ja' ? '画像を削除' : 'DELETE IMAGE'}
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label>{arcT(lang, 'fTitle')}</label>
            <input type="text" value={data.title} onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))} placeholder="ENTER TITLE..." />
          </div>

          <div className="field-row">
            <div className="field">
              <label>{arcT(lang, 'fGenre')}</label>
              <select value={data.genre} onChange={(e) => {
                const gn = arcGenre(e.target.value);
                setData((d) => ({ ...d, genre: e.target.value, color: gn ? gn.color : d.color }));
              }}>
                {window.GENRES.map((g) => <option key={g.id} value={g.id}>{lang === 'en' ? g.en : g.ja}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{arcT(lang, 'fPlatform')}</label>
              <select value={data.platform} onChange={(e) => setData((d) => ({ ...d, platform: e.target.value }))}>
                {window.PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>{arcT(lang, 'fReleased')}</label>
              <input type="date" value={data.released} onChange={(e) => setData((d) => ({ ...d, released: e.target.value }))} />
            </div>
            <div className="field">
              <label>{arcT(lang, 'fPlaytime')}</label>
              <input type="number" min="0" value={data.playtime} onChange={(e) => setData((d) => ({ ...d, playtime: e.target.value }))} />
            </div>
          </div>

          <div className="field">
            <label>{arcT(lang, 'fStatus')}</label>
            <div className="status-pills">
              {window.STATUSES.map((s) =>
                <button key={s.id} className={data.status === s.id ? 'on' : ''} onClick={() => setData((d) => ({ ...d, status: s.id }))}>
                  {lang === 'en' ? s.en : s.ja}
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label>{arcT(lang, 'fRating')}</label>
            <div className="rating-input">
              {[1, 2, 3, 4, 5].map((n) =>
                <button key={n} className={data.rating >= n ? 'on' : ''} onClick={() => setData((d) => ({ ...d, rating: n }))}>★</button>
              )}
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <button className="neon-btn small" onClick={onClose}>{arcT(lang, 'cancel')}</button>
          <button className="neon-btn pink small" onClick={submit}>▸ {arcT(lang, 'save')}</button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDel}
        lang={lang}
        title={lang === 'ja' ? '画像を削除しますか？' : 'Delete image?'}
        message={lang === 'ja' ? 'アップロードした画像を削除します。この操作は取り消せません。' : 'The uploaded image will be removed. This cannot be undone.'}
        confirmLabel={lang === 'ja' ? '削除する' : 'DELETE'}
        cancelLabel={lang === 'ja' ? 'キャンセル' : 'CANCEL'}
        onCancel={() => setConfirmDel(false)}
        onConfirm={removeImage}
      />
    </>
  );
}

// メインアプリ。状態・フィルタ・ソート・削除確認を統合する
function ArcadeApp() {
  const [tweaks, setTweak] = window.useTweaks(ARCADE_DEFAULTS);
  const [games, setGames] = useState(() => {
    try {
      const raw = localStorage.getItem('__gamearcade_games__');
      return raw ? JSON.parse(raw) : window.SAMPLE_GAMES.slice();
    } catch (_) { return window.SAMPLE_GAMES.slice(); }
  });
  const [openId, setOpenId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [sortBy, setSortBy] = useState('released_desc');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const lang = tweaks.lang || 'ja';

  useEffect(() => {
    document.documentElement.setAttribute('data-density', tweaks.density || 'standard');
  }, [tweaks.density]);

  useEffect(() => {
    try { localStorage.setItem('__gamearcade_games__', JSON.stringify(games)); } catch (_) {}
  }, [games]);

  const filtered = useMemo(() => {
    let r = games.slice();
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((g) => g.title.toLowerCase().includes(s) || g.title_en.toLowerCase().includes(s));
    }
    if (genreFilter) r = r.filter((g) => g.genre === genreFilter);
    if (platformFilter) r = r.filter((g) => g.platform === platformFilter);
    const [field, dir] = sortBy.split('_');
    const sign = dir === 'asc' ? 1 : -1;
    r.sort((a, b) => {
      if (field === 'released') return sign * (new Date(a.released) - new Date(b.released));
      if (field === 'playtime') return sign * (a.playtime - b.playtime);
      if (field === 'rating') return sign * (a.rating - b.rating);
      if (field === 'title') return sign * a.title.localeCompare(b.title, 'ja');
      return 0;
    });
    return r;
  }, [games, search, genreFilter, platformFilter, sortBy]);

  const stats = useMemo(() => {
    const total = games.length;
    const hours = games.reduce((s, g) => s + (g.playtime || 0), 0);
    const cleared = games.filter((g) => g.status === 'cleared').length;
    const playing = games.filter((g) => g.status === 'playing').length;
    const backlog = games.filter((g) => g.status === 'backlog').length;
    return { total, hours, cleared, playing, backlog };
  }, [games]);

  const openAdd = () => { setEditing(null); setPanelOpen(true); };
  const openEdit = (g) => { setEditing(g); setPanelOpen(true); setOpenId(null); };
  const onSave = (g) => {
    setGames((prev) => {
      const i = prev.findIndex((x) => x.id === g.id);
      if (i >= 0) { const n = prev.slice(); n[i] = g; return n; }
      return [g, ...prev];
    });
    setPanelOpen(false);
  };
  const askDelete = (g) => { setConfirmDelete(g); setOpenId(null); };
  const doDelete = () => {
    if (!confirmDelete) return;
    setGames((prev) => prev.filter((x) => x.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  const openGame = games.find((g) => g.id === openId);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>GAME ARCADE</h1>
          <div className="subtitle">▸ PERSONAL CABINET COLLECTION ◂</div>
        </div>
        <div className="header-actions">
          <a className="back-link" href="../index.html">▸ HOME</a>
          <div className="lang-switch">
            <button className={lang === 'ja' ? 'active' : ''} onClick={() => setTweak('lang', 'ja')}>JA</button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setTweak('lang', 'en')}>EN</button>
          </div>
          <button className="neon-btn pink" onClick={openAdd}>+ INSERT COIN</button>
        </div>
      </header>

      <section className="hi-scores">
        <div className="score">
          <div className="lbl">{arcT(lang, 'totalGames')}</div>
          <div className="val">{String(stats.total).padStart(3, '0')}</div>
        </div>
        <div className="score">
          <div className="lbl">{arcT(lang, 'totalHours')}</div>
          <div className="val">{stats.hours}<span className="unit">H</span></div>
        </div>
        <div className="score cleared">
          <div className="lbl">{arcT(lang, 'cleared')}</div>
          <div className="val">{String(stats.cleared).padStart(3, '0')}</div>
        </div>
        <div className="score playing">
          <div className="lbl">{arcT(lang, 'playing')}</div>
          <div className="val">{String(stats.playing).padStart(3, '0')}</div>
        </div>
        <div className="score">
          <div className="lbl">{arcT(lang, 'backlog')}</div>
          <div className="val">{String(stats.backlog).padStart(3, '0')}</div>
        </div>
      </section>

      <section className="filters">
        <input placeholder={`▸ ${arcT(lang, 'search')}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
          <option value="">▸ {arcT(lang, 'allGenres')}</option>
          {window.GENRES.map((g) => <option key={g.id} value={g.id}>{lang === 'en' ? g.en : g.ja}</option>)}
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
          <option value="">▸ {arcT(lang, 'allPlatforms')}</option>
          {window.PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="released_desc">{arcT(lang, 'sortReleased')} ↓</option>
          <option value="released_asc">{arcT(lang, 'sortReleased')} ↑</option>
          <option value="playtime_desc">{arcT(lang, 'sortPlaytime')} ↓</option>
          <option value="playtime_asc">{arcT(lang, 'sortPlaytime')} ↑</option>
          <option value="rating_desc">{arcT(lang, 'sortRating')} ↓</option>
          <option value="title_asc">{arcT(lang, 'sortTitle')} A→Z</option>
        </select>
        <button className="neon-btn yellow small" onClick={() => { setSearch(''); setGenreFilter(''); setPlatformFilter(''); }}>RESET</button>
      </section>

      <section className="cabinets">
        {filtered.map((g) =>
          <Cabinet key={g.id} game={g} lang={lang}
            onClick={() => setOpenId(g.id)}
            onDelete={() => askDelete(g)}
          />
        )}
        <div className="coin-slot" onClick={openAdd}>
          ▸ INSERT COIN ◂<br/>
          <span style={{ fontSize: 8, opacity: 0.7, letterSpacing: '0.15em' }}>{lang === 'ja' ? '新しいゲームを追加' : 'ADD NEW GAME'}</span>
        </div>
      </section>

      <ArcDetail
        game={openGame}
        lang={lang}
        onClose={() => setOpenId(null)}
        onEdit={() => openGame && openEdit(openGame)}
        onDelete={() => openGame && askDelete(openGame)}
      />

      <ArcForm open={panelOpen} onClose={() => setPanelOpen(false)} onSave={onSave} editing={editing} lang={lang} />

      <ConfirmDialog
        open={!!confirmDelete}
        lang={lang}
        title={lang === 'ja' ? 'ゲームを削除しますか？' : 'Delete this game?'}
        message={lang === 'ja' ? '記録を削除すると元には戻せません。本当に削除しますか？' : 'This record will be permanently removed. Are you sure?'}
        target={confirmDelete ? (lang === 'en' ? confirmDelete.title_en : confirmDelete.title) : ''}
        confirmLabel={lang === 'ja' ? '削除する' : 'DELETE'}
        cancelLabel={lang === 'ja' ? 'キャンセル' : 'CANCEL'}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />

      <window.TweaksPanel tweaks={tweaks} setTweak={setTweak}>
        <window.TweakSection title={lang === 'ja' ? '言語' : 'Language'}>
          <window.TweakRadio tweakKey="lang" label={lang === 'ja' ? '言語' : 'Lang'}
            options={[{ value: 'ja', label: '日本語' }, { value: 'en', label: 'EN' }]} />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ArcadeApp />);
