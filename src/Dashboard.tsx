import { ReactNode, useEffect, useState } from 'react';
import { TEMP_LOGIN } from './auth';
import { CategoriesPage } from './categories/CategoriesPage';
import { FoodsPage } from './foods/FoodsPage';
import { MealsPage } from './meals/MealsPage';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'foods', label: 'Foods', icon: '🍎' },
  { id: 'categories', label: 'Categories', icon: '🏷' },
  { id: 'meals', label: 'Meals', icon: '🍽' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

// Illustrative numbers until the database is connected; the page says so.
const STATS = [
  { label: 'Foods', value: '248', note: '12 added this week' },
  { label: 'Preparations', value: '611', note: 'raw, cooked, fried…' },
  { label: 'Meals', value: '18', note: '15 published' },
  { label: 'Drafts', value: '7', note: 'waiting for review' },
];

const ACTIVITY = [
  { what: 'Chicken breast (grilled) updated', when: '2 hours ago' },
  { what: 'Meal "Overnight Oats" published', when: 'Yesterday' },
  { what: 'Sweet potato (boiled) added', when: 'Yesterday' },
  { what: 'Corn (cooked) added', when: '2 days ago' },
];

const QUICK_ACTIONS = ['Add food', 'Add meal', 'Import foods'];

interface DashboardProps {
  username: string;
  onSignOut: () => void;
}

export function Dashboard({ username, onSignOut }: DashboardProps) {
  const [page, setPage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const current = NAV.find((n) => n.id === page) ?? NAV[0];

  return (
    <div className="shell">
      <aside id="sidebar" className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">Fitness Market</div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item${item.id === page ? ' active' : ''}`}
              aria-current={item.id === page ? 'page' : undefined}
              onClick={() => {
                setPage(item.id);
                setMenuOpen(false);
              }}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
          <h1 className="page-title">{current.label}</h1>
          <div className="user">
            <span className="user-name">{username}</span>
            <button type="button" className="outline" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          {username === TEMP_LOGIN && (
            <p className="notice" role="status">
              Temporary sign-in. Not connected to the database account, so nothing can be saved. Sign in with your admin email to save changes.
            </p>
          )}
          {page === 'dashboard' ? <Overview /> : page === 'foods' ? <FoodsPage /> : page === 'meals' ? <MealsPage /> : page === 'categories' ? <CategoriesPage /> : <ComingSoon title={current.label} />}
        </main>
      </div>
    </div>
  );
}

function Overview() {
  return (
    <>
      <p className="notice" role="note">
        Sample data. Live numbers appear once the database is connected.
      </p>

      <section aria-label="Summary" className="stats">
        {STATS.map((s) => (
          <Card key={s.label}>
            <p className="stat-label">{s.label}</p>
            <p className="stat-value">{s.value}</p>
            <p className="stat-note">{s.note}</p>
          </Card>
        ))}
      </section>

      <div className="columns">
        <Card>
          <h2>Recent activity</h2>
          <ul className="activity">
            {ACTIVITY.map((a) => (
              <li key={a.what}>
                <span>{a.what}</span>
                <time>{a.when}</time>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2>Quick actions</h2>
          <div className="actions">
            {QUICK_ACTIONS.map((a) => (
              <button key={a} type="button" className="outline" disabled title="Coming soon">
                {a}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <Card>
      <h2>{title}</h2>
      <p className="stat-note">This section is coming soon.</p>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="panel">{children}</div>;
}
