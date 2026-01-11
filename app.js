/**
 * Dagens Vibe - Modernisert Applikasjon
 * Med norske datakilder, bedre UX og animasjoner
 */

// ============ KONFIGURASJON ============
const CONFIG = {
    CORS_PROXY: 'https://api.allorigins.win/raw?url=',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutter
    ANIMATION_DURATION: 1500,
    DEFAULT_LOCATION: { lat: 59.91, lon: 10.75, name: 'Oslo' },
    LOCATIONS: [
        { id: 'NO1', name: 'Oslo', lat: 59.91, lon: 10.75 },
        { id: 'NO2', name: 'Kristiansand', lat: 58.15, lon: 8.00 },
        { id: 'NO3', name: 'Trondheim', lat: 63.43, lon: 10.39 },
        { id: 'NO4', name: 'Tromsø', lat: 69.65, lon: 18.96 },
        { id: 'NO5', name: 'Bergen', lat: 60.39, lon: 5.32 }
    ]
};

// ============ UTILITIES ============
const Utils = {
    formatDate(date = new Date()) {
        return date.toLocaleDateString('no-NO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    formatDateShort(date = new Date()) {
        return date.toLocaleDateString('no-NO', {
            day: 'numeric',
            month: 'short'
        });
    },

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============ CACHE MANAGER ============
const Cache = {
    data: new Map(),

    set(key, value) {
        this.data.set(key, {
            value,
            timestamp: Date.now()
        });
    },

    get(key) {
        const item = this.data.get(key);
        if (!item) return null;
        if (Date.now() - item.timestamp > CONFIG.CACHE_DURATION) {
            this.data.delete(key);
            return null;
        }
        return item.value;
    },

    clear() {
        this.data.clear();
    }
};

// ============ STORAGE ============
const Storage = {
    STORAGE_KEY: 'dagens_vibe_history',
    SETTINGS_KEY: 'dagens_vibe_settings',

    saveDayScore(score, vibes) {
        const history = this.getHistory();
        const today = new Date().toLocaleDateString('no-NO');
        const filtered = history.filter(item => item.date !== today);
        filtered.unshift({
            date: today,
            score,
            vibes,
            timestamp: Date.now()
        });
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered.slice(0, 30)));
    },

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    },

    getLastVibe() {
        const history = this.getHistory();
        const today = new Date().toLocaleDateString('no-NO');
        const item = history.find(i => i.date === today);
        return item?.vibes || null;
    },

    getSettings() {
        try {
            return JSON.parse(localStorage.getItem(this.SETTINGS_KEY)) || {};
        } catch {
            return {};
        }
    },

    saveSettings(settings) {
        const current = this.getSettings();
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
    }
};

// ============ TOAST NOTIFICATIONS ============
const Toast = {
    container: null,

    init() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 4000) {
        const icons = {
            error: '⚠️',
            success: '✅',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close">×</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    error(message) {
        this.show(message, 'error');
    },

    success(message) {
        this.show(message, 'success');
    }
};

// ============ ANIMASJONER ============
const Animations = {
    countUp(element, target, duration = CONFIG.ANIMATION_DURATION) {
        const start = 0;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing: easeOutExpo
            const easeProgress = 1 - Math.pow(2, -10 * progress);
            const current = Math.round(start + (target - start) * easeProgress);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    },

    updateProgressRing(element, percentage, duration = CONFIG.ANIMATION_DURATION) {
        const circumference = 283;
        const offset = circumference - (circumference * percentage / 100);

        element.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
        element.style.strokeDashoffset = offset;
    },

    updateBar(element, percentage, delay = 0) {
        setTimeout(() => {
            element.style.width = `${percentage}%`;
        }, delay);
    }
};

// ============ DATA FETCHERS ============

