// Event Panel and Event List UI
Object.assign(SpiralCalendar.prototype, {
  setupEventInputPanel() {
    const self = this;
    // Elements
    const addEventPanelBtn = document.getElementById('addEventPanelBtn');
    const eventInputPanel = document.getElementById('eventInputPanel');
    const closeEventPanelBtn = document.getElementById('closeEventPanelBtn');
    const eventTitle = document.getElementById('eventTitle');
    const eventDescription = document.getElementById('eventDescription');
    const eventStart = document.getElementById('eventStart');
    const eventEnd = document.getElementById('eventEnd');
    const eventStartBox = document.getElementById('eventStartBox');
    const eventEndBox = document.getElementById('eventEndBox');
    const eventColor = document.getElementById('eventColor');
    const colorBox = document.getElementById('colorBox');
    const addEventBtn = document.getElementById('addEventBtn');
    const titleCharCount = document.getElementById('titleCharCount');
    const descCharCount = document.getElementById('descCharCount');
    const eventList = document.getElementById('eventList');

    // Reusable helpers for custom date/time boxes in the panel
    const openHiddenPicker = (inputEl) => {
      if (!inputEl) return;
      // Directly trigger the hidden input under the box so the OS places the popup near it when possible
      if (typeof inputEl.showPicker === 'function') {
        try { inputEl.showPicker(); return; } catch (_) {}
      }
      inputEl.focus();
      inputEl.click();
    };

    const openAnchoredPicker = (anchorEl, targetInputEl) => {
      if (!anchorEl || !targetInputEl) return openHiddenPicker(targetInputEl);
      const rect = anchorEl.getBoundingClientRect();
      const temp = document.createElement('input');
      temp.type = 'datetime-local';
      temp.style.position = 'fixed';
      temp.style.left = `${Math.max(0, Math.round(rect.left))}px`;
      temp.style.top = `${Math.min(window.innerHeight - 2, Math.round(rect.bottom + 2))}px`;
      temp.style.zIndex = '10000';
      temp.style.opacity = '0.01';
      temp.style.width = '2px';
      temp.style.height = '2px';
      temp.style.pointerEvents = 'auto';
      temp.value = targetInputEl.value || formatDateTimeLocalForInput(new Date());

      document.body.appendChild(temp);

      const cleanup = () => { if (temp.parentNode) temp.remove(); };
      const apply = () => {
        if (temp.value) {
          targetInputEl.value = temp.value;
          targetInputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        cleanup();
      };

      temp.addEventListener('change', apply);
      temp.addEventListener('blur', () => setTimeout(cleanup, 150));
      temp.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cleanup();
        if (e.key === 'Enter') apply();
      });

      // Trigger picker on next tick to ensure layout is applied
      setTimeout(() => {
        if (typeof temp.showPicker === 'function') {
          try { temp.showPicker(); return; } catch (_) {}
        }
        temp.focus();
        temp.click();
      }, 0);
    };

    const formatBox = (value) => {
      if (!value) return '';
      const d = parseDateTimeLocalAsUTC(value);
      return this.formatDateTime(new Date(d));
    };

    const syncEventBoxes = () => {
      if (eventStartBox) eventStartBox.textContent = eventStart && eventStart.value ? formatBox(eventStart.value) : '';
      if (eventEndBox) eventEndBox.textContent = eventEnd && eventEnd.value ? formatBox(eventEnd.value) : '';
    };

    if (eventStartBox) eventStartBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(eventStart);
      } else {
        openAnchoredPicker(eventStartBox, eventStart);
      }
    });
    if (eventEndBox) eventEndBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(eventEnd);
      } else {
        openAnchoredPicker(eventEndBox, eventEnd);
      }
    });
    if (eventStart) eventStart.addEventListener('change', syncEventBoxes);
    if (eventEnd) eventEnd.addEventListener('change', syncEventBoxes);

    // Helper function to create "All:" header item
    const createAllHeaderItem = (isBottomList = false) => {
        const allLi = document.createElement('li');
      // Use centered layout on desktop, but keep space-between on mobile (matching event items)
      const isMobile = window.innerWidth <= 768;
      // For event panel (not bottom list), use responsive widths to fit panel
      const isEventPanel = !isBottomList;
      const gapSize = (isMobile || isEventPanel) ? '0.5em' : '1em'; // Smaller gap for event panel
      // When using row color style, extend header row to edges by using negative margins to counteract container padding
      const useRowColor = this.state.eventListColorStyle === 'row';
      // Use calc(100% + 1em) to extend width beyond container, counteracting both left and right padding
      const horizontalMargin = (useRowColor && !isEventPanel) ? 'margin-left: -0.5em; margin-right: -0.5em; padding-left: 0.5em; padding-right: 0.5em; width: calc(100% + 1em);' : '';
      // Background color for sticky header - match list container background (non-transparent)
      const isDarkMode = document.body.classList.contains('dark-mode');
      const headerBg = isDarkMode ? 'var(--dark-bg-panel)' : (isEventPanel ? '#dedede' : '#ffffff');
      // For bottom list, ul has padding: 0.5em, so extend sticky header upward to cover it
      // For event panel, ul has padding: 0, so no extension needed
      const stickyTopOffset = !isEventPanel ? '-0.5em' : '0';
      const stickyTopPadding = !isEventPanel ? '0.3em' : '0';
      // Make header sticky with proper background and z-index, extending upward to cover container padding
      allLi.style.cssText = `position: sticky; top: ${stickyTopOffset}; z-index: 5; background: ${headerBg}; padding: ${stickyTopPadding} 0 0.2em 0; ${horizontalMargin} border-bottom: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#eee'}; display: flex; justify-content: ${isMobile || isEventPanel ? 'space-between' : 'center'}; align-items: center; gap: ${gapSize}; overflow: hidden; ${!horizontalMargin ? 'max-width: 100%; width: 100%;' : ''} box-sizing: border-box;`;
      
      // Left side with search input and "All:" text (exact same width as event items)
        const leftContent = document.createElement('div');
      // For event panel, use flex to fit panel width; for bottom list on desktop, use fixed 300px
      const leftWidth = (isMobile || isEventPanel) ? 'flex: 1; min-width: 60px; ' : 'width: 300px; ';
      leftContent.style.cssText = 'display: flex; align-items: center; gap: 0.5em; ' + leftWidth + 'min-width: ' + (isMobile || isEventPanel ? '60px' : '0') + '; flex-shrink: 1;';
      
      // Search input container with clear button
      const searchContainer = document.createElement('div');
      searchContainer.style.cssText = 'position: relative; flex: 1; display: flex; align-items: center; min-width: 0;';
      
      // Search input - use unique ID for bottom list to avoid conflicts
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search';
      searchInput.id = isBottomList ? 'eventListSearchBottom' : 'eventListSearch';
      const isDarkModeSearch = document.body.classList.contains('dark-mode');
      searchInput.style.cssText = `width: 100%; padding: ${isMobile ? '0.2em 2em 0.2em 0.5em' : '0.2em 2em 0.2em 0.5em'}; border: 1px solid ${isDarkModeSearch ? 'var(--dark-border)' : '#ccc'}; border-radius: 0.3em; font-size: 16px; background: ${isDarkModeSearch ? 'var(--dark-bg-secondary)' : '#fff'}; color: ${isDarkModeSearch ? 'var(--dark-text-primary)' : '#333'}; min-width: 0; box-sizing: border-box;`;
      searchInput.value = this.eventListSearchQuery || '';
      
      // Clear button (×) - positioned inside the input on the right
      const clearButton = document.createElement('span');
      clearButton.innerHTML = '×';
      clearButton.style.cssText = `position: absolute; right: 0.4em; cursor: pointer; font-size: ${isMobile ? '1.2em' : '1.4em'}; line-height: 1; color: ${isDarkModeSearch ? 'var(--dark-text-primary)' : '#666'}; opacity: ${searchInput.value ? '0.6' : '0'}; pointer-events: ${searchInput.value ? 'auto' : 'none'}; transition: opacity 0.2s; user-select: none; z-index: 1;`;
      clearButton.title = 'Clear search';
      
      // Function to update clear button visibility
      const updateClearButton = () => {
        const hasValue = searchInput.value.length > 0;
        clearButton.style.opacity = hasValue ? '0.6' : '0';
        clearButton.style.pointerEvents = hasValue ? 'auto' : 'none';
      };
      
      // Clear button click handler
      clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.value = '';
        this.eventListSearchQuery = '';
        // Sync the other search input
        const otherSearchId = isBottomList ? 'eventListSearch' : 'eventListSearchBottom';
        const otherSearchInput = document.getElementById(otherSearchId);
        if (otherSearchInput) {
          otherSearchInput.value = '';
          // Update the other clear button if it exists
          const otherContainer = otherSearchInput.parentElement;
          if (otherContainer && otherContainer.querySelector('span[title="Clear search"]')) {
            const otherClearButton = otherContainer.querySelector('span[title="Clear search"]');
            otherClearButton.style.opacity = '0';
            otherClearButton.style.pointerEvents = 'none';
          }
        }
        updateClearButton();
        searchInput.focus();
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      });
      
      // Hover effect for clear button
      clearButton.addEventListener('mouseenter', () => {
        if (clearButton.style.opacity !== '0') {
          clearButton.style.opacity = '1';
        }
      });
      clearButton.addEventListener('mouseleave', () => {
        if (searchInput.value) {
          clearButton.style.opacity = '0.6';
        }
      });
      
      // Update search query and re-render on input - sync both inputs
      searchInput.addEventListener('input', (e) => {
        const inputValue = e.target.value;
        this.eventListSearchQuery = inputValue.trim();
        updateClearButton();
        // Sync the other search input (if it exists) to keep them in sync
        const otherSearchId = isBottomList ? 'eventListSearch' : 'eventListSearchBottom';
        const otherSearchInput = document.getElementById(otherSearchId);
        if (otherSearchInput && otherSearchInput.value !== inputValue) {
          otherSearchInput.value = inputValue;
          // Update the other clear button if it exists
          const otherContainer = otherSearchInput.parentElement;
          if (otherContainer && otherContainer.querySelector('span[title="Clear search"]')) {
            const otherClearButton = otherContainer.querySelector('span[title="Clear search"]');
            const otherHasValue = inputValue.length > 0;
            otherClearButton.style.opacity = otherHasValue ? '0.6' : '0';
            otherClearButton.style.pointerEvents = otherHasValue ? 'auto' : 'none';
          }
        }
        // renderEventList will preserve the input element if it's focused, so no need to restore focus here
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      });
      
      // Clear search on Escape - sync both inputs
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.eventListSearchQuery = '';
          updateClearButton();
          const otherSearchId = isBottomList ? 'eventListSearch' : 'eventListSearchBottom';
          const otherSearchInput = document.getElementById(otherSearchId);
          if (otherSearchInput) {
            otherSearchInput.value = '';
            // Update the other clear button if it exists
            const otherContainer = otherSearchInput.parentElement;
            if (otherContainer && otherContainer.querySelector('span[title="Clear search"]')) {
              const otherClearButton = otherContainer.querySelector('span[title="Clear search"]');
              otherClearButton.style.opacity = '0';
              otherClearButton.style.pointerEvents = 'none';
            }
          }
          if (typeof window.renderEventList === 'function') {
            window.renderEventList();
          }
        }
      });
      
      // Assemble search container
      searchContainer.appendChild(searchInput);
      searchContainer.appendChild(clearButton);
      leftContent.appendChild(searchContainer);
      
      // Calendar column with dropdown (matching event items - smaller on mobile, but can shrink)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const calendarWidth = (isMobile || isEventPanel) ? (isMobile ? '60px' : 'flex: 0 0 auto; min-width: 40px; max-width: 65px;') : '80px';
      const calendarContent = document.createElement('div');
      const calendarWidthStyle = (isMobile || isEventPanel) && !isMobile ? calendarWidth : `width: ${isMobile ? '70px' : '80px'};`;
      calendarContent.style.cssText = `display: flex; align-items: center; justify-content: flex-start; ${calendarWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 30px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 80px;' : ''} overflow: visible; position: relative;`;
      
      // Calendar dropdown button
      const bottomCalendarDropdownBtn = document.createElement('button');
      const isDarkModeCalendar = document.body.classList.contains('dark-mode');
      bottomCalendarDropdownBtn.textContent = isMobile ? 'Calendars' : 'Calendars ▾';
      bottomCalendarDropdownBtn.title = 'Filter calendars';
      bottomCalendarDropdownBtn.style.cssText = `padding: ${isMobile ? '0.5em 0.2em' : '0.5em 0.4em'}; background: ${isDarkModeCalendar ? 'var(--dark-bg-secondary)' : '#fff'}; border: 1px solid ${isDarkModeCalendar ? 'var(--dark-border)' : '#ccc'}; border-radius: 0.3em; cursor: pointer; font-size: 12px; color: ${isDarkModeCalendar ? 'var(--dark-text-primary)' : '#333'}; white-space: nowrap; width: 100%; overflow: hidden; text-overflow: ellipsis;`;
      bottomCalendarDropdownBtn.onmouseover = () => bottomCalendarDropdownBtn.style.opacity = '0.8';
      bottomCalendarDropdownBtn.onmouseout = () => bottomCalendarDropdownBtn.style.opacity = '1';
      
      // Calendar dropdown menu for bottom event list
      let bottomCalendarDropdownMenu = document.getElementById('bottomCalendarDropdownMenu');
      if (!bottomCalendarDropdownMenu) {
        bottomCalendarDropdownMenu = document.createElement('div');
        bottomCalendarDropdownMenu.id = 'bottomCalendarDropdownMenu';
        bottomCalendarDropdownMenu.style.cssText = 'display: none; position: fixed; background: ' + (isDarkModeCalendar ? 'var(--dark-bg-secondary)' : '#fff') + '; border: 2px solid ' + (isDarkModeCalendar ? 'var(--dark-border)' : '#ccc') + '; border-radius: 0.3em; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 200px; z-index: 10000; padding: 0.4em 0;';
        document.body.appendChild(bottomCalendarDropdownMenu);
      }
      
      // Build calendar menu function (reuse logic from main dropdown)
      const buildBottomCalendarMenu = () => {
        if (!bottomCalendarDropdownMenu) return;
        bottomCalendarDropdownMenu.innerHTML = ''; // Clear existing
        
        // Header
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = 'Visible calendars';
        header.style.cssText = 'padding: 0.5em 0.6em; color: #666; font-size: 0.85em; border-bottom: 1px solid #eee;';
        bottomCalendarDropdownMenu.appendChild(header);
        
        // Visible calendar checkboxes
        (this.state.calendars || []).forEach(name => {
          const row = document.createElement('div');
          row.className = 'calendar-option';
          row.style.cssText = 'padding: 0.45em 0.6em; display: flex; align-items: center; gap: 0.5em; cursor: pointer;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = this.state.visibleCalendars.includes(name);
          cb.onchange = (e) => {
            const checked = e.target.checked;
            if (checked && !this.state.visibleCalendars.includes(name)) {
              this.state.visibleCalendars.push(name);
            } else if (!checked) {
              this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
              if (this.state.visibleCalendars.length === 0) {
                this.state.visibleCalendars = [name];
                cb.checked = true;
              }
            }
            this.saveSettingsToStorage();
            this.drawSpiral();
            renderEventList();
          };
          const label = document.createElement('span');
          label.textContent = name;
          label.style.cssText = 'flex:1;';
          row.appendChild(cb);
          row.appendChild(label);
          
          // Add delete button for non-default calendars
          const isDefaultCalendar = ['Home', 'Work'].includes(name);
          if (!isDefaultCalendar) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.title = `Delete calendar "${name}"`;
            deleteBtn.style.cssText = 'background: none; border: none; color: #b44; font-size: 1.1em; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; width: 20px; text-align: center; padding: 0; margin-left: 0.3em;';
            deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
            deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.6';
            deleteBtn.onclick = (e) => {
              e.stopPropagation();
              this.playFeedback();
              if (confirm(`Delete calendar "${name}"? All events in this calendar will be permanently deleted.`)) {
                this.events = this.events.filter(event => event.calendar !== name);
                this._eventsVersion++;
                this.state.calendars = this.state.calendars.filter(n => n !== name);
                this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
                this.saveSettingsToStorage();
                this.saveEventsToStorage();
                buildBottomCalendarMenu();
                // The main dropdown will rebuild itself when next opened
                renderEventList();
                this.drawSpiral();
              }
            };
            row.appendChild(deleteBtn);
          }
          
          bottomCalendarDropdownMenu.appendChild(row);
        });
        
        // Add "Add New Calendar" option
        const addNewCalendar = document.createElement('div');
        addNewCalendar.style.cssText = 'padding: 0.5em 0.6em; cursor: pointer; border-top: 1px solid #eee; color: #333;';
        addNewCalendar.textContent = '+ Add New Calendar';
        addNewCalendar.onclick = (e) => {
          e.stopPropagation();
          this.playFeedback();
          this.addNewCalendar((newCalendarName) => {
            buildBottomCalendarMenu();
            // The main dropdown will rebuild itself when next opened
            renderEventList();
            this.drawSpiral();
          });
          bottomCalendarDropdownMenu.style.display = 'none';
        };
        bottomCalendarDropdownMenu.appendChild(addNewCalendar);
      };
      
      // Toggle dropdown
      bottomCalendarDropdownBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = bottomCalendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          const isMobileDevice = window.innerWidth <= 768;
          if (isMobileDevice) {
            bottomCalendarDropdownMenu.style.left = '50%';
            bottomCalendarDropdownMenu.style.top = '50%';
            bottomCalendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
            bottomCalendarDropdownMenu.style.width = '90vw';
            bottomCalendarDropdownMenu.style.maxWidth = '300px';
            bottomCalendarDropdownMenu.style.maxHeight = '70vh';
            bottomCalendarDropdownMenu.style.overflowY = 'auto';
          } else {
            const buttonRect = bottomCalendarDropdownBtn.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - buttonRect.bottom;
            const spaceAbove = buttonRect.top;
            const estimatedDropdownHeight = 400; // Approximate max height before scrolling
            
            // Position above button if not enough space below, otherwise below
            if (spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow) {
              bottomCalendarDropdownMenu.style.top = (buttonRect.top - estimatedDropdownHeight - 5) + 'px';
            } else {
              bottomCalendarDropdownMenu.style.top = (buttonRect.bottom + 5) + 'px';
            }
            
            bottomCalendarDropdownMenu.style.left = (buttonRect.left - 120) + 'px';
            bottomCalendarDropdownMenu.style.transform = 'none';
            bottomCalendarDropdownMenu.style.width = 'auto';
            // Constrain height on desktop and allow scrolling
            bottomCalendarDropdownMenu.style.maxWidth = 'none';
            bottomCalendarDropdownMenu.style.maxHeight = '60vh';
            bottomCalendarDropdownMenu.style.overflowY = 'auto';
          }
          bottomCalendarDropdownMenu.style.display = 'block';
          buildBottomCalendarMenu();
        } else {
          bottomCalendarDropdownMenu.style.display = 'none';
        }
      };
      
      // Touch event for mobile
      bottomCalendarDropdownBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = bottomCalendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          bottomCalendarDropdownMenu.style.left = '50%';
          bottomCalendarDropdownMenu.style.top = '50%';
          bottomCalendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
          bottomCalendarDropdownMenu.style.width = '90vw';
          bottomCalendarDropdownMenu.style.maxWidth = '300px';
          bottomCalendarDropdownMenu.style.maxHeight = '70vh';
          bottomCalendarDropdownMenu.style.overflowY = 'auto';
          bottomCalendarDropdownMenu.style.display = 'block';
          buildBottomCalendarMenu();
        } else {
          bottomCalendarDropdownMenu.style.display = 'none';
        }
      });
      
      // Close dropdown when clicking outside
      if (!window.bottomCalendarDropdownClickListener) {
        window.bottomCalendarDropdownClickListener = (e) => {
          if (bottomCalendarDropdownMenu && !bottomCalendarDropdownMenu.contains(e.target) && e.target !== bottomCalendarDropdownBtn) {
            bottomCalendarDropdownMenu.style.display = 'none';
          }
        };
        document.addEventListener('click', window.bottomCalendarDropdownClickListener);
      }
      
      calendarContent.appendChild(bottomCalendarDropdownBtn);
      
      // Date column placeholder (matching event items - smaller on mobile, but can shrink)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const dateWidth = (isMobile || isEventPanel) ? (isMobile ? '50px' : 'flex: 0 0 auto; min-width: 40px; max-width: 55px;') : '55px';
      const middleContent = document.createElement('div');
      const dateWidthStyle = (isMobile || isEventPanel) && !isMobile ? dateWidth : `width: ${isMobile ? '50px' : '55px'};`;
      middleContent.style.cssText = `${dateWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 35px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 55px;' : ''} overflow: hidden;`; // Fixed width to match time column
      
      // Right side with "All:" text and buttons (fixed width, must never shrink to stay visible)
      // For event panel, use slightly smaller buttons; for bottom list on desktop, use standard width
      const buttonWidth = (isMobile || isEventPanel) ? (isMobile ? '45px' : '45px') : '50px';
        const rightContent = document.createElement('div');
      rightContent.style.cssText = `display: flex; align-items: center; justify-content: flex-end; gap: ${isMobile ? '3px' : '4px'}; width: ${buttonWidth}; flex-shrink: 0; min-width: ${buttonWidth};`;
      
      // "All:" text label removed for alignment
      // const allInfo = document.createElement('span');
      // const isDarkModeAll = document.body.classList.contains('dark-mode');
      // allInfo.style.cssText = `color: ${isDarkModeAll ? 'var(--dark-text-primary)' : '#666'}; font-size: ${isMobile ? '0.85em' : '0.93em'}; white-space: nowrap;`;
      // allInfo.textContent = 'All: ';
      // rightContent.appendChild(allInfo);
        
        // Add All to Calendar button
        const addAllToCalendarBtn = document.createElement('button');
      // Use row color style logic if enabled, otherwise use dark mode
      const useRowColorHeader = this.state.eventListColorStyle === 'row';
      const isDarkModeAll = document.body.classList.contains('dark-mode');
      const allIconSuffix = useRowColorHeader ? 
        (document.body.classList.contains('dark-mode') ? '_white.png' : '.png') : 
        (isDarkModeAll ? '_white.png' : '.png');
      addAllToCalendarBtn.innerHTML = `<img src="icons/add_to_calendar${allIconSuffix}" alt="Add to Calendar" style="width: 16px; height: 16px; display: block; margin: 0; vertical-align: middle;">`;
        addAllToCalendarBtn.title = 'Add all events to calendar';
      addAllToCalendarBtn.style.cssText = 'background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; line-height: 0;';
        addAllToCalendarBtn.onmouseover = () => addAllToCalendarBtn.style.opacity = '1';
        addAllToCalendarBtn.onmouseout = () => addAllToCalendarBtn.style.opacity = '0.7';
        addAllToCalendarBtn.onclick = (e) => {
          e.stopPropagation();
          this.showAddAllToCalendarDialog();
        };
        
        const deleteAllBtn = document.createElement('button');
        deleteAllBtn.textContent = '×';
        deleteAllBtn.title = 'Delete all events';
        // Match event row button styling - use adaptive color if row style, otherwise default #b44
        // For header row, we don't have event brightness, so use default or check if row style is enabled
        const deleteAllBtnColor = '#b44'; // Default color for header row
        deleteAllBtn.style.cssText = `background: none; border: none; color: ${deleteAllBtnColor}; font-size: 1.1em; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;`;
        deleteAllBtn.onmouseover = () => deleteAllBtn.style.opacity = '1';
        deleteAllBtn.onmouseout = () => deleteAllBtn.style.opacity = '0.8';
        deleteAllBtn.onclick = (e) => {
          e.stopPropagation();
          // Only count events from visible calendars
          const visibleEvents = this.events.filter(e => this.state.visibleCalendars.includes((e.calendar || 'Home')));
          if (confirm(`Delete all ${visibleEvents.length} visible event${visibleEvents.length !== 1 ? 's' : ''}? This action cannot be undone.`)) {
            // Only delete events from visible calendars
            this.events = this.events.filter(e => !this.state.visibleCalendars.includes((e.calendar || 'Home')));
            this._eventsVersion++;
            // Save events to localStorage
            this.saveEventsToStorage();
            this.drawSpiral();
            renderEventList();
          }
        };
        
        rightContent.appendChild(addAllToCalendarBtn);
        rightContent.appendChild(deleteAllBtn);
        
        allLi.appendChild(leftContent);
      allLi.appendChild(calendarContent);
      allLi.appendChild(middleContent);
        allLi.appendChild(rightContent);
      return allLi;
    };
      
    // Helper function to create event list item with all handlers
    const createEventListItem = (ev, isBottomList = false, heightScale = 1.0) => {
        const li = document.createElement('li');
      // Use centered layout on desktop, but keep space-between on mobile
      const isMobile = window.innerWidth <= 768;
      // For event panel (not bottom list), use responsive widths to fit panel
      const isEventPanel = !isBottomList;
      const gapSize = (isMobile || isEventPanel) ? '0.5em' : '1em'; // Smaller gap for event panel
      
      // Calculate padding based on height scale (base padding scales with proximity)
      const basePadding = 0.2; // Base padding in em
      const scaledPadding = basePadding * heightScale;
      
      // Get event display color
      const isDarkMode = document.body.classList.contains('dark-mode');
      const displayColor = this.getDisplayColorForEvent(ev);
      
      // Check which style to use: 'row' for full row background, 'dot' for colored circle
      // Always use dot style for event panel, respect user preference for bottom list
      const useRowColor = !isEventPanel && this.state.eventListColorStyle === 'row';
      
      // Calculate text color based on background brightness (only needed for row style)
      let textColor = '#333'; // Default text color
      let brightness = 128;
      if (useRowColor) {
        const hex = displayColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        brightness = (r * 299 + g * 587 + b * 114) / 1000;
        textColor = brightness > 128 ? '#000' : '#fff';
      }
      
      // Set background color and text color on the row (only if using row style)
      // Use !important to override dark mode CSS that forces transparent backgrounds
      const rowBackgroundStyle = useRowColor ? `background-color: ${displayColor} !important; color: ${textColor} !important;` : '';
      // When using row color style, extend to edges by using negative margins to counteract container padding
      // For bottom list, we need to counteract the 0.5em padding; for event panel, no negative margin needed (panel handles padding)
      // Use calc(100% + 1em) to extend width beyond container, counteracting both left and right padding
      const horizontalMargin = (useRowColor && !isEventPanel) ? 'margin-left: -0.5em; margin-right: -0.5em; padding-left: 0.5em; padding-right: 0.5em; width: calc(100% + 1em);' : '';
      // Apply scaled padding for proximity-based height scaling
      li.style.cssText = `padding: ${scaledPadding}em 0; ${horizontalMargin} border-bottom: 1px solid ${useRowColor ? 'rgba(0,0,0,0.1)' : '#eee'}; display: flex; justify-content: ${isMobile || isEventPanel ? 'space-between' : 'center'}; align-items: center; gap: ${gapSize}; overflow: hidden; ${!horizontalMargin ? 'max-width: 100%; width: 100%;' : ''} box-sizing: border-box; transition: padding 0.3s ease; ${rowBackgroundStyle}`;
      
      // Left side with color dot and title
        const leftContent = document.createElement('div');
      // For event panel, use flex to fit panel width; for bottom list on desktop, use fixed 300px
      const leftWidth = (isMobile || isEventPanel) ? 'flex: 1; min-width: 60px; ' : 'width: 300px; ';
      leftContent.style.cssText = 'display: flex; align-items: center; ' + leftWidth + 'min-width: ' + (isMobile || isEventPanel ? '60px' : '0') + '; flex-shrink: 1;';
        
        // Format time using UTC to avoid DST issues (date is shown in day header)
        const eventDate = new Date(ev.start);
        const hours = pad2(eventDate.getUTCHours());
        const minutes = pad2(eventDate.getUTCMinutes());
        const dateStr = `${hours}:${minutes}`;
      
      // Add color dot - always show in event panel, only show in bottom list when using dot style
      const showColorDot = isEventPanel || !useRowColor;
      const colorDot = showColorDot ? `<span style="display:inline-block;width:14px;height:14px;min-width:14px;max-width:14px;flex-shrink:0;border-radius:50%;background:${displayColor};margin-right:7px;vertical-align:middle;box-sizing:border-box;"></span>` : '';
      leftContent.innerHTML = `${colorDot}<span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${ev.title}</span>`;
      
      // Calendar column (smaller on mobile to fit narrow screens, but can shrink if needed)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const calendarWidth = (isMobile || isEventPanel) ? (isMobile ? '60px' : 'flex: 0 0 auto; min-width: 40px; max-width: 65px;') : '80px';
      const calendarContent = document.createElement('div');
      const calendarWidthStyle = (isMobile || isEventPanel) && !isMobile ? calendarWidth : `width: ${isMobile ? '60px' : '80px'};`;
      calendarContent.style.cssText = `display: flex; align-items: center; justify-content: flex-start; ${calendarWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 30px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 80px;' : ''} overflow: hidden;`;
      
      // Get calendar color for background, with fallback
      let calBgColor = isDarkMode ? 'var(--dark-bg-secondary)' : '#eee';
      let calTextColor = isDarkMode ? 'var(--dark-text-primary)' : '#555';
      let calBorderColor = isDarkMode ? 'var(--dark-border)' : '#ddd';
      
      if (ev.calendar && this.state.calendarColors && this.state.calendarColors[ev.calendar]) {
        calBgColor = this.state.calendarColors[ev.calendar];
        // Determine text color based on background brightness
        // Convert hex to RGB and calculate brightness
        const hex = calBgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        calTextColor = brightness > 128 ? '#000' : '#fff';
        calBorderColor = calBgColor;
      }
      
      if (ev.calendar) {
        const calTag = document.createElement('span');
        calTag.style.cssText = `padding: 0 ${isMobile ? '4px' : '6px'}; font-size: ${isMobile ? '0.72em' : '0.78em'}; background: ${calBgColor}; border: 1px solid ${calBorderColor}; border-radius: 0.6em; color: ${calTextColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; display: inline-block; cursor: pointer;`;
        calTag.textContent = ev.calendar;
        
        // Long press handler to deselect all other calendars (select only this one)
        let pressStartTime = 0;
        let pressTimer = null;
        let hasMoved = false;
        const longPressDuration = 500; // 500ms for long press
        
        const handlePressStart = (e) => {
          pressStartTime = Date.now();
          hasMoved = false;
          pressTimer = setTimeout(() => {
            // Long press detected - toggle calendar filter
            if (!hasMoved && ev.calendar) {
              const isCurrentlyFiltered = this.state.visibleCalendars.length === 1 && 
                                          this.state.visibleCalendars[0] === ev.calendar;
              
              if (isCurrentlyFiltered) {
                // Second long press: restore previous state
                if (this._previousVisibleCalendars !== null) {
                  this.state.visibleCalendars = [...this._previousVisibleCalendars];
                  this._previousVisibleCalendars = null;
                } else {
                  // If no previous state, show all calendars
                  this.state.visibleCalendars = [...this.state.calendars];
                }
              } else {
                // First long press: save current state and filter to this calendar only
                this._previousVisibleCalendars = [...this.state.visibleCalendars];
                this.state.visibleCalendars = [ev.calendar];
              }
              
              this.saveSettingsToStorage();
              // Rebuild calendar dropdown menu to update checkboxes
              if (typeof this.buildCalendarMenu === 'function') {
                this.buildCalendarMenu();
              }
              // Re-render event list
              if (typeof window.renderEventList === 'function') {
                window.renderEventList();
              }
              this.drawSpiral();
            }
          }, longPressDuration);
        };
        
        const handlePressEnd = (e) => {
          if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
          pressStartTime = 0;
          hasMoved = false;
        };
        
        const handleMove = (e) => {
          hasMoved = true;
          if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
        };
        
        // Add event listeners for both touch and mouse
        calTag.addEventListener('touchstart', handlePressStart, { passive: true });
        calTag.addEventListener('touchend', handlePressEnd, { passive: true });
        calTag.addEventListener('touchmove', handleMove, { passive: true });
        calTag.addEventListener('touchcancel', handlePressEnd, { passive: true });
        calTag.addEventListener('mousedown', handlePressStart);
        calTag.addEventListener('mouseup', handlePressEnd);
        calTag.addEventListener('mouseleave', handlePressEnd);
        calTag.addEventListener('mousemove', handleMove);
        
        calendarContent.appendChild(calTag);
      }
      
      // Time column (smaller on mobile to fit narrow screens, but can shrink if needed)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const dateWidth = (isMobile || isEventPanel) ? (isMobile ? '50px' : 'flex: 0 0 auto; min-width: 40px; max-width: 55px;') : '55px';
        const middleContent = document.createElement('div');
      const dateWidthStyle = (isMobile || isEventPanel) && !isMobile ? dateWidth : `width: ${isMobile ? '50px' : '55px'};`;
      // Use the calculated text color for time (only if using row style, otherwise use default)
      const dateTextColor = useRowColor ? textColor : (isDarkMode ? 'var(--dark-text-primary)' : '#666');
      middleContent.style.cssText = `color: ${dateTextColor}; font-size: ${isMobile ? '0.85em' : '0.90em'}; white-space: nowrap; ${dateWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 35px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 55px;' : ''} text-align: left; overflow: hidden; text-overflow: ellipsis;`;
        middleContent.textContent = dateStr;
        
      // Right side with action buttons (fixed width, must never shrink to stay visible)
      // For event panel, use slightly smaller buttons; for bottom list on desktop, use standard width
      const buttonWidth = (isMobile || isEventPanel) ? (isMobile ? '45px' : '45px') : '50px';
        const rightContent = document.createElement('div');
      rightContent.style.cssText = `display: flex; align-items: center; justify-content: flex-end; gap: ${isMobile ? '3px' : '4px'}; width: ${buttonWidth}; flex-shrink: 0; min-width: ${buttonWidth};`;

        // Add to Calendar button
        const addToCalendarBtn = document.createElement('button');
      let iconSrc, iconAlt, titleText;
      
      // Use white icon for dark backgrounds, dark icon for light backgrounds (only if using row style)
      const iconSuffix = useRowColor ? (brightness > 128 ? '.png' : '_white.png') : (isDarkMode ? '_white.png' : '.png');
      
      if (ev.addedToCalendar) {
        // Check if event has been modified since being added to calendar
        const hasBeenModified = ev.lastModified && ev.lastAddedToCalendar && 
                               ev.lastModified > ev.lastAddedToCalendar;
        
        if (hasBeenModified) {
          iconSrc = `icons/update_calendar${iconSuffix}`;
          iconAlt = 'Update in Calendar';
          titleText = 'Event needs update in calendar';
        } else {
          iconSrc = `icons/added_to_calendar${iconSuffix}`;
          iconAlt = 'Added to Calendar';
          titleText = 'Open calendar to manage event';
        }
      } else {
        iconSrc = `icons/add_to_calendar${iconSuffix}`;
        iconAlt = 'Add to Calendar';
        titleText = 'Add event to calendar';
      }
      
      addToCalendarBtn.innerHTML = `<img src="${iconSrc}" alt="${iconAlt}" style="width: 16px; height: 16px; display: block; margin: 0; vertical-align: middle;">`;
      addToCalendarBtn.title = titleText;
      addToCalendarBtn.style.cssText = 'background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; line-height: 0;';
        addToCalendarBtn.onmouseover = () => addToCalendarBtn.style.opacity = '1';
        addToCalendarBtn.onmouseout = () => addToCalendarBtn.style.opacity = '0.7';
      
      // Create add to calendar handler (same logic reused)
      const createAddToCalendarHandler = (event) => {
        return (e) => {
          e.stopPropagation();
          
          // Always open calendar app - even for up-to-date events, users might want to delete them
          // Detect iOS for better Apple Calendar integration
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          
          if (isIOS) {
            // For iOS, directly download ICS file that will open in Apple Calendar (like "Add All")
            let icsContent = 'BEGIN:VCALENDAR\r\n';
            icsContent += 'VERSION:2.0\r\n';
            icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
            icsContent += 'CALSCALE:GREGORIAN\r\n';
            icsContent += 'METHOD:PUBLISH\r\n';
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:${generateEventUID(event)}\r\n`;
            icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
            icsContent += `DTSTART:${formatIcsDateUTC(event.start)}\r\n`;
            icsContent += `DTEND:${formatIcsDateUTC(event.end)}\r\n`;
            icsContent += `SUMMARY:${escapeIcsText(event.title)}\r\n`;
            if (event.description) {
              icsContent += `DESCRIPTION:${escapeIcsText(event.description)}\r\n`;
            }
            icsContent += `X-SPIRAL-COLOR:${event.color}\r\n`;
            // Add iOS-friendly properties
            icsContent += 'STATUS:CONFIRMED\r\n';
            icsContent += `SEQUENCE:${generateEventSequence(event)}\r\n`;
            icsContent += 'END:VEVENT\r\n';
            icsContent += 'END:VCALENDAR\r\n';

            const blob = new Blob([icsContent], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spiral-${event.title.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 0);
            
            // Mark event as added to calendar
            event.addedToCalendar = true;
            event.lastAddedToCalendar = Date.now();
            this.saveEventsToStorage();
            // Update event list to show new icon state (with delay to ensure properties are saved)
            setTimeout(() => renderEventList(), 0);
            return;
          }
          
          // For non-iOS devices, show the options dialog
          // Create options dialog
          const dialog = document.createElement('div');
          dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(222, 222, 222, 0.95);
            padding: 1.2em;
            border-radius: 0.5em;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 1000;
            min-width: 200px;
            text-align: center;
          `;

          const calendarButtonText = 'Open Calendar App';

          dialog.innerHTML = `
            <h4 style="margin: 0 0 0.8em 0; color: #333;">Add "${event.title}" to Calendar</h4>
            <div style="display: flex; gap: 0.5em; justify-content: center; flex-direction: column;">
              <button id="downloadICS" style="padding: 0.4em 1em; background: #4CAF50; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Download .ics file</button>
                <button id="openCalendar" style="padding: 0.4em 1em; background: #2196F3; color: white; border: none; border-radius: 0.3em; cursor: pointer;">${calendarButtonText}</button>
                <button id="openGoogleCalendar" style="padding: 0.4em 1em; background: #DB4437; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Google Calendar</button>
            </div>
            <button id="cancelCalendar" style="margin-top: 0.8em; padding: 0.3em 1em; background: #666; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Cancel</button>
          `;

          document.body.appendChild(dialog);

          // Download ICS file - mark as added since user is downloading
          dialog.querySelector('#downloadICS').onclick = () => {
            let icsContent = 'BEGIN:VCALENDAR\r\n';
            icsContent += 'VERSION:2.0\r\n';
            icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
            icsContent += 'CALSCALE:GREGORIAN\r\n';
            icsContent += 'METHOD:PUBLISH\r\n';
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:${generateEventUID(event)}\r\n`;
            icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
            icsContent += `DTSTART:${formatIcsDateUTC(event.start)}\r\n`;
            icsContent += `DTEND:${formatIcsDateUTC(event.end)}\r\n`;
            icsContent += `SUMMARY:${escapeIcsText(event.title)}\r\n`;
            if (event.description) {
              icsContent += `DESCRIPTION:${escapeIcsText(event.description)}\r\n`;
            }
            icsContent += `X-SPIRAL-COLOR:${event.color}\r\n`;
            // Add iOS-friendly properties
            icsContent += 'STATUS:CONFIRMED\r\n';
            icsContent += `SEQUENCE:${generateEventSequence(event)}\r\n`;
            icsContent += 'END:VEVENT\r\n';
            icsContent += 'END:VCALENDAR\r\n';

            const blob = new Blob([icsContent], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spiral-${event.title.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 0);
            
            // Mark event as added to calendar
            event.addedToCalendar = true;
            event.lastAddedToCalendar = Date.now();
            this.saveEventsToStorage();
            // Update event list to show new icon state (with delay to ensure properties are saved)
            setTimeout(() => renderEventList(), 0);
            
            document.body.removeChild(dialog);
          };

          // Open calendar app - don't mark as added since user might just view
          dialog.querySelector('#openCalendar').onclick = () => {
            const startDate = new Date(event.start).toISOString();
            const endDate = new Date(event.end).toISOString();
            
              // For non-iOS, try to open Google Calendar
            const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate.replace(/[-:]/g, '').split('.')[0]}Z/${endDate.replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(event.description || '')}`;
              window.open(googleCalendarUrl, '_blank');
            
            // Don't mark as added - user might just view or cancel
            document.body.removeChild(dialog);
          };
          
          // Add Google Calendar button handler for non-iOS devices
            const googleCalendarBtn = dialog.querySelector('#openGoogleCalendar');
            if (googleCalendarBtn) {
              googleCalendarBtn.onclick = () => {
              const startDate = new Date(event.start).toISOString();
              const endDate = new Date(event.end).toISOString();
                
              const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate.replace(/[-:]/g, '').split('.')[0]}Z/${endDate.replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(event.description || '')}`;
            window.open(googleCalendarUrl, '_blank');
              
              // Don't mark as added - user might just view or cancel
            document.body.removeChild(dialog);
          };
          }

          dialog.querySelector('#cancelCalendar').onclick = () => {
            document.body.removeChild(dialog);
          };

          // Close on outside click
          dialog.onclick = (e) => {
            if (e.target === dialog) {
              document.body.removeChild(dialog);
            }
          };
          };
        };

      addToCalendarBtn.onclick = createAddToCalendarHandler(ev);

        // Remove button - adjust color based on background brightness (only if using row style)
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove event';
        // Use appropriate color for remove button based on background
        const removeBtnColor = useRowColor ? (brightness > 128 ? '#b44' : '#ff6b6b') : '#b44';
        removeBtn.style.cssText = `background: none; border: none; color: ${removeBtnColor}; font-size: 1.1em; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;`;
        removeBtn.onmouseover = () => removeBtn.style.opacity = '1';
        removeBtn.onmouseout = () => removeBtn.style.opacity = '0.8';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
        if (confirm(`Delete event "${ev.title}"? This action cannot be undone.`)) {
          const idx = this.events.indexOf(ev);
          if (idx !== -1) {
            this.events.splice(idx, 1);
            this._eventsVersion++;
            // Save events to localStorage
            this.saveEventsToStorage();
            this.drawSpiral();
            renderEventList();
          }
          }
        };
        
        rightContent.appendChild(addToCalendarBtn);
        rightContent.appendChild(removeBtn);
        
        li.appendChild(leftContent);
      li.appendChild(calendarContent);
        li.appendChild(middleContent);
        li.appendChild(rightContent);

        // Select event on click
        li.style.cursor = 'pointer';
        li.onclick = (e) => {
        if (e.target === removeBtn || e.target.closest('button') === removeBtn) return;
          
          // Find the segment corresponding to the event's start time
          const eventStart = new Date(ev.start);
          const diffHours = (eventStart - this.referenceTime) / (1000 * 60 * 60);
          // Use floor for future and ceil for past to avoid off-by-one day rounding
          const segmentId = diffHours >= 0 ? Math.floor(diffHours) : Math.ceil(diffHours);
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const absPos = totalVisibleSegments - segmentId - 1;
          let newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
          // Map event UTC hour to spiral segment index (segment 0 = outermost/most recent, 23 = innermost/oldest)
          // The spiral counts from outside in, so segment 0 is hour 0 (00:00-01:00) when looking outward
          // But getAllEventsForSegment expects: segment 0 = 23:00-00:00, segment 23 = 00:00-01:00 (inverted)
          const eventUtcHour = eventStart.getUTCHours();
          // Convert UTC hour to spiral segment: hour 0 -> segment 23, hour 1 -> segment 22, ..., hour 23 -> segment 0
          const targetSegment = (CONFIG.SEGMENTS_PER_DAY - 1) - eventUtcHour;
          

          // Simple sanity adjustment: if computed day is off by exactly one day
          // compared to the event's actual UTC date, nudge the day index.
          try {
            const calcSegmentDate = (dayIdx, segIdx) => {
              const segId = totalVisibleSegments - (dayIdx * CONFIG.SEGMENTS_PER_DAY + segIdx) - 1;
              return new Date(this.referenceTime.getTime() + segId * 60 * 60 * 1000);
            };
            const candidateDate = calcSegmentDate(newDay, targetSegment);
            const eventStartUtc = new Date(ev.start);
            const dayMs = 24 * 60 * 60 * 1000;
            const deltaDays = Math.round((candidateDate - eventStartUtc) / dayMs);
            if (deltaDays === 1 && newDay > 0) {
              newDay -= 1;
            } else if (deltaDays === -1 && newDay < this.state.days - 1) {
              newDay += 1;
            }
          } catch (_) {
            // Fail-safe: ignore adjustment on any unexpected error
          }
          // After computing the rotation target, prefer to set rotation first
          const thetaMax = (this.state.days) * 2 * Math.PI;
          const eventRotation = (diffHours / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
          this.state.rotation = eventRotation;

          // Robustly locate the exact day containing this event for the computed hour segment
          // Check a few days around the computed day to handle edge cases
          let foundDay = -1;
          const searchRange = 2; // Check ±2 days around computed day
          const startDay = Math.max(0, newDay - searchRange);
          const endDay = Math.min(this.state.days - 1, newDay + searchRange);
          
          for (let d = startDay; d <= endDay; d++) {
            const list = this.getAllEventsForSegment(d, targetSegment);
            const idx = list.findIndex(ei => ei.event === ev);
            if (idx !== -1) { 
              foundDay = d;
              break;
            }
          }
          
          // If not found in nearby days, search all days as fallback
          if (foundDay === -1) {
            for (let d = 0; d < this.state.days; d++) {
              const list = this.getAllEventsForSegment(d, targetSegment);
              const idx = list.findIndex(ei => ei.event === ev);
              if (idx !== -1) { 
                foundDay = d;
                break;
              }
            }
          }
          
          if (foundDay !== -1) {
            newDay = foundDay;
          }

          this.mouseState.selectedSegment = { day: newDay, segment: targetSegment };
          // Keep selectedSegmentId consistent with the adjusted day/segment
          const adjustedSegmentId = totalVisibleSegments - (newDay * CONFIG.SEGMENTS_PER_DAY + targetSegment) - 1;
          this.mouseState.selectedSegmentId = adjustedSegmentId;
          // Find the event index for this segment
          const allEvents = this.getAllEventsForSegment(newDay, targetSegment);
          const eventIdx = allEvents.findIndex(ei => ei.event === ev);
          this.mouseState.selectedEventIndex = eventIdx >= 0 ? eventIdx : 0;
          this.state.detailMode = newDay;
          
          // --- rotation already updated above ---
          
          // Turn off Auto Time Align when jumping to an event
          if (this.autoTimeAlignState.enabled) {
            this.stopAutoTimeAlign();
          }
          
          // Update the rotateSlider UI to match
          const rotateSlider = document.getElementById('rotateSlider');
          if (rotateSlider) {
            const degrees = eventRotation * 180 / Math.PI;
            rotateSlider.value = degrees;
            const rotateVal = document.getElementById('rotateVal');
            if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
          }
          
          // Switch to circle mode for detail view
          if (!this.state.circleMode) {
            this._wasSpiralModeBeforeDetail = true;
            this.alignSelectedSegmentInCircleMode();
            this.state.circleMode = true;
            const circleModeCheckbox = document.getElementById('circleMode');
            if (circleModeCheckbox) circleModeCheckbox.checked = true;
          }
          
          // Force a redraw to ensure the time display shows the correct time
          this.drawSpiral();
        };
      
      return li;
    };

    window.renderEventList = () => {
      // Sort events by start date and apply calendar visibility filter and search query
      const searchQuery = (this.eventListSearchQuery || '').toLowerCase().trim();
      const sorted = this.events
        .filter(e => {
          // Filter by visible calendars
          if (!this.state.visibleCalendars.includes((e.calendar || 'Home'))) return false;
          // Filter by search query if present
          if (searchQuery) {
            const title = (e.title || '').toLowerCase();
            const description = (e.description || '').toLowerCase();
            const calendar = (e.calendar || 'Home').toLowerCase();
            return title.includes(searchQuery) || description.includes(searchQuery) || calendar.includes(searchQuery);
          }
          return true;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      
      // Preserve search input on mobile to prevent keyboard from closing
      // Check both search inputs (main panel and bottom list)
      const existingSearchInput = document.getElementById('eventListSearch');
      const existingBottomSearchInput = document.getElementById('eventListSearchBottom');
      const wasSearchFocused = existingSearchInput && document.activeElement === existingSearchInput;
      const wasBottomSearchFocused = existingBottomSearchInput && document.activeElement === existingBottomSearchInput;
      const activeSearchInput = wasSearchFocused ? existingSearchInput : (wasBottomSearchFocused ? existingBottomSearchInput : null);
      const searchCursorPos = activeSearchInput ? (activeSearchInput.selectionStart || activeSearchInput.value.length) : null;
      
      // Find and preserve the header row if search input is focused
      const headerLi = eventList.querySelector('li:first-child');
      const shouldPreserveHeader = wasSearchFocused && headerLi && headerLi.querySelector('#eventListSearch');
      
      // Remove all items except header if preserving
      if (shouldPreserveHeader) {
        // Remove all list items except the first one (header)
        // Don't touch the header or search input - keep them intact to preserve focus
        const items = Array.from(eventList.children);
        for (let i = 1; i < items.length; i++) {
          items[i].remove();
        }
      } else {
        // Full clear if not preserving
        eventList.innerHTML = '';
      }
      
      // Also prepare bottom event list container (if present)
      const bottomEventListItems = document.getElementById('bottomEventListItems');
      let shouldPreserveBottomHeader = false;
      if (bottomEventListItems) {
        // Check if bottom list has focused search input
        const bottomHeaderLi = bottomEventListItems.querySelector('li:first-child');
        shouldPreserveBottomHeader = wasBottomSearchFocused && bottomHeaderLi && bottomHeaderLi.querySelector('#eventListSearchBottom');
        
        if (shouldPreserveBottomHeader) {
          const bottomItems = Array.from(bottomEventListItems.children);
          for (let i = 1; i < bottomItems.length; i++) {
            bottomItems[i].remove();
          }
          // Value should already be synced via the input handler
        } else {
          bottomEventListItems.innerHTML = '';
        }
      }

      // Add "All:" header item if there are events OR if there's a search query (so search bar is always visible)
      // Only create if we didn't preserve it
      const hasSearchQuery = searchQuery.length > 0;
      if (!shouldPreserveHeader && (this.events.length > 0 || hasSearchQuery)) {
        const allHeaderItem = createAllHeaderItem();
        eventList.appendChild(allHeaderItem);
      }
      
      // Clone for bottom list
      if (bottomEventListItems && !shouldPreserveBottomHeader && (this.events.length > 0 || hasSearchQuery)) {
        const allHeaderBottom = createAllHeaderItem(true); // Pass true to indicate it's for bottom list
        bottomEventListItems.appendChild(allHeaderBottom);
      }
      
      // Empty state for both lists when no visible events (but still show header if searching)
      if (sorted.length === 0) {
        const isMobile = window.innerWidth <= 768;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const makeEmptyItem = () => {
          const li = document.createElement('li');
          li.style.cssText = 'padding: 0.6em 0; border-bottom: 1px solid #eee; display: flex; justify-content: center; align-items: center; gap: 0.6em;';
          const msg = document.createElement('div');
          msg.style.cssText = `font-size: ${isMobile ? '0.88em' : '0.95em'}; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#666'}; opacity: 0.8; text-align: center;`;
          msg.textContent = hasSearchQuery ? 'No events found' : 'No events to show';
          const hint = document.createElement('div');
          hint.style.cssText = `font-size: ${isMobile ? '0.78em' : '0.85em'}; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#888'}; opacity: 0.8;`;
          hint.textContent = hasSearchQuery ? 'Try a different search term.' : 'Use + to add events.';
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex; flex-direction: column; align-items: center;';
          wrap.appendChild(msg);
          wrap.appendChild(hint);
          li.appendChild(wrap);
          return li;
        };

        eventList.appendChild(makeEmptyItem());
        if (bottomEventListItems) {
          bottomEventListItems.appendChild(makeEmptyItem());
        }
        return;
      }
      
      // Calculate proximity scaling for events
      // Use the time shown in the time display, not just current time
      const displayTime = this.getDisplayTime();
      
      // First, check for all currently happening events (start <= displayTime < end)
      // Handle overlapping events by highlighting all of them
      const currentEvents = sorted.filter(e => {
        const eventStart = new Date(e.start);
        const eventEnd = new Date(e.end);
        return eventStart <= displayTime && displayTime < eventEnd;
      });
      
      // Create a Set of highlighted event IDs (for fast lookup)
      const highlightedEventIds = new Set();
      
      if (currentEvents.length > 0) {
        // Highlight all currently happening events (including overlapping ones)
        currentEvents.forEach(e => {
          const eventId = e.id || e.start;
          highlightedEventIds.add(eventId);
        });
      } else {
        // No current event, find the next upcoming event
        const upcomingEvents = sorted.filter(e => new Date(e.start) > displayTime);
        if (upcomingEvents.length > 0) {
          const eventId = upcomingEvents[0].id || upcomingEvents[0].start;
          highlightedEventIds.add(eventId);
        }
      }
      
      // Calculate height scale for each event - scale all highlighted events (current or next)
      const getEventHeightScale = (event) => {
        // Scale all highlighted events (3.5x size)
        const eventId = event.id || event.start;
        if (highlightedEventIds.has(eventId)) {
          return 3.5;
        }
        // All other events get normal height
        return 1.0;
      };
      
      // Group events by day (using UTC date to avoid timezone issues)
      const eventsByDay = new Map();
      for (const ev of sorted) {
        const eventDate = new Date(ev.start);
        const dayKey = `${eventDate.getUTCFullYear()}-${eventDate.getUTCMonth()}-${eventDate.getUTCDate()}`;
        if (!eventsByDay.has(dayKey)) {
          eventsByDay.set(dayKey, []);
        }
        eventsByDay.get(dayKey).push(ev);
      }
      
      // Helper function to create day header
      // Uses the same layout structure as event rows for proper alignment
      const createDayHeader = (dayKey, isBottomList = false) => {
        const li = document.createElement('li');
        const isMobile = window.innerWidth <= 768;
        const isEventPanel = !isBottomList;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const gapSize = (isMobile || isEventPanel) ? '0.5em' : '1em';
        
        // Parse dayKey (format: YYYY-M-D)
        const [year, month, day] = dayKey.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month, day));
        const today = new Date();
        const todayKey = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;
        const isToday = dayKey === todayKey;
        
        // Format date string (e.g., "Monday, Jan 15, 2025" or "Today, Jan 15, 2025")
        const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getUTCDay()];
        const monthName = MONTHS_SHORT_UTC[month];
        const dateStr = isToday ? `Today, ${monthName} ${day}, ${year}` : `${weekday}, ${monthName} ${day}, ${year}`;
        
        // Use same layout structure as event rows: flex with leftContent, calendarContent, middleContent, rightContent
        const horizontalMargin = !isEventPanel ? 'margin-left: -0.5em; margin-right: -0.5em; padding-left: 0.5em; padding-right: 0.5em; width: calc(100% + 1em);' : '';
        // Sticky day header - sticks to top while day's events are visible
        // Use same background as header for seamless coverage
        const headerBg = isDarkMode ? 'var(--dark-bg-panel)' : (isEventPanel ? 'rgba(222, 222, 222, 0.85)' : 'rgba(255, 255, 255, 0.95)');
        // Calculate sticky top offset (0 if no "All:" header, or account for it)
        // We'll update this dynamically after measuring the "All:" header
        const stickyTop = '0'; // Will be updated in a follow-up pass
        // Thinner header with border on top, sticky positioning
        li.style.cssText = `position: sticky; top: ${stickyTop}; z-index: 4; padding: 0.3em 0; ${horizontalMargin} border-top: 2px solid ${isDarkMode ? 'var(--dark-border)' : '#ccc'}; background: ${headerBg}; display: flex; justify-content: ${isMobile || isEventPanel ? 'space-between' : 'center'}; align-items: center; gap: ${gapSize}; overflow: hidden; ${!horizontalMargin ? 'max-width: 100%; width: 100%;' : ''} box-sizing: border-box;`;
        
        // Left side - matches event title position (same width/style as leftContent in event rows)
        const leftContent = document.createElement('div');
        const leftWidth = (isMobile || isEventPanel) ? 'flex: 1; min-width: 60px; ' : 'width: 300px; ';
        leftContent.style.cssText = 'display: flex; align-items: center; ' + leftWidth + 'min-width: ' + (isMobile || isEventPanel ? '60px' : '0') + '; flex-shrink: 1;';
        
        // When dot style is enabled, add an invisible placeholder dot to align with event color circles
        const useRowColor = this.state.eventListColorStyle === 'row';
        if (!useRowColor) {
          // Add invisible placeholder dot (14px width + 7px margin) to align with event color circles
          const placeholderDot = document.createElement('span');
          placeholderDot.style.cssText = 'display:inline-block;width:14px;height:14px;min-width:14px;max-width:14px;flex-shrink:0;margin-right:7px;visibility:hidden;';
          leftContent.appendChild(placeholderDot);
        }
        
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = `font-weight: 600; font-size: ${isMobile ? '0.9em' : '0.95em'}; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#333'};`;
        titleSpan.textContent = dateStr;
        leftContent.appendChild(titleSpan);
        li.appendChild(leftContent);
        
        // Calendar column - empty but maintains spacing (same width as event rows)
        const calendarWidth = (isMobile || isEventPanel) ? (isMobile ? '60px' : 'flex: 0 0 auto; min-width: 40px; max-width: 65px;') : '80px';
        const calendarContent = document.createElement('div');
        const calendarWidthStyle = (isMobile || isEventPanel) && !isMobile ? calendarWidth : `width: ${isMobile ? '60px' : '80px'};`;
        calendarContent.style.cssText = `display: flex; align-items: center; justify-content: flex-start; ${calendarWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 30px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 80px;' : ''} overflow: hidden;`;
        li.appendChild(calendarContent);
        
        // Time column - empty but maintains spacing (same width as event rows)
        const dateWidth = (isMobile || isEventPanel) ? (isMobile ? '50px' : 'flex: 0 0 auto; min-width: 40px; max-width: 55px;') : '55px';
        const middleContent = document.createElement('div');
        const dateWidthStyle = (isMobile || isEventPanel) && !isMobile ? dateWidth : `width: ${isMobile ? '50px' : '55px'};`;
        middleContent.style.cssText = `${dateWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 35px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 55px;' : ''}`;
        li.appendChild(middleContent);
        
        // Right side - empty but maintains spacing (same width as event rows)
        const buttonWidth = (isMobile || isEventPanel) ? (isMobile ? '45px' : '45px') : '50px';
        const rightContent = document.createElement('div');
        rightContent.style.cssText = `display: flex; align-items: center; justify-content: flex-end; gap: ${isMobile ? '3px' : '4px'}; width: ${buttonWidth}; flex-shrink: 0; min-width: ${buttonWidth};`;
        li.appendChild(rightContent);
        
        return li;
      };
      
      // Track the first highlighted event item for scrolling (prioritize current events over next)
      let firstHighlightedItem = null;
      let firstHighlightedItemBottom = null;
      
      // Sort day keys chronologically
      const sortedDayKeys = Array.from(eventsByDay.keys()).sort((a, b) => {
        const [yearA, monthA, dayA] = a.split('-').map(Number);
        const [yearB, monthB, dayB] = b.split('-').map(Number);
        const dateA = new Date(Date.UTC(yearA, monthA, dayA));
        const dateB = new Date(Date.UTC(yearB, monthB, dayB));
        return dateA - dateB;
      });
      
      // Render events grouped by day
      const dayHeaders = [];
      const dayHeadersBottom = [];
      
      for (const dayKey of sortedDayKeys) {
        const dayEvents = eventsByDay.get(dayKey);
        
        // Add day header for event panel
        const dayHeader = createDayHeader(dayKey, false);
        dayHeaders.push(dayHeader);
        eventList.appendChild(dayHeader);
        
        // Add day header for bottom list
        if (bottomEventListItems) {
          const dayHeaderBottom = createDayHeader(dayKey, true);
          dayHeadersBottom.push(dayHeaderBottom);
          bottomEventListItems.appendChild(dayHeaderBottom);
        }
        
        // Add events for this day
        for (const ev of dayEvents) {
          const heightScale = getEventHeightScale(ev);
          const eventItem = createEventListItem(ev, false, heightScale); // false = event panel, pass height scale
          eventList.appendChild(eventItem);
          
          // Track the first highlighted event item for scrolling
          const eventId = ev.id || ev.start;
          if (highlightedEventIds.has(eventId) && !firstHighlightedItem) {
            firstHighlightedItem = eventItem;
          }
          
          // Clone for bottom list
          if (bottomEventListItems) {
            const eventItemBottom = createEventListItem(ev, true, heightScale); // true = bottom list, pass height scale
            bottomEventListItems.appendChild(eventItemBottom);
            
            // Track the first highlighted event item in bottom list for scrolling
            if (highlightedEventIds.has(eventId) && !firstHighlightedItemBottom) {
              firstHighlightedItemBottom = eventItemBottom;
            }
          }
        }
      }
      
      // Update sticky top offset for day headers after they're in DOM (account for "All:" header if present)
      // Use requestAnimationFrame to ensure layout is calculated
      requestAnimationFrame(() => {
        // Helper to convert CSS value to pixels
        const cssToPx = (cssValue, element) => {
          if (typeof cssValue === 'number') return cssValue;
          const match = cssValue.match(/^(-?\d+\.?\d*)(px|em|rem)$/);
          if (!match) return 0;
          const value = parseFloat(match[1]);
          const unit = match[2];
          if (unit === 'px') return value;
          // Convert em/rem to px using element's computed font-size
          const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
          return value * fontSize;
        };
        
        // Event panel
        const allHeaderItem = eventList.querySelector('li:first-child');
        let stickyTopOffset = '0';
        if (allHeaderItem && allHeaderItem.querySelector('#eventListSearch')) {
          const allHeaderHeight = allHeaderItem.offsetHeight || 0;
          const computedStyle = window.getComputedStyle(allHeaderItem);
          const allHeaderTop = computedStyle.top;
          // Convert top value to pixels, accounting for negative values
          const topPx = cssToPx(allHeaderTop, allHeaderItem);
          // Day headers should stick at the bottom edge of the "All:" header
          // If top is negative (extends upward), bottom is at: topPx + height
          // If top is 0 or positive, bottom is at: height
          const headerBottomPx = topPx < 0 ? topPx + allHeaderHeight : allHeaderHeight;
          stickyTopOffset = `${headerBottomPx}px`;
        }
        
        dayHeaders.forEach(dayHeader => {
          dayHeader.style.top = stickyTopOffset;
        });
        
        // Bottom list
        if (bottomEventListItems) {
          const allHeaderItemBottom = bottomEventListItems.querySelector('li:first-child');
          let stickyTopOffsetBottom = '0';
          if (allHeaderItemBottom && allHeaderItemBottom.querySelector('#eventListSearchBottom')) {
            const allHeaderHeightBottom = allHeaderItemBottom.offsetHeight || 0;
            const computedStyleBottom = window.getComputedStyle(allHeaderItemBottom);
            const allHeaderTopBottom = computedStyleBottom.top;
            const topPxBottom = cssToPx(allHeaderTopBottom, allHeaderItemBottom);
            const headerBottomPxBottom = topPxBottom < 0 ? topPxBottom + allHeaderHeightBottom : allHeaderHeightBottom;
            stickyTopOffsetBottom = `${headerBottomPxBottom}px`;
          }
          
          dayHeadersBottom.forEach(dayHeaderBottom => {
            dayHeaderBottom.style.top = stickyTopOffsetBottom;
          });
        }
      });
      
      // Scroll to show the first highlighted event at the top (after header)
      // Use setTimeout to ensure DOM is updated before scrolling
      setTimeout(() => {
        // Scroll event panel list
        if (firstHighlightedItem && eventList) {
          // Account for sticky "All:" header height if present
          const allHeaderItem = eventList.querySelector('li:first-child');
          const allHeaderHeight = (allHeaderItem && allHeaderItem.querySelector('#eventListSearch')) 
            ? allHeaderItem.offsetHeight || 0 
            : 0;
          
          // Account for sticky day header if the highlighted event is under one
          let dayHeaderHeight = 0;
          const highlightedEventLi = firstHighlightedItem;
          // Find the previous sibling that is a day header (has sticky positioning)
          let prevSibling = highlightedEventLi.previousElementSibling;
          while (prevSibling) {
            const prevStyle = window.getComputedStyle(prevSibling);
            if (prevStyle.position === 'sticky' && prevStyle.zIndex === '4') {
              // This is a day header
              dayHeaderHeight = prevSibling.offsetHeight || 0;
              break;
            }
            prevSibling = prevSibling.previousElementSibling;
          }
          
          const itemOffset = firstHighlightedItem.offsetTop;
          eventList.scrollTop = itemOffset - allHeaderHeight - dayHeaderHeight;
        }
        
        // Scroll bottom event list
        if (firstHighlightedItemBottom && bottomEventListItems) {
          // Account for sticky "All:" header height if present
          const allHeaderItemBottom = bottomEventListItems.querySelector('li:first-child');
          const allHeaderHeightBottom = (allHeaderItemBottom && allHeaderItemBottom.querySelector('#eventListSearchBottom')) 
            ? allHeaderItemBottom.offsetHeight || 0 
            : 0;
          
          // Account for sticky day header if the highlighted event is under one
          let dayHeaderHeightBottom = 0;
          const highlightedEventLiBottom = firstHighlightedItemBottom;
          let prevSiblingBottom = highlightedEventLiBottom.previousElementSibling;
          while (prevSiblingBottom) {
            const prevStyleBottom = window.getComputedStyle(prevSiblingBottom);
            if (prevStyleBottom.position === 'sticky' && prevStyleBottom.zIndex === '4') {
              // This is a day header
              dayHeaderHeightBottom = prevSiblingBottom.offsetHeight || 0;
              break;
            }
            prevSiblingBottom = prevSiblingBottom.previousElementSibling;
          }
          
          const itemOffsetBottom = firstHighlightedItemBottom.offsetTop;
          bottomEventListItems.scrollTop = itemOffsetBottom - allHeaderHeightBottom - dayHeaderHeightBottom;
        }
      }, 0);
      
      // Restore search input cursor position if header was preserved (focus maintained automatically)
      if (wasSearchFocused && shouldPreserveHeader && existingSearchInput) {
        // Header was preserved, so just restore cursor position
        if (searchCursorPos !== null) {
          const maxPos = existingSearchInput.value.length;
          const restorePos = Math.min(searchCursorPos, maxPos);
          existingSearchInput.setSelectionRange(restorePos, restorePos);
        }
        // Update clear button visibility for preserved header
        const preservedContainer = existingSearchInput.parentElement;
        if (preservedContainer) {
          const preservedClearButton = preservedContainer.querySelector('span[title="Clear search"]');
          if (preservedClearButton) {
            const hasValue = existingSearchInput.value.length > 0;
            preservedClearButton.style.opacity = hasValue ? '0.6' : '0';
            preservedClearButton.style.pointerEvents = hasValue ? 'auto' : 'none';
          }
        }
      } else if (wasBottomSearchFocused && shouldPreserveBottomHeader && existingBottomSearchInput) {
        // Bottom header was preserved, restore cursor position
        if (searchCursorPos !== null) {
          const maxPos = existingBottomSearchInput.value.length;
          const restorePos = Math.min(searchCursorPos, maxPos);
          existingBottomSearchInput.setSelectionRange(restorePos, restorePos);
        }
        // Update clear button visibility for preserved bottom header
        const preservedBottomContainer = existingBottomSearchInput.parentElement;
        if (preservedBottomContainer) {
          const preservedBottomClearButton = preservedBottomContainer.querySelector('span[title="Clear search"]');
          if (preservedBottomClearButton) {
            const hasValue = existingBottomSearchInput.value.length > 0;
            preservedBottomClearButton.style.opacity = hasValue ? '0.6' : '0';
            preservedBottomClearButton.style.pointerEvents = hasValue ? 'auto' : 'none';
          }
        }
      } else if ((wasSearchFocused || wasBottomSearchFocused) && !shouldPreserveHeader && !shouldPreserveBottomHeader) {
        // Header was recreated, so we need to restore focus
        requestAnimationFrame(() => {
          const newSearchInput = wasSearchFocused ? document.getElementById('eventListSearch') : document.getElementById('eventListSearchBottom');
          if (newSearchInput) {
            newSearchInput.focus();
            if (searchCursorPos !== null) {
              const maxPos = newSearchInput.value.length;
              const restorePos = Math.min(searchCursorPos, maxPos);
              newSearchInput.setSelectionRange(restorePos, restorePos);
            }
          }
        });
      }
      
    };

    // ICS helpers are provided globally: formatIcsDateUTC, escapeIcsText

    // Function to export as ICS
    const exportToICS = () => {
      if (this.events.length === 0) {
        alert('No events to export.');
        return;
      }

      let icsContent = 'BEGIN:VCALENDAR\r\n';
      icsContent += 'VERSION:2.0\r\n';
      icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
      icsContent += 'CALSCALE:GREGORIAN\r\n';
      icsContent += 'METHOD:PUBLISH\r\n';

      this.events.forEach((event, index) => {
        icsContent += 'BEGIN:VEVENT\r\n';
        icsContent += `UID:spiral-${Date.now()}-${index}\r\n`;
        icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
        icsContent += `DTSTART:${formatIcsDateUTC(event.start)}\r\n`;
        icsContent += `DTEND:${formatIcsDateUTC(event.end)}\r\n`;
        icsContent += `SUMMARY:${escapeIcsText(event.title)}\r\n`;
        if (event.description) {
          icsContent += `DESCRIPTION:${escapeIcsText(event.description)}\r\n`;
        }
        icsContent += `X-SPIRAL-COLOR:${event.color}\r\n`;
        if (event.calendar) {
          icsContent += `X-SPIRAL-CALENDAR:${escapeIcsText(event.calendar)}\r\n`;
        }
        icsContent += 'END:VEVENT\r\n';
      });

      icsContent += 'END:VCALENDAR\r\n';

      const blob = new Blob([icsContent], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spiral-calendar.ics';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    };

    // Function to export as JSON
    const exportToJSON = () => {
      const data = JSON.stringify(this.events, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spiral-events.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    };

    exportEventsBtn.addEventListener('click', () => {
      if (this.events.length === 0) {
        alert('No events to export.');
        return;
      }

      // Create export options dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(222, 222, 222, 0.95);
        padding: 1.5em;
        border-radius: 0.5em;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000;
        min-width: 250px;
        text-align: center;
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 1em 0; color: #333;">Export Events</h3>
        <div style="display: flex; gap: 0.5em; justify-content: center;">
          <button id="exportJSON" style="padding: 0.5em 1em; background: #2196F3; color: white; border: none; border-radius: 0.3em; cursor: pointer;">JSON</button>
          <button id="exportICS" style="padding: 0.5em 1em; background: #4CAF50; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Calendar (.ics)</button>
        </div>
        <button id="cancelExport" style="margin-top: 1em; padding: 0.3em 1em; background: #666; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Cancel</button>
      `;

      document.body.appendChild(dialog);

      // Event listeners
      dialog.querySelector('#exportJSON').onclick = () => {
        exportToJSON();
        document.body.removeChild(dialog);
      };

      dialog.querySelector('#exportICS').onclick = () => {
        exportToICS();
        document.body.removeChild(dialog);
      };

      dialog.querySelector('#cancelExport').onclick = () => {
        document.body.removeChild(dialog);
      };

      // Close on outside click
      dialog.onclick = (e) => {
        if (e.target === dialog) {
          document.body.removeChild(dialog);
        }
      };
    });

    importEventsBtn.addEventListener('click', () => {
      importEventsFile.value = '';
      importEventsFile.click();
    });




    // Helper function to unescape ICS text
    const unescapeICS = (text) => {
      return text
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
    };

    // Helper function to parse ICS date
    const parseICSDate = (dateStr) => {
      // Handle both date-only and date-time formats
      if (dateStr.length === 8) {
        // Date only: YYYYMMDD
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        return new Date(Date.UTC(year, month, day));
      } else {
        // Date-time: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(dateStr.substring(9, 11));
        const minute = parseInt(dateStr.substring(11, 13));
        const second = parseInt(dateStr.substring(13, 15));
        
        if (dateStr.endsWith('Z')) {
          return new Date(Date.UTC(year, month, day, hour, minute, second));
        } else {
          // Assume local time if no timezone indicator
          return new Date(year, month, day, hour, minute, second);
        }
      }
    };

    // Function to parse ICS content
    const parseICSContent = (content) => {
      const events = [];
      const lines = content.split(/\r?\n/);
      let currentEvent = null;
      let inEvent = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line === 'BEGIN:VEVENT') {
          inEvent = true;
          currentEvent = {};
        } else if (line === 'END:VEVENT') {
          inEvent = false;
          if (currentEvent && currentEvent.start && currentEvent.end) {
            // Preserve color if provided; otherwise assign a random color
            if (!currentEvent.color) {
              const eventCalendar = currentEvent.calendar || 'Home';
              const randomColor = this.generateRandomColor(eventCalendar);
              // If generateRandomColor returns hex (single mode), keep it;
              // if it returns HSL, convert to hex for consistency
              currentEvent.color = randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor);
            }
            // Set default calendar if not provided
            if (!currentEvent.calendar) {
              currentEvent.calendar = 'Home';
            }
            events.push(currentEvent);
          }
          currentEvent = null;
        } else if (inEvent && currentEvent) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex);
            let value = line.substring(colonIndex + 1);
            
            // Handle line folding (continued lines)
            while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
              i++;
              value += lines[i].substring(1);
            }
            
            switch (key) {
              case 'SUMMARY':
                currentEvent.title = unescapeICS(value);
                break;
              case 'DESCRIPTION':
                currentEvent.description = unescapeICS(value);
                break;
              case 'DTSTART':
                currentEvent.start = parseICSDate(value);
                break;
              case 'DTEND':
                currentEvent.end = parseICSDate(value);
                break;
              case 'DURATION':
                // Handle duration if no DTEND
                if (currentEvent.start && !currentEvent.end) {
                  const duration = value;
                  // Simple duration parsing (PT1H = 1 hour, PT30M = 30 minutes)
                  let hours = 0, minutes = 0;
                  const hourMatch = duration.match(/(\d+)H/);
                  const minuteMatch = duration.match(/(\d+)M/);
                  if (hourMatch) hours = parseInt(hourMatch[1]);
                  if (minuteMatch) minutes = parseInt(minuteMatch[1]);
                  currentEvent.end = new Date(currentEvent.start.getTime() + (hours * 60 + minutes) * 60 * 1000);
                }
                break;
              case 'COLOR':
                // Accept hex, rgb(), or hsl(); if hsl, convert to hex for consistency
                {
                  const raw = value.trim();
                  if (/^hsl/i.test(raw)) {
                    try {
                      currentEvent.color = this.hslToHex(raw);
                    } catch (_) {
                      currentEvent.color = raw;
                    }
                  } else {
                    currentEvent.color = raw;
                  }
                }
                break;
              case 'X-SPIRAL-CALENDAR':
                currentEvent.calendar = unescapeICS(value);
                break;
            }
          }
        }
      }
      
      return events;
    };
    importEventsFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const content = evt.target.result;
          
          // Try to parse as JSON first
          try {
            const imported = JSON.parse(content);
            if (Array.isArray(imported)) {
              // Validate and convert date fields
              const newEvents = imported.map(ev => ({
                ...ev,
                start: new Date(ev.start),
                end: new Date(ev.end)
              }));
              
              // Auto-create missing calendars
              const missingCalendars = new Set();
              newEvents.forEach(event => {
                if (event.calendar && !this.state.calendars.includes(event.calendar)) {
                  missingCalendars.add(event.calendar);
                }
              });
              
              // Add missing calendars
              missingCalendars.forEach(calendarName => {
                this.state.calendars.push(calendarName);
                // Make new calendars visible by default
                if (!this.state.visibleCalendars.includes(calendarName)) {
                  this.state.visibleCalendars.push(calendarName);
                }
              });
              
              if (missingCalendars.size > 0) {
                this.saveSettingsToStorage();
              }
              
              // Append imported events to existing events instead of replacing them
              this.events = [...this.events, ...newEvents];
              this._eventsVersion++; // Trigger layout cache rebuild
              // Save events to localStorage
              this.saveEventsToStorage();
              this.drawSpiral();
              renderEventList();
              
              let message = `Successfully imported ${newEvents.length} events from JSON file.`;
              if (missingCalendars.size > 0) {
                message += ` Created ${missingCalendars.size} new calendar(s): ${Array.from(missingCalendars).join(', ')}.`;
              }
              alert(message);
              // Clear the file input so the same file can be imported again
              e.target.value = '';
              return;
            }
          } catch (jsonError) {
            // Not JSON, try ICS
          }
          
          // Try to parse as ICS
          if (content.includes('BEGIN:VCALENDAR') && content.includes('BEGIN:VEVENT')) {
            const importedEvents = parseICSContent(content);
            if (importedEvents.length > 0) {
              // Auto-create missing calendars
              const missingCalendars = new Set();
              importedEvents.forEach(event => {
                if (event.calendar && !this.state.calendars.includes(event.calendar)) {
                  missingCalendars.add(event.calendar);
                }
              });
              
              // Add missing calendars
              missingCalendars.forEach(calendarName => {
                this.state.calendars.push(calendarName);
                // Make new calendars visible by default
                if (!this.state.visibleCalendars.includes(calendarName)) {
                  this.state.visibleCalendars.push(calendarName);
                }
              });
              
              if (missingCalendars.size > 0) {
                this.saveSettingsToStorage();
              }
              
              // Append imported events to existing events instead of replacing them
              this.events = [...this.events, ...importedEvents];
              this._eventsVersion++; // Trigger layout cache rebuild
              // Save events to localStorage
              this.saveEventsToStorage();
              this.drawSpiral();
              renderEventList();
              
              let message = `Successfully imported ${importedEvents.length} events from calendar file.`;
              if (missingCalendars.size > 0) {
                message += ` Created ${missingCalendars.size} new calendar(s): ${Array.from(missingCalendars).join(', ')}.`;
              }
              alert(message);
              // Clear the file input so the same file can be imported again
              e.target.value = '';
        } else {
              alert('No valid events found in the calendar file.');
            }
          } else {
            alert('Unsupported file format. Please use JSON or .ics calendar files.');
          }
        } catch (err) {
          alert('Failed to import events: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    // Random events generator UI
    const randStart = document.getElementById('randStart');
    const randEnd = document.getElementById('randEnd');
    const randStartBox = document.getElementById('randStartBox');
    const randEndBox = document.getElementById('randEndBox');
    const randCountRange = document.getElementById('randCountRange');
    const randCountVal = document.getElementById('randCountVal');
    const randMinRange = document.getElementById('randMinRange');
    const randMinVal = document.getElementById('randMinVal');
    const randMaxRange = document.getElementById('randMaxRange');
    const randMaxVal = document.getElementById('randMaxVal');
    const randNightWeightRange = document.getElementById('randNightWeightRange');
    const randNightWeightVal = document.getElementById('randNightWeightVal');
    const randClear = document.getElementById('randClear');
    const randGenerate = document.getElementById('randGenerate');

    const toInputValue = (date) => formatDateTimeLocalForInput(date);
    const getVisibleStart = () => this.visibleWindowStart();
    const getVisibleEnd = () => new Date(this.visibleWindowEnd().getTime() + 24 * 60 * 60 * 1000 - 1);

    const setRangeInputs = () => {
      const start = getVisibleStart();
      const end = getVisibleEnd();
      randStart.value = toInputValue(start);
      randEnd.value = toInputValue(end);
      if (randStartBox) randStartBox.textContent = formatBox(randStart.value);
      if (randEndBox) randEndBox.textContent = formatBox(randEnd.value);
    };
    const syncRandBoxes = () => {
      if (randStartBox) randStartBox.textContent = randStart && randStart.value ? formatBox(randStart.value) : '';
      if (randEndBox) randEndBox.textContent = randEnd && randEnd.value ? formatBox(randEnd.value) : '';
    };
    if (randStartBox) randStartBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(randStart);
      } else {
        openAnchoredPicker(randStartBox, randStart);
      }
    });
    if (randEndBox) randEndBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(randEnd);
      } else {
        openAnchoredPicker(randEndBox, randEnd);
      }
    });
    if (randStart) randStart.addEventListener('change', syncRandBoxes);
    if (randEnd) randEnd.addEventListener('change', syncRandBoxes);

    // Set initial range and update when days slider changes
    setRangeInputs();
    
    // Listen for days slider changes to update the random event range
    const daysSlider = document.getElementById('daysSlider');
    if (daysSlider) {
      daysSlider.addEventListener('input', setRangeInputs);
    }

    // Update value displays
    const updateValueDisplay = (slider, display) => {
      if (slider && display) {
        display.textContent = slider.value;
      }
    };

    // Enforce min <= max for length sliders (bidirectional)
    const clampLengths = () => {
      const minNum = parseInt(randMinRange.value || '15', 10);
      const maxNum = parseInt(randMaxRange.value || '240', 10);
      
      if (minNum > maxNum) {
        // If min exceeds max, adjust the other slider
        // Determine which slider was moved and adjust the other
        if (randMinRange === document.activeElement) {
          // Min was moved, adjust max up
          randMaxRange.value = String(minNum);
          updateValueDisplay(randMaxRange, randMaxVal);
        } else {
          // Max was moved, adjust min down
          randMinRange.value = String(maxNum);
          updateValueDisplay(randMinRange, randMinVal);
        }
      }
      
      // Update both displays
      updateValueDisplay(randMinRange, randMinVal);
      updateValueDisplay(randMaxRange, randMaxVal);
    };

    // Add event listeners for all sliders
    if (randCountRange && randCountVal) {
      randCountRange.addEventListener('input', () => updateValueDisplay(randCountRange, randCountVal));
      updateValueDisplay(randCountRange, randCountVal);
    }
    
    randMinRange.addEventListener('input', clampLengths);
    randMaxRange.addEventListener('input', clampLengths);
    
    if (randNightWeightRange && randNightWeightVal) {
      randNightWeightRange.addEventListener('input', () => updateValueDisplay(randNightWeightRange, randNightWeightVal));
      updateValueDisplay(randNightWeightRange, randNightWeightVal);
    }
    
    // Initial value display updates
    clampLengths();
    
    // Random events toggle functionality
    window.toggleRandomEvents = function() {
      const content = document.getElementById('randomEventsContent');
      const icon = document.getElementById('randToggleIcon');
      
      if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.textContent = '▲';
      } else {
        content.style.display = 'none';
        icon.textContent = '▼';
      }
    };

    // Study session toggle functionality
    window.toggleStudySession = function() {
      const content = document.getElementById('studySessionContent');
      const icon = document.getElementById('studyToggleIcon');
      
      if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.textContent = '▲';
      } else {
        content.style.display = 'none';
        icon.textContent = '▼';
      }
    };

    // Calendars dropdown functionality
    const calendarDropdownBtn = document.getElementById('calendarDropdownBtn');
    const calendarDropdownMenu = document.getElementById('calendarDropdownMenu');
    const addNewCalendar = document.getElementById('addNewCalendar');
    // Make buildCalendarMenu accessible for long press handler on calendar tags
    this.buildCalendarMenu = () => {
      if (!calendarDropdownMenu) return;
      // Remove existing options (keep addNewCalendar)
      const existing = calendarDropdownMenu.querySelectorAll('.calendar-option, .calendar-header');
      existing.forEach(el => el.remove());
      // Header
      const header = document.createElement('div');
      header.className = 'calendar-header';
      header.textContent = 'Visible calendars';
      header.style.cssText = 'padding: 0.5em 0.6em; color: #666; font-size: 0.85em; border-bottom: 1px solid #eee;';
      calendarDropdownMenu.insertBefore(header, addNewCalendar);
      // Visible calendar checkboxes
      (this.state.calendars || []).forEach(name => {
        const row = document.createElement('div');
        row.className = 'calendar-option';
        row.style.cssText = 'padding: 0.45em 0.6em; display: flex; align-items: center; gap: 0.5em; cursor: pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.state.visibleCalendars.includes(name);
        cb.onchange = (e) => {
          const checked = e.target.checked;
          if (checked && !this.state.visibleCalendars.includes(name)) {
            this.state.visibleCalendars.push(name);
          } else if (!checked) {
            this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
            if (this.state.visibleCalendars.length === 0) {
              // keep at least one visible to avoid empty screen
              this.state.visibleCalendars = [name];
              cb.checked = true;
            }
          }
          this.saveSettingsToStorage();
          this.drawSpiral();
          renderEventList();
        };
        const label = document.createElement('span');
        label.textContent = name;
        label.style.cssText = 'flex:1;';
        row.appendChild(cb);
        row.appendChild(label);
        
        // Add delete button for non-default calendars
        const isDefaultCalendar = ['Home', 'Work'].includes(name);
        if (!isDefaultCalendar) {
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = '×';
          deleteBtn.title = `Delete calendar "${name}"`;
          deleteBtn.style.cssText = 'background: none; border: none; color: #b44; font-size: 1.1em; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; width: 20px; text-align: center; padding: 0; margin-left: 0.3em;';
          deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
          deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.6';
          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.playFeedback();
            if (confirm(`Delete calendar "${name}"? All events in this calendar will be permanently deleted.`)) {
              // Delete all events from the calendar
              this.events = this.events.filter(event => event.calendar !== name);
              this._eventsVersion++;
              // Remove calendar from lists
              this.state.calendars = this.state.calendars.filter(n => n !== name);
              this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
              this.saveSettingsToStorage();
              this.saveEventsToStorage();
              this.buildCalendarMenu();
              populateEventCalendarSelect(); // Refresh the event calendar select dropdown
              renderEventList();
              this.drawSpiral();
            }
          };
          row.appendChild(deleteBtn);
        }
        
        calendarDropdownMenu.insertBefore(row, addNewCalendar);
      });
    };
    
    // Initial build of calendar menu
    this.buildCalendarMenu();
    if (calendarDropdownBtn && calendarDropdownMenu) {
      calendarDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = calendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          // Check if mobile device
          const isMobile = isMobileDevice();
          
          if (isMobile) {
            // Center dropdown on mobile
            calendarDropdownMenu.style.left = '50%';
            calendarDropdownMenu.style.top = '50%';
            calendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
            calendarDropdownMenu.style.width = '90vw';
            calendarDropdownMenu.style.maxWidth = '300px';
            calendarDropdownMenu.style.maxHeight = '70vh';
            calendarDropdownMenu.style.overflowY = 'auto';
          } else {
            // Desktop positioning
            const buttonRect = calendarDropdownBtn.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - buttonRect.bottom;
            const spaceAbove = buttonRect.top;
            const estimatedDropdownHeight = 400; // Approximate max height before scrolling
            
            // Position above button if not enough space below, otherwise below
            if (spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow) {
              calendarDropdownMenu.style.top = (buttonRect.top - estimatedDropdownHeight - 5) + 'px';
            } else {
            calendarDropdownMenu.style.top = (buttonRect.bottom + 5) + 'px';
            }
            
            calendarDropdownMenu.style.left = (buttonRect.right - 200) + 'px'; // 200px is min-width
            calendarDropdownMenu.style.transform = 'none';
            calendarDropdownMenu.style.width = 'auto';
            // Constrain height on desktop and allow scrolling
            calendarDropdownMenu.style.maxWidth = 'none';
            calendarDropdownMenu.style.maxHeight = '60vh';
            calendarDropdownMenu.style.overflowY = 'auto';
          }
          
          calendarDropdownMenu.style.display = 'block';
          this.buildCalendarMenu();
        } else {
          calendarDropdownMenu.style.display = 'none';
        }
      });
      
      // Add touch event for mobile
      calendarDropdownBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = calendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          // Always center on mobile for touch events
          calendarDropdownMenu.style.left = '50%';
          calendarDropdownMenu.style.top = '50%';
          calendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
          calendarDropdownMenu.style.width = '90vw';
          calendarDropdownMenu.style.maxWidth = '300px';
          calendarDropdownMenu.style.maxHeight = '70vh';
          calendarDropdownMenu.style.overflowY = 'auto';
          
          calendarDropdownMenu.style.display = 'block';
          this.buildCalendarMenu();
        } else {
          calendarDropdownMenu.style.display = 'none';
        }
      });
      document.addEventListener('click', (e) => {
        if (!calendarDropdownMenu.contains(e.target) && e.target !== calendarDropdownBtn) {
          calendarDropdownMenu.style.display = 'none';
        }
      });
    }
    if (addNewCalendar) {
      addNewCalendar.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playFeedback();
        this.addNewCalendar((newCalendarName) => {
          this.buildCalendarMenu();
          // Update event calendar picker display if it exists
          const eventCalendarDisplay = document.getElementById('eventCalendarDisplay');
          if (eventCalendarDisplay) {
            this.selectedEventCalendar = newCalendarName;
            this.updateEventCalendarDisplay();
          }
          renderEventList();
          this.drawSpiral();
        });
      });
    }

    const roundToStepMinutes = (date, stepMinutes) => {
      const d = new Date(date);
      const ms = d.getTime();
      const stepMs = stepMinutes * 60 * 1000;
      const rounded = Math.round(ms / stepMs) * stepMs;
      d.setTime(rounded);
      return d;
    };

    randGenerate.addEventListener('click', () => {
      try {
        const count = Math.max(1, Math.min(5000, parseInt(randCountRange.value || '0', 10)));
        const minMin = Math.max(5, Math.min(720, parseInt(randMinRange.value || '15', 10)));
        const maxMin = Math.max(minMin, Math.min(720, parseInt(randMaxRange.value || String(minMin), 10)));
        const step = 5;
        const biasDay = true; // Always favor daytime
        const nightWeightFraction = Math.max(0, Math.min(1, (parseInt((randNightWeightRange && randNightWeightRange.value) || '5', 10) || 0) / 100));

        let startRange, endRange;
        // Always use visible window as default, but allow manual override
        if (randStart.value && randEnd.value) {
          startRange = parseDateTimeLocalAsUTC(randStart.value);
          endRange = parseDateTimeLocalAsUTC(randEnd.value);
        } else {
          startRange = getVisibleStart();
          endRange = getVisibleEnd();
        }
        if (endRange <= startRange) {
          alert('End must be after start for the random range.');
          return;
        }

        if (randClear.checked) {
          // Only clear previously generated random events, keep user-added ones
          this.events = this.events.filter(ev => ev.calendar !== 'Random');
          this._eventsVersion++;
          
          // Remove "Random" calendar if it exists (since we're clearing random events)
          const randomCalendarIndex = this.state.calendars.indexOf('Random');
          if (randomCalendarIndex !== -1) {
            this.state.calendars.splice(randomCalendarIndex, 1);
            // Also remove from visible calendars
            const randomVisibleIndex = this.state.visibleCalendars.indexOf('Random');
            if (randomVisibleIndex !== -1) {
              this.state.visibleCalendars.splice(randomVisibleIndex, 1);
            }
            this.saveSettingsToStorage();
          }
        }

        // Create "Random" calendar if it doesn't exist
        if (!this.state.calendars.includes('Random')) {
          this.state.calendars.push('Random');
          // Make Random calendar visible by default
          if (!this.state.visibleCalendars.includes('Random')) {
            this.state.visibleCalendars.push('Random');
          }
          this.saveSettingsToStorage();
        }

        const rangeMs = endRange.getTime() - startRange.getTime();
        
        // Helper function to check if two events overlap
        const eventsOverlap = (ev1, ev2) => {
          return ev1.start < ev2.end && ev2.start < ev1.end;
        };
        
        // Helper function to check if a new event overlaps with existing events
        const hasOverlap = (newEvent, existingEvents) => {
          return existingEvents.some(existing => eventsOverlap(newEvent, existing));
        };
        
        // Helper function to apply time preferences (full hours, half hours, etc.)
        const applyTimePreferences = (date) => {
          const minutes = date.getUTCMinutes();
          const random = Math.random();
          
          // 60% chance for full hour (00 minutes)
          if (random < 0.6 && minutes === 0) {
            return date; // Already at full hour
          } else if (random < 0.6) {
            // Move to full hour
            date.setUTCMinutes(0, 0, 0);
            return date;
          }
          
          // 20% chance for half hour (30 minutes)
          if (random < 0.8 && minutes === 30) {
            return date; // Already at half hour
          } else if (random < 0.8) {
            // Move to half hour
            date.setUTCMinutes(30, 0, 0);
            return date;
          }
          
          // 10% chance for quarter hours (15 or 45 minutes)
          if (random < 0.9) {
            if (minutes === 15 || minutes === 45) {
              return date; // Already at quarter hour
            } else {
              // Move to nearest quarter hour
              if (minutes < 15) {
                date.setUTCMinutes(15, 0, 0);
              } else if (minutes < 30) {
                date.setUTCMinutes(15, 0, 0);
              } else if (minutes < 45) {
                date.setUTCMinutes(45, 0, 0);
              } else {
                date.setUTCMinutes(45, 0, 0);
              }
              return date;
            }
          }
          
          // 10% chance for any 5-minute interval (keep as is)
          return date;
        };
        
        // Helper function to apply duration preferences (full hours, half hours, etc.)
        const applyDurationPreferences = (durationMinutes, minMin, maxMin) => {
          const random = Math.random();
          
          // 60% chance for full hour durations (60, 120, 180, etc.)
          if (random < 0.6) {
            // Find the nearest full hour duration within limits
            const fullHourDurations = [];
            for (let hours = 1; hours <= Math.floor(maxMin / 60); hours++) {
              const duration = hours * 60;
              if (duration >= minMin && duration <= maxMin) {
                fullHourDurations.push(duration);
              }
            }
            
            if (fullHourDurations.length > 0) {
              // Choose randomly from available full hour durations
              return fullHourDurations[Math.floor(Math.random() * fullHourDurations.length)];
            }
          }
          
          // 20% chance for half hour durations (30, 90, 150, etc.)
          if (random < 0.8) {
            const halfHourDurations = [];
            for (let halfHours = 1; halfHours <= Math.floor(maxMin / 30); halfHours++) {
              const duration = halfHours * 30;
              if (duration >= minMin && duration <= maxMin) {
                halfHourDurations.push(duration);
              }
            }
            
            if (halfHourDurations.length > 0) {
              return halfHourDurations[Math.floor(Math.random() * halfHourDurations.length)];
            }
          }
          
          // 10% chance for quarter hour durations (15, 45, 75, etc.)
          if (random < 0.9) {
            const quarterHourDurations = [];
            for (let quarterHours = 1; quarterHours <= Math.floor(maxMin / 15); quarterHours++) {
              const duration = quarterHours * 15;
              if (duration >= minMin && duration <= maxMin) {
                quarterHourDurations.push(duration);
              }
            }
            
            if (quarterHourDurations.length > 0) {
              return quarterHourDurations[Math.floor(Math.random() * quarterHourDurations.length)];
            }
          }
          
          // 10% chance for any 5-minute duration (keep original logic)
          return durationMinutes;
        };
        
        for (let i = 0; i < count; i++) {
          const stepsCount = Math.floor((maxMin - minMin) / step) + 1;
          let durMin = minMin + Math.floor(Math.random() * stepsCount) * step;
          
          // Apply duration preferences (full hours, half hours, etc.)
          durMin = applyDurationPreferences(durMin, minMin, maxMin);
          
          const durMs = durMin * 60 * 1000;

          let latestStartMs = endRange.getTime() - durMs;
          if (latestStartMs <= startRange.getTime()) {
            latestStartMs = startRange.getTime();
          }
          
          // Try to find a non-overlapping time slot
          let startDate, endDate;
          const maxAttempts = 200; // Increased attempts for overlap avoidance
          let foundNonOverlappingSlot = false;
          
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Generate a random start time
            const startMs = startRange.getTime() + Math.floor(Math.random() * Math.max(1, (latestStartMs - startRange.getTime())));
            let candidateStartDate = new Date(startMs);
            candidateStartDate = roundToStepMinutes(candidateStartDate, step);
            
            // Apply time preferences (full hours, half hours, etc.)
            candidateStartDate = applyTimePreferences(candidateStartDate);
            
            // Apply day/night bias using rejection sampling
            if (biasDay) {
              const localHour = (candidateStartDate.getUTCHours() + TIMEZONE_OFFSET) + candidateStartDate.getUTCMinutes() / 60;
              const { sunrise, sunset } = this.getSunTimesForDate(candidateStartDate);
              const isDay = sunrise <= sunset ? (localHour >= sunrise && localHour < sunset)
                                              : (localHour >= sunrise || localHour < sunset); // polar edge-case
              const acceptProb = isDay ? 1.0 : nightWeightFraction;
              
              // If this time doesn't match our bias preference, skip this attempt
              if (Math.random() >= acceptProb) {
                continue;
              }
            }
            
            startDate = candidateStartDate;
            endDate = new Date(startDate.getTime() + durMs);
            
            // Adjust if end date exceeds range
            if (endDate > endRange) {
              startDate = new Date(endRange.getTime() - durMs);
              startDate = roundToStepMinutes(startDate, step);
              endDate = new Date(startDate.getTime() + durMs);
            }
            
            // Check for overlaps with existing events
            const candidateEvent = { start: startDate, end: endDate };
            if (!hasOverlap(candidateEvent, this.events)) {
              foundNonOverlappingSlot = true;
              break;
            }
          }
          
          // If we couldn't find a non-overlapping slot, place it anyway (better than not generating the event)
          if (!foundNonOverlappingSlot) {
            // Fallback: place at a random time without overlap checking, but still respect day/night bias
            const fallbackAttempts = 50;
            for (let fallbackAttempt = 0; fallbackAttempt < fallbackAttempts; fallbackAttempt++) {
            const startMs = startRange.getTime() + Math.floor(Math.random() * Math.max(1, (latestStartMs - startRange.getTime())));
            startDate = new Date(startMs);
            startDate = roundToStepMinutes(startDate, step);
              
              // Apply time preferences (full hours, half hours, etc.)
              startDate = applyTimePreferences(startDate);
              
              // Apply day/night bias in fallback too
              if (biasDay) {
            const localHour = (startDate.getUTCHours() + TIMEZONE_OFFSET) + startDate.getUTCMinutes() / 60;
                const { sunrise, sunset } = this.getSunTimesForDate(startDate);
            const isDay = sunrise <= sunset ? (localHour >= sunrise && localHour < sunset)
                                                : (localHour >= sunrise || localHour < sunset);
            const acceptProb = isDay ? 1.0 : nightWeightFraction;
                
            if (Math.random() < acceptProb) break; // accepted
              } else {
                break; // no bias, accept immediately
              }
          }

            endDate = new Date(startDate.getTime() + durMs);
            
          if (endDate > endRange) {
            startDate = new Date(endRange.getTime() - durMs);
            startDate = roundToStepMinutes(startDate, step);
            endDate = new Date(startDate.getTime() + durMs);
            }
          }

          const randomColor = this.generateRandomColor('Random');
          const ev = {
            title: `Random Event ${i + 1}`,
            description: '',
            start: startDate,
            end: endDate,
            color: randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor),
            calendar: 'Random',
            addedToCalendar: false,
            lastModified: Date.now(),
            lastAddedToCalendar: null,
            persistentUID: generateEventUID({
              title: `Random Event ${i + 1}`,
              description: '',
              start: startDate,
              end: endDate,
            calendar: 'Random'
            })
          };
          this.events.push(ev);
          this._eventsVersion++;
        }

        // Save events to localStorage
        this.saveEventsToStorage();

        this.drawSpiral();
        renderEventList();
      } catch (err) {
        alert('Failed to generate events: ' + (err && err.message ? err.message : String(err)));
      }
    });

    // Delete random events button
    const randDeleteRandom = document.getElementById('randDeleteRandom');
    if (randDeleteRandom) {
      randDeleteRandom.addEventListener('click', () => {
        const randomEventCount = this.events.filter(ev => ev.calendar === 'Random').length;
        if (randomEventCount === 0) {
          alert('No random events to delete.');
          return;
        }
        
        if (confirm(`Delete ${randomEventCount} random event${randomEventCount !== 1 ? 's' : ''}?`)) {
          this.events = this.events.filter(ev => ev.calendar !== 'Random');
          this._eventsVersion++;
          
          // Remove "Random" calendar if it exists (since no more random events)
          const randomCalendarIndex = this.state.calendars.indexOf('Random');
          if (randomCalendarIndex !== -1) {
            this.state.calendars.splice(randomCalendarIndex, 1);
            // Also remove from visible calendars
            const randomVisibleIndex = this.state.visibleCalendars.indexOf('Random');
            if (randomVisibleIndex !== -1) {
              this.state.visibleCalendars.splice(randomVisibleIndex, 1);
            }
            this.saveSettingsToStorage();
          }
          
          // Save events to localStorage
          this.saveEventsToStorage();
          this.drawSpiral();
          renderEventList();
          alert(`Deleted ${randomEventCount} random event${randomEventCount !== 1 ? 's' : ''}.`);
        }
      });
    }

    // Show panel
    addEventPanelBtn.addEventListener('click', () => {
      // Play feedback for button click
      this.playFeedback(0.1, 6);
      
      // Hide the button and show the panel
      addEventPanelBtn.style.display = 'none';
      eventInputPanel.style.display = 'block';
      // Prevent zooming while panel is open
      document.body.classList.add('panel-open');
      // Set default values
      renderEventList();
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0); // Set to next full hour in local time
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      const nextHourString = formatLocalDateTime(nextHour);
      eventStart.value = nextHourString;
      const endTime = new Date(nextHour);
      endTime.setHours(nextHour.getHours() + 1); // Add 1 hour in local time
      eventEnd.value = formatLocalDateTime(endTime);
      // Update visible dt boxes
      if (typeof syncEventBoxes === 'function') syncEventBoxes();
      if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
        // Suggest selected calendar color in calendar mode
        const calName = (this.selectedEventCalendar || 'Home').trim();
        const calColor = this.state.calendarColors && this.state.calendarColors[calName];
        let hex = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
        if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
        eventColor.value = hex;
        colorBox.style.background = hex;
      } else {
        // Stored event color (independent from calendar palette)
        eventColor.value = this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
      colorBox.style.background = eventColor.value;
      }
      eventTitle.value = '';
      eventDescription.value = '';
      titleCharCount.textContent = '0';
      descCharCount.textContent = '0';
    });
    // Hide panel
    closeEventPanelBtn.addEventListener('click', () => {
      // Play feedback for button click
      this.playFeedback(0.1, 6);
      
      // Restore previous calendar visibility if it was filtered
      if (this._previousVisibleCalendars !== null) {
        this.state.visibleCalendars = [...this._previousVisibleCalendars];
        this._previousVisibleCalendars = null;
        this.saveSettingsToStorage();
        // Rebuild calendar dropdown menu to update checkboxes
        if (typeof this.buildCalendarMenu === 'function') {
          this.buildCalendarMenu();
        }
        // Re-render event list and spiral
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
        this.drawSpiral();
      }
      
      eventInputPanel.style.display = 'none';
      // Show the button again
      addEventPanelBtn.style.display = 'grid';
      // Re-enable zooming and reset zoom level
      document.body.classList.remove('panel-open');
      this.resetMobileZoom();
    });
    
    // --- Click outside to close ---
    document.addEventListener('mousedown', function handleOutsideClick(e) {
      // Handle event panel
      if (eventInputPanel.style.display === 'block') {
        const eventCalendarDropdown = document.getElementById('eventCalendarDropdown');
        const newCalendarDialog = document.getElementById('newCalendarDialog');
        if (!eventInputPanel.contains(e.target) && !addEventPanelBtn.contains(e.target) && 
            (!eventCalendarDropdown || !eventCalendarDropdown.contains(e.target)) &&
            (!newCalendarDialog || !newCalendarDialog.contains(e.target))) {
          // Restore previous calendar visibility if it was filtered
          if (self._previousVisibleCalendars !== null) {
            self.state.visibleCalendars = [...self._previousVisibleCalendars];
            self._previousVisibleCalendars = null;
            self.saveSettingsToStorage();
            // Rebuild calendar dropdown menu to update checkboxes
            if (typeof self.buildCalendarMenu === 'function') {
              self.buildCalendarMenu();
            }
            // Re-render event list and spiral
            if (typeof window.renderEventList === 'function') {
              window.renderEventList();
            }
            self.drawSpiral();
          }
          
          eventInputPanel.style.display = 'none';
          // Show the button again when closing via outside click
          addEventPanelBtn.style.display = 'grid';
          // Re-enable zooming and reset zoom level
          document.body.classList.remove('panel-open');
          self.resetMobileZoom();
        }
      }
      
      // Handle settings panel
      const settingsPanel = document.getElementById('settingsPanel');
      const settingsPanelBtn = document.getElementById('settingsPanelBtn');
      if (settingsPanel && settingsPanel.style.display === 'block') {
        if (!settingsPanel.contains(e.target) && !settingsPanelBtn.contains(e.target)) {
          settingsPanel.style.display = 'none';
          // Show the button again when closing via outside click
          settingsPanelBtn.style.display = 'grid';
          // Re-enable zooming and reset zoom level
          document.body.classList.remove('panel-open');
          self.resetMobileZoom();
        }
      }
    });
    
    // Settings panel handlers
    const settingsPanelBtn = document.getElementById('settingsPanelBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettingsPanelBtn = document.getElementById('closeSettingsPanelBtn');
    
    if (settingsPanelBtn && settingsPanel && closeSettingsPanelBtn) {
      // Show settings panel
      settingsPanelBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 6);
        
        // Hide the button and show the panel
        settingsPanelBtn.style.display = 'none';
        settingsPanel.style.display = 'block';
        // Prevent zooming while panel is open
        document.body.classList.add('panel-open');
      });
      
      // Hide settings panel
      closeSettingsPanelBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 6);
        
        settingsPanel.style.display = 'none';
        // Show the button again
        settingsPanelBtn.style.display = 'grid';
        // Re-enable zooming and reset zoom level
        document.body.classList.remove('panel-open');
        this.resetMobileZoom();
      });
    }
    // Add event
    addEventBtn.addEventListener('click', () => {
      this.playFeedback(); // Add click sound
      const title = eventTitle.value.trim();
      const description = eventDescription.value.trim();
      const startDate = eventStart.value;
      const endDate = eventEnd.value;
      // Store exactly what the user sees in the color input
      let color = eventColor.value;
      const chosenCalendar = this.selectedEventCalendar;
      if (startDate && endDate) {
        const event = {
          title: title || 'Untitled Event',
          description: description || '',
          start: parseDateTimeLocalAsUTC(startDate),
          end: parseDateTimeLocalAsUTC(endDate),
        color: color,
          calendar: chosenCalendar,
          addedToCalendar: false,
          lastModified: Date.now(),
          lastAddedToCalendar: null,
          persistentUID: generateEventUID({
            title: title || 'Untitled Event',
            description: description || '',
            start: parseDateTimeLocalAsUTC(startDate),
            end: parseDateTimeLocalAsUTC(endDate),
        calendar: chosenCalendar
          })
        };
        this.events.push(event);
        this._eventsVersion++;
        // Save events to localStorage
        this.saveEventsToStorage();
        this.drawSpiral();
        // Reset fields
        eventTitle.value = '';
        eventDescription.value = '';
        titleCharCount.textContent = '0';
        descCharCount.textContent = '0';
        // Generate new suggested color for next event
        if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
          const calName = (this.selectedEventCalendar || 'Home').trim();
          const calColor = this.state.calendarColors && this.state.calendarColors[calName];
          let hex = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
          if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
          eventColor.value = hex;
        } else {
          eventColor.value = this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
        }
        // Reset auto-activated settings
        this.resetAutoActivatedSettings();
        
        // Hide panel after adding
        eventInputPanel.style.display = 'none';
        addEventPanelBtn.style.display = 'block'; // Show the add event button again
        // Re-enable zooming and reset zoom level
        document.body.classList.remove('panel-open');
        this.resetMobileZoom();
        renderEventList();
      } else {
        alert('Please select both start and end dates');
      }
    });

    eventColor.addEventListener('input', () => {
      // If user picks a color, reflect it unless we are in 'calendar' palette
      if (this.state.colorMode === 'calendar') {
        // Keep showing calendar color as preview in calendar mode
        try {
          const calName = (this.selectedEventCalendar || 'Home').trim();
          const calColor = this.state.calendarColors && this.state.calendarColors[calName];
          colorBox.style.background = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : eventColor.value;
        } catch (_) {
      colorBox.style.background = eventColor.value;
        }
      } else {
        colorBox.style.background = eventColor.value;
      }
    });
    colorBox.addEventListener('click', () => {
      eventColor.click();
    });
    // Set initial color box background per current palette
    try {
      if (this.state.colorMode === 'calendar') {
        const calName = (this.selectedEventCalendar || 'Home').trim();
        const calColor = this.state.calendarColors && this.state.calendarColors[calName];
        colorBox.style.background = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : eventColor.value;
      } else {
    colorBox.style.background = eventColor.value;
      }
    } catch (_) {
      colorBox.style.background = eventColor.value;
    }

    // Setup custom calendar picker for new events
    const eventCalendarDisplay = document.getElementById('eventCalendarDisplay');
    this.selectedEventCalendar = (this.state.selectedCalendar || 'Home'); // Default calendar for new events
    
    this.updateEventCalendarDisplay = () => {
      if (eventCalendarDisplay) {
        eventCalendarDisplay.textContent = this.selectedEventCalendar;
      }
    };
    
    // Add click handler for calendar picker
    if (eventCalendarDisplay) {
      eventCalendarDisplay.addEventListener('click', () => {
        this.playFeedback();
        this.openEventCalendarPicker();
      });
    }
    
    this.updateEventCalendarDisplay();
    
    // Character count handlers
    eventTitle.addEventListener('input', (e) => {
      titleCharCount.textContent = e.target.value.length;
    });
    eventDescription.addEventListener('input', (e) => {
      descCharCount.textContent = e.target.value.length;
      });
      // Auto-populate end date when start date changes
    eventStart.addEventListener('change', (e) => {
      const startValue = e.target.value;
      if (!startValue) return;
        const [datePart, timePart] = startValue.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        const endHour = (hour + 1) % 24;
        const endDay = hour + 1 >= 24 ? day + 1 : day;
        const endDateStr = `${year}-${month.toString().padStart(2, '0')}-${endDay.toString().padStart(2, '0')}`;
        const endTimeStr = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      eventEnd.value = `${endDateStr}T${endTimeStr}`;
      if (typeof syncEventBoxes === 'function') syncEventBoxes();
    });
    // Prevent end date from being set earlier than start date
    eventEnd.addEventListener('change', (e) => {
      const startValue = eventStart.value;
      const endValue = eventEnd.value;
      if (!startValue || !endValue) return;
      const startDate = parseDateTimeLocalAsUTC(startValue);
      let endDate = parseDateTimeLocalAsUTC(endValue);
      if (endDate <= startDate) {
        // Auto-adjust end time to be 1 hour after start time
        endDate = new Date(startDate);
        endDate.setUTCHours(startDate.getUTCHours() + 1);
        // Format for input
        const year = endDate.getFullYear();
        const month = String(endDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(endDate.getUTCDate()).padStart(2, '0');
        const hours = String(endDate.getUTCHours()).padStart(2, '0');
        const minutes = String(endDate.getUTCMinutes()).padStart(2, '0');
        eventEnd.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      if (typeof syncEventBoxes === 'function') syncEventBoxes();
      });
      
      // Render the event list after everything is set up
      renderEventList();
    }
});
