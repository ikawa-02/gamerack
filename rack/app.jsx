// rack/app.jsx
// Game Rack（Retro CRT）のメインアプリ。
// グローバル: React, ReactDOM, SAMPLE_GAMES, GENRES, PLATFORMS, STATUSES, I18N,
//             useTweaks, TweaksPanel, TweakSection, TweakRadio, t, Shelf, FormPanel,
//             GridCard, ConfirmDialog
const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = {
  theme: 'light',
  density: 'standard',
  rackStyle: 'spines',
  lang: 'ja'
};

// 初期サンプルの ID 一覧。手動追加ゲーム（Date.now()）と区別するために使う
const SAMPLE_IDS = new Set(window.SAMPLE_GAMES.map((g) => g.id));

// 設定パネル内に置くアクション用ボタン。tweaks/setTweak は親から
// cloneElement で注入されるが未使用なのでそのまま吸収する
function TweakAction({ label, danger, onClick }) {
  return (
    <button
      type="button"
      className={`pixel-btn small${danger ? ' danger' : ''}`}
      style={{ width: '100%' }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// URL hash の `#share=...` を検出し、デコード済みデータか null を返す
// （共有リンクで開かれた場合は閲覧モードに入るためのトリガになる）
function readShareFromHash() {
  try {
    const m = (window.location.hash || '').match(/^#share=(.+)$/);
    if (!m) return null;
    return window.decodeShareData(m[1]);
  } catch (_) { return null; }
}

// アプリのトップレベル。状態管理・フィルタ・ソート・ビュー切替を担う
function App() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  // 共有URLで開かれた場合は viewMode に { games, tweaks } が入り、編集機能を抑制する
  const [viewMode, setViewMode] = useState(() => readShareFromHash());
  const [games, setGames] = useState(() => {
    // 閲覧モードなら共有データのゲームを表示、通常時は localStorage→サンプルの順で復元
    if (viewMode && Array.isArray(viewMode.games)) return viewMode.games;
    try {
      const raw = localStorage.getItem('__gamerack_games__');
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
  const [view, setView] = useState('rack');
  const [confirmDelete, setConfirmDelete] = useState(null); // 削除確認対象
  const [confirmClearSamples, setConfirmClearSamples] = useState(false); // サンプル一括削除の確認
  const [importPending, setImportPending] = useState(null); // インポート確認待ちのデータ
  const [quotaError, setQuotaError] = useState(false); // localStorage 容量超過の表示
  const [shareInfo, setShareInfo] = useState(null); // 共有URL生成結果（{url,bytes,copied}）
  const [confirmImportViewed, setConfirmImportViewed] = useState(false); // 閲覧中ラックを取り込む確認
  const [dragId, setDragId] = useState(null); // ドラッグ中のゲームID（棚跨ぎ判定にも使う）
  const importFileRef = useRef(null);

  const lang = tweaks.lang || 'ja';

  // 状態保存（テーマ・密度・ラックスタイルは html 属性へ反映）
  // 過去に CRT/AMBER 等を保存していた人向けに、想定外の値は light に正規化する
  useEffect(() => {
    const theme = (tweaks.theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', tweaks.density || 'standard');
    document.documentElement.setAttribute('data-rack-style', tweaks.rackStyle || 'spines');
  }, [tweaks.theme, tweaks.density, tweaks.rackStyle]);

  // ゲームリストの永続化（容量超過は QuotaExceededError として通知）
  // 閲覧モードでは共有データを表示しているだけなので保存しない
  useEffect(() => {
    if (viewMode) return;
    try {
      localStorage.setItem('__gamerack_games__', JSON.stringify(games));
    } catch (err) {
      // Safari は QUOTA_EXCEEDED_ERR(22)、他は name === 'QuotaExceededError'
      if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
        setQuotaError(true);
      } else {
        console.error('localStorage save failed', err);
      }
    }
  }, [games, viewMode]);

  // 検索・フィルタ・ソートを適用したリスト
  const filtered = useMemo(() => {
    let r = games.slice();
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((g) => g.title.toLowerCase().includes(s) || g.title_en.toLowerCase().includes(s));
    }
    if (genreFilter) r = r.filter((g) => g.genre === genreFilter);
    if (platformFilter) r = r.filter((g) => g.platform === platformFilter);
    const [field, dir] = sortBy.split('_');
    // manual はソートをかけず games 配列の順序そのままを採用する（ドラッグ並び替えの結果がそのまま反映される）
    if (field !== 'manual') {
      const sign = dir === 'asc' ? 1 : -1;
      r.sort((a, b) => {
        if (field === 'released') return sign * (new Date(a.released) - new Date(b.released));
        if (field === 'playtime') return sign * (a.playtime - b.playtime);
        if (field === 'rating') return sign * (a.rating - b.rating);
        if (field === 'title') return sign * a.title.localeCompare(b.title, 'ja');
        return 0;
      });
    }
    return r;
  }, [games, search, genreFilter, platformFilter, sortBy]);

  // ジャンルクラスタごとに棚へ振り分け
  const shelves = useMemo(() => {
    const a = filtered.filter((g) => ['rpg', 'adventure'].includes(g.genre));
    const b = filtered.filter((g) => ['action', 'shooter'].includes(g.genre));
    const c = filtered.filter((g) => !['rpg', 'adventure', 'action', 'shooter'].includes(g.genre));
    return [
      { id: 'a', label: window.t(lang, 'shelfA'), games: a },
      { id: 'b', label: window.t(lang, 'shelfB'), games: b },
      { id: 'c', label: window.t(lang, 'shelfC'), games: c }
    ];
  }, [filtered, lang]);

  // 集計（登録数・総時間・状態別カウント）
  const stats = useMemo(() => {
    const total = games.length;
    const hours = games.reduce((s, g) => s + (g.playtime || 0), 0);
    const cleared = games.filter((g) => g.status === 'cleared').length;
    const playing = games.filter((g) => g.status === 'playing').length;
    const backlog = games.filter((g) => g.status === 'backlog').length;
    return { total, hours, cleared, playing, backlog };
  }, [games]);

  // 閲覧モードでは追加・編集を完全に無効化する
  const openAdd = () => { if (viewMode) return; setEditing(null); setPanelOpen(true); };
  const openEdit = (g) => { if (viewMode) return; setEditing(g); setPanelOpen(true); setOpenId(null); };

  // 保存（既存なら更新、なければ先頭に追加）
  const onSave = (g) => {
    setGames((prev) => {
      const i = prev.findIndex((x) => x.id === g.id);
      if (i >= 0) { const n = prev.slice(); n[i] = g; return n; }
      return [g, ...prev];
    });
    setPanelOpen(false);
  };

  // 削除はネイティブ confirm を使わず、レトロ風カスタムダイアログで確認
  const askDelete = (g) => { setConfirmDelete(g); setOpenId(null); };
  const doDelete = () => {
    if (!confirmDelete) return;
    setGames((prev) => prev.filter((x) => x.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  // 棚内のドラッグ並び替え。dragId のゲームを dropId の直前に挿入する。
  // ソートが auto 系のままだと表示は変わらないので、自動的に MANUAL に切り替える
  const onReorder = (draggedId, targetId) => {
    if (viewMode) return;
    if (!draggedId || !targetId || draggedId === targetId) return;
    setGames((prev) => {
      const di = prev.findIndex((g) => g.id === draggedId);
      if (di < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(di, 1);
      const ti = next.findIndex((g) => g.id === targetId);
      if (ti < 0) return prev;
      next.splice(ti, 0, moved);
      return next;
    });
    if (sortBy !== 'manual_asc') setSortBy('manual_asc');
  };

  // 残っている初期サンプルの件数。0 件なら設定パネルのボタンを隠す
  const sampleCount = useMemo(
    () => games.filter((g) => SAMPLE_IDS.has(g.id)).length,
    [games]
  );

  // サンプル一括削除（手動追加ゲームは残す）
  const doClearSamples = () => {
    setGames((prev) => prev.filter((g) => !SAMPLE_IDS.has(g.id)));
    setConfirmClearSamples(false);
    setOpenId(null);
  };

  // 現在の保存サイズ（推定）。設定パネルにバイト数として表示する
  const storageBytes = useMemo(
    () => JSON.stringify(games).length + JSON.stringify(tweaks).length,
    [games, tweaks]
  );
  const storageLabel = storageBytes < 1024
    ? `${storageBytes} B`
    : storageBytes < 1024 * 1024
      ? `${(storageBytes / 1024).toFixed(1)} KB`
      : `${(storageBytes / (1024 * 1024)).toFixed(2)} MB`;

  // 全データを JSON ファイルとして書き出す（バックアップ・他端末への移行・他人と共有）
  const onExport = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      games,
      tweaks
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamerack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // インポート用ファイル選択を起動
  const onPickImport = () => {
    if (importFileRef.current) importFileRef.current.click();
  };

  // 選択されたファイルを読み、形式を検証してから確認ダイアログへ渡す
  const onImportFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || !Array.isArray(parsed.games)) throw new Error('invalid shape');
        setImportPending(parsed);
      } catch (_) {
        alert(window.t(lang, 'importInvalid'));
      }
    };
    reader.onerror = () => alert(window.t(lang, 'importInvalid'));
    reader.readAsText(f);
  };

  // インポート確定。ゲームと tweaks を完全置換する
  const doImport = () => {
    if (!importPending) return;
    setGames(importPending.games);
    if (importPending.tweaks && typeof importPending.tweaks === 'object') {
      setTweak(importPending.tweaks);
    }
    setImportPending(null);
    setOpenId(null);
  };

  // 共有URLを生成してクリップボードへコピー（失敗時はダイアログ内のテキストエリアから手動コピー）
  // 画像も含めて URL に詰めるため、サイズが大きくなる場合がある旨はダイアログ側で警告する
  const onShare = async () => {
    try {
      const encoded = window.encodeShareData(games, tweaks);
      const base = `${window.location.origin}${window.location.pathname}`;
      const url = `${base}#share=${encoded}`;
      const bytes = url.length;
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
      } catch (_) { /* fall through to manual-copy in dialog */ }
      setShareInfo({ url, bytes, copied });
    } catch (err) {
      console.error('share encoding failed', err);
      alert(window.t(lang, 'shareFailed'));
    }
  };

  // 閲覧モードを抜ける。hash を消してリロードし、自分のラック表示へ戻す
  const exitViewMode = () => {
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (_) {}
    window.location.reload();
  };

  // 閲覧中の共有ラックを自分のものとして取り込む。
  // localStorage に直接書き、hash を消してから reload することで通常モードへ戻る
  const doImportViewed = () => {
    if (!viewMode) return;
    try {
      localStorage.setItem('__gamerack_games__', JSON.stringify(viewMode.games));
      if (viewMode.tweaks && typeof viewMode.tweaks === 'object') {
        const merged = { ...tweaks, ...viewMode.tweaks };
        localStorage.setItem('__gamerack_tweaks__', JSON.stringify(merged));
      }
    } catch (err) {
      if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
        setConfirmImportViewed(false);
        setQuotaError(true);
        return;
      }
      console.error('import viewed failed', err);
    }
    setConfirmImportViewed(false);
    exitViewMode();
  };

  return (
    <div className="app">
      {viewMode && (
        <div className="view-banner" role="status">
          <div className="view-banner-text">
            <b>{window.t(lang, 'viewBanner')}</b>
            <span>{window.t(lang, 'viewBannerSub')}</span>
          </div>
          <div className="view-banner-actions">
            <button className="pixel-btn primary small" onClick={() => setConfirmImportViewed(true)}>
              {window.t(lang, 'importViewed')}
            </button>
            <button className="pixel-btn ghost small" onClick={exitViewMode}>
              {window.t(lang, 'exitView')}
            </button>
          </div>
        </div>
      )}
      <header className="header">
        <div className="brand-mark">
          <div className="brand-pixel" aria-hidden="true"></div>
          <div className="brand-text">
            <h1>{window.t(lang, 'appTitle')}<span className="blink"></span></h1>
            <p>▸ {window.t(lang, 'subtitle')}</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="lang-switch">
            <button className={lang === 'ja' ? 'active' : ''} onClick={() => setTweak('lang', 'ja')}>JA</button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setTweak('lang', 'en')}>EN</button>
          </div>
          {!viewMode && (
            <button className="pixel-btn primary" onClick={openAdd}>{window.t(lang, 'addGame')}</button>
          )}
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <div className="label">{window.t(lang, 'totalGames')}</div>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat">
          <div className="label">{window.t(lang, 'totalHours')}</div>
          <div className="value">{stats.hours}<span className="unit">{window.t(lang, 'hours')}</span></div>
        </div>
        <div className="stat cleared">
          <div className="label">{window.t(lang, 'cleared')}</div>
          <div className="value">{stats.cleared}</div>
          <div className="bar"><span style={{ width: `${(stats.cleared / Math.max(stats.total, 1)) * 100}%`, background: 'var(--green)' }}></span></div>
        </div>
        <div className="stat playing">
          <div className="label">{window.t(lang, 'playing')}</div>
          <div className="value">{stats.playing}</div>
          <div className="bar"><span style={{ width: `${(stats.playing / Math.max(stats.total, 1)) * 100}%`, background: 'var(--yellow)' }}></span></div>
        </div>
        <div className="stat backlog">
          <div className="label">{window.t(lang, 'backlog')}</div>
          <div className="value">{stats.backlog}</div>
          <div className="bar"><span style={{ width: `${(stats.backlog / Math.max(stats.total, 1)) * 100}%`, background: '#a3a3a3' }}></span></div>
        </div>
      </section>

      <section className="filters">
        <input placeholder={window.t(lang, 'search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
          <option value="">{window.t(lang, 'allGenres')}</option>
          {window.GENRES.map((g) => <option key={g.id} value={g.id}>{lang === 'en' ? g.en : g.ja}</option>)}
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
          <option value="">{window.t(lang, 'allPlatforms')}</option>
          {window.PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="manual_asc">{window.t(lang, 'sortManual')}</option>
          <option value="released_desc">{window.t(lang, 'sortReleased')} ↓</option>
          <option value="released_asc">{window.t(lang, 'sortReleased')} ↑</option>
          <option value="playtime_desc">{window.t(lang, 'sortPlaytime')} ↓</option>
          <option value="playtime_asc">{window.t(lang, 'sortPlaytime')} ↑</option>
          <option value="rating_desc">{window.t(lang, 'sortRating')} ↓</option>
          <option value="title_asc">{window.t(lang, 'sortTitle')} A→Z</option>
        </select>
        <select value={tweaks.rackStyle} onChange={(e) => setTweak('rackStyle', e.target.value)}>
          <option value="spines">SPINES</option>
          <option value="catalog">CATALOG</option>
          <option value="tilted">TILTED</option>
        </select>
        <div className="view-toggle">
          <button className={view === 'rack' ? 'active' : ''} onClick={() => setView('rack')}>{window.t(lang, 'rackView')}</button>
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>{window.t(lang, 'gridView')}</button>
        </div>
      </section>

      {view === 'rack' ? (
        <section className="shelves">
          {shelves.map((s) => (
            <window.Shelf key={s.id} label={s.label} games={s.games} lang={lang}
              openId={openId}
              onOpen={setOpenId}
              onClose={() => setOpenId(null)}
              onEdit={openEdit}
              onDelete={askDelete}
              readOnly={!!viewMode}
              dragId={dragId}
              setDragId={setDragId}
              onReorder={onReorder}
            />
          ))}
        </section>
      ) : (
        <section className="grid-view">
          {filtered.map((g) =>
            <window.GridCard key={g.id} game={g} lang={lang}
              onClick={viewMode ? () => {} : () => openEdit(g)} />
          )}
        </section>
      )}

      <window.FormPanel open={panelOpen} onClose={() => setPanelOpen(false)} onSave={onSave} editing={editing} lang={lang} />

      <window.ConfirmDialog
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

      <window.ConfirmDialog
        open={confirmClearSamples}
        lang={lang}
        title={window.t(lang, 'clearSamplesTitle')}
        message={window.t(lang, 'clearSamplesMsg')}
        target={`${sampleCount} ${lang === 'ja' ? '件のサンプル' : 'samples'}`}
        confirmLabel={window.t(lang, 'clearSamplesConfirm')}
        cancelLabel={lang === 'ja' ? 'キャンセル' : 'CANCEL'}
        onCancel={() => setConfirmClearSamples(false)}
        onConfirm={doClearSamples}
      />

      <window.ConfirmDialog
        open={!!importPending}
        lang={lang}
        title={window.t(lang, 'importTitle')}
        message={window.t(lang, 'importMsg')}
        target={importPending ? `${importPending.games.length} ${lang === 'ja' ? '件' : 'games'}` : ''}
        confirmLabel={window.t(lang, 'importConfirm')}
        cancelLabel={lang === 'ja' ? 'キャンセル' : 'CANCEL'}
        onCancel={() => setImportPending(null)}
        onConfirm={doImport}
      />

      <window.ConfirmDialog
        open={quotaError}
        lang={lang}
        single
        title={window.t(lang, 'quotaTitle')}
        message={window.t(lang, 'quotaMsg')}
        confirmLabel={window.t(lang, 'quotaOk')}
        onCancel={() => setQuotaError(false)}
        onConfirm={() => setQuotaError(false)}
      />

      <window.ConfirmDialog
        open={confirmImportViewed}
        lang={lang}
        title={window.t(lang, 'importViewedTitle')}
        message={window.t(lang, 'importViewedMsg')}
        target={viewMode ? `${viewMode.games.length} ${lang === 'ja' ? '件' : 'games'}` : ''}
        confirmLabel={window.t(lang, 'importConfirm')}
        cancelLabel={lang === 'ja' ? 'キャンセル' : 'CANCEL'}
        onCancel={() => setConfirmImportViewed(false)}
        onConfirm={doImportViewed}
      />

      <window.ShareDialog
        open={!!shareInfo}
        lang={lang}
        url={shareInfo ? shareInfo.url : ''}
        bytes={shareInfo ? shareInfo.bytes : 0}
        copied={shareInfo ? shareInfo.copied : false}
        onClose={() => setShareInfo(null)}
      />

      <input
        ref={importFileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={onImportFile}
      />

      <window.TweaksPanel tweaks={tweaks} setTweak={setTweak}>
        <window.TweakSection title={lang === 'ja' ? '外観' : 'Appearance'}>
          <window.TweakRadio tweakKey="theme" label={lang === 'ja' ? 'テーマ' : 'Theme'}
            options={[
              { value: 'light', label: 'LIGHT' },
              { value: 'dark', label: 'DARK' }
            ]} />
          <window.TweakRadio tweakKey="density" label={lang === 'ja' ? 'カード密度' : 'Density'}
            options={[{ value: 'compact', label: 'COMPACT' }, { value: 'standard', label: 'STANDARD' }, { value: 'cozy', label: 'COZY' }]} />
          <window.TweakRadio tweakKey="rackStyle" label={lang === 'ja' ? 'ラック陳列' : 'Rack style'}
            options={[{ value: 'spines', label: 'SPINES' }, { value: 'catalog', label: 'CATALOG' }, { value: 'tilted', label: 'TILTED' }]} />
          <window.TweakRadio tweakKey="lang" label={lang === 'ja' ? '言語' : 'Language'}
            options={[{ value: 'ja', label: '日本語' }, { value: 'en', label: 'EN' }]} />
        </window.TweakSection>
        {!viewMode && (
          <window.TweakSection title={window.t(lang, 'dataSection')}>
            <TweakAction label={window.t(lang, 'exportBtn')} onClick={onExport} />
            <TweakAction label={window.t(lang, 'importBtn')} onClick={onPickImport} />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              padding: '2px 2px 0',
              color: 'rgba(41,38,27,.55)'
            }}>
              <span>{window.t(lang, 'storageUsage')}</span>
              <span>{storageLabel}</span>
            </div>
            {sampleCount > 0 && (
              <TweakAction
                danger
                label={`${window.t(lang, 'clearSamples')} (${sampleCount})`}
                onClick={() => setConfirmClearSamples(true)}
              />
            )}
          </window.TweakSection>
        )}
        {!viewMode && (
          <window.TweakSection title={window.t(lang, 'shareSection')}>
            <TweakAction label={window.t(lang, 'shareBtn')} onClick={onShare} />
          </window.TweakSection>
        )}
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
