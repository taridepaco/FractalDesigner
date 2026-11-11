// Controls panel generated from a tab's parameter schema: adding a parameter to a tab needs no
// change here. Built from the pieces of the shared design system (slider, select, segmented
// selector, buttons), with data-i18n keys so the language switch repaints them.
//
// Schema entries (all with an optional `group` legend key and `when(values)` to show or hide):
//   { key, type: 'range', label, min, max, step, def, log?, fmt?(v) }
//   { key, type: 'select', label, def, options: [{ v, k }] | () => [...] }
//   { key, type: 'modes', label, def, options: [{ v, k }] }
//   { key, type: 'text', label, def }
//   { type: 'buttons', items: [{ act, k, title?, wide? }] }   → tab.action(act)
//   { type: 'hint', k }

import { t, num } from './i18n.js';

let uid = 0;

export class Panel {
  /** controls: the panel body; before: the element the tab's groups go in front of. */
  constructor(controls, before, { onChange, onAction }) {
    this.controls = controls;
    this.before = before;
    this.onChange = onChange;
    this.onAction = onAction;
    this.items = []; // { def, wrap, sync() }
    this.values = null;
  }

  clear() {
    this.controls.querySelectorAll('fieldset.gen').forEach((f) => f.remove());
    this.items = [];
  }

  build(schema, values) {
    this.clear();
    this.values = values;
    const groups = new Map();
    for (const def of schema) {
      const g = def.group || 'g.params';
      if (!groups.has(g)) {
        const fs = document.createElement('fieldset');
        fs.className = 'gen';
        const lg = document.createElement('legend');
        lg.dataset.i18n = g;
        lg.textContent = t(g);
        fs.append(lg);
        this.controls.insertBefore(fs, this.before);
        groups.set(g, fs);
      }
      const item = this.make(def);
      groups.get(g).append(item.wrap);
      this.items.push(item);
    }
    this.syncAll();
  }

  set(key, v) {
    this.values[key] = v;
    this.onChange(key, v);
    this.refresh();
  }

  make(def) {
    const id = `p${++uid}`;
    const label = (forId, tag = 'label') => {
      const l = document.createElement(tag);
      if (forId && tag === 'label') l.htmlFor = forId;
      l.dataset.i18n = def.label || def.key;
      l.textContent = t(def.label || def.key);
      return l;
    };
    const wrap = document.createElement('div');
    let sync = () => {};

    if (def.type === 'range') {
      wrap.className = 'slider';
      const out = document.createElement('output');
      out.htmlFor = id;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      const toPos = (v) => (def.log ? Math.round(1000 * Math.log(v / def.min) / Math.log(def.max / def.min)) : v);
      const fromPos = (p) => {
        if (!def.log) return +p;
        const v = def.min * Math.pow(def.max / def.min, p / 1000);
        const s = def.step || 0;
        return s ? Math.round(v / s) * s : v;
      };
      if (def.log) { input.min = 0; input.max = 1000; input.step = 1; } else { input.min = def.min; input.max = def.max; input.step = def.step ?? 'any'; }
      const decimals = def.step ? Math.max(0, -Math.floor(Math.log10(def.step) + 1e-9)) : 2;
      const show = (v) => {
        out.textContent = def.fmt ? def.fmt(v) : num(v, decimals);
        input.style.setProperty('--p', (input.value - input.min) / (input.max - input.min));
      };
      input.addEventListener('input', () => { const v = fromPos(input.value); show(v); this.set(def.key, v); });
      sync = () => { input.value = toPos(this.values[def.key]); show(this.values[def.key]); };
      wrap.append(label(id), out, input);
    } else if (def.type === 'select') {
      wrap.className = 'field';
      const span = document.createElement('span');
      span.className = 'select';
      const sel = document.createElement('select');
      sel.id = id;
      const opts = typeof def.options === 'function' ? def.options() : def.options;
      for (const o of opts) {
        const op = new Option(t(o.k), o.v);
        op.dataset.i18n = o.k;
        sel.add(op);
      }
      sel.addEventListener('change', () => this.set(def.key, sel.value));
      sync = () => { sel.value = this.values[def.key]; };
      span.append(sel);
      wrap.append(label(id), span);
    } else if (def.type === 'modes') {
      wrap.className = 'field';
      const lab = label(null, 'span');
      lab.className = 'label';
      lab.id = `${id}-l`;
      const box = document.createElement('div');
      box.className = 'modes';
      box.setAttribute('role', 'radiogroup');
      box.setAttribute('aria-labelledby', lab.id);
      box.style.gridTemplateColumns = `repeat(${def.options.length}, 1fr)`;
      const radios = [];
      def.options.forEach((o, i) => {
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = id;
        r.id = `${id}-${i}`;
        r.value = String(o.v);
        const l = document.createElement('label');
        l.htmlFor = r.id;
        l.dataset.i18n = o.k;
        l.textContent = t(o.k);
        r.addEventListener('change', () => { if (r.checked) this.set(def.key, o.v); });
        box.append(r, l);
        radios.push([r, o.v]);
      });
      sync = () => { for (const [r, v] of radios) r.checked = v === this.values[def.key]; };
      wrap.append(lab, box);
    } else if (def.type === 'text') {
      wrap.className = 'field';
      const input = document.createElement('input');
      input.type = 'text';
      input.id = id;
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.addEventListener('change', () => this.set(def.key, input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      sync = () => { input.value = this.values[def.key]; };
      wrap.append(label(id), input);
    } else if (def.type === 'buttons') {
      wrap.className = 'buttons';
      for (const b of def.items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn ghost${b.wide ? ' wide' : ''}`;
        btn.dataset.i18n = b.k;
        btn.textContent = t(b.k);
        if (b.title) { btn.dataset.i18nTitle = b.title; btn.title = t(b.title); }
        btn.addEventListener('click', () => this.onAction(b.act));
        wrap.append(btn);
      }
    } else if (def.type === 'hint') {
      const p = document.createElement('p');
      p.className = 'hint';
      p.dataset.i18n = def.k;
      p.textContent = t(def.k);
      wrap.append(p);
    }
    return { def, wrap, sync };
  }

  /** Shows the values again (after a preset, a drag on the canvas or a link). */
  syncAll() {
    for (const it of this.items) if (it.def.key) it.sync();
    this.refresh();
  }

  /** Repaints formatted values (language change) and shows or hides conditional controls. */
  refresh() {
    for (const it of this.items) {
      if (it.def.type === 'range') it.sync();
      if (it.def.when) it.wrap.hidden = !it.def.when(this.values);
    }
  }
}