// Vær fra Met.no (Yr.no backend)
async function getWeatherData(location) {
    const cacheKey = `weather_${location.lat}_${location.lon}`;
    const cached = Cache.get(cacheKey);
    if (cached) return cached;

    try {
        // Met.no krever User-Agent, så vi bruker Open-Meteo som fallback
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true&timezone=auto`
        );
        const data = await res.json();
        const code = data.current_weather.weathercode;
        const temp = data.current_weather.temperature;

        let score = 50;
        let desc = 'Overskyet';
        let icon = '☁️';

        if (code <= 1) {
            score = 95; desc = 'Strålende sol'; icon = '☀️';
        } else if (code <= 3) {
            score = 80; desc = 'Delvis skyet'; icon = '⛅';
        } else if (code <= 48) {
            score = 60; desc = 'Skyet/tåke'; icon = '🌥️';
        } else if (code <= 57) {
            score = 45; desc = 'Yr'; icon = '🌧️';
        } else if (code <= 67) {
            score = 30; desc = 'Regn'; icon = '🌧️';
        } else if (code <= 77) {
            score = 35; desc = 'Snø'; icon = '❄️';
        } else if (code <= 82) {
            score = 20; desc = 'Kraftig nedbør'; icon = '⛈️';
        } else {
            score = 10; desc = 'Uvær'; icon = '🌪️';
        }

        const result = {
            score,
            display: `${Math.round(temp)}°C`,
            description: desc,
            icon
        };

        Cache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.error('Værhenting feilet:', e);
        return { score: 50, display: '--', description: 'Utilgjengelig', icon: '🌡️', error: true };
    }
}

// Nyheter fra NRK via CORS proxy
async function getNewsData() {
    const cacheKey = 'news_nrk';
    const cached = Cache.get(cacheKey);
    if (cached) return cached;

    try {
        const nrkUrl = encodeURIComponent('https://www.nrk.no/toppsaker.rss');
        const res = await fetch(CONFIG.CORS_PROXY + nrkUrl);
        const text = await res.text();

        // Parse RSS
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const items = xml.querySelectorAll('item');

        // Norske sentiment-ord
        const negative = [
            'krig', 'konflikt', 'død', 'drept', 'krise', 'ulykke', 'angrep',
            'trussel', 'frykt', 'fare', 'katastrofe', 'eksplosjon', 'skadet',
            'terror', 'vold', 'brann', 'flom', 'ras', 'dødsfall', 'smitte'
        ];
        const positive = [
            'rekord', 'seier', 'vinner', 'gjennombrudd', 'fred', 'vekst',
            'bedring', 'suksess', 'glede', 'feiring', 'reddet', 'trygg',
            'fremgang', 'avtale', 'enighet', 'prisvinner'
        ];

        let negCount = 0, posCount = 0;
        const headlines = [];

        items.forEach((item, i) => {
            if (i >= 10) return;
            const title = item.querySelector('title')?.textContent?.toLowerCase() || '';
            headlines.push(item.querySelector('title')?.textContent);

            negative.forEach(word => { if (title.includes(word)) negCount++; });
            positive.forEach(word => { if (title.includes(word)) posCount++; });
        });

        let score = 55 - (negCount * 6) + (posCount * 8);
        score = Utils.clamp(score, 15, 90);

        let sentiment = 'Nøytralt';
        let icon = '📰';
        if (score > 65) { sentiment = 'Positivt'; icon = '📈'; }
        else if (score < 40) { sentiment = 'Urolig'; icon = '📉'; }

        const result = {
            score,
            display: sentiment,
            description: `${items.length} saker`,
            icon,
            headlines: headlines.slice(0, 3)
        };

        Cache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.error('Nyhetshenting feilet, prøver Reddit:', e);

        // Fallback til Reddit
        try {
            const res = await fetch('https://www.reddit.com/r/norge/hot.json?limit=10');
            const data = await res.json();
            const posts = data.data.children;

            let score = 55;
            posts.forEach(p => {
                const ratio = p.data.upvote_ratio || 0.5;
                score += (ratio - 0.5) * 10;
            });
            score = Utils.clamp(Math.round(score), 30, 75);

            return {
                score,
                display: score > 55 ? 'OK stemning' : 'Blandet',
                description: 'Reddit r/norge',
                icon: '📱'
            };
        } catch {
            return { score: 50, display: '--', description: 'Utilgjengelig', icon: '📰', error: true };
        }
    }
}

// Oslo Børs / Crypto sentiment
async function getMarketData() {
    const cacheKey = 'market';
    const cached = Cache.get(cacheKey);
    if (cached) return cached;

    try {
        // Bruker Fear & Greed som proxy for markedsstemning
        const res = await fetch('https://api.alternative.me/fng/');
        const data = await res.json();
        const value = parseInt(data.data[0].value);

        const classifications = {
            'Extreme Fear': 'Ekstrem frykt',
            'Fear': 'Frykt',
            'Neutral': 'Nøytral',
            'Greed': 'Grådighet',
            'Extreme Greed': 'Ekstrem grådighet'
        };

        const icons = {
            'Extreme Fear': '😨',
            'Fear': '😟',
            'Neutral': '😐',
            'Greed': '😊',
            'Extreme Greed': '🤑'
        };

        const classification = data.data[0].value_classification;

        const result = {
            score: value,
            display: classifications[classification] || classification,
            description: `Index: ${value}/100`,
            icon: icons[classification] || '📊'
        };

        Cache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.error('Markedshenting feilet:', e);
        return { score: 50, display: '--', description: 'Utilgjengelig', icon: '📊', error: true };
    }
}

// Strømpris fra hvakosterstrommen.no
async function getEnergyData(priceZone = 'NO1') {
    const cacheKey = `energy_${priceZone}`;
    const cached = Cache.get(cacheKey);
    if (cached) return cached;

    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = now.getHours();

        const res = await fetch(
            `https://www.hvakosterstrommen.no/api/v1/prices/${year}/${month}-${day}_${priceZone}.json`
        );
        const data = await res.json();
        const currentPrice = data[hour]?.NOK_per_kWh;

        if (currentPrice === undefined) throw new Error('Ingen pris funnet');

        let score = 50;
        let level = 'Moderat';
        let icon = '⚡';

        if (currentPrice < 0.3) {
            score = 95; level = 'Veldig lav'; icon = '💚';
        } else if (currentPrice < 0.7) {
            score = 80; level = 'Lav'; icon = '✅';
        } else if (currentPrice < 1.5) {
            score = 55; level = 'Moderat'; icon = '⚡';
        } else if (currentPrice < 3.0) {
            score = 30; level = 'Høy'; icon = '💸';
        } else {
            score = 10; level = 'Veldig høy'; icon = '🔥';
        }

        const result = {
            score,
            display: `${currentPrice.toFixed(2)} kr/kWh`,
            description: level,
            icon
        };

        Cache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.error('Strømprishenting feilet:', e);
        return { score: 50, display: '--', description: 'Utilgjengelig', icon: '⚡', error: true };
    }
}

