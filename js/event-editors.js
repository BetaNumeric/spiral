// DOM editors for the canvas detail view.
Object.assign(SpiralCalendar.prototype, {
    updateActiveTitleEditorLayout(detailLayout) {
      const input = document.getElementById('titleEditor');
      if (!input || !this.titleClickArea) return;

      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
      const canvasRect = this.canvas.getBoundingClientRect();
      const pageLeft = window.visualViewport && Number.isFinite(window.visualViewport.pageLeft)
        ? window.visualViewport.pageLeft
        : (window.scrollX || window.pageXOffset || 0);
      const pageTop = window.visualViewport && Number.isFinite(window.visualViewport.pageTop)
        ? window.visualViewport.pageTop
        : (window.scrollY || window.pageYOffset || 0);
      const visualFontSize = this.titleClickArea.fontSizeUsed || detailLayout.titleFontSize;
      const cssFontSize = Math.max(16, visualFontSize);
      const visualScale = visualFontSize / cssFontSize;
      const width = this.titleClickArea.width / visualScale;
      const height = Math.max(this.titleClickArea.height / visualScale, cssFontSize * 1.6);
      const left = canvasRect.left + pageLeft + detailLayout.centerX - width / 2;
      const top = canvasRect.top + pageTop + this.titleClickArea.centerY - height / 2 + safeTop;

      input.style.left = `${left}px`;
      input.style.top = `${top}px`;
      input.style.width = `${width}px`;
      input.style.height = `${height}px`;
      input.style.fontSize = `${cssFontSize}px`;
      input.style.lineHeight = `${Math.max(cssFontSize * 1.2, height - 4)}px`;
      input.style.borderRadius = `${Math.max(4, Math.round((this.titleClickArea.height || height) * 0.22 / visualScale))}px`;
      input.style.padding = `0 ${Math.max(8, Math.round(detailLayout.baseFontSize * 0.45 / visualScale))}px`;
      input.style.transform = visualScale !== 1 ? `scale(${visualScale})` : '';
      input.style.transformOrigin = 'center center';
    },

    updateActiveDescriptionEditorLayout(detailLayout) {
      const textarea = document.getElementById('descEditor');
      if (!textarea || !this.descClickArea) return;

      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
      const canvasRect = this.canvas.getBoundingClientRect();
      const pageLeft = window.visualViewport && Number.isFinite(window.visualViewport.pageLeft)
        ? window.visualViewport.pageLeft
        : (window.scrollX || window.pageXOffset || 0);
      const pageTop = window.visualViewport && Number.isFinite(window.visualViewport.pageTop)
        ? window.visualViewport.pageTop
        : (window.scrollY || window.pageYOffset || 0);
      const visualFontSize = detailLayout.smallFontSize;
      const cssFontSize = Math.max(16, visualFontSize);
      const visualScale = visualFontSize / cssFontSize;
      const baseWidth = this.descClickArea.width / visualScale;
      const baseHeight = Math.max(this.descClickArea.height / visualScale, cssFontSize * 1.6 + 12);

      textarea.style.width = `${baseWidth}px`;
      textarea.style.fontSize = `${cssFontSize}px`;
      textarea.style.lineHeight = `${Math.max(cssFontSize * 1.2, cssFontSize + 2)}px`;
      textarea.style.transform = visualScale !== 1 ? `scale(${visualScale})` : '';
      textarea.style.transformOrigin = 'center center';

      textarea.style.height = 'auto';
      const newHeight = Math.max(baseHeight, Math.min(textarea.scrollHeight, baseHeight * 5));
      const left = canvasRect.left + pageLeft + detailLayout.centerX - baseWidth / 2;
      const top = canvasRect.top + pageTop + this.descClickArea.centerY - newHeight / 2 + safeTop;

      textarea.style.left = `${left}px`;
      textarea.style.top = `${top}px`;
      textarea.style.height = `${newHeight}px`;
    },

    syncActiveDetailTextEditorLayout() {
      if (this.state.detailViewDay === null) return;
      const detailLayout = this.getDetailViewLayout();
      this.updateActiveTitleEditorLayout(detailLayout);
      this.updateActiveDescriptionEditorLayout(detailLayout);
    },

    updateActiveDetailTextEditorViewportSyncState() {
      const hasActiveTextEditor = !!document.getElementById('titleEditor') || !!document.getElementById('descEditor');

      if (!hasActiveTextEditor) {
        if (this._activeDetailTextEditorViewportRaf) {
          cancelAnimationFrame(this._activeDetailTextEditorViewportRaf);
          this._activeDetailTextEditorViewportRaf = null;
        }
        if (this._boundActiveDetailTextEditorViewportSync) {
          window.removeEventListener('resize', this._boundActiveDetailTextEditorViewportSync);
          window.removeEventListener('scroll', this._boundActiveDetailTextEditorViewportSync);
          if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this._boundActiveDetailTextEditorViewportSync);
            window.visualViewport.removeEventListener('scroll', this._boundActiveDetailTextEditorViewportSync);
          }
          this._boundActiveDetailTextEditorViewportSync = null;
        }
        return;
      }

      if (this._boundActiveDetailTextEditorViewportSync) return;

      this._boundActiveDetailTextEditorViewportSync = () => {
        if (this._activeDetailTextEditorViewportRaf) {
          cancelAnimationFrame(this._activeDetailTextEditorViewportRaf);
        }
        this._activeDetailTextEditorViewportRaf = requestAnimationFrame(() => {
          this._activeDetailTextEditorViewportRaf = null;
          this.syncActiveDetailTextEditorLayout();
        });
      };

      window.addEventListener('resize', this._boundActiveDetailTextEditorViewportSync);
      window.addEventListener('scroll', this._boundActiveDetailTextEditorViewportSync);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this._boundActiveDetailTextEditorViewportSync);
        window.visualViewport.addEventListener('scroll', this._boundActiveDetailTextEditorViewportSync);
      }
    },

    createTitleEditor(event) {
      this.createDetailTextEditor(event, 'title');
    },

    createDescriptionEditor(event) {
      this.createDetailTextEditor(event, 'description');
    },

    finishActiveDetailTextEditor(options = {}) {
      this._finishDetailTextEditor?.(options);
    },

    createDetailTextEditor(event, field) {
      this.finishActiveDetailTextEditor({ redraw: false });
      if (!this.isActiveEvent(event)) return;
      const isTitle = field === 'title';
      const input = document.createElement(isTitle ? 'input' : 'textarea');
      input.id = isTitle ? 'titleEditor' : 'descEditor';
      if (isTitle) input.type = 'text';
      else input.placeholder = 'Enter description...';
      input.value = event[field] || '';
      input.maxLength = document.getElementById(isTitle ? 'eventTitle' : 'eventDescription').maxLength;
      input.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 10px;
        height: ${isTitle ? 28 : 44}px;
        font-size: 16px;
        ${isTitle ? 'font-weight: bold;' : ''}
        line-height: 20px;
        border: 2px solid #4CAF50;
        border-radius: ${isTitle ? 4 : 2}px;
        padding: ${isTitle ? '0 8px' : '6px'};
        background: ${document.body.classList.contains('dark-mode') ? 'var(--dark-bg-secondary)' : 'white'};
        color: ${document.body.classList.contains('dark-mode') ? 'var(--dark-text-primary)' : 'black'};
        z-index: 1000;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        text-align: center;
        box-sizing: border-box;
        transform-origin: center center;
        ${isTitle ? '' : 'resize: none; overflow: hidden;'}
      `;
      const editingFlag = isTitle ? 'isEditingTitle' : 'isEditingDescription';
      const hiddenFlag = isTitle ? 'hideTitleWhileEditing' : 'hideDescriptionWhileEditing';
      let finished = false;
      const finish = ({ save = true, redraw = true } = {}) => {
        if (finished) return;
        finished = true; // Removing a focused input can also fire blur.
        this._finishDetailTextEditor = null;
        this.editingState[editingFlag] = false;
        this[hiddenFlag] = false;
        input.remove();
        this.updateActiveDetailTextEditorViewportSyncState();
        if (save) this.editEvent(event, {
          [field]: input.value.trim() || (isTitle ? 'Untitled Event' : '')
        }, { redraw: false });
        else this.recordStudyAction?.('editor_cancelled', { eventId: event.persistentUID || null, field }, { source: 'detail_text_editor', inputMethod: 'keyboard' });
        if (redraw) this.drawSpiral();
      };
      this._finishDetailTextEditor = finish;
      input.addEventListener('blur', () => finish());
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (isTitle || e.ctrlKey))) {
          e.preventDefault();
          e.stopPropagation();
          finish({ save: e.key !== 'Escape' });
        }
      });
      if (!isTitle) input.addEventListener('input', () => {
        this.updateActiveDescriptionEditorLayout(this.getDetailViewLayout());
      });
      document.body.appendChild(input);
      const layout = this.getDetailViewLayout();
      if (isTitle) this.updateActiveTitleEditorLayout(layout);
      else this.updateActiveDescriptionEditorLayout(layout);
      this.updateActiveDetailTextEditorViewportSyncState();
      this.editingState[editingFlag] = true;
      this[hiddenFlag] = true;
      input.focus();
      input.select();
      this.drawSpiral();
    }
});
