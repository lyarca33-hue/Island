import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { bookmark, LIVRES, setBookmark } from '../game/items/livres';

/**
 * Un livre d'histoire ouvert : le titre, une page à la fois, on tourne les pages, on pose le
 * marque-page. On rouvre à la page du marque-page. Arriver à la dernière page, c'est finir le
 * livre (l'humeur monte, voir Game.finishBook).
 */
export function BookReader({ game, id, onClose }: { game: Game; id: string; onClose: () => void }) {
  const book = LIVRES[id];
  const last = book.pages.length - 1;
  const [mark, setMark] = useState(() => bookmark(id));
  const [page, setPage] = useState(() => Math.min(mark ?? 0, last));
  // fini une fois par ouverture du livre
  const done = useRef(false);

  useEffect(() => {
    if (page === last && !done.current) {
      done.current = true;
      game.finishBook(id);
      // histoire finie : le marque-page n'a plus lieu d'être
      setBookmark(id, null);
      setMark(null);
    }
  }, [page, last, game, id]);

  const toggleMark = () => {
    const next = mark === page ? null : page;
    setBookmark(id, next);
    setMark(next);
  };

  return (
    <div className="inv-panel book-reader" role="dialog" aria-label={book.title}>
      <div className="inv-head">
        <span className="book-title">
          <b>{book.title}</b>
          <small>{book.author}</small>
        </span>
        <button className="inv-x" onClick={onClose} aria-label="Fermer le livre">✕</button>
      </div>
      <div className="book-page">
        {mark === page && <span className="book-ribbon" aria-hidden="true" />}
        <p>{book.pages[page]}</p>
      </div>
      <div className="book-nav">
        <button onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Page précédente">‹</button>
        <small>
          Page {page + 1} / {last + 1}
        </small>
        <button onClick={() => setPage(page + 1)} disabled={page === last} aria-label="Page suivante">›</button>
      </div>
      <button className="inv-close book-mark" onClick={toggleMark} disabled={page === last && mark !== page}>
        {mark === page ? 'Retirer le marque-page' : mark !== null ? `Déplacer le marque-page ici (page ${mark + 1})` : 'Poser le marque-page ici'}
      </button>
    </div>
  );
}
