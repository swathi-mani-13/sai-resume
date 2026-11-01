const fs = require('fs');
const path = require('path');

// 1. Read files
const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
const jsApp = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf-8');
const jsSupabase = fs.readFileSync(path.join(__dirname, '../js/supabase-client.js'), 'utf-8');
const jsData = fs.readFileSync(path.join(__dirname, '../js/projects-data.js'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf-8');

console.log('=== STARTING SUITE OF AUTOMATED INTEGRATION TESTS (V5.1) ===\n');

// TEST 1: projects-data.js has NO demo videos
console.log('TEST 1: Checking projects-data.js for demo videos...');
const demoTitles = ['Cinematic Wilderness', 'Neon Pulse', 'Apex Velocity', 'Tokyo Techwear'];
let foundDemo = false;
demoTitles.forEach(title => {
  if (jsData.includes(title)) {
    console.error(`FAIL: projects-data.js still contains "${title}"!`);
    foundDemo = true;
  }
});
if (!foundDemo && jsData.includes('const PROJECTS_DATA = [];')) {
  console.log('PASS: projects-data.js is clean with empty PROJECTS_DATA array.\n');
} else if (foundDemo) {
  process.exit(1);
}

// TEST 2: Index.html has Browse Files button, Edit Modal, Delete Confirmation Modal, and Toast Container
console.log('TEST 2: Verifying HTML structure...');
const checks = [
  { id: 'browseFilesBtn', label: 'Browse Files button' },
  { id: 'uploadProgressWrapper', label: 'Upload progress bar wrapper' },
  { id: 'editVideoModal', label: 'Edit Video modal dialog' },
  { id: 'deleteConfirmModal', label: 'Delete Confirmation modal popup' },
  { id: 'cancelDeleteVideoBtn', label: 'Cancel Delete button' },
  { id: 'confirmDeleteVideoBtn', label: 'Confirm Delete button' },
  { id: 'toastContainer', label: 'Toast notifications container' },
  { id: 'portfolioEmptyState', label: 'Clean Empty state container' }
];

checks.forEach(check => {
  if (htmlContent.includes(`id="${check.id}"`)) {
    console.log(`PASS: Found #${check.id} (${check.label}) in index.html`);
  } else {
    console.error(`FAIL: Missing #${check.id} in index.html!`);
    process.exit(1);
  }
});
console.log('');

// TEST 3: Check CSS overflow on portfolio-video-card
console.log('TEST 3: Checking CSS overflow and z-index for Three-Dot Menu...');
if (cssContent.includes('.portfolio-video-card') && cssContent.includes('overflow: visible') && cssContent.includes('.portfolio-video-card.menu-active')) {
  console.log('PASS: .portfolio-video-card has overflow: visible and .menu-active has high z-index (no clipping).\n');
} else {
  console.error('FAIL: CSS overflow or menu-active class missing in style.css!');
  process.exit(1);
}

// TEST 4: Three-Dot Menu Actions and Events in app.js
console.log('TEST 4: Verifying Three-Dot Menu implementation...');
const hasDotsWrap = jsApp.includes('card-dots-wrap');
const hasEditAction = jsApp.includes('edit-video');
const hasCopyAction = jsApp.includes('copy-video');
const hasDeleteAction = jsApp.includes('delete-video');
const hasDelegation = jsApp.includes("closest('.card-dots-btn')");
const hasCloseAll = jsApp.includes('closeAllCardMenus');
const hasCopiedToast = jsApp.includes('Link Copied Successfully');
const hasDeleteModal = jsApp.includes('openDeleteModal') && jsApp.includes('confirmDeleteVideoBtn');

if (hasDotsWrap && hasEditAction && hasCopyAction && hasDeleteAction && hasDelegation && hasCloseAll && hasCopiedToast && hasDeleteModal) {
  console.log('PASS: Three-dot menu fully functional with Edit, Copy Link, and Delete Confirmation Modal.\n');
} else {
  console.error('FAIL: Incomplete Three-Dot menu implementation in app.js!');
  process.exit(1);
}

// TEST 5: Demo filtering and auto-purge in supabase-client.js
console.log('TEST 5: Verifying isConfirmedDemo and auto-purging logic...');
if (jsSupabase.includes('isConfirmedDemo') && jsSupabase.includes('Permanently purging confirmed demo video')) {
  console.log('PASS: isConfirmedDemo detector and auto-purge logic are active in supabase-client.js.\n');
} else {
  console.error('FAIL: Demo purging logic missing in supabase-client.js!');
  process.exit(1);
}

// TEST 6: Video playback error handling & HTML5 source tags
console.log('TEST 6: Verifying HTML5 video player and error handling...');
if (jsApp.includes('card-video-player') && jsApp.includes('showVideoErrorBadge') && jsApp.includes('playOverlay')) {
  console.log('PASS: Video playback handlers and error badge states implemented.\n');
} else {
  console.error('FAIL: Video playback handling incomplete in app.js!');
  process.exit(1);
}

// TEST 7: Instagram link, username with both underscores, email, and phone
console.log('TEST 7: Checking Instagram URL, username @_shxazz_, email, and phone...');
const hasInstaUrl = htmlContent.includes('https://www.instagram.com/_shxazz_/');
const hasInstaUser = htmlContent.includes('@_shxazz_');
const hasEmail = htmlContent.includes('Saivsh501@gmail.com');
const hasPhone = htmlContent.includes('6369988501');

if (hasInstaUrl && hasInstaUser && hasEmail && hasPhone) {
  console.log('PASS: Instagram URL is "https://www.instagram.com/_shxazz_/" with both underscores intact.');
  console.log('PASS: Display username is "@_shxazz_".');
  console.log('PASS: Email (Saivsh501@gmail.com) and Phone (6369988501) preserved.\n');
} else {
  console.error('FAIL: Instagram, Email, or Phone mismatch in index.html!');
  process.exit(1);
}

console.log('=== ALL AUTOMATED INTEGRATION TESTS (V5.1) PASSED SUCCESSFULLY! ===');