// ============ MAIN APPLICATION ============
class App {
    constructor() {
        this.scores = {
            weather: 50,
            news: 50,
            market: 50,
            energy: 50,
            vibes: 50
        };
        this.weights = {
            weather: 0.20,
            news: 0.25,
            market: 0.20,
            energy: 0.15,
            vibes: 0.20
        };
        this.currentVibe = Storage.getLastVibe() || 'meh';
        this.location = this.getStoredLocation();
        this.isLoading = true;

        this.init();
    }

    getStoredLocation() {
        const settings = Storage.getSettings();
        if (settings.locationId) {
            return CONFIG.LOCATIONS.find(l => l.id === settings.locationId) || CONFIG.DEFAULT_LOCATION;
        }
        return CONFIG.DEFAULT_LOCATION;
    }

    async init() {
        Toast.init();
        this.updateDate();
        this.setupLocationSelector();
        this.setupEventListeners();
        this.renderHistory();
        this.setVibe(this.currentVibe);
        this.showLoadingState();

        await this.fetchAllData();
    }

    updateDate() {
        const dateEl = document.getElementById('currentDate');
        if (dateEl) {
            dateEl.textContent = Utils.formatDate();
        }
    }

    setupLocationSelector() {
        const selector = document.getElementById('locationSelect');
        if (!selector) return;

        // Populer dropdown
        selector.innerHTML = CONFIG.LOCATIONS.map(loc =>
            `<option value="${loc.id}" ${loc.id === this.location.id ? 'selected' : ''}>${loc.name}</option>`
        ).join('');

        selector.addEventListener('change', (e) => {
            const newLocation = CONFIG.LOCATIONS.find(l => l.id === e.target.value);
            if (newLocation) {
                this.location = newLocation;
                Storage.saveSettings({ locationId: newLocation.id });
                Cache.clear();
                this.fetchAllData();
                Toast.success(`Byttet til ${newLocation.name}`);
            }
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.vibe-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setVibe(btn.dataset.vibe);
                this.calculateTotalScore();

                // Visuell feedback
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);
            });
        });

        // Retry-knapper
        document.querySelectorAll('.retry-btn').forEach(btn => {
            btn.addEventListener('click', () => this.fetchAllData());
        });
    }

    setVibe(vibe) {
        this.currentVibe = vibe;
        document.querySelectorAll('.vibe-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.vibe === vibe);
        });

        const vibeScores = { 'bad': 15, 'meh': 45, 'good': 75, 'great': 100 };
        this.scores.vibes = vibeScores[vibe];
    }

    showLoadingState() {
        this.isLoading = true;
        const scoreValue = document.getElementById('mainScoreValue');
        if (scoreValue) {
            scoreValue.textContent = '--';
            scoreValue.classList.add('loading');
        }

        // Vis skeleton på faktorkort
        ['weather', 'news', 'market', 'energy'].forEach(id => {
            const valEl = document.getElementById(`${id}Val`);
            if (valEl) valEl.innerHTML = '<span class="skeleton skeleton-text"></span>';
        });
    }

    async fetchAllData() {
        this.showLoadingState();

        const priceZone = this.location.id;

        try {
            const results = await Promise.allSettled([
                getWeatherData(this.location),
                getNewsData(),
                getMarketData(),
                getEnergyData(priceZone)
            ]);

            const [weather, news, market, energy] = results.map(r =>
                r.status === 'fulfilled' ? r.value : { score: 50, display: '--', error: true }
            );

            this.scores.weather = weather.score;
            this.scores.news = news.score;
            this.scores.market = market.score;
            this.scores.energy = energy.score;

            // Oppdater UI med forsinkelse for smooth effekt
            this.updateUIFactor('weather', weather, 0);
            this.updateUIFactor('news', news, 150);
            this.updateUIFactor('market', market, 300);
            this.updateUIFactor('energy', energy, 450);

            // Beregn total etter siste kort er animert
            setTimeout(() => {
                this.isLoading = false;
                this.calculateTotalScore();
            }, 600);

            // Vis feilmeldinger
            const errors = [];
            if (weather.error) errors.push('vær');
            if (news.error) errors.push('nyheter');
            if (market.error) errors.push('marked');
            if (energy.error) errors.push('strøm');

            if (errors.length > 0 && errors.length < 4) {
                Toast.error(`Kunne ikke hente: ${errors.join(', ')}`);
            } else if (errors.length === 4) {
                Toast.error('Ingen data tilgjengelig. Sjekk internettforbindelsen.');
            }

        } catch (e) {
            console.error('Feil ved datahenting:', e);
            Toast.error('Noe gikk galt. Prøv igjen.');
            this.isLoading = false;
        }
    }

    updateUIFactor(id, data, delay = 0) {
        setTimeout(() => {
            const valEl = document.getElementById(`${id}Val`);
            const barEl = document.getElementById(`${id}Bar`);
            const iconEl = document.getElementById(`${id}Icon`);
            const card = document.getElementById(`${id}Card`);

            if (valEl) {
                valEl.textContent = data.display;
                valEl.classList.add('fade-in');
            }

            if (barEl) {
                Animations.updateBar(barEl, data.score, 100);
            }

            if (iconEl && data.icon) {
                iconEl.textContent = data.icon;
            }

            if (card) {
                card.classList.toggle('error', !!data.error);
            }
        }, delay);
    }

    calculateTotalScore() {
        if (this.isLoading) return;

        const total = Math.round(
            (this.scores.weather * this.weights.weather) +
            (this.scores.news * this.weights.news) +
            (this.scores.market * this.weights.market) +
            (this.scores.energy * this.weights.energy) +
            (this.scores.vibes * this.weights.vibes)
        );

        this.renderMainScore(total);
        Storage.saveDayScore(total, this.currentVibe);
        this.renderHistory();
    }

    renderMainScore(score) {
        const scoreValue = document.getElementById('mainScoreValue');
        const scoreProgress = document.getElementById('scoreProgress');
        const statusText = document.getElementById('scoreStatusText');
        const description = document.getElementById('scoreDescription');

        if (scoreValue) {
            scoreValue.classList.remove('loading');
            Animations.countUp(scoreValue, score);
        }

        if (scoreProgress) {
            Animations.updateProgressRing(scoreProgress, score);
        }

        // Bestem nivå og oppdater farger
        let level, status, desc;
        if (score < 35) {
            level = 'bad';
            status = 'En tøff dag';
            desc = 'Mye motvind i dag. Ta vare på deg selv og fokuser på det positive.';
        } else if (score < 55) {
            level = 'ok';
            status = 'En helt grei dag';
            desc = 'Dagen har sine opp- og nedturer. Det meste går sin gang.';
        } else if (score < 75) {
            level = 'ok';
            status = 'En fin dag';
            desc = 'Ting ser bra ut! Nyt dagen og gjør noe hyggelig.';
        } else {
            level = 'good';
            status = 'En fantastisk dag!';
            desc = 'Alt ligger til rette for en super dag. Grip mulighetene!';
        }

        document.body.setAttribute('data-score-level', level);

        if (statusText) statusText.textContent = status;
        if (description) description.textContent = desc;
    }

    renderHistory() {
        const history = Storage.getHistory();
        const listEl = document.getElementById('historyList');

        if (!listEl) return;

        listEl.innerHTML = '';

        if (history.length <= 1) {
            listEl.innerHTML = '<div class="history-item placeholder">Ingen historikk ennå</div>';
            return;
        }

        history.slice(1, 4).forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'history-item fade-in';
            div.style.animationDelay = `${i * 100}ms`;

            const vibeEmojis = { bad: '😫', meh: '😐', good: '😊', great: '🔥' };

            div.innerHTML = `
                <span>${item.date}</span>
                <span>${item.score} ${vibeEmojis[item.vibes] || ''}</span>
            `;
            listEl.appendChild(div);
        });
    }
}

// ============ START APP ============
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
