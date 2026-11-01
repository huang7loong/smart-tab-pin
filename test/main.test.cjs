const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function document() {
  return { addEventListener() {}, removeEventListener() {} };
}

function canvas(doc = document()) {
  const listeners = new Set();
  const view = {
    file: { path: 'drawing.excalidraw.md' },
    getViewType: () => 'excalidraw',
    containerEl: { ownerDocument: doc },
    _loaded: true,
    semaphores: { justLoaded: false, viewunload: false },
    excalidrawAPI: {
      onIncrement(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    },
  };
  const leaf = {
    view, pinned: false, pinCalls: 0,
    getRoot: () => 'main',
    getViewState() { return { pinned: this.pinned }; },
    setPinned(value) { this.pinned = value; this.pinCalls++; },
    togglePinned() { this.pinned = !this.pinned; },
  };
  return { leaf, view, listeners, emit: (event) => [...listeners].forEach((fn) => fn(event)) };
}

function host(leaves = []) {
  const callbacks = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const workspace = {
    leaves, active: leaves[0], leftSplit: 'left', rightSplit: 'right',
    containerEl: { ownerDocument: document() },
    getMostRecentLeaf() { return this.active; },
    iterateAllLeaves(fn) { for (const leaf of this.leaves) if (fn(leaf)) break; },
    on(event, fn) { callbacks.set(event, fn); return { event }; },
    onLayoutReady(fn) { this.ready = fn; },
    revealLeaf(leaf) { this.active = leaf; return Promise.resolve(); },
  };
  class Plugin {
    constructor() { this.app = { workspace }; this.cleanup = []; }
    register(fn) { this.cleanup.push(fn); }
    registerEvent() {}
    registerEditorExtension(fn) { this.editorListener = fn; }
  }
  const modules = {
    obsidian: { Plugin, Notice: class {}, editorInfoField: 'editor' },
    '@codemirror/view': { EditorView: { updateListener: { of: (fn) => fn } } },
    '@codemirror/state': { Transaction: { remote: 'remote' } },
  };
  const context = {
    module: { exports: {} }, require: (id) => modules[id], console,
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'main.js'), 'utf8'), context);
  const plugin = new context.module.exports();
  plugin.onload();
  workspace.ready();
  return {
    plugin, workspace, timers,
    event: (name) => callbacks.get(name)?.(),
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
    unload() { plugin.cleanup.forEach((fn) => fn()); },
  };
}

// Shape of the public Excalidraw StoreIncrement; elements are changed records,
// not a full scene. Undo/redo use the same durable increment contract.
const edit = (elements = { a: { id: 'a', type: 'rectangle', x: 20 } }) => ({
  type: 'durable', change: { elements, appState: {} },
});

test('committed content changes pin once and re-pin after manual unpinning', () => {
  const c = canvas(); const h = host([c.leaf]);
  assert.equal(c.leaf.pinned, false);
  c.emit(edit()); c.emit(edit());
  assert.equal(c.leaf.pinCalls, 1);
  c.leaf.pinned = false;
  c.emit(edit({ a: { id: 'a', isDeleted: true } }));
  assert.equal(c.leaf.pinCalls, 2);
  h.unload();
});

test('loading, synchronization, in-progress strokes and navigation do not pin', () => {
  const c = canvas(); const h = host([c.leaf]);
  c.emit({ ...edit(), type: 'ephemeral' });
  for (const appState of [
    { selectedElementIds: { a: true } }, { zoom: { value: 2 } },
    { scrollX: 100 }, { activeTool: { type: 'rectangle' } }, { theme: 'dark' },
  ]) c.emit({ type: 'durable', change: { elements: {}, appState } });
  c.emit(edit({})); c.emit(null);
  assert.equal(c.leaf.pinCalls, 0);
  h.unload();
});

test('canvas background edits count as content', () => {
  const c = canvas(); const h = host([c.leaf]);
  c.emit({ type: 'durable', change: { elements: {}, appState: { viewBackgroundColor: '#fff' } } });
  assert.equal(c.leaf.pinned, true);
  h.unload();
});

test('initial load and teardown guards ignore even durable increments', () => {
  const c = canvas(); const h = host([c.leaf]);
  c.view._loaded = false; c.emit(edit()); c.view._loaded = true;
  c.view.semaphores.justLoaded = true; c.emit(edit()); c.view.semaphores.justLoaded = false;
  c.view.semaphores.viewunload = true; c.emit(edit());
  assert.equal(c.leaf.pinCalls, 0);
  h.unload();
});

test('background views do not pin; the focused popout view does', () => {
  const a = canvas(); const b = canvas(); const h = host([a.leaf, b.leaf]);
  b.emit(edit()); assert.equal(b.leaf.pinned, false);
  h.workspace.active = b.leaf;
  b.emit(edit()); assert.equal(b.leaf.pinned, true);
  assert.equal(a.leaf.pinned, false);
  h.unload();
});

