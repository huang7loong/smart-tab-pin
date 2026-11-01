const { Plugin, Notice, editorInfoField } = require('obsidian');
const { EditorView } = require('@codemirror/view');
const { Transaction } = require('@codemirror/state');

module.exports = class SmartTabPin extends Plugin {
  onload() {
    this.documents = new Set();
    this.stopped = false;
    this.pendingPin = null;
    this.onFileClick = (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target?.closest ? event.target : event.target?.parentElement;
      const row = this.sidebarFileRow(target);
      if (!row) return;
      const path = row.getAttribute('data-path');
      let match = null;
      const active = this.app.workspace.getMostRecentLeaf();
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (!this.isMainFile(leaf) || !leaf.getViewState().pinned
          || (leaf.view.file?.path || leaf.getViewState().state?.file) !== path) return;
        // Prefer the active copy, then a copy in the clicked window.
        if (!match || leaf === active || (match !== active
          && leaf.view.containerEl.ownerDocument === row.ownerDocument
          && match.view.containerEl.ownerDocument !== row.ownerDocument)) match = leaf;
      });
      if (!match) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pendingPin = null;
      clearTimeout(this.pinTimeout);
      clearTimeout(this.pinAttempt);
      this.app.workspace.revealLeaf(match).catch((error) => {
        console.error('Smart Tab Pin: cannot reveal pinned tab', error);
        new Notice('无法跳转到已固定标签，请重试。');
      });
    };
    this.onDoubleClick = (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      // Avoid instanceof: a popout has its own DOM constructors.
      const target = event.target?.closest ? event.target : event.target?.parentElement;
      if (!target || target.closest('.workspace-tab-header-inner-close-button, .workspace-tab-header-status-container, .clickable-icon')) return;
      if (!target.closest('input, textarea, [contenteditable="true"]')) {
        const row = this.sidebarFileRow(target);
        if (row) {
          const path = row.getAttribute('data-path');
          if (this.app.vault.getFileByPath(path)) {
            this.pendingPin = { path, doc: row.ownerDocument };
            clearTimeout(this.pinTimeout);
            clearTimeout(this.pinAttempt);
            this.pinTimeout = setTimeout(() => { this.pendingPin = null; }, 3000);
            // Let the file browser finish its own navigation before resolving the leaf.
            this.pinAttempt = setTimeout(() => this.pinOpenedFile(), 0);
          }
          return;
        }
      }
      const header = target.closest('.workspace-tab-header');
      if (!header) return;
      this.app.workspace.iterateAllLeaves((leaf) => {
        // tabHeaderEl is the only internal UI field used; pinning itself is public API.
        if (leaf.tabHeaderEl !== header || !this.isMainFile(leaf)) return;
        event.preventDefault();
        event.stopImmediatePropagation(); // Also suppress macOS title-bar double-click behavior.
        leaf.togglePinned();
        return true;
      });
    };
    this.register(() => {
      this.stopped = true;
      clearTimeout(this.pinTimeout);
      clearTimeout(this.pinAttempt);
      this.pendingPin = null;
      for (const doc of this.documents) {
        doc.removeEventListener('dblclick', this.onDoubleClick, true);
        doc.removeEventListener('click', this.onFileClick, true);
      }
      this.documents.clear();
    });
    this.registerEvent(this.app.workspace.on('file-open', () => this.pinOpenedFile()));
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.syncDocuments();
      this.pinOpenedFile();
    }));
    this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, win) => this.attachDocument(win.document)));
    this.registerEvent(this.app.workspace.on('window-close', (_workspaceWindow, win) => {
      win.document.removeEventListener('dblclick', this.onDoubleClick, true);
      win.document.removeEventListener('click', this.onFileClick, true);
      this.documents.delete(win.document);
    }));
    this.app.workspace.onLayoutReady(() => this.syncDocuments());
    this.registerEditorExtension(EditorView.updateListener.of((update) => {
      if (this.stopped || !update.docChanged) return;
      const edited = update.transactions.some((tr) => tr.docChanged
        && !tr.annotation(Transaction.remote)
        && ['input', 'delete', 'move', 'undo', 'redo'].some((kind) => tr.isUserEvent(kind)));
      if (!edited) return;
      const info = update.state.field(editorInfoField, false);
      if (!info?.editor) return;
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view.getViewType() !== 'markdown' || leaf.view.editor !== info.editor || !this.isMainFile(leaf)) return;
        if (!leaf.getViewState().pinned) leaf.setPinned(true);
        return true;
      });
    }));
  }

  sidebarFileRow(target) {
    if (!target || target.closest('input, textarea, [contenteditable="true"], button, .clickable-icon')
      || !target.closest('.workspace-split.mod-left-split')) return null;
    return target.closest('.nav-file-title[data-path], .nav-file[data-path], [data-drag-type="file"][data-path]');
  }

  pinOpenedFile() {
    if (this.stopped || !this.pendingPin) return;
    const { path, doc } = this.pendingPin;
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf || !this.isMainFile(leaf) || leaf.view.containerEl.ownerDocument !== doc
      || (leaf.view.file?.path || leaf.getViewState().state?.file) !== path) return;
    this.pendingPin = null;
    clearTimeout(this.pinTimeout);
    if (!leaf.getViewState().pinned) leaf.setPinned(true);
  }

  isMainFile(leaf) {
    const root = leaf.getRoot();
    const workspace = this.app.workspace;
    return root !== workspace.leftSplit && root !== workspace.rightSplit
      && Boolean(leaf.view.file || leaf.getViewState().state?.file);
  }

  attachDocument(doc) {
    if (this.stopped || this.documents.has(doc)) return;
    doc.addEventListener('dblclick', this.onDoubleClick, true);
    doc.addEventListener('click', this.onFileClick, true);
    this.documents.add(doc);
  }

  syncDocuments() {
    if (this.stopped) return;
    this.attachDocument(this.app.workspace.containerEl.ownerDocument);
    this.app.workspace.iterateAllLeaves((leaf) => {
      this.attachDocument(leaf.view.containerEl.ownerDocument);
    });
  }
};
