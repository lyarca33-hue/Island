import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { euros, groceryAisle, type OrderLine, orderTotal, priceOf } from '../game/argent';
import type { Game } from '../game/Game';
import { ITEM_BY_ID } from '../game/items/catalog';
import './magasin.css';

type Tab = 'epicerie' | 'maison' | 'marche';
const TABS: Array<[Tab, string]> = [['epicerie', 'Épicerie'], ['maison', 'Maison'], ['marche', 'Vendre au marché']];

/** Le panier de départ : ce qui manque sur la liste de courses. */
function fromList(game: Game): Record<string, number> {
  const cart: Record<string, number> = {};
  const aisle = groceryAisle();
  for (const [name, n] of game.shoppingList()) {
    const def = aisle.find((d) => d.name === name);
    if (def) cart[def.id] = n;
  }
  return cart;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

/**
 * Le magasin, ouvert par la liste de courses (ou le porte-monnaie) : l'épicerie (le panier part
 * de ce qui manque sur la liste), le rayon maison (objets cassés, pastilles, vaisselle) et le
 * marché, qui rachète légumes, pommes et plats faits maison. Une
 * commande payée arrive dans le sac de livraison, devant la porte.
 */
export function Magasin({ game }: { game: Game | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('epicerie');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!game) return;
    game.onShop = () => {
      setCart(game.pendingOrder() ? {} : fromList(game));
      setTab('epicerie');
      setOpen(true);
    };
    return () => {
      game.onShop = null;
    };
  }, [game]);

  // l'argent, la commande en route et ce qu'on peut vendre changent pendant que la fenêtre est ouverte
  useEffect(() => {
    if (!game || !open) return;
    const off = game.argent.subscribe(() => setTick((n) => n + 1));
    const id = window.setInterval(() => setTick((n) => n + 1), 500);
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [game, open]);

  const add = useCallback((id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, (c[id] ?? 0) + d)) })), []);

  if (!game || !open) return null;
  const money = game.argent.money;
  const pending = game.pendingOrder();
  const lines: OrderLine[] = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n }));
  const total = orderTotal(lines);
  const count = lines.reduce((s, l) => s + l.n, 0);

  const row = (id: string, note?: ReactNode) => {
    const def = ITEM_BY_ID.get(id);
    if (!def) return null;
    const n = cart[id] ?? 0;
    return (
      <li key={id} className={n ? 'want' : undefined}>
        <span className="shop-name">
          {def.name}
          {note}
        </span>
        <span className="shop-price">{euros(priceOf(def))}</span>
        <span className="shop-qty">
          <button onClick={() => add(id, -1)} disabled={!n} aria-label={`Retirer : ${def.name}`}>−</button>
          <span aria-label={`${n} dans le panier`}>{n}</span>
          <button onClick={() => add(id, 1)} disabled={!!pending} aria-label={`Ajouter : ${def.name}`}>+</button>
        </span>
      </li>
    );
  };

  const market = tab === 'marche' ? game.marketItems() : [];
  return (
    <div className="shop" role="dialog" aria-label="Magasin">
      <div className="inv-head">
        <b>Magasin</b>
        <span className="shop-money">
          Porte-monnaie : <b>{euros(money)}</b>
        </span>
        <button className="inv-x" onClick={() => setOpen(false)} aria-label="Fermer le magasin">✕</button>
      </div>
      <div className="shop-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="shop-body">
        {pending && tab !== 'marche' && (
          <p className="shop-note">
            Commande en route ({pending.names.length} article{pending.names.length > 1 ? 's' : ''}) : le livreur passe dans {pending.minutes} min. Une seule commande à la fois.
          </p>
        )}
        {tab === 'epicerie' && (
          <>
            {!pending && (
              <p className="shop-note">
                Le panier part de la liste de courses.{' '}
                <button className="shop-link" onClick={() => setCart(fromList(game))}>Remettre la liste</button>{' · '}
                <button className="shop-link" onClick={() => setCart({})}>Vider</button>
              </p>
            )}
            <ul className="shop-list">{groceryAisle().map((d) => row(d.id))}</ul>
          </>
        )}
        {tab === 'maison' && (
          <>
            <p className="shop-note">Ce qui est cassé se rachète ici : un meuble revient à sa place, le reste arrive avec la livraison.</p>
            <ul className="shop-list">
              {game.argent.houseAisle().map(({ def, broken }) => row(def.id, broken ? <small className="broken"> · cassé{broken > 1 ? ` ×${broken}` : ''}</small> : null))}
            </ul>
          </>
        )}
        {tab === 'marche' && (
          <>
            <p className="shop-note">Le marché rachète les légumes, les pommes et les plats faits maison : plus il y a d’étoiles, mieux c’est payé.</p>
            {market.length ? (
              <ul className="shop-list">
                {market.map((m) => (
                  <li key={m.ref}>
                    <span className="shop-name">
                      {m.name}
                      {m.stars > 0 && <small> · {stars(m.stars)}</small>}
                    </span>
                    <span className="shop-price">{euros(m.price)}</span>
                    <button className="shop-sell" onClick={() => game.sellItem(m.ref)}>Vendre</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inv-empty">Rien à vendre pour l’instant : récolte le potager, cueille des pommes ou cuisine un bon plat.</p>
            )}
          </>
        )}
      </div>
      {tab !== 'marche' ? (
        <div className="shop-foot">
          <span className="shop-total">
            {count} article{count > 1 ? 's' : ''} : <b className={total > money ? 'short' : undefined}>{euros(total)}</b>
          </span>
          <button
            className="shop-order"
            disabled={!!pending || !count || total > money}
            title={total > money ? 'Pas assez d’argent : vends au marché ou retire des articles.' : undefined}
            onClick={() => {
              if (game.placeOrder(lines)) {
                setCart({});
                setOpen(false);
              }
            }}
          >
            Commander et payer
          </button>
        </div>
      ) : (
        market.length > 1 && (
          <div className="shop-foot">
            <span className="shop-total">
              Tout : <b>{euros(market.reduce((s, m) => s + m.price, 0))}</b>
            </span>
            <button className="shop-order" onClick={() => game.sellAll()}>Tout vendre</button>
          </div>
        )
      )}
    </div>
  );
}
