// This is a basic service worker file for PWA compatibility.
// It can be expanded later for offline caching strategies.

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  // You can pre-cache assets here if needed
});

self.addEventListener('fetch', (event) => {
  // This basic fetch handler just passes the request through.
  // It's a placeholder for more advanced caching.
  event.respondWith(fetch(event.request));
});
