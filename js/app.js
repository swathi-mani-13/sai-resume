/**
 * =========================================================================
 * SHACREATZ - PORTFOLIO INTERACTIVE LOGIC & VIDEO CONTROLLER (V5.1)
 * =========================================================================
 * - Direct file upload with Browse Files & Drag/Drop
 * - Real-time upload progress indicator
 * - Zero hardcoded/demo videos (guaranteed permanent purge)
 * - HTML5 cross-platform video playback (Chrome, Edge, iOS, Android)
 * - Fully Functional Three-Dot Menu:
 *     1. Edit Video (Title, Category, Hashtags, Description -> Supabase)
 *     2. Copy Video Link ("Link Copied Successfully")
 *     3. Delete Video (Dedicated Confirmation Popup -> Permanent Supabase Storage & DB deletion)
 * - Non-intrusive floating toast notifications
 * - Responsive UI preserving Obsidian & Electric Cyan branding
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Elements
  const navbar = document.getElementById('navbar');
  const mobileToggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  const navItems = document.querySelectorAll('.nav-link');

  // Video Gallery Container
  const portfolioVideoGrid = document.getElementById('portfolioVideoGrid');
  const portfolioEmptyState = document.getElementById('portfolioEmptyState');
  const openAddVideoBtn = document.getElementById('openAddVideoBtn');
  const emptyStateAddBtn = document.getElementById('emptyStateAddBtn');

  // Add Video Modal Elements
  const addVideoModal = document.getElementById('addVideoModal');
  const closeAddVideoModal = document.getElementById('closeAddVideoModal');
  const cancelAddVideoBtn = document.getElementById('cancelAddVideoBtn');
  const addVideoForm = document.getElementById('addVideoForm');
  const submitAddVideoBtn = document.getElementById('submitAddVideoBtn');
  const videoFileInput = document.getElementById('videoFileInput');
  const videoFilePicker = document.getElementById('videoFilePicker');
  const browseFilesBtn = document.getElementById('browseFilesBtn');
  const filePickerPrompt = document.getElementById('filePickerPrompt');
  const filePickerNote = document.getElementById('filePickerNote');
  const videoCaptionInput = document.getElementById('videoCaptionInput');
  const videoCategoryInput = document.getElementById('videoCategoryInput');
  const videoTagsInput = document.getElementById('videoTagsInput');
  const videoDescInput = document.getElementById('videoDescInput');
  const fileErrorMsg = document.getElementById('fileErrorMsg');
  const captionErrorMsg = document.getElementById('captionErrorMsg');
  const modalUploadErrorBanner = document.getElementById('modalUploadErrorBanner');
  const modalUploadErrorText = document.getElementById('modalUploadErrorText');

  // Upload Progress Elements
  const uploadProgressWrapper = document.getElementById('uploadProgressWrapper');
  const uploadProgressLabel = document.getElementById('uploadProgressLabel');
  const uploadProgressPct = document.getElementById('uploadProgressPct');
  const uploadProgressFill = document.getElementById('uploadProgressFill');

  // Modal Video Live Preview Elements
  const videoPreviewWrapper = document.getElementById('videoPreviewWrapper');
  const modalVideoPreview = document.getElementById('modalVideoPreview');
  const previewDurationBadge = document.getElementById('previewDurationBadge');
  const videoErrorAlert = document.getElementById('videoErrorAlert');
  const videoErrorAlertText = document.getElementById('videoErrorAlertText');

  // Edit Video Modal Elements
  const editVideoModal = document.getElementById('editVideoModal');
  const closeEditVideoModal = document.getElementById('closeEditVideoModal');
  const cancelEditVideoBtn = document.getElementById('cancelEditVideoBtn');
  const editVideoForm = document.getElementById('editVideoForm');
  const editVideoId = document.getElementById('editVideoId');
  const editVideoTitleInput = document.getElementById('editVideoTitleInput');
  const editVideoCategoryInput = document.getElementById('editVideoCategoryInput');
  const editVideoTagsInput = document.getElementById('editVideoTagsInput');
  const editVideoDescInput = document.getElementById('editVideoDescInput');
  const editTitleErrorMsg = document.getElementById('editTitleErrorMsg');
  const saveEditVideoBtn = document.getElementById('saveEditVideoBtn');

  // Delete Confirmation Modal Elements
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  const closeDeleteVideoModal = document.getElementById('closeDeleteVideoModal');
  const cancelDeleteVideoBtn = document.getElementById('cancelDeleteVideoBtn');
  const confirmDeleteVideoBtn = document.getElementById('confirmDeleteVideoBtn');
  const deleteTargetCaption = document.getElementById('deleteTargetCaption');
  let pendingDeleteTarget = null;

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // Supported video formats & mobile MIME types
  const SUPPORTED_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', '3gp', 'qt', 'ogv', 'mkv'];
  const SUPPORTED_MIME_PREFIXES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/ogg', 'video/'];

  // In-memory state for user added videos, active player tracking & upload mutex
  let currentPreviewBlobUrl = null;
  let currentSelectedFile = null;
  let isUploading = false;
  const allActiveVideoElements = [];

  /* --------------------------------------------------------------------------
     1. STICKY NAVBAR & SCROLL SPY
     -------------------------------------------------------------------------- */
  const handleScroll = () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  /* --------------------------------------------------------------------------
     2. MOBILE NAVIGATION DRAWER
     -------------------------------------------------------------------------- */
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('open');
      mobileToggle.classList.toggle('active');
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    navItems.forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        mobileToggle.classList.remove('active');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !mobileToggle.contains(e.target)) {
        navLinks.classList.remove('open');
        mobileToggle.classList.remove('active');
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* --------------------------------------------------------------------------
     3. UTILITY FUNCTIONS & TOAST SYSTEM
     -------------------------------------------------------------------------- */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function isValidVideoFile(file) {
    if (!file || typeof file.size !== 'number' || file.size <= 0) return false;
    const parts = (file.name || '').split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const type = (file.type || '').toLowerCase().trim();

    // 1. Check known video extensions
    const hasValidExt = SUPPORTED_EXTENSIONS.includes(ext);

    // 2. Check standard video MIME prefixes
    const hasValidMime = type.startsWith('video/') || SUPPORTED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix));

    // Valid if standard extension OR standard video MIME type
    if (hasValidExt || hasValidMime) return true;

    // 3. Handle generic mobile MIME types (application/octet-stream or empty) if extension matches
    if ((!type || type === 'application/octet-stream' || type === 'binary/octet-stream') && hasValidExt) {
      return true;
    }

    // 4. Mobile camera roll / content URI fallback (e.g. Android VID_20261101_172030 or 1000087683 without extension)
    // When picked through video file input, if extension is absent or unusual and MIME is generic, accept as valid video
    if ((!type || type === 'application/octet-stream' || type === 'binary/octet-stream') && (!ext || ext.length > 5 || !isNaN(Number(ext)))) {
      return true;
    }

    return false;
  }

  function getNormalizedMimeType(file) {
    if (window.ShacreatzSupabase && typeof window.ShacreatzSupabase.getSafeMimeType === 'function') {
      return window.ShacreatzSupabase.getSafeMimeType(file);
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (file.type && file.type.startsWith('video/')) {
      return file.type;
    }
    switch (ext) {
      case 'webm': return 'video/webm';
      case 'mov':
      case 'qt': return 'video/quicktime';
      case 'm4v': return 'video/x-m4v';
      case '3gp': return 'video/3gpp';
      case 'mp4':
      default: return 'video/mp4';
    }
  }

  function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.22s ease';
      setTimeout(() => toast.remove(), 240);
    }, 3200);
  }

  function closeAllCardMenus() {
    document.querySelectorAll('.card-dots-wrap.open').forEach((w) => {
      w.classList.remove('open');
    });
    document.querySelectorAll('.portfolio-video-card.menu-active').forEach((c) => {
      c.classList.remove('menu-active');
    });
  }

  /* --------------------------------------------------------------------------
     4. SINGLE ACTIVE VIDEO CONTROLLER
     -------------------------------------------------------------------------- */
  function registerVideoPlayer(videoEl) {
    if (!allActiveVideoElements.includes(videoEl)) {
      allActiveVideoElements.push(videoEl);
    }

    videoEl.addEventListener('play', () => {
      allActiveVideoElements.forEach((otherVideo) => {
        if (otherVideo !== videoEl && !otherVideo.paused) {
          otherVideo.pause();
        }
      });
    });
  }

  function unregisterVideoPlayer(videoEl) {
    const idx = allActiveVideoElements.indexOf(videoEl);
    if (idx !== -1) {
      allActiveVideoElements.splice(idx, 1);
    }
  }

  /* --------------------------------------------------------------------------
     5. PERSISTENT VIDEO CARD GENERATOR & THREE-DOT MENU
     -------------------------------------------------------------------------- */
  function createPersistentVideoCard(videoItem) {
    const card = document.createElement('article');
    card.className = 'portfolio-video-card';
    card.id = `videoCard-${videoItem.id}`;
    card.setAttribute('data-id', videoItem.id);

    const videoUrl = videoItem.video_url || videoItem.videoUrl;
    let caption = videoItem.title || videoItem.caption || 'Uploaded Video';
    let category = videoItem.category || '';
    let tags = videoItem.tags || videoItem.hashtags || '';
    let description = videoItem.description || '';
    const mimeType = videoItem.mime_type || videoItem.mimeType || 'video/mp4';
    const storagePath = videoItem.storage_path || videoItem.storagePath || '';

    const videoWrap = document.createElement('div');
    videoWrap.className = 'card-video-wrapper';

    // HTML5 Video Player
    const video = document.createElement('video');
    video.className = 'card-video-player';
    video.controls = false;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = 'metadata';
    video.src = videoUrl;

    const source = document.createElement('source');
    source.src = videoUrl;
    source.type = mimeType;
    video.appendChild(source);

    // Play button overlay
    const playOverlay = document.createElement('div');
    playOverlay.className = 'card-play-overlay';
    playOverlay.setAttribute('role', 'button');
    playOverlay.setAttribute('aria-label', `Play ${escapeHtml(caption)}`);
    playOverlay.innerHTML = `
      <div class="card-play-btn-circle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </div>
    `;

    // Robust Play / Pause handling
    playOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllCardMenus();
      video.controls = true;
      video.play().then(() => {
        playOverlay.classList.add('hidden');
      }).catch((err) => {
        console.warn('[Video Playback Failed]', err);
        showVideoErrorBadge('Video playback unavailable on this browser or URL inaccessible.');
      });
    });

    video.addEventListener('play', () => {
      playOverlay.classList.add('hidden');
    });

    video.addEventListener('pause', () => {
      if (video.currentTime === 0 || video.ended) {
        playOverlay.classList.remove('hidden');
      }
    });

    video.addEventListener('error', () => {
      console.warn('[Video Load Error] URL:', videoUrl);
      showVideoErrorBadge('Video URL is invalid or inaccessible.');
    });

    function showVideoErrorBadge(errorText) {
      if (videoWrap.querySelector('.card-video-error-badge')) return;
      const badge = document.createElement('div');
      badge.className = 'card-video-error-badge';
      badge.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${escapeHtml(errorText)}</span>
      `;
      videoWrap.appendChild(badge);
      playOverlay.classList.add('hidden');
    }

    registerVideoPlayer(video);

    videoWrap.appendChild(video);
    videoWrap.appendChild(playOverlay);

    // Card Meta Section
    const metaWrap = document.createElement('div');
    metaWrap.className = 'card-video-meta';

    const metaText = document.createElement('div');
    metaText.className = 'card-meta-text';

    const captionEl = document.createElement('h3');
    captionEl.className = 'card-video-caption';
    captionEl.textContent = caption;
    metaText.appendChild(captionEl);

    // Sub-row with category and tags
    const subRow = document.createElement('div');
    subRow.className = 'card-meta-subrow';

    const categoryEl = document.createElement('span');
    categoryEl.className = 'card-video-category';
    categoryEl.textContent = category;
    categoryEl.style.display = category ? 'inline-block' : 'none';
    subRow.appendChild(categoryEl);

    const tagsEl = document.createElement('span');
    tagsEl.className = 'card-video-tags';
    tagsEl.textContent = tags;
    tagsEl.style.display = tags ? 'inline-block' : 'none';
    subRow.appendChild(tagsEl);

    metaText.appendChild(subRow);

    // Description
    const descEl = document.createElement('p');
    descEl.className = 'card-video-desc';
    descEl.textContent = description;
    descEl.style.display = description ? '-webkit-box' : 'none';
    metaText.appendChild(descEl);

    metaWrap.appendChild(metaText);

    // =========================================================================
    // THREE-DOT MENU COMPONENT
    // =========================================================================
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'card-dots-wrap';

    const dotsBtn = document.createElement('button');
    dotsBtn.type = 'button';
    dotsBtn.className = 'card-dots-btn';
    dotsBtn.setAttribute('data-action', 'toggle-menu');
    dotsBtn.setAttribute('aria-label', `Options for ${caption}`);
    dotsBtn.setAttribute('aria-haspopup', 'true');
    dotsBtn.textContent = '⋮';

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'card-dropdown-menu';
    dropdownMenu.setAttribute('role', 'menu');

    // 1. Edit Video Action
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'dropdown-item edit-action';
    editBtn.setAttribute('data-action', 'edit-video');
    editBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span>Edit Video</span>
    `;

    // 2. Copy Video Link Action
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'dropdown-item copy-action';
    copyBtn.setAttribute('data-action', 'copy-video');
    copyBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy Video Link</span>
    `;

    // Divider
    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';

    // 3. Delete Video Action
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'dropdown-item dropdown-item-danger delete-action';
    deleteBtn.setAttribute('data-action', 'delete-video');
    deleteBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>Delete Video</span>
    `;

    dropdownMenu.appendChild(editBtn);
    dropdownMenu.appendChild(copyBtn);
    dropdownMenu.appendChild(divider);
    dropdownMenu.appendChild(deleteBtn);

    dotsWrap.appendChild(dotsBtn);
    dotsWrap.appendChild(dropdownMenu);
    metaWrap.appendChild(dotsWrap);

    card.appendChild(videoWrap);
    card.appendChild(metaWrap);

    // --- Toggle Dropdown Handler ---
    dotsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isOpen = dotsWrap.classList.contains('open');
      closeAllCardMenus();

      if (!isOpen) {
        dotsWrap.classList.add('open');
        card.classList.add('menu-active');
      }
    });

    // --- Action: Copy Video Link ---
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllCardMenus();

      if (!videoUrl) {
        showToast('Video URL is unavailable.', 'error');
        return;
      }

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(videoUrl);
        } else {
          const tempInput = document.createElement('textarea');
          tempInput.value = videoUrl;
          tempInput.style.position = 'fixed';
          tempInput.style.opacity = '0';
          document.body.appendChild(tempInput);
          tempInput.focus();
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
        }
        showToast('Link Copied Successfully', 'success');
      } catch (copyErr) {
        console.warn('Clipboard copy error:', copyErr);
        try {
          const tempInput = document.createElement('textarea');
          tempInput.value = videoUrl;
          tempInput.style.position = 'fixed';
          tempInput.style.opacity = '0';
          document.body.appendChild(tempInput);
          tempInput.focus();
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
          showToast('Link Copied Successfully', 'success');
        } catch (e2) {
          showToast('Failed to copy video link.', 'error');
        }
      }
    });

    // --- Action: Edit Video ---
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllCardMenus();

      if (editVideoId) editVideoId.value = videoItem.id;
      if (editVideoTitleInput) editVideoTitleInput.value = caption;
      if (editVideoCategoryInput) editVideoCategoryInput.value = category;
      if (editVideoTagsInput) editVideoTagsInput.value = tags;
      if (editVideoDescInput) editVideoDescInput.value = description;
      if (editTitleErrorMsg) editTitleErrorMsg.style.display = 'none';

      openEditModal();

      // Bind dynamic update closure to card elements
      card._updateMeta = (newTitle, newCategory, newTags, newDesc) => {
        caption = newTitle;
        category = newCategory;
        tags = newTags;
        description = newDesc;

        captionEl.textContent = newTitle;
        categoryEl.textContent = newCategory;
        categoryEl.style.display = newCategory ? 'inline-block' : 'none';
        tagsEl.textContent = newTags;
        tagsEl.style.display = newTags ? 'inline-block' : 'none';
        descEl.textContent = newDesc;
        descEl.style.display = newDesc ? '-webkit-box' : 'none';
      };
    });

    // --- Action: Delete Video (Open Confirmation Popup) ---
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllCardMenus();

      openDeleteModal({
        videoId: videoItem.id,
        storagePath: storagePath,
        caption: caption,
        card: card,
        video: video
      });
    });

    return card;
  }

  // Event Delegation fallback on portfolioVideoGrid
  if (portfolioVideoGrid) {
    portfolioVideoGrid.addEventListener('click', (e) => {
      const dotsBtnEl = e.target.closest('.card-dots-btn');
      if (dotsBtnEl) {
        e.preventDefault();
        e.stopPropagation();
        const wrap = dotsBtnEl.closest('.card-dots-wrap');
        const card = dotsBtnEl.closest('.portfolio-video-card');
        if (!wrap || !card) return;

        const isOpen = wrap.classList.contains('open');
        closeAllCardMenus();
        if (!isOpen) {
          wrap.classList.add('open');
          card.classList.add('menu-active');
        }
      }
    });
  }

  // Global click outside closes any open three-dot menu
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-dots-wrap')) {
      closeAllCardMenus();
    }
  });

  /* --------------------------------------------------------------------------
     6. PORTFOLIO GALLERY INITIALIZATION (ZERO DEMO VIDEOS)
     -------------------------------------------------------------------------- */
  async function initPortfolioGrid() {
    if (!portfolioVideoGrid) return;
    portfolioVideoGrid.innerHTML = '';

    // Show empty state while loading
    if (portfolioEmptyState) {
      portfolioEmptyState.style.display = 'flex';
    }

    // Fetch all persistent genuine videos from Supabase Cloud Database (or local persistence mirror)
    if (window.ShacreatzSupabase && typeof window.ShacreatzSupabase.fetchVideos === 'function') {
      try {
        const persistentVideos = await window.ShacreatzSupabase.fetchVideos();
        if (Array.isArray(persistentVideos) && persistentVideos.length > 0) {
          if (portfolioEmptyState) {
            portfolioEmptyState.style.display = 'none';
          }
          persistentVideos.forEach((videoItem) => {
            const card = createPersistentVideoCard(videoItem);
            portfolioVideoGrid.appendChild(card);
          });
        } else {
          // Zero videos uploaded yet
          if (portfolioEmptyState) {
            portfolioEmptyState.style.display = 'flex';
          }
        }
      } catch (err) {
        console.warn('[Supabase] Could not load persistent videos on startup:', err);
        if (portfolioEmptyState) {
          portfolioEmptyState.style.display = 'flex';
        }
      }
    }
  }

  initPortfolioGrid();

  /* --------------------------------------------------------------------------
     7. ADD VIDEO MODAL CONTROLS & BROWSE FILES
     -------------------------------------------------------------------------- */
  function openModal() {
    if (!addVideoModal) return;
    closeAllCardMenus();
    addVideoModal.classList.add('open');
    addVideoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      if (videoFileInput) videoFileInput.focus();
    }, 100);
  }

  function closeModal() {
    if (!addVideoModal) return;
    addVideoModal.classList.remove('open');
    addVideoModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    resetForm();
  }

  function resetForm() {
    if (addVideoForm) addVideoForm.reset();
    currentSelectedFile = null;
    isUploading = false;

    if (currentPreviewBlobUrl) {
      try {
        URL.revokeObjectURL(currentPreviewBlobUrl);
      } catch (e) {}
      currentPreviewBlobUrl = null;
    }

    if (modalVideoPreview) {
      modalVideoPreview.pause();
      modalVideoPreview.removeAttribute('src');
      while (modalVideoPreview.firstChild) {
        modalVideoPreview.removeChild(modalVideoPreview.firstChild);
      }
    }

    if (videoPreviewWrapper) videoPreviewWrapper.style.display = 'none';
    if (uploadProgressWrapper) uploadProgressWrapper.style.display = 'none';
    if (videoErrorAlert) videoErrorAlert.style.display = 'none';
    if (modalUploadErrorBanner) modalUploadErrorBanner.style.display = 'none';
    if (filePickerPrompt) filePickerPrompt.textContent = 'Click or drag & drop video here';
    if (filePickerNote) filePickerNote.textContent = 'Supports MP4, WebM, MOV, M4V';
    if (fileErrorMsg) fileErrorMsg.style.display = 'none';
    if (captionErrorMsg) captionErrorMsg.style.display = 'none';
    if (videoFilePicker) videoFilePicker.classList.remove('has-file', 'dragover');
    if (videoCategoryInput) videoCategoryInput.value = '';
    if (videoTagsInput) videoTagsInput.value = '';
    if (videoDescInput) videoDescInput.value = '';
  }

  function handleFileSelected(file) {
    if (!file) return;

    const parts = (file.name || '').split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const isValid = isValidVideoFile(file);

    // STAGE 1 DIAGNOSTIC LOG IMMEDIATELY UPON SELECTION (Requirement 1)
    console.log('[SHACREATZ DIAGNOSTIC 1/6: FILE SELECTION]', {
      fileName: file.name,
      fileType: file.type || '(empty / unknown by mobile browser)',
      fileSizeBytes: file.size,
      fileSizeMB: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      fileExtension: ext || '(none)',
      isValidFile: isValid,
      hasBlobInstance: file instanceof Blob
    });

    if (modalUploadErrorBanner) modalUploadErrorBanner.style.display = 'none';

    if (!isValid) {
      if (fileErrorMsg) {
        fileErrorMsg.textContent = 'Unsupported video format. Please select an MP4, MOV, WebM, or M4V video.';
        fileErrorMsg.style.display = 'block';
        fileErrorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    if (fileErrorMsg) fileErrorMsg.style.display = 'none';
    currentSelectedFile = file;

    if (filePickerPrompt) filePickerPrompt.textContent = file.name;
    if (filePickerNote) filePickerNote.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to Add`;
    if (videoFilePicker) videoFilePicker.classList.add('has-file');

    // Auto-fill caption if empty
    if (videoCaptionInput && !videoCaptionInput.value.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      videoCaptionInput.value = cleanName;
    }

    // Revoke previous preview
    if (currentPreviewBlobUrl) {
      try {
        URL.revokeObjectURL(currentPreviewBlobUrl);
      } catch (e) {}
    }

    currentPreviewBlobUrl = URL.createObjectURL(file);
    const mimeType = getNormalizedMimeType(file);

    if (modalVideoPreview && videoPreviewWrapper) {
      videoPreviewWrapper.style.display = 'block';
      if (previewDurationBadge) previewDurationBadge.textContent = 'Loading...';

      // Clear previous sources to prevent accumulating tags in DOM
      while (modalVideoPreview.firstChild) {
        modalVideoPreview.removeChild(modalVideoPreview.firstChild);
      }

      modalVideoPreview.pause();
      modalVideoPreview.src = currentPreviewBlobUrl;

      const sourceEl = document.createElement('source');
      sourceEl.src = currentPreviewBlobUrl;
      sourceEl.type = mimeType;
      modalVideoPreview.appendChild(sourceEl);

      modalVideoPreview.onloadedmetadata = () => {
        const duration = modalVideoPreview.duration;
        if (previewDurationBadge) {
          previewDurationBadge.textContent = formatDuration(duration);
        }
        if (videoErrorAlert) videoErrorAlert.style.display = 'none';
      };

      modalVideoPreview.onerror = () => {
        if (videoErrorAlert) {
          videoErrorAlert.style.display = 'flex';
          if (videoErrorAlertText) videoErrorAlertText.textContent = 'Preview notice: Browser codec decoder unavailable on this device. (Video will still upload and play on supported devices)';
        }
      };

      modalVideoPreview.load();
    }
  }

  // Browse Files button directly triggers file input
  if (browseFilesBtn && videoFileInput) {
    browseFilesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      videoFileInput.click();
    });
  }

  // File Input Events
  if (videoFileInput) {
    videoFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handleFileSelected(file);
    });
  }

  // Drag & drop support
  if (videoFilePicker) {
    videoFilePicker.addEventListener('click', (e) => {
      if (e.target !== browseFilesBtn && !browseFilesBtn.contains(e.target)) {
        if (videoFileInput) videoFileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      videoFilePicker.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        videoFilePicker.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      videoFilePicker.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        videoFilePicker.classList.remove('dragover');
      });
    });

    videoFilePicker.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files && dt.files[0];
      if (file) {
        if (videoFileInput) videoFileInput.files = dt.files;
        handleFileSelected(file);
      }
    });
  }

  // Modal open & close listeners
  if (openAddVideoBtn) openAddVideoBtn.addEventListener('click', openModal);
  if (emptyStateAddBtn) emptyStateAddBtn.addEventListener('click', openModal);
  if (closeAddVideoModal) closeAddVideoModal.addEventListener('click', closeModal);
  if (cancelAddVideoBtn) cancelAddVideoBtn.addEventListener('click', closeModal);

  if (addVideoModal) {
    addVideoModal.addEventListener('click', (e) => {
      if (e.target === addVideoModal) closeModal();
    });
  }

  /* --------------------------------------------------------------------------
     8. EDIT VIDEO MODAL CONTROLS
     -------------------------------------------------------------------------- */
  function openEditModal() {
    if (!editVideoModal) return;
    closeAllCardMenus();
    editVideoModal.classList.add('open');
    editVideoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      if (editVideoTitleInput) editVideoTitleInput.focus();
    }, 100);
  }

  function closeEditModal() {
    if (!editVideoModal) return;
    editVideoModal.classList.remove('open');
    editVideoModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (closeEditVideoModal) closeEditVideoModal.addEventListener('click', closeEditModal);
  if (cancelEditVideoBtn) cancelEditVideoBtn.addEventListener('click', closeEditModal);

  if (editVideoModal) {
    editVideoModal.addEventListener('click', (e) => {
      if (e.target === editVideoModal) closeEditModal();
    });
  }

  if (editVideoForm) {
    editVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const videoId = editVideoId ? editVideoId.value : '';
      const newTitle = editVideoTitleInput ? editVideoTitleInput.value.trim() : '';
      const newCategory = editVideoCategoryInput ? editVideoCategoryInput.value.trim() : '';
      const newTags = editVideoTagsInput ? editVideoTagsInput.value.trim() : '';
      const newDesc = editVideoDescInput ? editVideoDescInput.value.trim() : '';

      if (!newTitle) {
        if (editTitleErrorMsg) editTitleErrorMsg.style.display = 'block';
        return;
      }
      if (editTitleErrorMsg) editTitleErrorMsg.style.display = 'none';

      if (saveEditVideoBtn) {
        saveEditVideoBtn.disabled = true;
        saveEditVideoBtn.innerHTML = `<span>SAVING...</span>`;
      }

      try {
        if (window.ShacreatzSupabase && typeof window.ShacreatzSupabase.updateMetadata === 'function') {
          await window.ShacreatzSupabase.updateMetadata(videoId, {
            title: newTitle,
            category: newCategory,
            tags: newTags,
            description: newDesc
          });
        }

        // Refresh card content automatically in DOM
        const targetCard = document.getElementById(`videoCard-${videoId}`);
        if (targetCard) {
          if (typeof targetCard._updateMeta === 'function') {
            targetCard._updateMeta(newTitle, newCategory, newTags, newDesc);
          } else {
            const capEl = targetCard.querySelector('.card-video-caption');
            const catEl = targetCard.querySelector('.card-video-category');
            const tagEl = targetCard.querySelector('.card-video-tags');
            const desEl = targetCard.querySelector('.card-video-desc');

            if (capEl) capEl.textContent = newTitle;
            if (catEl) {
              catEl.textContent = newCategory;
              catEl.style.display = newCategory ? 'inline-block' : 'none';
            }
            if (tagEl) {
              tagEl.textContent = newTags;
              tagEl.style.display = newTags ? 'inline-block' : 'none';
            }
            if (desEl) {
              desEl.textContent = newDesc;
              desEl.style.display = newDesc ? '-webkit-box' : 'none';
            }
          }
        }

        closeEditModal();
        showToast('Video details updated successfully!', 'success');
      } catch (err) {
        console.error('[Update Video Error]', err);
        showToast('Failed to update video details.', 'error');
      } finally {
        if (saveEditVideoBtn) {
          saveEditVideoBtn.disabled = false;
          saveEditVideoBtn.innerHTML = `
            <span>SAVE CHANGES</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
        }
      }
    });
  }

  /* --------------------------------------------------------------------------
     9. DELETE CONFIRMATION MODAL CONTROLS
     -------------------------------------------------------------------------- */
  function openDeleteModal(target) {
    if (!deleteConfirmModal) return;
    closeAllCardMenus();
    pendingDeleteTarget = target;
    if (deleteTargetCaption) {
      deleteTargetCaption.textContent = `"${target.caption}"`;
    }
    deleteConfirmModal.classList.add('open');
    deleteConfirmModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDeleteModal() {
    if (!deleteConfirmModal) return;
    deleteConfirmModal.classList.remove('open');
    deleteConfirmModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    pendingDeleteTarget = null;
  }

  if (closeDeleteVideoModal) closeDeleteVideoModal.addEventListener('click', closeDeleteModal);
  if (cancelDeleteVideoBtn) cancelDeleteVideoBtn.addEventListener('click', closeDeleteModal);

  if (deleteConfirmModal) {
    deleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === deleteConfirmModal) closeDeleteModal();
    });
  }

  if (confirmDeleteVideoBtn) {
    confirmDeleteVideoBtn.addEventListener('click', async () => {
      if (!pendingDeleteTarget) return;

      const { videoId, storagePath, card, video } = pendingDeleteTarget;

      confirmDeleteVideoBtn.disabled = true;
      confirmDeleteVideoBtn.innerHTML = `<span>Deleting...</span>`;

      try {
        if (video) {
          video.pause();
          unregisterVideoPlayer(video);
        }

        // Delete from Supabase Storage & Database
        if (window.ShacreatzSupabase && typeof window.ShacreatzSupabase.deleteVideo === 'function') {
          await window.ShacreatzSupabase.deleteVideo(videoId, storagePath);
        }

        // Remove card from gallery only after successful deletion
        if (card) {
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          card.style.transition = 'all 0.25s ease';
          setTimeout(() => {
            card.remove();
            if (portfolioVideoGrid && portfolioVideoGrid.children.length === 0 && portfolioEmptyState) {
              portfolioEmptyState.style.display = 'flex';
            }
          }, 260);
        }

        closeDeleteModal();
        showToast('Video permanently deleted.', 'success');
      } catch (err) {
        console.error('[Delete Video Error]', err);
        showToast('Failed to delete video. Please check your connection.', 'error');
      } finally {
        confirmDeleteVideoBtn.disabled = false;
        confirmDeleteVideoBtn.innerHTML = `
          <span>Confirm Delete</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        `;
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllCardMenus();
      if (addVideoModal && addVideoModal.classList.contains('open')) closeModal();
      if (editVideoModal && editVideoModal.classList.contains('open')) closeEditModal();
      if (deleteConfirmModal && deleteConfirmModal.classList.contains('open')) closeDeleteModal();
    }
  });

  /* --------------------------------------------------------------------------
     10. FORM SUBMISSION (DIRECT MOBILE FILE UPLOAD TO SUPABASE & DETAILED ERRORS)
     -------------------------------------------------------------------------- */
  if (addVideoForm) {
    addVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Prevent duplicate upload requests (Requirement 4)
      if (isUploading) {
        console.warn('[SHACREATZ UPLOAD TRACE] Upload already in progress. Ignoring duplicate request.');
        return;
      }

      let hasError = false;
      const file = currentSelectedFile || (videoFileInput && videoFileInput.files && videoFileInput.files[0]);
      const caption = videoCaptionInput ? videoCaptionInput.value.trim() : '';
      const category = videoCategoryInput ? videoCategoryInput.value.trim() : '';
      const tags = videoTagsInput ? videoTagsInput.value.trim() : '';
      const description = videoDescInput ? videoDescInput.value.trim() : '';

      // Reset previous error indicators
      if (modalUploadErrorBanner) modalUploadErrorBanner.style.display = 'none';
      if (fileErrorMsg) fileErrorMsg.style.display = 'none';
      if (captionErrorMsg) captionErrorMsg.style.display = 'none';

      if (!file) {
        if (fileErrorMsg) {
          fileErrorMsg.textContent = 'Please select a video file to upload.';
          fileErrorMsg.style.display = 'block';
          fileErrorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        hasError = true;
      } else if (!isValidVideoFile(file)) {
        if (fileErrorMsg) {
          fileErrorMsg.textContent = 'Unsupported video format. Please select an MP4, MOV, WebM, or M4V video.';
          fileErrorMsg.style.display = 'block';
          fileErrorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        hasError = true;
      }

      if (!caption) {
        if (captionErrorMsg) captionErrorMsg.style.display = 'block';
        hasError = true;
      }

      if (hasError) return;

      // Verify that the File object reached the upload function (Requirement 1 & 3)
      console.log('[SHACREATZ DIAGNOSTIC 1/6: FILE REACHED PIPELINE]', {
        name: file.name,
        type: file.type || '(empty / unspecified by mobile browser)',
        sizeBytes: file.size,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        caption: caption
      });

      isUploading = true;

      // Show uploading state on button & progress bar
      if (submitAddVideoBtn) {
        submitAddVideoBtn.disabled = true;
        submitAddVideoBtn.innerHTML = `
          <span>UPLOADING VIDEO...</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-icon">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
        `;
      }

      if (uploadProgressWrapper) {
        uploadProgressWrapper.style.display = 'block';
        if (uploadProgressFill) uploadProgressFill.style.width = '8%';
        if (uploadProgressPct) uploadProgressPct.textContent = '8%';
        if (uploadProgressLabel) uploadProgressLabel.textContent = 'Initiating cloud upload stream...';
      }

      let uploadResult = null;
      try {
        // 1. Upload actual selected video file to Supabase Cloud Storage (with ASCII-safe filename & real progress)
        uploadResult = await window.ShacreatzSupabase.uploadVideo(file, (pct, msg) => {
          if (uploadProgressFill) uploadProgressFill.style.width = `${pct}%`;
          if (uploadProgressPct) uploadProgressPct.textContent = `${pct}%`;
          if (uploadProgressLabel && msg) uploadProgressLabel.textContent = msg;
        });

        // 2. Save video metadata to Supabase PostgreSQL Database
        let dbRecord;
        try {
          dbRecord = await window.ShacreatzSupabase.saveMetadata({
            title: caption,
            category: category || 'Uploaded Video',
            tags: tags,
            description: description,
            videoUrl: uploadResult.publicUrl,
            fileName: file.name, // Preserves original full-Unicode filename in DB
            mimeType: uploadResult.mimeType || getNormalizedMimeType(file),
            fileSize: file.size,
            storagePath: uploadResult.storagePath,
            isLocalBlob: uploadResult.isLocalBlob,
            fileBlob: uploadResult.fileBlob
          });
        } catch (dbErr) {
          // SAFE CLEANUP: If database insertion fails after storage upload,
          // remove the uploaded storage file to prevent orphaned objects! (Requirement 4)
          console.error('[DB Insert Failed - Cleaning up storage object]', dbErr);
          if (uploadResult && uploadResult.storagePath && !uploadResult.isLocalBlob) {
            await window.ShacreatzSupabase.deleteVideo(null, uploadResult.storagePath).catch(() => {});
          }
          const detailedMsg = 'Storage upload succeeded, but database insertion failed: ' + (dbErr.message || 'Check database connection.');
          throw new Error(detailedMsg);
        }

        if (portfolioEmptyState) {
          portfolioEmptyState.style.display = 'none';
        }

        // 3. Immediately display the newly uploaded persistent video card in gallery
        const card = createPersistentVideoCard(dbRecord);
        if (portfolioVideoGrid) {
          portfolioVideoGrid.appendChild(card);
        }

        closeModal();
        showToast('Video uploaded and published successfully!', 'success');

        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      } catch (uploadErr) {
        console.error('[Upload Pipeline Failed]', uploadErr);
        const errorReason = uploadErr.message || 'Upload failed. Please check your connection.';

        // Display actual failure reason in admin interface (Requirement 5)
        if (fileErrorMsg) {
          fileErrorMsg.textContent = errorReason;
          fileErrorMsg.style.display = 'block';
          fileErrorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (modalUploadErrorBanner) {
          modalUploadErrorBanner.style.display = 'flex';
          if (modalUploadErrorText) {
            modalUploadErrorText.textContent = errorReason;
          }
        }

        showToast(errorReason, 'error');
      } finally {
        isUploading = false;
        if (uploadProgressWrapper) {
          setTimeout(() => {
            uploadProgressWrapper.style.display = 'none';
          }, 800);
        }
        if (submitAddVideoBtn) {
          submitAddVideoBtn.disabled = false;
          submitAddVideoBtn.innerHTML = `
            <span>ADD VIDEO</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
        }
      }
    });
  }

  // Real-time error clearing
  if (videoCaptionInput) {
    videoCaptionInput.addEventListener('input', () => {
      if (videoCaptionInput.value.trim() && captionErrorMsg) {
        captionErrorMsg.style.display = 'none';
      }
    });
  }

  if (editVideoTitleInput) {
    editVideoTitleInput.addEventListener('input', () => {
      if (editVideoTitleInput.value.trim() && editTitleErrorMsg) {
        editTitleErrorMsg.style.display = 'none';
      }
    });
  }

  /* --------------------------------------------------------------------------
     11. CLEANUP ON UNLOAD
     -------------------------------------------------------------------------- */
  window.addEventListener('beforeunload', () => {
    if (currentPreviewBlobUrl) {
      try {
        URL.revokeObjectURL(currentPreviewBlobUrl);
      } catch (e) {}
    }
  });
});
