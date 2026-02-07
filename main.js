/*
 * Main JavaScript for the Prayer Times mini app.
 *
 * This file contains the per‑page initialisation functions which are
 * automatically invoked based on the ID of the <body> element. Each
 * initialisation routine sets up its own event listeners, fetches data from
 * the AlAdhan API and updates the DOM accordingly. Utilities for geolocation
 * and reverse geocoding are shared across pages.
 */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.id;
  if (page === 'prayer') initPrayer();
  else if (page === 'ramadan') initRamadan();
  else if (page === 'qibla') initQibla();
  else if (page === 'tasbeeh') initTasbeeh();
});

/**
 * Request the user's current location via the Geolocation API. Resolves with
 * an object containing latitude and longitude. If the user denies the
 * permission or an error occurs, the promise will reject.
 */
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation not supported'));
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });
      },
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/**
 * Reverse geocode a pair of coordinates into a human friendly location name.
 * Uses BigDataCloud's free reverse geocoding service which returns the
 * locality (city or town) and country names. No API key is required for
 * unmasked coordinates at the time of writing. If the request fails the
 * function resolves with an empty string.
 */
async function getLocationName(lat, lon) {
  try {
    const resp = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (!resp.ok) throw new Error('Reverse geocode failed');
    const data = await resp.json();
    const city = data.city || data.locality || data.principalSubdivision || '';
    const country = data.countryName || '';
    return [city, country].filter(Boolean).join(', ');
  } catch (e) {
    console.warn(e);
    return '';
  }
}

/**
 * Initialise the Prayer Times page. Fetches prayer times for today and
 * displays them in a list. The next prayer is highlighted and a live
 * countdown shows how much time remains. The calculation method can be
 * changed by the user via a select element.
 */
function initPrayer() {
  const locationEl = document.getElementById('location');
  const methodSelect = document.getElementById('method');
  const countdownEl = document.getElementById('countdown');
  const nextNameEl = document.getElementById('next-prayer-name');
  const listEl = document.getElementById('prayer-list');

  let currentLat = null;
  let currentLon = null;
  let times = [];
  let countdownInterval = null;

  async function refreshTimes() {
    if (currentLat === null || currentLon === null) return;
    const method = methodSelect.value;
    try {
      const today = new Date();
      const isoDate = today.toISOString().split('T')[0];
      const url = `https://api.aladhan.com/v1/timings/${isoDate}?latitude=${currentLat}&longitude=${currentLon}&method=${method}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.code !== 200) throw new Error(data.status || 'Error fetching timings');
      const t = data.data.timings;
      // Keep only the prayers we need and strip timezone suffixes
      times = [
        { key: 'Fajr', name: 'Fajr', time: t.Fajr.slice(0, 5) },
        { key: 'Sunrise', name: 'Sunrise', time: t.Sunrise.slice(0, 5) },
        { key: 'Dhuhr', name: 'Dhuhr', time: t.Dhuhr.slice(0, 5) },
        { key: 'Asr', name: 'Asr', time: t.Asr.slice(0, 5) },
        { key: 'Maghrib', name: 'Maghrib', time: t.Maghrib.slice(0, 5) },
        { key: 'Isha', name: 'Isha', time: t.Isha.slice(0, 5) }
      ];
      renderList();
      startCountdown();
    } catch (e) {
      console.error('Error fetching prayer times', e);
    }
  }

  function renderList() {
    listEl.innerHTML = '';
    const now = new Date();
    // Determine next prayer index
    let nextIdx = -1;
    for (let i = 0; i < times.length; i++) {
      const [hour, minute] = times[i].time.split(':').map(Number);
      const timeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      if (timeDate > now) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === -1) nextIdx = 0; // Loop to first prayer if all have passed
    // Update next prayer name display
    nextNameEl.textContent = `Next: ${times[nextIdx].name}`;
    times.forEach((p, idx) => {
      const li = document.createElement('li');
      if (idx === nextIdx) li.classList.add('highlight');
      li.innerHTML = `<span>${p.name}</span><span>${p.time}</span>`;
      listEl.appendChild(li);
    });
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      const now = new Date();
      // Find the next prayer and update name
      let targetDate = null;
      let nextIdx = -1;
      for (let i = 0; i < times.length; i++) {
        const [hour, minute] = times[i].time.split(':').map(Number);
        const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
        if (candidate > now) {
          targetDate = candidate;
          nextIdx = i;
          break;
        }
      }
      if (!targetDate) {
        // Next day's first prayer
        const [hour, minute] = times[0].time.split(':').map(Number);
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
        nextIdx = 0;
      }
      const diff = targetDate - now;
      const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
      const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      countdownEl.textContent = `${hours}:${mins}:${secs}`;
      // Re-render list every minute to update highlighting
      if (secs === '00') renderList();
      if (nextNameEl && nextIdx >= 0) nextNameEl.textContent = `Next: ${times[nextIdx].name}`;
    }, 1000);
  }

  // Acquire location and update location text
  getUserLocation()
    .then(async ({ lat, lon }) => {
      currentLat = lat;
      currentLon = lon;
      const name = await getLocationName(lat, lon);
      locationEl.textContent = name ? name : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      await refreshTimes();
    })
    .catch(err => {
      console.error(err);
      locationEl.textContent = 'Location unavailable';
    });

  methodSelect.addEventListener('change', () => {
    refreshTimes();
  });
}

/**
 * Initialise the Ramadan schedule page. Fetches prayer calendars for February
 * and March 2026 and composes a schedule covering the estimated days of
 * Ramadan (19 February – 20 March 2026 as per publicly available
 * information【22043719467596†L426-L431】). Each row shows the prayer times for a day.
 */
function initRamadan() {
  const locationEl = document.getElementById('ramadan-location');
  const tbody = document.querySelector('#ramadan-table tbody');

  // Define the start and end of Ramadan 2026 (subject to moonsighting)
  const ramadanStart = new Date('2026-02-19');
  const ramadanEnd = new Date('2026-03-20');
  const method = 4; // Default to Umm al‑Qura

  getUserLocation()
    .then(async ({ lat, lon }) => {
      const name = await getLocationName(lat, lon);
      locationEl.textContent = name ? name : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      // Helper to fetch a month calendar
      async function fetchMonth(year, month) {
        const url = `https://api.aladhan.com/v1/calendar?latitude=${lat}&longitude=${lon}&method=${method}&month=${month}&year=${year}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code !== 200) throw new Error('Failed to fetch calendar');
        return data.data;
      }
      try {
        const feb = await fetchMonth(2026, 2);
        const mar = await fetchMonth(2026, 3);
        const combined = feb.concat(mar);
        combined.forEach(day => {
          const dateStr = day.date.gregorian.date; // format DD-MM-YYYY
          const [d, m, y] = dateStr.split('-').map(Number);
          const dateObj = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
          if (dateObj < ramadanStart || dateObj > ramadanEnd) return;
          const row = document.createElement('tr');
          // Highlight current day if within Ramadan
          const today = new Date();
          if (today.toDateString() === dateObj.toDateString()) {
            row.classList.add('highlight');
          }
          row.innerHTML = `
            <td>${dateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
            <td>${day.timings.Fajr.slice(0, 5)}</td>
            <td>${day.timings.Sunrise.slice(0, 5)}</td>
            <td>${day.timings.Dhuhr.slice(0, 5)}</td>
            <td>${day.timings.Asr.slice(0, 5)}</td>
            <td>${day.timings.Maghrib.slice(0, 5)}</td>
            <td>${day.timings.Isha.slice(0, 5)}</td>
          `;
          tbody.appendChild(row);
        });
      } catch (e) {
        console.error(e);
      }
    })
    .catch(err => {
      console.error(err);
      locationEl.textContent = 'Location unavailable';
    });
}

