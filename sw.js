// =============================================
// SERVICE WORKER — Mes Interventions Pro
// Version : met à jour ce numéro à chaque
// modification pour forcer le rechargement
// =============================================
const CACHE_NAME = 'interventions-v1';

// Fichiers à mettre en cache pour le mode hors ligne
const FICHIERS_A_CACHER = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Polices Google (mises en cache au premier chargement)
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap',
  // Police OpenDyslexic
  'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-regular.otf',
  'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-bold.otf',
];

// ---- INSTALLATION : mise en cache des ressources ----
self.addEventListener('install', event => {
  console.log('[SW] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des fichiers');
        // On essaie chaque fichier individuellement pour ne pas bloquer si un CDN est indisponible
        return Promise.allSettled(
          FICHIERS_A_CACHER.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Impossible de cacher :', url, err))
          )
        );
      })
      .then(() => self.skipWaiting()) // Active immédiatement le nouveau SW
  );
});

// ---- ACTIVATION : nettoyage des anciens caches ----
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then(noms => {
      return Promise.all(
        noms
          .filter(nom => nom !== CACHE_NAME)
          .map(nom => {
            console.log('[SW] Suppression ancien cache :', nom);
            return caches.delete(nom);
          })
      );
    }).then(() => self.clients.claim()) // Prend le contrôle immédiatement
  );
});

// ---- FETCH : stratégie "Cache d'abord, réseau en secours" ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes Google API (OAuth, Drive)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('apis.google.com')
  ) {
    return; // Laisser passer, le navigateur gère
  }

  event.respondWith(
    caches.match(event.request)
      .then(reponseCache => {
        if (reponseCache) {
          // Trouvé en cache → on le sert immédiatement
          // Et on met à jour le cache en arrière-plan (stale-while-revalidate)
          const fetchMisAJour = fetch(event.request)
            .then(reponseReseau => {
              if (reponseReseau && reponseReseau.status === 200) {
                const copie = reponseReseau.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copie));
              }
              return reponseReseau;
            })
            .catch(() => {}); // Silencieux si hors ligne
          
          return reponseCache; // Réponse immédiate depuis le cache
        }

        // Pas en cache → on essaie le réseau
        return fetch(event.request)
          .then(reponseReseau => {
            // On met en cache les nouvelles ressources réussies
            if (reponseReseau && reponseReseau.status === 200 && event.request.method === 'GET') {
              const copie = reponseReseau.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, copie));
            }
            return reponseReseau;
          })
          .catch(() => {
            // Hors ligne et pas en cache → page de fallback
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// ---- MESSAGES depuis l'appli ----
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
