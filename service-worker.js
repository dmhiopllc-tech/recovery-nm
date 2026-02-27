// Service Worker for Recovery NM Scholarship Management PWA
const CACHE_NAME = 'recovery-nm-scholarship-v1';
const urlsToCache = [
  '/recovery-nm/',
  '/recovery-nm/index.html',
  '/recovery-nm/recovery-nm-dashboard.html',
  '/recovery-nm/recovery_logo.jpg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Recovery NM Scholarship: Cache opened');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('❌ Cache install failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(err => {
          console.log('❌ Fetch failed, serving offline page:', err);
          return new Response('Offline - Please check your connection', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Background sync for offline data
self.addEventListener('sync', event => {
  if (event.tag === 'sync-scholarship-data') {
    event.waitUntil(syncScholarshipData());
  }
});

async function syncScholarshipData() {
  console.log('🔄 Syncing offline scholarship data...');
  // Sync logic will be added here if needed
}

// Push notifications for scholarship updates
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Recovery NM Scholarship Update',
    icon: '/recovery-nm/recovery_logo.jpg',
    badge: '/recovery-nm/recovery_logo.jpg',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Recovery NM Scholarship', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/recovery-nm/')
  );
});