/**
 * Initialise the Qibla page. Calculates the angle between the user's
 * longitude/latitude and the Kaaba in Mecca. The compass arrow rotates
 * relative to device orientation if supported. Distance to the Kaaba is
 * displayed for additional context. The calculation of the Qibla angle uses
 * the formula described in the AlAdhan API documentation【329085559551744†L128-L149】.
 */
function initQibla() {
  const locationEl = document.getElementById('qibla-location');
  const arrow = document.getElementById('compass-arrow');
  const infoEl = document.getElementById('qibla-info');

  getUserLocation()
    .then(async ({ lat, lon }) => {
      const name = await getLocationName(lat, lon);
      locationEl.textContent = name ? name : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      // Qibla calculation
      const kaabaLat = 21.4225;
      const kaabaLon = 39.8262;
      const qiblaAngle = getQiblaAngle(lat, lon, kaabaLat, kaabaLon);
      const distance = haversine(lat, lon, kaabaLat, kaabaLon);
      infoEl.textContent = `Direction: ${qiblaAngle.toFixed(1)}° · Distance: ${distance.toFixed(0)} km`;
      // Listen to device orientation events
      function handleOrientation(event) {
        const alpha = event.alpha;
        if (alpha === null) return;
        // Convert alpha (compass heading) to degrees from North
        const heading = 360 - alpha;
        const diff = qiblaAngle - heading;
        // Rotate the arrow
        arrow.style.transform = `rotate(${diff}deg)`;
      }
      // iOS 13+ requires permission
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        DeviceOrientationEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === 'granted') {
              window.addEventListener('deviceorientation', handleOrientation, true);
            } else {
              infoEl.textContent += ' · Permission denied';
            }
          })
          .catch(err => {
            console.error(err);
            infoEl.textContent += ' · Unable to access sensors';
          });
      } else {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    })
    .catch(err => {
      console.error(err);
      locationEl.textContent = 'Location unavailable';
    });
}

/**
 * Compute the Qibla angle (bearing) from a location to the Kaaba. Returns a
 * value in degrees between 0° (North) and 360°, measured clockwise. The
 * formula uses the spherical law of cosines.
 */
function getQiblaAngle(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const x = Math.sin(dLon);
  const y = Math.cos(phi1) * Math.tan(phi2) - Math.sin(phi1) * Math.cos(dLon);
  let bearing = Math.atan2(x, y) * 180 / Math.PI;
  if (bearing < 0) bearing += 360;
  return bearing;
}

/**
 * Compute distance between two points on Earth (Haversine formula). Returns
 * kilometres.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Initialise the Tasbeeh counter. Provides simple increment and reset
 * functionality. The counter state persists in localStorage so that leaving
 * and returning to the page doesn't lose the current count.
 */
function initTasbeeh() {
  const countEl = document.getElementById('tasbeeh-count');
  const incBtn = document.getElementById('tasbeeh-increment');
  const resetBtn = document.getElementById('tasbeeh-reset');
  let count = Number(localStorage.getItem('tasbeehCount')) || 0;
  update();
  incBtn.addEventListener('click', () => {
    count++;
    update();
  });
  resetBtn.addEventListener('click', () => {
    count = 0;
    update();
  });
  function update() {
    countEl.textContent = count;
    localStorage.setItem('tasbeehCount', count);
  }
}