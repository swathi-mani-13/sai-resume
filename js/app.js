/**
 * =========================================================================
 * SHACREATZ - PORTFOLIO INTERACTIVE LOGIC & 4-CARD VIDEO CONTROLLER
 * =========================================================================
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
  const filePickerPrompt = document.getElementById('filePickerPrompt');
  const filePickerNote = document.getElementById('filePickerNote');
  const videoCaptionInput = document.getElementById('videoCaptionInput');
  const videoCategoryInput = document.getElementById('videoCategoryInput');
  const fileErrorMsg = document.getElementById('fileErrorMsg');
  const captionErrorMsg = document.getElementById('captionErrorMsg');

  // Modal Video Live Preview Elements
  const videoPreviewWrapper = document.getElementById('videoPreviewWrapper');
  const modalVideoPreview = document.getElementById('modalVideoPreview');
  const previewDurationBadge = document.getElementById('previewDurationBadge');
  const videoErrorAlert = document.getElementById('videoErrorAlert');
  const videoErrorAlertText = document.getElementById('videoErrorAlertText');

  // Supported video formats
  const SUPPORTED_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'];
  const SUPPORTED_MIME_PREFIXES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

  // In-memory state for user added videos & active player tracking
  let currentPreviewBlobUrl = null;
  let currentSelectedFile = null;
  const userAddedVideos = [];
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

  // ScrollSpy with IntersectionObserver
  const sections = document.querySelectorAll('section[id], header[id]');
  const observerOptions = {
    root: null,
    rootMargin: '-25% 0px -65% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navItems.forEach((link) => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach((sec) => observer.observe(sec));

  /* --------------------------------------------------------------------------
     2. MOBILE NAVIGATION DRAWER
     -------------------------------------------------------------------------- */
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('mobile-open');
      mobileToggle.classList.toggle('open', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    const allDrawerLinks = navLinks.querySelectorAll('a');
    allDrawerLinks.forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
        mobileToggle.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* --------------------------------------------------------------------------
     3. FORMAT & UTILITY FUNCTIONS
     -------------------------------------------------------------------------- */
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function isValidVideoFile(file) {
    if (!file) return false;
    const ext = file.name.split('.').pop().toLowerCase();
    const hasValidExt = SUPPORTED_EXTENSIONS.includes(ext);
    const hasValidType = file.type ? (file.type.startsWith('video/') || SUPPORTED_MIME_PREFIXES.includes(file.type.toLowerCase())) : false;
    return hasValidExt || hasValidType;
  }

  function getNormalizedMimeType(file) {
    if (file && file.type && file.type.startsWith('video/')) {
      return file.type;
    }
    const ext = file ? file.name.split('.').pop().toLowerCase() : '';
    switch (ext) {
      case 'mp4': return 'video/mp4';
      case 'webm': return 'video/webm';
      case 'mov': return 'video/quicktime';
      case 'm4v': return 'video/x-m4v';
      default: return 'video/mp4';
    }
  }

  /* --------------------------------------------------------------------------
     4. SINGLE ACTIVE VIDEO CONTROLLER
     -------------------------------------------------------------------------- */
  function registerVideoPlayer(videoEl) {
    if (!allActiveVideoElements.includes(videoEl)) {
      allActiveVideoElements.push(videoEl);
    }

    videoEl.addEventListener('play', () => {
      // Pause all other videos
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
     5. RENDER THE INITIAL 4 REAL VIDEOS
     -------------------------------------------------------------------------- */
  function createRealProjectCard(project, index) {
    const card = document.createElement('article');
    card.className = 'portfolio-video-card';
    card.id = `projectCard-${project.id}`;

    // Saved caption from localStorage if edited
    const savedCaption = localStorage.getItem(`shacreatz_caption_${project.id}`);
    const displayCaption = savedCaption || project.title;

    // Video Wrapper
    const videoWrap = document.createElement('div');
    videoWrap.className = 'card-video-wrapper';

    // HTML5 Video Element
    const video = document.createElement('video');
    video.className = 'card-video-player';
    video.controls = false;
    video.playsInline = true;
    video.preload = 'metadata';
    if (project.thumbnail) {
      video.poster = project.thumbnail;
    }

    // Primary source (H.264 MP4 for instant universal playback)
    const sourcePrimary = document.createElement('source');
    sourcePrimary.src = project.videoUrl;
    sourcePrimary.type = project.mimeType || 'video/mp4';
    video.appendChild(sourcePrimary);

    // Fallback source (Original MOV if available)
    if (project.fallbackUrl) {
      const sourceFallback = document.createElement('source');
      sourceFallback.src = project.fallbackUrl;
      sourceFallback.type = 'video/quicktime';
      video.appendChild(sourceFallback);
    }

    // Play button overlay
    const playOverlay = document.createElement('div');
    playOverlay.className = 'card-play-overlay';
    playOverlay.setAttribute('role', 'button');
    playOverlay.setAttribute('aria-label', `Play ${escapeHtml(displayCaption)}`);
    playOverlay.innerHTML = `
      <div class="card-play-btn-circle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </div>
    `;

    // Click play overlay -> enable controls, start video and hide overlay
    playOverlay.addEventListener('click', () => {
      video.controls = true;
      video.play().then(() => {
        playOverlay.classList.add('hidden');
      }).catch((err) => {
        console.warn('Playback error or user gesture required:', err);
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

    video.addEventListener('ended', () => {
      playOverlay.classList.remove('hidden');
    });

    // Register with single-video controller
    registerVideoPlayer(video);

    videoWrap.appendChild(video);
    videoWrap.appendChild(playOverlay);

    // Meta Section
    const metaWrap = document.createElement('div');
    metaWrap.className = 'card-video-meta';

    const metaText = document.createElement('div');
    metaText.className = 'card-meta-text';

    // Caption Element
    const captionEl = document.createElement('h3');
    captionEl.className = 'card-video-caption';

    if (project.isEditable) {
      captionEl.classList.add('editable-caption');
      captionEl.contentEditable = 'true';
      captionEl.title = 'Click to edit title';
      captionEl.textContent = displayCaption;

      // Save to localStorage on blur
      captionEl.addEventListener('blur', () => {
        const text = captionEl.textContent.trim();
        if (text) {
          localStorage.setItem(`shacreatz_caption_${project.id}`, text);
        } else {
          captionEl.textContent = project.title;
        }
      });

      captionEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          captionEl.blur();
        }
      });
    } else {
      captionEl.textContent = displayCaption;
    }

    const categoryEl = document.createElement('span');
    categoryEl.className = 'card-video-category';
    categoryEl.textContent = project.category || 'Cinematic Edit';

    metaText.appendChild(captionEl);
    metaText.appendChild(categoryEl);
    metaWrap.appendChild(metaText);

    const dotsBtn = document.createElement('div');
    dotsBtn.className = 'card-dots-btn';
    dotsBtn.textContent = '⋮';
    metaWrap.appendChild(dotsBtn);

    card.appendChild(videoWrap);
    card.appendChild(metaWrap);

    return card;
  }

  async function initPortfolioGrid() {
    if (!portfolioVideoGrid) return;
    portfolioVideoGrid.innerHTML = '';

    // 1. Render the baseline 4 portfolio videos
    if (typeof PROJECTS_DATA !== 'undefined' && Array.isArray(PROJECTS_DATA)) {
      PROJECTS_DATA.forEach((proj, idx) => {
        const card = createRealProjectCard(proj, idx);
        portfolioVideoGrid.appendChild(card);
      });
    }

    // Hide empty state
    if (portfolioEmptyState) {
      portfolioEmptyState.style.display = 'none';
    }

    // 2. Fetch and render persistent videos from Supabase Cloud Database
    if (window.ShacreatzSupabase && typeof window.ShacreatzSupabase.fetchVideos === 'function') {
      try {
        const persistentVideos = await window.ShacreatzSupabase.fetchVideos();
        if (Array.isArray(persistentVideos) && persistentVideos.length > 0) {
          persistentVideos.forEach((videoItem) => {
            const card = createPersistentVideoCard(videoItem);
            portfolioVideoGrid.appendChild(card);
          });
        }
      } catch (err) {
        console.warn('[Supabase] Could not load persistent videos on startup:', err);
      }
    }
  }

  initPortfolioGrid();

  /* --------------------------------------------------------------------------
     6. USER-ADDED VIDEOS VIA SUPABASE CLOUD STORAGE & DATABASE
     -------------------------------------------------------------------------- */
  function createPersistentVideoCard(videoItem) {
    const card = document.createElement('article');
    card.className = 'portfolio-video-card';
    card.id = `userVideo-${videoItem.id}`;

    const videoUrl = videoItem.video_url || videoItem.videoUrl;
    const caption = videoItem.title || videoItem.caption || 'Uploaded Video';
    const category = videoItem.category || 'Uploaded Video';
    const mimeType = videoItem.mime_type || videoItem.mimeType || 'video/mp4';
    const storagePath = videoItem.storage_path || videoItem.storagePath || '';

    const videoWrap = document.createElement('div');
    videoWrap.className = 'card-video-wrapper';

    const video = document.createElement('video');
    video.className = 'card-video-player';
    video.controls = false;
    video.playsInline = true;
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

    playOverlay.addEventListener('click', () => {
      video.controls = true;
      video.play().then(() => {
        playOverlay.classList.add('hidden');
      }).catch((e) => console.warn('Playback error:', e));
    });

    video.addEventListener('play', () => playOverlay.classList.add('hidden'));
    video.addEventListener('pause', () => {
      if (video.currentTime === 0 || video.ended) playOverlay.classList.remove('hidden');
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'card-remove-btn';
    removeBtn.title = 'Delete Video from Cloud';
    removeBtn.setAttribute('aria-label', `Delete video ${escapeHtml(caption)}`);
    removeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    registerVideoPlayer(video);

    videoWrap.appendChild(video);
    videoWrap.appendChild(playOverlay);
    videoWrap.appendChild(removeBtn);

    // Meta Section
    const metaWrap = document.createElement('div');
    metaWrap.className = 'card-video-meta';

    const metaText = document.createElement('div');
    metaText.className = 'card-meta-text';

    const captionEl = document.createElement('h3');
    captionEl.className = 'card-video-caption';
    captionEl.textContent = caption;

    const categoryEl = document.createElement('span');
    categoryEl.className = 'card-video-category';
    categoryEl.textContent = category;

    metaText.appendChild(captionEl);
    metaText.appendChild(categoryEl);
    metaWrap.appendChild(metaText);

    const dotsBtn = document.createElement('div');
    dotsBtn.className = 'card-dots-btn';
    dotsBtn.textContent = '⋮';
    metaWrap.appendChild(dotsBtn);

    card.appendChild(videoWrap);
    card.appendChild(metaWrap);

    // Remove video action
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmDelete = window.confirm(`Permanently delete "${caption}" from cloud storage and database?`);
      if (!confirmDelete) return;

      video.pause();
      unregisterVideoPlayer(video);

      // Delete from Supabase cloud database & storage
      if (window.ShacreatzSupabase && typeof window.ShacreatzSupabase.deleteVideo === 'function') {
        try {
          await window.ShacreatzSupabase.deleteVideo(videoItem.id, storagePath);
        } catch (err) {
          console.warn('[Supabase] Delete error:', err);
        }
      }

      card.remove();

      if (portfolioVideoGrid && portfolioVideoGrid.children.length === 0 && portfolioEmptyState) {
        portfolioEmptyState.style.display = 'flex';
      }
    });

    return card;
  }

  /* --------------------------------------------------------------------------
     7. MODAL CONTROLS & FILE SELECTION
     -------------------------------------------------------------------------- */
  function openModal() {
    if (!addVideoModal) return;
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
    if (videoErrorAlert) videoErrorAlert.style.display = 'none';
    if (filePickerPrompt) filePickerPrompt.textContent = 'Click or drag & drop video here';
    if (filePickerNote) filePickerNote.textContent = 'Supports MP4, WebM, MOV, M4V';
    if (fileErrorMsg) fileErrorMsg.style.display = 'none';
    if (captionErrorMsg) captionErrorMsg.style.display = 'none';
    if (videoFilePicker) videoFilePicker.classList.remove('has-file', 'dragover');
  }

  function handleFileSelected(file) {
    if (!file) return;

    if (!isValidVideoFile(file)) {
      if (fileErrorMsg) {
        fileErrorMsg.textContent = 'Please select a valid video format (MP4, WebM, MOV, or M4V).';
        fileErrorMsg.style.display = 'block';
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
          if (videoErrorAlertText) videoErrorAlertText.textContent = 'Preview error: Browser cannot decode this codec.';
        }
      };

      modalVideoPreview.load();
    }
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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addVideoModal && addVideoModal.classList.contains('open')) {
      closeModal();
    }
  });

  // Form Submit with Supabase Cloud Storage & Database Persistence
  if (addVideoForm) {
    addVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let hasError = false;
      const file = currentSelectedFile || (videoFileInput.files && videoFileInput.files[0]);
      const caption = videoCaptionInput ? videoCaptionInput.value.trim() : '';
      const category = videoCategoryInput ? videoCategoryInput.value.trim() : '';

      if (!file) {
        if (fileErrorMsg) {
          fileErrorMsg.textContent = 'Please select a video file from your computer.';
          fileErrorMsg.style.display = 'block';
        }
        hasError = true;
      } else if (!isValidVideoFile(file)) {
        if (fileErrorMsg) {
          fileErrorMsg.textContent = 'Please select a valid video format (MP4, WebM, MOV, or M4V).';
          fileErrorMsg.style.display = 'block';
        }
        hasError = true;
      } else {
        if (fileErrorMsg) fileErrorMsg.style.display = 'none';
      }

      if (!caption) {
        if (captionErrorMsg) captionErrorMsg.style.display = 'block';
        hasError = true;
      } else {
        if (captionErrorMsg) captionErrorMsg.style.display = 'none';
      }

      if (hasError) return;

      // Check if Supabase client is initialized
      const isConfigured = window.ShacreatzSupabase && window.ShacreatzSupabase.isConfigured();
      if (!isConfigured) {
        // Prompt user for credentials if not yet set in .env or js/supabase-config.js
        const promptCreds = window.confirm(
          'Supabase Cloud Storage is not configured yet.\n\n' +
          'Would you like to enter your Supabase URL & Anon Key now to enable permanent cloud storage?'
        );

        if (promptCreds) {
          const userUrl = window.prompt('Enter your Supabase Project URL (e.g. https://xyz.supabase.co):');
          const userKey = window.prompt('Enter your Supabase Public Anon Key:');
          if (userUrl && userKey) {
            localStorage.setItem('shacreatz_supabase_url', userUrl.trim());
            localStorage.setItem('shacreatz_supabase_anon_key', userKey.trim());
            await window.ShacreatzSupabase.init();
          } else {
            return;
          }
        } else {
          if (fileErrorMsg) {
            fileErrorMsg.textContent = 'Permanent storage requires Supabase. Please set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel or js/supabase-config.js.';
            fileErrorMsg.style.display = 'block';
          }
          return;
        }
      }

      // Show uploading state on button
      if (submitAddVideoBtn) {
        submitAddVideoBtn.disabled = true;
        submitAddVideoBtn.innerHTML = `
          <span>UPLOADING TO CLOUD...</span>
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

      try {
        // 1. Upload actual video file to Supabase Cloud Storage
        const uploadResult = await window.ShacreatzSupabase.uploadVideo(file);

        // 2. Save video metadata to Supabase PostgreSQL Database
        const dbRecord = await window.ShacreatzSupabase.saveMetadata({
          title: caption,
          category: category || 'Uploaded Video',
          videoUrl: uploadResult.publicUrl,
          fileName: file.name,
          mimeType: getNormalizedMimeType(file),
          fileSize: file.size,
          storagePath: uploadResult.storagePath
        });

        if (portfolioEmptyState) {
          portfolioEmptyState.style.display = 'none';
        }

        // 3. Immediately display the newly uploaded persistent video card
        const card = createPersistentVideoCard(dbRecord);
        if (portfolioVideoGrid) {
          portfolioVideoGrid.appendChild(card);
        }

        closeModal();

        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      } catch (uploadErr) {
        console.error('[Upload Failed]', uploadErr);
        if (fileErrorMsg) {
          fileErrorMsg.textContent = 'Upload error: ' + (uploadErr.message || 'Please check your Supabase credentials and RLS policies.');
          fileErrorMsg.style.display = 'block';
        }
      } finally {
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

  /* --------------------------------------------------------------------------
     8. CLEANUP ON UNLOAD
     -------------------------------------------------------------------------- */
  window.addEventListener('beforeunload', () => {
    if (currentPreviewBlobUrl) {
      try {
        URL.revokeObjectURL(currentPreviewBlobUrl);
      } catch (e) {}
    }

    userAddedVideos.forEach((item) => {
      if (item.blobUrl) {
        try {
          URL.revokeObjectURL(item.blobUrl);
        } catch (e) {}
      }
    });
  });
});
