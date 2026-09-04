/**
 * =========================================================================
 * SHACREATZ - VIDEO PORTFOLIO DATA CONFIGURATION
 * =========================================================================
 * 
 * 4 Actual Video Edits with designated captions and categories.
 * Video 3 and Video 4 allow the owner to enter/edit captions directly.
 */

const PROJECTS_DATA = [
  {
    id: "video-01",
    projectNumber: "VIDEO 01",
    title: "DRIFT & DUST",
    category: "Automotive Edit",
    thumbnail: "assets/images/poster-01-bmw.jpg",
    videoUrl: "assets/videos/video-01-bmw.mp4",
    fallbackUrl: "assets/videos/video-01-bmw.mov",
    mimeType: "video/mp4",
    isEditable: false
  },
  {
    id: "video-02",
    projectNumber: "VIDEO 02",
    title: "PINK IN MOTION",
    category: "Creative Reel",
    thumbnail: "assets/images/poster-02-loshini.jpg",
    videoUrl: "assets/videos/video-02-loshini.mp4",
    mimeType: "video/mp4",
    isEditable: false
  },
  {
    id: "video-03",
    projectNumber: "VIDEO 03",
    title: "BUILT TO STAND OUT",
    category: "Automotive Edit",
    thumbnail: "assets/images/poster-03-rathinam.jpg",
    videoUrl: "assets/videos/video-03-rathinam.mp4",
    fallbackUrl: "assets/videos/video-03-rathinam.mov",
    mimeType: "video/mp4",
    isEditable: true
  },
  {
    id: "video-04",
    projectNumber: "VIDEO 04",
    title: "COLOURS IN FRAME",
    category: "Lifestyle / Creative Edit",
    thumbnail: "assets/images/poster-04-fahad.jpg",
    videoUrl: "assets/videos/video-04-fahad.mp4",
    fallbackUrl: "assets/videos/video-04-fahad.mov",
    mimeType: "video/mp4",
    isEditable: true
  }
];
