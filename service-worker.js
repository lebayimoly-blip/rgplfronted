const CACHE_NAME = 'rgpl-cache-v2';

const OFFLINE_URLS = [
  'index.html', 'login.html', 'menu.html', 'familles.html',
  'doublons.html', 'stats.html', 'utilisateurs.html',
  'zone_travail.html', 'synchronisation.html', 'offline.html',

  // fichiers statiques
  'static/style.css', 'static/js/db.js', 'static/js/main.js',
  'static/icons/icons.svg', 'static/images/rgpl.png'
];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rgpl-db', 1);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { autoIncrement: true });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

// INSTALLATION : mise en cache des ressources statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
});

// FETCH : hybride
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignore API → network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first pour JSON (stats, données dynamiques)
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first pour le reste (HTML, CSS, JS, images)
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).catch(() => caches.match('offline.html'))
    )
  );
});

// SYNC : synchronisation des données en attente
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  const db = await openDatabase();
  const tx = db.transaction('pending', 'readonly');
  const store = tx.objectStore('pending');
  const allData = await store.getAll();

  for (const item of allData) {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify(item),
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error('Sync échoué pour un élément', err);
    }
  }

  const clearTx = db.transaction('pending', 'readwrite');
  clearTx.objectStore('pending').clear();
}
