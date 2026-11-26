/**
 * Seeds all 195 UN sovereign world capitals into the Air Quality Monitoring backend.
 * Usage: node scripts/seed-world-capitals.mjs
 */

const BASE_URL = (process.env.AERIS_API_BASE ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const DELAY_MS = 150;
const COORD_TOLERANCE = 0.00001;

export const WORLD_CAPITALS = [
  { name: 'Kabul, Afghanistan', latitude: 34.5553, longitude: 69.2075 },
  { name: 'Tirana, Albania', latitude: 41.3275, longitude: 19.8187 },
  { name: 'Algiers, Algeria', latitude: 36.7538, longitude: 3.0588 },
  { name: 'Andorra la Vella, Andorra', latitude: 42.5063, longitude: 1.5218 },
  { name: 'Luanda, Angola', latitude: -8.839, longitude: 13.2894 },
  { name: "Saint John's, Antigua and Barbuda", latitude: 17.1175, longitude: -61.8456 },
  { name: 'Buenos Aires, Argentina', latitude: -34.6037, longitude: -58.3816 },
  { name: 'Yerevan, Armenia', latitude: 40.1792, longitude: 44.4991 },
  { name: 'Canberra, Australia', latitude: -35.2809, longitude: 149.13 },
  { name: 'Vienna, Austria', latitude: 48.2082, longitude: 16.3738 },
  { name: 'Baku, Azerbaijan', latitude: 40.4093, longitude: 49.8671 },
  { name: 'Nassau, Bahamas', latitude: 25.0443, longitude: -77.3504 },
  { name: 'Manama, Bahrain', latitude: 26.2285, longitude: 50.586 },
  { name: 'Dhaka, Bangladesh', latitude: 23.8103, longitude: 90.4125 },
  { name: 'Bridgetown, Barbados', latitude: 13.0969, longitude: -59.6145 },
  { name: 'Minsk, Belarus', latitude: 53.9006, longitude: 27.559 },
  { name: 'Brussels, Belgium', latitude: 50.8503, longitude: 4.3517 },
  { name: 'Belmopan, Belize', latitude: 17.251, longitude: -88.759 },
  { name: 'Porto-Novo, Benin', latitude: 6.4969, longitude: 2.6289 },
  { name: 'Thimphu, Bhutan', latitude: 27.4728, longitude: 89.639 },
  { name: 'Sucre, Bolivia', latitude: -19.0196, longitude: -65.2619 },
  { name: 'Sarajevo, Bosnia and Herzegovina', latitude: 43.8563, longitude: 18.4131 },
  { name: 'Gaborone, Botswana', latitude: -24.6282, longitude: 25.9231 },
  { name: 'Brasília, Brazil', latitude: -15.7975, longitude: -47.8919 },
  { name: 'Bandar Seri Begawan, Brunei', latitude: 4.9031, longitude: 114.9398 },
  { name: 'Sofia, Bulgaria', latitude: 42.6977, longitude: 23.3219 },
  { name: 'Ouagadougou, Burkina Faso', latitude: 12.3714, longitude: -1.5197 },
  { name: 'Gitega, Burundi', latitude: -3.4264, longitude: 29.9308 },
  { name: 'Praia, Cabo Verde', latitude: 14.9331, longitude: -23.5133 },
  { name: 'Phnom Penh, Cambodia', latitude: 11.5564, longitude: 104.9282 },
  { name: 'Yaoundé, Cameroon', latitude: 3.848, longitude: 11.5021 },
  { name: 'Ottawa, Canada', latitude: 45.4215, longitude: -75.6972 },
  { name: 'Bangui, Central African Republic', latitude: 4.3947, longitude: 18.5582 },
  { name: "N'Djamena, Chad", latitude: 12.1348, longitude: 15.0557 },
  { name: 'Santiago, Chile', latitude: -33.4489, longitude: -70.6693 },
  { name: 'Beijing, China', latitude: 39.9042, longitude: 116.4074 },
  { name: 'Bogotá, Colombia', latitude: 4.711, longitude: -74.0721 },
  { name: 'Moroni, Comoros', latitude: -11.7172, longitude: 43.2473 },
  { name: 'Brazzaville, Republic of the Congo', latitude: -4.2634, longitude: 15.2429 },
  { name: 'San José, Costa Rica', latitude: 9.9281, longitude: -84.0907 },
  { name: "Yamoussoukro, Côte d'Ivoire", latitude: 6.8276, longitude: -5.2893 },
  { name: 'Zagreb, Croatia', latitude: 45.815, longitude: 15.9819 },
  { name: 'Havana, Cuba', latitude: 23.1136, longitude: -82.3666 },
  { name: 'Nicosia, Cyprus', latitude: 35.1856, longitude: 33.3823 },
  { name: 'Prague, Czechia', latitude: 50.0755, longitude: 14.4378 },
  { name: 'Kinshasa, Democratic Republic of the Congo', latitude: -4.4419, longitude: 15.2663 },
  { name: 'Copenhagen, Denmark', latitude: 55.6761, longitude: 12.5683 },
  { name: 'Djibouti, Djibouti', latitude: 11.5721, longitude: 43.1456 },
  { name: 'Roseau, Dominica', latitude: 15.3017, longitude: -61.3881 },
  { name: 'Santo Domingo, Dominican Republic', latitude: 18.4861, longitude: -69.9312 },
  { name: 'Quito, Ecuador', latitude: -0.1807, longitude: -78.4678 },
  { name: 'Cairo, Egypt', latitude: 30.0444, longitude: 31.2357 },
  { name: 'San Salvador, El Salvador', latitude: 13.6929, longitude: -89.2182 },
  { name: 'Malabo, Equatorial Guinea', latitude: 3.7504, longitude: 8.7371 },
  { name: 'Asmara, Eritrea', latitude: 15.3229, longitude: 38.9251 },
  { name: 'Tallinn, Estonia', latitude: 59.437, longitude: 24.7536 },
  { name: 'Mbabane, Eswatini', latitude: -26.3054, longitude: 31.1367 },
  { name: 'Addis Ababa, Ethiopia', latitude: 9.032, longitude: 38.7469 },
  { name: 'Suva, Fiji', latitude: -18.1248, longitude: 178.4501 },
  { name: 'Helsinki, Finland', latitude: 60.1699, longitude: 24.9384 },
  { name: 'Paris, France', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Libreville, Gabon', latitude: 0.4162, longitude: 9.4673 },
  { name: 'Banjul, Gambia', latitude: 13.4549, longitude: -16.579 },
  { name: 'Tbilisi, Georgia', latitude: 41.7151, longitude: 44.8271 },
  { name: 'Berlin, Germany', latitude: 52.52, longitude: 13.405 },
  { name: 'Accra, Ghana', latitude: 5.6037, longitude: -0.187 },
  { name: 'Athens, Greece', latitude: 37.9838, longitude: 23.7275 },
  { name: "Saint George's, Grenada", latitude: 12.0561, longitude: -61.7488 },
  { name: 'Guatemala City, Guatemala', latitude: 14.6349, longitude: -90.5069 },
  { name: 'Conakry, Guinea', latitude: 9.6412, longitude: -13.5784 },
  { name: 'Bissau, Guinea-Bissau', latitude: 11.8817, longitude: -15.6178 },
  { name: 'Georgetown, Guyana', latitude: 6.8013, longitude: -58.1551 },
  { name: 'Port-au-Prince, Haiti', latitude: 18.5944, longitude: -72.3074 },
  { name: 'Tegucigalpa, Honduras', latitude: 14.0723, longitude: -87.1921 },
  { name: 'Budapest, Hungary', latitude: 47.4979, longitude: 19.0402 },
  { name: 'Reykjavík, Iceland', latitude: 64.1466, longitude: -21.9426 },
  { name: 'New Delhi, India', latitude: 28.6139, longitude: 77.209 },
  { name: 'Jakarta, Indonesia', latitude: -6.2088, longitude: 106.8456 },
  { name: 'Tehran, Iran', latitude: 35.6892, longitude: 51.389 },
  { name: 'Baghdad, Iraq', latitude: 33.3152, longitude: 44.3661 },
  { name: 'Dublin, Ireland', latitude: 53.3498, longitude: -6.2603 },
  { name: 'Jerusalem, Israel', latitude: 31.7683, longitude: 35.2137 },
  { name: 'Rome, Italy', latitude: 41.9028, longitude: 12.4964 },
  { name: 'Kingston, Jamaica', latitude: 17.9714, longitude: -76.7931 },
  { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Amman, Jordan', latitude: 31.9454, longitude: 35.9284 },
  { name: 'Astana, Kazakhstan', latitude: 51.1694, longitude: 71.4491 },
  { name: 'Nairobi, Kenya', latitude: -1.2921, longitude: 36.8219 },
  { name: 'Tarawa, Kiribati', latitude: 1.3382, longitude: 173.0176 },
  { name: 'Kuwait City, Kuwait', latitude: 29.3759, longitude: 47.9774 },
  { name: 'Bishkek, Kyrgyzstan', latitude: 42.8746, longitude: 74.5698 },
  { name: 'Vientiane, Laos', latitude: 17.9757, longitude: 102.6331 },
  { name: 'Riga, Latvia', latitude: 56.9496, longitude: 24.1052 },
  { name: 'Beirut, Lebanon', latitude: 33.8938, longitude: 35.5018 },
  { name: 'Maseru, Lesotho', latitude: -29.3151, longitude: 27.4869 },
  { name: 'Monrovia, Liberia', latitude: 6.3156, longitude: -10.8074 },
  { name: 'Tripoli, Libya', latitude: 32.8872, longitude: 13.1913 },
  { name: 'Vaduz, Liechtenstein', latitude: 47.141, longitude: 9.5209 },
  { name: 'Vilnius, Lithuania', latitude: 54.6872, longitude: 25.2797 },
  { name: 'Luxembourg, Luxembourg', latitude: 49.6116, longitude: 6.1319 },
  { name: 'Antananarivo, Madagascar', latitude: -18.8792, longitude: 47.5079 },
  { name: 'Lilongwe, Malawi', latitude: -13.9626, longitude: 33.7741 },
  { name: 'Kuala Lumpur, Malaysia', latitude: 3.139, longitude: 101.6869 },
  { name: 'Malé, Maldives', latitude: 4.1755, longitude: 73.5093 },
  { name: 'Bamako, Mali', latitude: 12.6392, longitude: -8.0029 },
  { name: 'Valletta, Malta', latitude: 35.8989, longitude: 14.5146 },
  { name: 'Majuro, Marshall Islands', latitude: 7.1164, longitude: 171.1858 },
  { name: 'Nouakchott, Mauritania', latitude: 18.0735, longitude: -15.9582 },
  { name: 'Port Louis, Mauritius', latitude: -20.1609, longitude: 57.5012 },
  { name: 'Mexico City, Mexico', latitude: 19.4326, longitude: -99.1332 },
  { name: 'Palikir, Micronesia', latitude: 6.9248, longitude: 158.1611 },
  { name: 'Chișinău, Moldova', latitude: 47.0105, longitude: 28.8638 },
  { name: 'Monaco, Monaco', latitude: 43.7384, longitude: 7.4246 },
  { name: 'Ulaanbaatar, Mongolia', latitude: 47.8864, longitude: 106.9057 },
  { name: 'Podgorica, Montenegro', latitude: 42.4304, longitude: 19.2594 },
  { name: 'Rabat, Morocco', latitude: 34.0209, longitude: -6.8416 },
  { name: 'Maputo, Mozambique', latitude: -25.9692, longitude: 32.5732 },
  { name: 'Naypyidaw, Myanmar', latitude: 19.7633, longitude: 96.0785 },
  { name: 'Windhoek, Namibia', latitude: -22.5609, longitude: 17.0658 },
  { name: 'Yaren, Nauru', latitude: -0.5477, longitude: 166.9209 },
  { name: 'Kathmandu, Nepal', latitude: 27.7172, longitude: 85.324 },
  { name: 'Amsterdam, Netherlands', latitude: 52.3676, longitude: 4.9041 },
  { name: 'Wellington, New Zealand', latitude: -41.2865, longitude: 174.7762 },
  { name: 'Managua, Nicaragua', latitude: 12.115, longitude: -86.2362 },
  { name: 'Niamey, Niger', latitude: 13.5116, longitude: 2.1254 },
  { name: 'Abuja, Nigeria', latitude: 9.0765, longitude: 7.3986 },
  { name: 'Pyongyang, North Korea', latitude: 39.0392, longitude: 125.7625 },
  { name: 'Skopje, North Macedonia', latitude: 41.9973, longitude: 21.428 },
  { name: 'Oslo, Norway', latitude: 59.9139, longitude: 10.7522 },
  { name: 'Muscat, Oman', latitude: 23.588, longitude: 58.3829 },
  { name: 'Islamabad, Pakistan', latitude: 33.72148, longitude: 73.04329 },
  { name: 'Ngerulmud, Palau', latitude: 7.5006, longitude: 134.6243 },
  { name: 'Ramallah, Palestine', latitude: 31.9038, longitude: 35.2034 },
  { name: 'Panama City, Panama', latitude: 8.9824, longitude: -79.5199 },
  { name: 'Port Moresby, Papua New Guinea', latitude: -9.4438, longitude: 147.1803 },
  { name: 'Asunción, Paraguay', latitude: -25.2637, longitude: -57.5759 },
  { name: 'Lima, Peru', latitude: -12.0464, longitude: -77.0428 },
  { name: 'Manila, Philippines', latitude: 14.5995, longitude: 120.9842 },
  { name: 'Warsaw, Poland', latitude: 52.2297, longitude: 21.0122 },
  { name: 'Lisbon, Portugal', latitude: 38.7223, longitude: -9.1393 },
  { name: 'Doha, Qatar', latitude: 25.2854, longitude: 51.531 },
  { name: 'Bucharest, Romania', latitude: 44.4268, longitude: 26.1025 },
  { name: 'Moscow, Russia', latitude: 55.7558, longitude: 37.6173 },
  { name: 'Kigali, Rwanda', latitude: -1.9441, longitude: 30.0619 },
  { name: 'Basseterre, Saint Kitts and Nevis', latitude: 17.3026, longitude: -62.7177 },
  { name: 'Castries, Saint Lucia', latitude: 14.0101, longitude: -60.9875 },
  { name: 'Kingstown, Saint Vincent and the Grenadines', latitude: 13.1587, longitude: -61.2248 },
  { name: 'Apia, Samoa', latitude: -13.8507, longitude: -171.7514 },
  { name: 'San Marino, San Marino', latitude: 43.9424, longitude: 12.4578 },
  { name: 'São Tomé, São Tomé and Príncipe', latitude: 0.3302, longitude: 6.7333 },
  { name: 'Riyadh, Saudi Arabia', latitude: 24.7136, longitude: 46.6753 },
  { name: 'Dakar, Senegal', latitude: 14.7167, longitude: -17.4677 },
  { name: 'Belgrade, Serbia', latitude: 44.7866, longitude: 20.4489 },
  { name: 'Victoria, Seychelles', latitude: -4.6191, longitude: 55.4513 },
  { name: 'Freetown, Sierra Leone', latitude: 8.4657, longitude: -13.2317 },
  { name: 'Singapore, Singapore', latitude: 1.3521, longitude: 103.8198 },
  { name: 'Bratislava, Slovakia', latitude: 48.1486, longitude: 17.1077 },
  { name: 'Ljubljana, Slovenia', latitude: 46.0569, longitude: 14.5058 },
  { name: 'Honiara, Solomon Islands', latitude: -9.4456, longitude: 159.9729 },
  { name: 'Mogadishu, Somalia', latitude: 2.0469, longitude: 45.3182 },
  { name: 'Pretoria, South Africa', latitude: -25.7479, longitude: 28.2293 },
  { name: 'Seoul, South Korea', latitude: 37.5665, longitude: 126.978 },
  { name: 'Juba, South Sudan', latitude: 4.8594, longitude: 31.5713 },
  { name: 'Madrid, Spain', latitude: 40.4168, longitude: -3.7038 },
  { name: 'Sri Jayawardenepura Kotte, Sri Lanka', latitude: 6.8941, longitude: 79.9025 },
  { name: 'Khartoum, Sudan', latitude: 15.5007, longitude: 32.5599 },
  { name: 'Paramaribo, Suriname', latitude: 5.852, longitude: -55.2038 },
  { name: 'Stockholm, Sweden', latitude: 59.3293, longitude: 18.0686 },
  { name: 'Bern, Switzerland', latitude: 46.948, longitude: 7.4474 },
  { name: 'Damascus, Syria', latitude: 33.5138, longitude: 36.2765 },
  { name: 'Dushanbe, Tajikistan', latitude: 38.5598, longitude: 68.787 },
  { name: 'Dodoma, Tanzania', latitude: -6.163, longitude: 35.7516 },
  { name: 'Bangkok, Thailand', latitude: 13.7563, longitude: 100.5018 },
  { name: 'Dili, Timor-Leste', latitude: -8.5569, longitude: 125.5603 },
  { name: 'Lomé, Togo', latitude: 6.1319, longitude: 1.2228 },
  { name: "Nukuʻalofa, Tonga", latitude: -21.1393, longitude: -175.2049 },
  { name: 'Port of Spain, Trinidad and Tobago', latitude: 10.6549, longitude: -61.5019 },
  { name: 'Tunis, Tunisia', latitude: 36.8065, longitude: 10.1815 },
  { name: 'Ankara, Turkey', latitude: 39.9334, longitude: 32.8597 },
  { name: 'Ashgabat, Turkmenistan', latitude: 37.9601, longitude: 58.3261 },
  { name: 'Funafuti, Tuvalu', latitude: -8.5211, longitude: 179.1962 },
  { name: 'Kampala, Uganda', latitude: 0.3476, longitude: 32.5825 },
  { name: 'Kyiv, Ukraine', latitude: 50.4501, longitude: 30.5234 },
  { name: 'Abu Dhabi, United Arab Emirates', latitude: 24.4539, longitude: 54.3773 },
  { name: 'London, United Kingdom', latitude: 51.5072, longitude: -0.1276 },
  { name: 'Washington, D.C., United States', latitude: 38.9072, longitude: -77.0369 },
  { name: 'Montevideo, Uruguay', latitude: -34.9011, longitude: -56.1645 },
  { name: 'Tashkent, Uzbekistan', latitude: 41.2995, longitude: 69.2401 },
  { name: 'Port Vila, Vanuatu', latitude: -17.7333, longitude: 168.3273 },
  { name: 'Vatican City, Vatican City', latitude: 41.9029, longitude: 12.4534 },
  { name: 'Caracas, Venezuela', latitude: 10.4806, longitude: -66.9036 },
  { name: 'Hanoi, Vietnam', latitude: 21.0285, longitude: 105.8542 },
  { name: "Sana'a, Yemen", latitude: 15.3694, longitude: 44.191 },
  { name: 'Lusaka, Zambia', latitude: -15.3875, longitude: 28.3228 },
  { name: 'Harare, Zimbabwe', latitude: -17.8252, longitude: 31.0335 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isExistingArea(existingAreas, candidate) {
  const targetName = candidate.name.trim().toLowerCase();
  return existingAreas.some(({ area }) => {
    if (!area) return false;
    if (String(area.name ?? '').trim().toLowerCase() === targetName) return true;
    return (
      Math.abs(Number(area.latitude) - candidate.latitude) < COORD_TOLERANCE &&
      Math.abs(Number(area.longitude) - candidate.longitude) < COORD_TOLERANCE
    );
  });
}

async function fetchAreas() {
  const res = await fetch(`${BASE_URL}/api/areas`);
  if (!res.ok) {
    throw new Error(`GET /api/areas failed with ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  for (const capital of WORLD_CAPITALS) {
    if (!capital.name || capital.name.length > 80) {
      throw new Error(`Invalid capital name length (>80): "${capital.name}"`);
    }
  }

  console.log(`Target backend: ${BASE_URL}/api/areas`);
  console.log(`Total world capitals in dataset: ${WORLD_CAPITALS.length}`);

  const initialAreas = await fetchAreas();
  console.log(`Existing monitored locations before seeding: ${initialAreas.length}`);

  let addedCount = 0;
  let skippedExisting = 0;
  let conflictCount = 0;
  let errorCount = 0;

  for (let i = 0; i < WORLD_CAPITALS.length; i += 1) {
    const capital = WORLD_CAPITALS[i];

    if (isExistingArea(initialAreas, capital)) {
      skippedExisting += 1;
    } else {
      try {
        const res = await fetch(`${BASE_URL}/api/areas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capital),
        });

        if (res.status === 409) {
          const body = await res.text();
          conflictCount += 1;
          console.log(`[409 Conflict] Skipped "${capital.name}": ${body}`);
        } else if (!res.ok) {
          const body = await res.text();
          errorCount += 1;
          console.error(`[Error ${res.status}] Failed "${capital.name}": ${body}`);
        } else {
          const payload = await res.json();
          if (payload.added) {
            addedCount += 1;
          } else {
            skippedExisting += 1;
          }
          if (payload.area) {
            initialAreas.push({ area: payload.area, reading: null, stale: true });
          }
        }
      } catch (err) {
        errorCount += 1;
        console.error(`[Network Error] Failed "${capital.name}": ${err.message}`);
      }

      if (i < WORLD_CAPITALS.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    if ((i + 1) % 25 === 0 || i === WORLD_CAPITALS.length - 1) {
      console.log(
        `Progress: ${i + 1}/${WORLD_CAPITALS.length} processed | added=${addedCount}, skipped=${skippedExisting}, conflicts=${conflictCount}, errors=${errorCount}`,
      );
    }
  }

  const finalAreas = await fetchAreas();
  const withReading = finalAreas.filter((item) => item.reading !== null && item.reading !== undefined).length;
  const freshLiveReading = finalAreas.filter(
    (item) => item.reading !== null && item.reading !== undefined && item.stale === false,
  ).length;
  const withLastError = finalAreas.filter((item) => item.area?.lastError).length;

  console.log('\n=== Seeding Summary ===');
  console.log(`Newly added capitals: ${addedCount}`);
  console.log(`Skipped (already present): ${skippedExisting}`);
  console.log(`Conflicts (409): ${conflictCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total monitored cities now: ${finalAreas.length}`);
  console.log(`Cities with readings: ${withReading} (${freshLiveReading} fresh / non-stale)`);
  console.log(`Cities with lastError: ${withLastError}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