test('late canvas initialization attaches without another workspace event', () => {
  const c = canvas(); const api = c.view.excalidrawAPI;
  c.view.excalidrawAPI = null; c.view._loaded = false;
  const h = host([c.leaf]);
  assert.equal(h.timers.size, 1);
  c.view.excalidrawAPI = api; c.view._loaded = true;
  h.tick(); c.emit(edit());
  assert.equal(c.leaf.pinned, true); assert.equal(h.timers.size, 0);
  h.unload();
});

test('workspace events attach new canvases and never duplicate subscriptions', () => {
  const h = host(); const c = canvas();
  h.workspace.leaves.push(c.leaf); h.workspace.active = c.leaf;
  for (const name of ['file-open', 'layout-change', 'active-leaf-change', 'layout-change']) h.event(name);
  assert.equal(c.listeners.size, 1);
  c.emit(edit()); assert.equal(c.leaf.pinCalls, 1);
  h.unload();
});

test('closing a canvas releases its subscription', () => {
  const c = canvas(); const h = host([c.leaf]);
  h.workspace.leaves = []; h.event('layout-change');
  assert.equal(c.listeners.size, 0); assert.equal(h.timers.size, 0);
  h.unload();
});

test('replacing a view in a reused leaf detaches old events', () => {
  const old = canvas(); const next = canvas(); const h = host([old.leaf]);
  const stale = [...old.listeners][0];
  old.leaf.view = next.view;
  stale(edit()); assert.equal(old.leaf.pinned, false);
  h.event('file-open');
  assert.equal(old.listeners.size, 0); assert.equal(next.listeners.size, 1);
  next.emit(edit()); assert.equal(old.leaf.pinned, true);
  h.unload();
});

test('replacing the React API resubscribes and ignores the stale callback', () => {
  const c = canvas(); const next = canvas(); const h = host([c.leaf]);
  const stale = [...c.listeners][0];
  c.view.excalidrawAPI = next.view.excalidrawAPI;
  stale(edit()); assert.equal(c.leaf.pinned, false);
  h.event('layout-change');
  assert.equal(c.listeners.size, 0); assert.equal(next.listeners.size, 1);
  next.emit(edit()); assert.equal(c.leaf.pinned, true);
  h.unload();
});

test('unloading removes listeners and pending retries without clearing pin state', () => {
  const c = canvas(); const loading = canvas();
  loading.view.excalidrawAPI = null; loading.view._loaded = false;
  const h = host([c.leaf, loading.leaf]);
  const stale = [...c.listeners][0];
  c.emit(edit()); h.unload();
  assert.equal(c.leaf.pinned, true); assert.equal(c.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  c.leaf.pinned = false; stale(edit()); h.event('file-open');
  assert.equal(c.leaf.pinned, false); assert.equal(c.listeners.size, 0);
});

test('older Excalidraw APIs and sidebars remain untouched', () => {
  const old = canvas(); old.view.excalidrawAPI = {};
  const sidebar = canvas(); sidebar.leaf.getRoot = () => 'left';
  const h = host([old.leaf, sidebar.leaf]);
  assert.equal(h.timers.size, 0); assert.equal(sidebar.listeners.size, 0);
  assert.equal(old.leaf.pinned, false);
  h.unload();
});

test('existing Markdown user edits still pin while remote edits do not', () => {
  const c = canvas(); c.view.getViewType = () => 'markdown'; c.view.editor = {};
  const h = host([c.leaf]);
  const update = (remote, user) => ({
    docChanged: true,
    transactions: [{ docChanged: true, annotation: () => remote, isUserEvent: () => user }],
    state: { field: () => ({ editor: c.view.editor }) },
  });
  h.plugin.editorListener(update(true, true));
  h.plugin.editorListener(update(false, false));
  assert.equal(c.leaf.pinned, false);
  h.plugin.editorListener(update(false, true));
  assert.equal(c.leaf.pinned, true); assert.equal(c.listeners.size, 0);
  h.unload();
});

test('double-click pinning still works for Excalidraw file tabs', () => {
  const c = canvas(); const h = host([c.leaf]); const header = {};
  c.leaf.tabHeaderEl = header;
  const event = {
    button: 0,
    target: { closest: (selector) => selector === '.workspace-tab-header' ? header : null },
    preventDefault() {}, stopImmediatePropagation() {},
  };
  h.plugin.onDoubleClick(event); assert.equal(c.leaf.pinned, true);
  h.plugin.onDoubleClick(event); assert.equal(c.leaf.pinned, false);
  assert.equal(c.listeners.size, 1);
  h.unload();
});
