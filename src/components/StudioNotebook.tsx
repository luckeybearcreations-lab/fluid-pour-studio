import React, { useEffect, useState } from 'react';
import { BookOpen, Download, FlaskConical, Plus, Trash2, X } from 'lucide-react';
import { PaintColor } from '@/lib/palette';
import { PhysicsParams, PourMode } from '@/lib/fluidEngine';
import { saveFile } from '@/lib/native';

export interface PourRecipe {
  id: string;
  name: string;
  note: string;
  createdAt: string;
  color: PaintColor;
  mode: PourMode;
  params: PhysicsParams;
}

interface Props {
  open: boolean;
  color: PaintColor;
  mode: PourMode;
  params: PhysicsParams;
  onClose: () => void;
  onLoad: (recipe: PourRecipe) => void;
}

const KEY = 'lucky-bear-fluid-recipes-v1';

const StudioNotebook: React.FC<Props> = ({ open, color, mode, params, onClose, onLoad }) => {
  const [recipes, setRecipes] = useState<PourRecipe[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    try { setRecipes(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { setRecipes([]); }
  }, []);

  const persist = (items: PourRecipe[]) => {
    setRecipes(items);
    localStorage.setItem(KEY, JSON.stringify(items));
  };
  const save = () => {
    const recipe: PourRecipe = {
      id: crypto.randomUUID(),
      name: name.trim() || `${color.name} ${mode}`,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      color,
      mode,
      params,
    };
    persist([recipe, ...recipes].slice(0, 40));
    setName('');
    setNote('');
  };
  const exportRecipes = () => {
    const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
    void saveFile(blob, 'lucky-bear-fluid-recipes.json').catch(() => undefined);
  };

  return (
    <>
      {open && <button className="notebook-scrim" aria-label="Close recipe lab" onClick={onClose} />}
      <aside className={`notebook-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <header>
          <div><FlaskConical /><span><b>Recipe lab</b><small>Save the setup behind every pour.</small></span></div>
          <button aria-label="Close recipe lab" onClick={onClose}><X /></button>
        </header>
        <div className="notebook-content">
          <section className="recipe-composer">
            <div className="recipe-preview"><i style={{ background: color.hex }} /><span><b>{color.name}</b><small>{mode} · {Math.round(params.viscosity * 100)}% viscosity</small></span></div>
            <input value={name} maxLength={48} placeholder="Recipe name" onChange={event => setName(event.target.value)} />
            <textarea value={note} maxLength={240} placeholder="Canvas size, paint ratios, inspiration, next experiment…" onChange={event => setNote(event.target.value)} />
            <button className="recipe-save" onClick={save}><Plus /> Save current recipe</button>
          </section>
          <div className="notebook-title"><span><BookOpen /> Project journal</span>{recipes.length > 0 && <button onClick={exportRecipes}><Download /> Export</button>}</div>
          {recipes.length === 0 ? <p className="notebook-empty">Your saved techniques and project notes will appear here.</p> :
            <div className="recipe-list">{recipes.map(recipe => <article key={recipe.id}>
              <button className="recipe-load" onClick={() => { onLoad(recipe); onClose(); }}>
                <i style={{ background: recipe.color.hex }} />
                <span><b>{recipe.name}</b><small>{new Date(recipe.createdAt).toLocaleDateString()} · {recipe.mode}</small>{recipe.note && <em>{recipe.note}</em>}</span>
              </button>
              <button className="recipe-delete" aria-label={`Delete ${recipe.name}`} onClick={() => persist(recipes.filter(item => item.id !== recipe.id))}><Trash2 /></button>
            </article>)}</div>}
        </div>
      </aside>
    </>
  );
};

export default StudioNotebook;
